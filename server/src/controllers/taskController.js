import { z } from 'zod';
import mongoose from 'mongoose';
import Task from '../models/Task.js';
import User from '../models/User.js';
import Message from '../models/Message.js';
import env from '../config/env.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { applyTrustEvent, bumpStreak, canTransact } from '../services/trustScore.js';
import { buildPaymentPayload } from '../services/upi.js';
import { notify } from '../services/notify.js';
import {
  generateHandshakeCode,
  haversineMeters,
  formatDistance,
  normalizeRadius,
  parseCoords,
  fuzzCoords,
} from '../utils/geo.js';
import { emitNearby, usersNearby } from '../services/geoBroadcast.js';
import {
  TASK_STATUS,
  TASK_CATEGORIES,
  SOCKET_EVENTS,
  LIVE_BROADCAST_RADIUS_M,
} from '../utils/constants.js';

const io = () => global.__io;

const createSchema = z.object({
  title: z.string().trim().min(5, 'Title is too short').max(90),
  description: z.string().trim().max(600).optional().default(''),
  category: z.enum(TASK_CATEGORIES).optional().default('other'),
  bounty: z.coerce
    .number()
    .min(env.minBounty, `Bounty must be at least ₹${env.minBounty}`)
    .max(env.maxBounty, `Bounty cannot exceed ₹${env.maxBounty}`),
  lng: z.coerce.number().min(-180).max(180),
  lat: z.coerce.number().min(-90).max(90),
  address: z.string().trim().max(200).optional().default(''),
  landmark: z.string().trim().max(120).optional().default(''),
  createdVia: z.enum(['form', 'voice', 'offline_sync']).optional().default('form'),
  voiceTranscript: z.string().max(1000).optional().nullable(),
  clientRef: z.string().max(64).optional(),
});

function parse(schema, body) {
  const r = schema.safeParse(body);
  if (!r.success) {
    throw ApiError.badRequest(
      r.error.issues[0].message,
      r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    );
  }
  return r.data;
}

/**
 * Shapes a person for the wire.
 *
 * Deliberately an allow-list, not a deny-list. `toObject()` strips Mongoose
 * methods, so relying on `doc.toPublic()` here silently falls through to the
 * raw document and leaks whatever the query happened to select — the
 * volunteer's `upiId` among it. Naming the safe fields explicitly means
 * adding a field to the schema can never accidentally publish it.
 */
function publicPerson(p) {
  if (!p) return null;
  return {
    id: p._id || p.id,
    name: p.name,
    avatarColor: p.avatarColor,
    avatar: p.avatar || null,
    trustScore: p.trustScore,
    badge: p.badge,
    city: p.city,
    stats: p.stats
      ? {
          tasksCompleted: p.stats.tasksCompleted,
          tasksPosted: p.stats.tasksPosted,
          ratingCount: p.stats.ratingCount,
          currentStreak: p.stats.currentStreak,
        }
      : undefined,
    rating:
      p.stats?.ratingCount > 0
        ? Number((p.stats.ratingSum / p.stats.ratingCount).toFixed(2))
        : null,
    memberSince: p.createdAt,
  };
}

/**
 * Shapes a task for the wire. The precise pin and the handshake code are
 * privileged: only the two parties see the real location, and nobody but the
 * wisher ever sees the code.
 */
