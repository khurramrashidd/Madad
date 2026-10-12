import { z } from 'zod';
import Task from '../models/Task.js';
import User from '../models/User.js';
import TripShare from '../models/TripShare.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { notify } from '../services/notify.js';
import { haversineMeters, formatDistance } from '../utils/geo.js';
import { ACTIVE_STATES, SOCKET_EVENTS } from '../utils/constants.js';

const io = () => global.__io;

/**
 * Safety endpoints.
 *
 * The README was right to call safety the biggest unsolved problem here: the
 * trust score punishes bad behaviour after it happens, which is no comfort to
 * someone standing in an unfamiliar lane at night. These endpoints add the
 * two things that actually help in the moment — somebody else can see where
 * you are, and one tap tells everyone that something is wrong.
 *
 * What this is NOT: an emergency service. The client dials 112 directly;
 * nothing here routes to police, and the UI says so rather than implying a
 * response that will not come.
 */

/** Both parties to an active task, so we can check who is allowed to act. */
async function activeTaskFor(taskId, userId) {
  const task = await Task.findById(taskId).populate([
    { path: 'wisher', select: 'name phone trustedContact' },
    { path: 'volunteer', select: 'name phone trustedContact' },
  ]);
  if (!task) throw ApiError.notFound('Task not found');

  const isWisher = String(task.wisher?._id) === String(userId);
  const isVolunteer = String(task.volunteer?._id) === String(userId);
  if (!isWisher && !isVolunteer) throw ApiError.forbidden('Not your task');

  if (!ACTIVE_STATES.includes(task.status)) {
    throw ApiError.badRequest('This task is not active, so there is no trip to share');
  }

  return { task, isWisher, isVolunteer, other: isWisher ? task.volunteer : task.wisher };
}

const positionSchema = z.object({
  lng: z.coerce.number().min(-180).max(180),
  lat: z.coerce.number().min(-90).max(90),
});

/**
 * POST /api/safety/trip/:taskId
 * Starts (or reuses) a share link for an active task.
 */
export const startTrip = asyncHandler(async (req, res) => {
  const { task } = await activeTaskFor(req.params.taskId, req.user._id);

  // Reuse a live share rather than minting a second link for the same trip,
  // so the one already sent to a relative keeps working.
  let share = await TripShare.findOne({
    task: task._id,
    owner: req.user._id,
    endedAt: null,
    expiresAt: { $gt: new Date() },
  });

  if (!share) {
    share = await TripShare.create({
      task: task._id,
      owner: req.user._id,
      note: String(req.body.note || '').slice(0, 200),
      destination: task.location,
    });
  }

  const contact = req.user.trustedContact;
  if (contact?.phone) {
    await notify(req.user._id, {
      type: 'trip_shared',
      title: 'Trip sharing is on',
      body: `Send the link to ${contact.name || contact.phone} so they can follow along.`,
      task: task._id,
      link: `/task/${task._id}`,
    }, io()).catch(() => {});
  }

  res.status(201).json({
    success: true,
    share: {
      token: share.token,
      path: `/trip/${share.token}`,
      expiresAt: share.expiresAt,
    },
  });
});

/** PUT /api/safety/trip/:token/position — the traveller reports a new fix. */
export const reportPosition = asyncHandler(async (req, res) => {
  const { lng, lat } = positionSchema.parse(req.body);

  const share = await TripShare.findOne({ token: req.params.token });
  if (!share) throw ApiError.notFound('That share link is no longer valid');
  if (String(share.owner) !== String(req.user._id)) {
    throw ApiError.forbidden('Only the traveller can report their position');
  }
  if (!share.isLive) throw ApiError.badRequest('This trip has ended');

  share.lastPosition = { type: 'Point', coordinates: [lng, lat] };
  share.lastReportedAt = new Date();
  await share.save();

  // Let the other party's screen move the pin in real time.
  io()?.to(`task:${share.task}`).emit(SOCKET_EVENTS.TRIP_LOCATION, {
    taskId: String(share.task),
    userId: String(req.user._id),
    lng,
    lat,
    at: share.lastReportedAt,
  });

  res.json({ success: true });
});

