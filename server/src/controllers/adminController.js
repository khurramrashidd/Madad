import User from '../models/User.js';
import Task from '../models/Task.js';
import Dispute from '../models/Dispute.js';
import Message from '../models/Message.js';
import Review from '../models/Review.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { applyTrustEvent, badgeFor } from '../services/trustScore.js';
import { notify } from '../services/notify.js';
import { TASK_STATUS, ACTIVE_STATES } from '../utils/constants.js';

/** GET /api/admin/stats — the numbers for the dashboard tiles. */
export const getStats = asyncHandler(async (req, res) => {
  const [
    totalUsers, restrictedUsers, totalTasks, openTasks,
    settledTasks, disputedTasks, openDisputes, bountyAgg, avgTrustAgg,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ isRestricted: true }),
    Task.countDocuments(),
    Task.countDocuments({ status: TASK_STATUS.OPEN }),
    Task.countDocuments({ status: TASK_STATUS.SETTLED }),
    Task.countDocuments({ status: TASK_STATUS.DISPUTED }),
    Dispute.countDocuments({ status: { $in: ['open', 'reviewing'] } }),
    Task.aggregate([
      { $match: { status: TASK_STATUS.SETTLED } },
      { $group: { _id: null, total: { $sum: '$bounty' }, avg: { $avg: '$bounty' } } },
    ]),
    User.aggregate([{ $group: { _id: null, avg: { $avg: '$trustScore' } } }]),
  ]);

  const byCategory = await Task.aggregate([
    { $group: { _id: '$category', count: { $sum: 1 }, totalBounty: { $sum: '$bounty' } } },
    { $sort: { count: -1 } },
  ]);

  const settleRate = totalTasks ? Math.round((settledTasks / totalTasks) * 100) : 0;

  res.json({
    success: true,
    stats: {
      users: { total: totalUsers, restricted: restrictedUsers },
      tasks: {
        total: totalTasks, open: openTasks, settled: settledTasks,
        disputed: disputedTasks, settleRate,
      },
      disputes: { open: openDisputes },
      bounty: {
        totalSettled: bountyAgg[0]?.total || 0,
        average: Math.round(bountyAgg[0]?.avg || 0),
      },
      trust: { average: Math.round(avgTrustAgg[0]?.avg || 0) },
      byCategory,
    },
  });
});

/** GET /api/admin/users */
export const listUsers = asyncHandler(async (req, res) => {
  const { q, filter } = req.query;
  const query = {};

  if (filter === 'restricted') query.isRestricted = true;
  if (filter === 'lowtrust') query.trustScore = { $lt: 50 };

  if (q && String(q).trim()) {
    const rx = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }

  const users = await User.find(query).sort({ createdAt: -1 }).limit(100);

  res.json({
    success: true,
    users: users.map((u) => ({
      ...u.toPublic(),
      email: u.email,
      phone: u.phone,
      upiId: u.upiId,
      role: u.role,
      restrictedReason: u.restrictedReason,
      flakeCount: u.stats.flakeCount,
      nonPaymentCount: u.stats.nonPaymentCount,
      lastActiveAt: u.lastActiveAt,
    })),
  });
});

/**
 * POST /api/admin/users/:id/trust
 * Manual override. Logged to the user's trust history like any other event —
 * an admin adjustment should be as auditable as an automatic one.
 */
export const adjustTrust = asyncHandler(async (req, res) => {
  const delta = Number(req.body.delta);
  if (!Number.isFinite(delta) || Math.abs(delta) > 50) {
    throw ApiError.badRequest('Adjustment must be between -50 and +50');
  }

  const result = await applyTrustEvent(req.params.id, 'ADMIN_ADJUSTMENT', {
    overrideDelta: delta,
    note: String(req.body.note || `Admin adjustment by ${req.user.name}`).slice(0, 200),
    io: global.__io,
  });
  if (!result) throw ApiError.notFound('User not found');

  res.json({ success: true, trustScore: result.after, delta: result.delta, badge: result.badge });
});

/** POST /api/admin/users/:id/restrict — toggle a manual restriction. */
export const toggleRestriction = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');

  if (user.isRestricted) {
    user.isRestricted = false;
    user.restrictedReason = null;
    // Lift them back to the floor so they aren't instantly re-restricted.
    if (user.trustScore < 40) user.trustScore = 45;
  } else {
    user.isRestricted = true;
    // The "admin:" prefix stops the trust engine auto-lifting this.
    user.restrictedReason = `admin: ${String(req.body.reason || 'Restricted by an administrator').slice(0, 200)}`;
  }

  user.badge = badgeFor(user.trustScore, user.isRestricted);
  await user.save();

  await notify(user._id, {
    type: 'restricted',
    title: user.isRestricted ? 'Your account was restricted' : 'Your account was restored',
    body: user.isRestricted
      ? user.restrictedReason.replace('admin: ', '')
      : 'You can post and claim tasks again.',
  }, global.__io);

  res.json({ success: true, isRestricted: user.isRestricted, user: user.toPublic() });
});