function serialize(task, viewer, originCoords) {
  const t = task.toObject ? task.toObject({ virtuals: true }) : task;
  const viewerId = viewer?._id?.toString();
  const wisherId = (t.wisher?._id || t.wisher)?.toString();
  const volunteerId = (t.volunteer?._id || t.volunteer)?.toString();

  const isParty = viewerId && (viewerId === wisherId || viewerId === volunteerId);
  const coords = isParty ? t.location.coordinates : fuzzCoords(t.location.coordinates, 200);

  const distance = originCoords
    ? haversineMeters(originCoords, t.location.coordinates)
    : null;

  return {
    id: t._id,
    title: t.title,
    description: t.description,
    category: t.category,
    bounty: t.bounty,
    boostCount: t.boostCount,
    status: t.status,
    location: { type: 'Point', coordinates: coords },
    isExactLocation: isParty,
    address: isParty ? t.address : '',
    landmark: t.landmark,
    distance,
    distanceLabel: formatDistance(distance),
    wisher: publicPerson(t.wisher),
    volunteer: publicPerson(t.volunteer),
    isMine: viewerId === wisherId,
    isMyClaim: viewerId === volunteerId,
    createdVia: t.createdVia,
    payment: {
      wisherMarkedPaid: Boolean(t.payment?.wisherMarkedPaidAt),
      volunteerConfirmed: Boolean(t.payment?.volunteerConfirmedAt),
      wisherMarkedPaidAt: t.payment?.wisherMarkedPaidAt || null,
      volunteerConfirmedAt: t.payment?.volunteerConfirmedAt || null,
    },
    handshakeVerifiedAt: t.handshakeVerifiedAt || null,
    minutesLeft: t.minutesLeft,
    expiresAt: t.expiresAt,
    claimedAt: t.claimedAt,
    settledAt: t.settledAt,
    createdAt: t.createdAt,
    timeline: isParty ? t.timeline : undefined,
  };
}

const POPULATE = [
  { path: 'wisher', select: 'name avatarColor avatar trustScore badge stats createdAt city' },
  { path: 'volunteer', select: 'name avatarColor avatar trustScore badge stats createdAt city upiId' },
];

/** Lazily expires stale open tasks. Cheaper and more reliable than a cron. */
async function sweepExpired() {
  const stale = await Task.find({
    status: TASK_STATUS.OPEN,
    expiresAt: { $lt: new Date() },
  }).select('_id wisher');

  if (!stale.length) return;
  const ids = stale.map((t) => t._id);
  await Task.updateMany({ _id: { $in: ids } }, { $set: { status: TASK_STATUS.EXPIRED } });

  for (const t of stale) {
    io()?.emit(SOCKET_EVENTS.TASK_REMOVED, { id: t._id, reason: 'expired' });
    notify(t.wisher, {
      type: 'task_expired',
      title: 'Your task expired',
      body: 'Nobody claimed it in time. Repost it with a higher bounty to get takers.',
      task: t._id,
      link: `/task/${t._id}`,
    }, io()).catch(() => {});
  }
}

/** POST /api/tasks */
export const createTask = asyncHandler(async (req, res) => {
  if (!canTransact(req.user)) {
    throw ApiError.forbidden(
      req.user.restrictedReason || 'Your account is restricted from posting tasks'
    );
  }

  const data = parse(createSchema, req.body);

  // Idempotency: an offline draft synced twice must not become two tasks.
  if (data.clientRef) {
    const existing = await Task.findOne({
      clientRef: data.clientRef,
      wisher: req.user._id,
    }).populate(POPULATE);
    if (existing) {
      return res.status(200).json({
        success: true,
        deduplicated: true,
        task: serialize(existing, req.user),
      });
    }
  }

  // One open task at a time per person keeps the feed honest.
  const openCount = await Task.countDocuments({
    wisher: req.user._id,
    status: { $in: [TASK_STATUS.OPEN, TASK_STATUS.CLAIMED, TASK_STATUS.DELIVERED, TASK_STATUS.PAID_PENDING] },
  });
  if (openCount >= 3) {
    throw ApiError.badRequest('You already have 3 active tasks. Settle one before posting another.');
  }

  const task = await Task.create({
    title: data.title,
    description: data.description,
    category: data.category,
    bounty: data.bounty,
    originalBounty: data.bounty,
    wisher: req.user._id,
    location: { type: 'Point', coordinates: [data.lng, data.lat] },
    address: data.address,
    landmark: data.landmark,
    createdVia: data.createdVia,
    voiceTranscript: data.voiceTranscript || null,
    clientRef: data.clientRef,
    handshakeCode: generateHandshakeCode(),
    timeline: [{ event: 'posted', by: req.user._id }],
  });

  await User.updateOne({ _id: req.user._id }, { $inc: { 'stats.tasksPosted': 1 } });
  await task.populate(POPULATE);

  /**
   * Push the task to people who could actually do it.
   *
   * This used to be `io.emit(...)`, which handed every new task to every
   * connected client in the country, with `distance: null` — so the client's
   * own radius filter could never reject anything. Now each nearby socket
   * gets its own payload carrying the distance from *that* person, and
   * everyone else never hears about the task at all.
   */
  const coords = [data.lng, data.lat];
  const payload = serialize(task, null);
  const reached = emitNearby(io(), coords, SOCKET_EVENTS.TASK_NEW, payload, {
    exclude: req.user._id,
  });

  // Notify the closest few people who aren't currently looking at the feed.
  // Capped, because 300 push notifications for one ₹50 errand is spam.
  const nearby = usersNearby(coords, LIVE_BROADCAST_RADIUS_M, req.user._id).slice(0, 25);
  for (const { userId, distance } of nearby) {
    notify(userId, {
      type: 'nearby_task',
      title: `New task ${formatDistance(distance)} away`,
      body: `${task.title} — ₹${task.bounty}`,
      task: task._id,
      link: `/task/${task._id}`,
    }, io()).catch(() => {});
  }

  if (!env.isProd) {
    console.log(`[feed] task ${task._id} pushed to ${reached} nearby socket(s)`);
  }

  res.status(201).json({ success: true, task: serialize(task, req.user) });
});