/** POST /api/safety/trip/:token/end */
export const endTrip = asyncHandler(async (req, res) => {
  const share = await TripShare.findOne({ token: req.params.token });
  if (!share) throw ApiError.notFound('That share link is no longer valid');
  if (String(share.owner) !== String(req.user._id)) {
    throw ApiError.forbidden('Only the traveller can end their trip');
  }

  share.endedAt = new Date();
  await share.save();
  res.json({ success: true });
});

/**
 * GET /api/safety/trip/:token — public watcher view.
 *
 * No authentication: the token IS the credential, which is what lets a
 * relative without an account open the link. Correspondingly it returns the
 * bare minimum — a first name, a position, where they are heading — and
 * never the task's full detail, the other party's contact, or anything about
 * the money involved.
 */
export const viewTrip = asyncHandler(async (req, res) => {
  const share = await TripShare.findOne({ token: req.params.token })
    .populate('owner', 'name avatarColor')
    .populate('task', 'title landmark status location');

  if (!share) throw ApiError.notFound('That share link is no longer valid');

  const ended = !share.isLive;
  const destination = share.destination?.coordinates || share.task?.location?.coordinates || null;
  const current = share.lastPosition?.coordinates || null;

  res.json({
    success: true,
    trip: {
      traveller: { name: share.owner?.name?.split(' ')[0] || 'Someone', color: share.owner?.avatarColor },
      taskTitle: share.task?.title || null,
      landmark: share.task?.landmark || '',
      note: share.note,
      position: current ? { lng: current[0], lat: current[1] } : null,
      destination: destination ? { lng: destination[0], lat: destination[1] } : null,
      remaining:
        current && destination ? formatDistance(haversineMeters(current, destination)) : null,
      lastReportedAt: share.lastReportedAt || null,
      sosRaisedAt: share.sosRaisedAt || null,
      ended,
      endedAt: share.endedAt || null,
      expiresAt: share.expiresAt,
    },
  });
});

/**
 * POST /api/safety/sos/:taskId
 *
 * Raises an alarm on an active task. This does three things that are within
 * this system's power, and claims nothing beyond them: it tells the other
 * party their counterpart has raised an alarm, it flags the task for an
 * admin, and it returns the trusted contact's number so the client can offer
 * a one-tap call. Dialling 112 happens on the device.
 */
export const raiseSos = asyncHandler(async (req, res) => {
  const { task, other } = await activeTaskFor(req.params.taskId, req.user._id);

  const at = new Date();
  const coords = positionSchema.safeParse(req.body);
  const position = coords.success ? [coords.data.lng, coords.data.lat] : null;

  task.log('sos_raised', req.user._id, 'Safety alert raised');
  await task.save();

  await TripShare.updateMany(
    { task: task._id, owner: req.user._id, endedAt: null },
    { $set: { sosRaisedAt: at } }
  );

  // The other party sees it immediately — in most real situations the person
  // standing in front of you is who can actually help.
  if (other?._id) {
    notify(other._id, {
      type: 'sos',
      title: `${req.user.name} raised a safety alert`,
      body: 'They have flagged a problem with your meeting. Please check on them.',
      task: task._id,
      link: `/task/${task._id}`,
    }, io()).catch(() => {});
  }

  io()?.to(`task:${task._id}`).emit(SOCKET_EVENTS.SOS_RAISED, {
    taskId: String(task._id),
    by: { id: String(req.user._id), name: req.user.name },
    at,
    position: position ? { lng: position[0], lat: position[1] } : null,
  });

  // Surface it to whoever runs the platform.
  const admins = await User.find({ role: 'admin' }).select('_id').limit(10);
  for (const admin of admins) {
    notify(admin._id, {
      type: 'sos',
      title: 'Safety alert raised',
      body: `${req.user.name} raised an alert on "${task.title}".`,
      task: task._id,
      link: `/admin`,
    }, io()).catch(() => {});
  }

  res.json({
    success: true,
    raisedAt: at,
    trustedContact: req.user.trustedContact?.phone ? req.user.trustedContact : null,
    emergencyNumber: '112',
    otherParty: other ? { name: other.name, phone: other.phone || null } : null,
  });
});

export default { startTrip, reportPosition, endTrip, viewTrip, raiseSos };