/** GET /api/admin/tasks */
export const listTasks = asyncHandler(async (req, res) => {
  const query = {};
  if (req.query.status && req.query.status !== 'all') query.status = req.query.status;

  const tasks = await Task.find(query)
    .populate('wisher', 'name trustScore avatarColor avatar')
    .populate('volunteer', 'name trustScore avatarColor avatar')
    .sort({ createdAt: -1 })
    .limit(100);

  res.json({ success: true, tasks });
});

/** GET /api/admin/disputes */
export const listDisputes = asyncHandler(async (req, res) => {
  const disputes = await Dispute.find()
    .populate('raisedBy', 'name avatarColor trustScore')
    .populate('against', 'name avatarColor trustScore')
    .populate('task', 'title bounty status')
    .sort({ createdAt: -1 })
    .limit(60);

  res.json({ success: true, disputes });
});

/**
 * GET /api/admin/disputes/:id/evidence
 * The soft-deleted chat, which is exactly why we keep it for 7 days rather
 * than hard-deleting at settlement.
 */
export const getDisputeEvidence = asyncHandler(async (req, res) => {
  const dispute = await Dispute.findById(req.params.id);
  if (!dispute) throw ApiError.notFound('Dispute not found');

  const messages = await Message.find({ task: dispute.task })
    .populate('sender', 'name avatarColor')
    .sort({ createdAt: 1 });

  const task = await Task.findById(dispute.task)
    .populate('wisher', 'name trustScore')
    .populate('volunteer', 'name trustScore');

  res.json({ success: true, task, messages, timeline: task?.timeline || [] });
});

/** POST /api/admin/disputes/:id/resolve */
export const resolveDispute = asyncHandler(async (req, res) => {
  const { verdict, note } = req.body;
  if (!['upheld', 'dismissed', 'split'].includes(verdict)) {
    throw ApiError.badRequest('Verdict must be upheld, dismissed or split');
  }

  const dispute = await Dispute.findById(req.params.id);
  if (!dispute) throw ApiError.notFound('Dispute not found');
  if (dispute.status === 'resolved') throw ApiError.badRequest('Already resolved');

  dispute.status = 'resolved';
  dispute.resolution = {
    verdict,
    note: String(note || '').slice(0, 600),
    resolvedBy: req.user._id,
    resolvedAt: new Date(),
  };
  await dispute.save();

  if (verdict === 'upheld') {
    await applyTrustEvent(dispute.against, 'DISPUTE_LOST', { task: dispute.task, io: global.__io });
    await applyTrustEvent(dispute.raisedBy, 'DISPUTE_WON', { task: dispute.task, io: global.__io });
  } else if (verdict === 'dismissed') {
    await applyTrustEvent(dispute.raisedBy, 'DISPUTE_LOST', {
      task: dispute.task, io: global.__io, overrideDelta: -8, note: 'Raised a dispute that was dismissed',
    });
  }

  await Task.updateOne({ _id: dispute.task }, { $set: { status: TASK_STATUS.SETTLED, settledAt: new Date() } });

  for (const uid of [dispute.raisedBy, dispute.against]) {
    await notify(uid, {
      type: 'dispute_update',
      title: 'Dispute resolved',
      body: dispute.resolution.note || `Verdict: ${verdict}`,
      task: dispute.task,
    }, global.__io);
  }

  res.json({ success: true, dispute });
});

/** POST /api/disputes/:taskId — user-facing: raise a dispute. */
export const raiseDispute = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.taskId);
  if (!task) throw ApiError.notFound('Task not found');

  const isWisher = task.wisher.equals(req.user._id);
  const isVolunteer = task.volunteer?.equals(req.user._id);
  if (!isWisher && !isVolunteer) throw ApiError.forbidden('Not your task');

  if (!ACTIVE_STATES.includes(task.status) && task.status !== TASK_STATUS.DISPUTED) {
    throw ApiError.badRequest('You can only dispute an active task');
  }
  if (await Dispute.exists({ task: task._id, raisedBy: req.user._id, status: { $ne: 'resolved' } })) {
    throw ApiError.conflict('You already have an open dispute on this task');
  }

  const dispute = await Dispute.create({
    task: task._id,
    raisedBy: req.user._id,
    against: isWisher ? task.volunteer : task.wisher,
    reason: req.body.reason || 'other',
    detail: String(req.body.detail || '').slice(0, 600),
  });

  task.status = TASK_STATUS.DISPUTED;
  task.log('disputed', req.user._id, dispute.reason);
  await task.save();

  res.status(201).json({ success: true, dispute });
});

export default {
  getStats, listUsers, adjustTrust, toggleRestriction, listTasks,
  listDisputes, getDisputeEvidence, resolveDispute, raiseDispute,
};