/**
 * GET /api/tasks
 * Geo-sorted feed. Uses $geoNear so MongoDB does the distance maths against
 * the 2dsphere index rather than us pulling every task and filtering in Node.
 */
export const getFeed = asyncHandler(async (req, res) => {
  await sweepExpired();

  const origin =
    parseCoords(req.query.lng, req.query.lat) ||
    req.user?.location?.coordinates ||
    [env.seed.lng, env.seed.lat];

  const radius = normalizeRadius(req.query.radius);
  const { category, q, sort = 'distance' } = req.query;
  const limit = Math.min(Number(req.query.limit) || 30, 60);
  const skip = Math.max(Number(req.query.skip) || 0, 0);

  const match = { status: TASK_STATUS.OPEN, expiresAt: { $gt: new Date() } };
  if (category && category !== 'all' && TASK_CATEGORIES.includes(category)) {
    match.category = category;
  }
  if (q && String(q).trim()) {
    const rx = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    match.$or = [{ title: rx }, { description: rx }, { landmark: rx }];
  }
  // Don't show people their own tasks in the volunteer feed, or tasks from
  // anyone they've blocked.
  if (req.user) {
    match.wisher = { $ne: req.user._id };
    if (req.user.blockedUsers?.length) {
      match.wisher = { $ne: req.user._id, $nin: req.user.blockedUsers };
    }
  }

  const pipeline = [
    {
      $geoNear: {
        near: { type: 'Point', coordinates: origin },
        distanceField: 'distance',
        maxDistance: radius,
        spherical: true,
        query: match,
      },
    },
  ];

  if (sort === 'bounty') pipeline.push({ $sort: { bounty: -1, distance: 1 } });
  else if (sort === 'newest') pipeline.push({ $sort: { createdAt: -1 } });
  else pipeline.push({ $sort: { distance: 1 } });

  pipeline.push({ $skip: skip }, { $limit: limit });

  const raw = await Task.aggregate(pipeline);
  const tasks = await Task.populate(raw, POPULATE);

  res.json({
    success: true,
    count: tasks.length,
    radius,
    origin,
    tasks: tasks.map((t) => {
      const s = serialize(t, req.user, origin);
      s.distance = Math.round(t.distance);
      s.distanceLabel = formatDistance(s.distance);
      return s;
    }),
  });
});

/** GET /api/tasks/mine — everything I posted or claimed. */
export const getMyTasks = asyncHandler(async (req, res) => {
  const [posted, claimed] = await Promise.all([
    Task.find({ wisher: req.user._id }).populate(POPULATE).sort({ createdAt: -1 }).limit(50),
    Task.find({ volunteer: req.user._id }).populate(POPULATE).sort({ createdAt: -1 }).limit(50),
  ]);

  res.json({
    success: true,
    posted: posted.map((t) => serialize(t, req.user)),
    claimed: claimed.map((t) => serialize(t, req.user)),
  });
});

/** GET /api/tasks/:id */
export const getTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id).populate(POPULATE);
  if (!task) throw ApiError.notFound('Task not found');

  const origin = parseCoords(req.query.lng, req.query.lat) || req.user?.location?.coordinates;
  const data = serialize(task, req.user, origin);

  // The wisher sees the handshake code — it's their half of the proof.
  if (req.user && task.wisher._id.equals(req.user._id) &&
      [TASK_STATUS.CLAIMED].includes(task.status)) {
    const withCode = await Task.findById(task._id).select('+handshakeCode');
    data.handshakeCode = withCode.handshakeCode;
  }

  res.json({ success: true, task: data });
});

/**
 * POST /api/tasks/:id/claim
 * Atomic: findOneAndUpdate with status:open in the filter means two volunteers
 * tapping at the same instant can't both win. The loser gets a clean 409.
 */
export const claimTask = asyncHandler(async (req, res) => {
  if (!canTransact(req.user)) {
    throw ApiError.forbidden(
      req.user.restrictedReason || 'Your account is restricted from claiming tasks'
    );
  }
  if (!req.user.upiId) {
    throw ApiError.badRequest('Add your UPI ID in your profile before claiming — that is how you get paid');
  }

  const task = await Task.findOneAndUpdate(
    {
      _id: req.params.id,
      status: TASK_STATUS.OPEN,
      expiresAt: { $gt: new Date() },
      wisher: { $ne: req.user._id },
    },
    {
      $set: {
        status: TASK_STATUS.CLAIMED,
        volunteer: req.user._id,
        claimedAt: new Date(),
      },
      $push: { timeline: { event: 'claimed', by: req.user._id } },
    },
    { new: true }
  ).populate(POPULATE);

  if (!task) {
    const existing = await Task.findById(req.params.id);
    if (!existing) throw ApiError.notFound('Task not found');
    if (existing.wisher.equals(req.user._id)) {
      throw ApiError.badRequest('You cannot claim your own task');
    }
    if (existing.status !== TASK_STATUS.OPEN) {
      throw ApiError.conflict('Someone just claimed this task');
    }
    throw ApiError.conflict('This task is no longer available');
  }

  // Off the public feed for everyone, instantly.
  io()?.emit(SOCKET_EVENTS.TASK_CLAIMED, { id: task._id, volunteerId: req.user._id });

  await Message.create({
    task: task._id,
    sender: req.user._id,
    kind: 'system',
    body: `${req.user.name} accepted this task. Coordinate here — this chat closes once the bounty is settled.`,
  });

  await notify(task.wisher._id, {
    type: 'task_claimed',
    title: 'Your task was claimed',
    body: `${req.user.name} is on it. Open the chat to share details.`,
    task: task._id,
    link: `/task/${task._id}`,
  }, io());

  res.json({ success: true, task: serialize(task, req.user) });
});

/**
 * POST /api/tasks/:id/handshake
 * The volunteer types the 4-digit code the wisher is showing on their screen.
 * Physical proximity is the thing being proven — you cannot complete a task
 * you never turned up for.
 */
export const verifyHandshake = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id).select('+handshakeCode').populate(POPULATE);
  if (!task) throw ApiError.notFound('Task not found');

  if (!task.volunteer || !task.volunteer._id.equals(req.user._id)) {
    throw ApiError.forbidden('Only the volunteer on this task can verify the code');
  }
  if (task.status !== TASK_STATUS.CLAIMED) {
    throw ApiError.badRequest('This task is not awaiting handshake verification');
  }

  const supplied = String(req.body.code || '').trim();
  if (supplied !== task.handshakeCode) {
    throw ApiError.badRequest('That code is incorrect. Ask the wisher to read it out again.');
  }

  task.status = TASK_STATUS.DELIVERED;
  task.handshakeVerifiedAt = new Date();
  task.log('handshake_verified', req.user._id);
  await task.save();

  await notify(task.wisher._id, {
    type: 'task_delivered',
    title: 'Task complete — time to pay',
    body: `${task.volunteer.name} verified the handshake. Scan their UPI QR to settle ₹${task.bounty}.`,
    task: task._id,
    link: `/task/${task._id}`,
  }, io());

  io()?.to(`task:${task._id}`).emit(SOCKET_EVENTS.TASK_UPDATED, serialize(task, null));

  res.json({
    success: true,
    message: 'Handshake verified. The wisher can now pay you.',
    task: serialize(task, req.user),
  });
});

/**
 * GET /api/tasks/:id/payment
 * Returns the UPI intent URI. No money passes through this server — the client
 * turns this string into a QR code and the wisher's own bank app does the rest.
 */
export const getPaymentDetails = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id).populate(POPULATE);
  if (!task) throw ApiError.notFound('Task not found');

  const isParty =
    task.wisher._id.equals(req.user._id) ||
    (task.volunteer && task.volunteer._id.equals(req.user._id));
  if (!isParty) throw ApiError.forbidden('Not your task');

  if (![TASK_STATUS.DELIVERED, TASK_STATUS.PAID_PENDING].includes(task.status)) {
    throw ApiError.badRequest('Payment opens once the handshake code is verified');
  }

  res.json({ success: true, payment: buildPaymentPayload({ volunteer: task.volunteer, task }) });
});

/** POST /api/tasks/:id/paid — wisher's half of the settlement. */
export const markPaid = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id).populate(POPULATE);
  if (!task) throw ApiError.notFound('Task not found');
  if (!task.wisher._id.equals(req.user._id)) {
    throw ApiError.forbidden('Only the wisher can mark a bounty as paid');
  }
  if (![TASK_STATUS.DELIVERED, TASK_STATUS.PAID_PENDING].includes(task.status)) {
    throw ApiError.badRequest('This task is not ready for payment');
  }
  if (task.payment.wisherMarkedPaidAt) {
    throw ApiError.badRequest('You already marked this as paid');
  }

  task.payment.wisherMarkedPaidAt = new Date();
  task.payment.upiIdUsed = task.volunteer.upiId;
  if (req.body.reference) task.payment.reference = String(req.body.reference).slice(0, 40);
  task.status = TASK_STATUS.PAID_PENDING;
  task.log('marked_paid', req.user._id);
  await task.save();

  await notify(task.volunteer._id, {
    type: 'payment_marked',
    title: `₹${task.bounty} sent`,
    body: `${task.wisher.name} says they paid. Check your UPI app, then confirm receipt.`,
    task: task._id,
    link: `/task/${task._id}`,
  }, io());

  io()?.to(`task:${task._id}`).emit(SOCKET_EVENTS.TASK_UPDATED, serialize(task, null));

  res.json({ success: true, task: serialize(task, req.user) });
});

/**
 * POST /api/tasks/:id/confirm
 * Volunteer's half. Only when BOTH sides have confirmed does the task settle,
 * trust points move and the chat get closed. One-sided claims settle nothing —
 * that asymmetry is what makes the score worth anything.
 */
export const confirmReceipt = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id).populate(POPULATE);
  if (!task) throw ApiError.notFound('Task not found');
  if (!task.volunteer || !task.volunteer._id.equals(req.user._id)) {
    throw ApiError.forbidden('Only the volunteer can confirm receipt');
  }
  if (!task.payment.wisherMarkedPaidAt) {
    throw ApiError.badRequest('The wisher has not marked this as paid yet');
  }
  if (task.payment.volunteerConfirmedAt) {
    throw ApiError.badRequest('You already confirmed this payment');
  }

  task.payment.volunteerConfirmedAt = new Date();
  task.status = TASK_STATUS.SETTLED;
  task.settledAt = new Date();
  task.log('settled', req.user._id);
  await task.save();

  // Both sides verified → trust moves.
  //
  // The volunteer earns two events. They must run one after the other: each
  // applyTrustEvent reads the score, adds to it and saves, so running both at
  // once makes them read the same starting score and the second save silently
  // overwrites the first — one of the two rewards is lost.
  await applyTrustEvent(task.volunteer._id, 'TASK_COMPLETED', { task: task._id, io: io() });
  await applyTrustEvent(task.volunteer._id, 'PAYMENT_CONFIRMED', { task: task._id, io: io() });

  // Different documents, or counters updated with $inc — safe to run together.
  await Promise.all([
    applyTrustEvent(task.wisher._id, 'PAID_ON_TIME', { task: task._id, io: io() }),
    User.updateOne(
      { _id: task.wisher._id },
      { $inc: { 'stats.bountiesPaid': 1, 'stats.totalSpent': task.bounty } }
    ),
    User.updateOne(
      { _id: task.volunteer._id },
      { $inc: { 'stats.tasksCompleted': 1, 'stats.totalEarned': task.bounty } }
    ),
  ]);
  await bumpStreak(task.volunteer._id, { task: task._id, io: io() });

  // Ephemeral chat: hidden now, purged by MongoDB's TTL in 7 days.
  await Message.softDeleteRoom(task._id);
  io()?.to(`task:${task._id}`).emit(SOCKET_EVENTS.CHAT_CLOSED, { taskId: task._id });

  await notify(task.wisher._id, {
    type: 'task_settled',
    title: 'Bounty settled',
    body: `${task.volunteer.name} confirmed receipt. Leave them a rating!`,
    task: task._id,
    link: `/task/${task._id}`,
  }, io());

  io()?.to(`task:${task._id}`).emit(SOCKET_EVENTS.TASK_UPDATED, serialize(task, null));

  res.json({
    success: true,
    message: 'Payment confirmed. Task settled.',
    task: serialize(task, req.user),
  });
});

/** POST /api/tasks/:id/boost — raise the bounty on a task nobody is taking. */
export const boostBounty = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) throw ApiError.notFound('Task not found');
  if (!task.wisher.equals(req.user._id)) throw ApiError.forbidden('Not your task');
  if (task.status !== TASK_STATUS.OPEN) {
    throw ApiError.badRequest('Only open tasks can be boosted');
  }

  const increment = Number(req.body.amount);
  if (!Number.isFinite(increment) || increment < 5) {
    throw ApiError.badRequest('Boost by at least ₹5');
  }
  const next = task.bounty + increment;
  if (next > env.maxBounty) {
    throw ApiError.badRequest(`Bounty cannot exceed ₹${env.maxBounty}`);
  }

  task.bounty = next;
  task.boostCount += 1;
  // A boost buys more time on the feed too.
  task.expiresAt = new Date(Date.now() + 90 * 60 * 1000);
  task.log('boosted', req.user._id, `+₹${increment}`);
  await task.save();
  await task.populate(POPULATE);

  io()?.emit(SOCKET_EVENTS.TASK_UPDATED, serialize(task, null));

  res.json({ success: true, task: serialize(task, req.user) });
});

/**
 * POST /api/tasks/:id/cancel
 * Cancelling before anyone claims is free. Cancelling after a volunteer has
 * committed their time costs trust — that's the point.
 */
export const cancelTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id).populate(POPULATE);
  if (!task) throw ApiError.notFound('Task not found');

  const isWisher = task.wisher._id.equals(req.user._id);
  const isVolunteer = task.volunteer && task.volunteer._id.equals(req.user._id);
  if (!isWisher && !isVolunteer) throw ApiError.forbidden('Not your task');

  if ([TASK_STATUS.SETTLED, TASK_STATUS.CANCELLED, TASK_STATUS.EXPIRED].includes(task.status)) {
    throw ApiError.badRequest('This task is already closed');
  }
  if (task.status === TASK_STATUS.PAID_PENDING) {
    throw ApiError.badRequest('Payment is in progress — raise a dispute instead of cancelling');
  }

  const reason = String(req.body.reason || '').slice(0, 200);

  if (isVolunteer) {
    // Volunteer walking away from a live commitment.
    await applyTrustEvent(req.user._id, 'VOLUNTEER_FLAKED', {
      task: task._id, io: io(), note: reason || 'Abandoned a claimed task',
    });
    await User.updateOne(
      { _id: req.user._id },
      { $inc: { 'stats.flakeCount': 1 }, $set: { 'stats.currentStreak': 0 } }
    );

    // Task goes back on the feed rather than dying.
    task.status = TASK_STATUS.OPEN;
    task.volunteer = null;
    task.claimedAt = null;
    task.expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    task.log('volunteer_withdrew', req.user._id, reason);
    await task.save();
    await Message.softDeleteRoom(task._id);
    await task.populate(POPULATE);

    io()?.emit(SOCKET_EVENTS.TASK_NEW, serialize(task, null));
    await notify(task.wisher._id, {
      type: 'task_expired',
      title: 'Your volunteer withdrew',
      body: 'The task is back on the feed for someone else to claim.',
      task: task._id,
      link: `/task/${task._id}`,
    }, io());

    return res.json({ success: true, message: 'You withdrew from this task', task: serialize(task, req.user) });
  }

  // Wisher cancelling.
  const hadVolunteer = Boolean(task.volunteer);
  task.status = TASK_STATUS.CANCELLED;
  task.cancelledAt = new Date();
  task.cancelReason = reason;
  task.log('cancelled', req.user._id, reason);
  await task.save();

  if (hadVolunteer) {
    await applyTrustEvent(req.user._id, 'WISHER_CANCELLED_LATE', {
      task: task._id, io: io(), note: reason || 'Cancelled after a volunteer committed',
    });
    await notify(task.volunteer._id, {
      type: 'task_expired',
      title: 'Task cancelled',
      body: `${task.wisher.name} cancelled the task you claimed.`,
      task: task._id,
      link: `/task/${task._id}`,
    }, io());
  }

  await Message.softDeleteRoom(task._id);
  io()?.emit(SOCKET_EVENTS.TASK_REMOVED, { id: task._id, reason: 'cancelled' });

  res.json({ success: true, message: 'Task cancelled', task: serialize(task, req.user) });
});

/** POST /api/tasks/:id/no-payment — volunteer reports the wisher ghosted. */
export const reportNonPayment = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id).populate(POPULATE);
  if (!task) throw ApiError.notFound('Task not found');
  if (!task.volunteer || !task.volunteer._id.equals(req.user._id)) {
    throw ApiError.forbidden('Only the volunteer can report non-payment');
  }
  if (task.status !== TASK_STATUS.DELIVERED) {
    throw ApiError.badRequest('This task is not awaiting payment');
  }
  // Give the wisher a reasonable window before the penalty lands.
  const hoursSince = (Date.now() - task.handshakeVerifiedAt) / 3600000;
  if (hoursSince < 2) {
    throw ApiError.badRequest('Give the wisher at least 2 hours to pay before reporting');
  }

  task.status = TASK_STATUS.DISPUTED;
  task.log('non_payment_reported', req.user._id);
  await task.save();

  await applyTrustEvent(task.wisher._id, 'NON_PAYMENT', {
    task: task._id, io: io(), note: 'Reported for not paying a settled bounty',
  });
  await User.updateOne({ _id: task.wisher._id }, { $inc: { 'stats.nonPaymentCount': 1 } });

  res.json({ success: true, message: 'Reported. An admin will review this.', task: serialize(task, req.user) });
});

export default {
  createTask, getFeed, getMyTasks, getTask, claimTask, verifyHandshake,
  getPaymentDetails, markPaid, confirmReceipt, boostBounty, cancelTask, reportNonPayment,
};

/** Exported for the privacy regression tests in seed/selftest.js. */
export const __testSerialize = serialize;
