import Message from '../models/Message.js';
import Task from '../models/Task.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { ACTIVE_STATES, TASK_STATUS } from '../utils/constants.js';

/**
 * Chat is scoped to a task and to exactly two people. There is no global
 * inbox and no way to message a stranger — the room only exists because a
 * claim created it, and it closes when the bounty settles.
 */
async function loadRoom(taskId, userId) {
  const task = await Task.findById(taskId).populate([
    { path: 'wisher', select: 'name avatarColor avatar trustScore badge' },
    { path: 'volunteer', select: 'name avatarColor avatar trustScore badge' },
  ]);
  if (!task) throw ApiError.notFound('Task not found');

  const isWisher = task.wisher._id.equals(userId);
  const isVolunteer = task.volunteer && task.volunteer._id.equals(userId);
  if (!isWisher && !isVolunteer) {
    throw ApiError.forbidden('This chat is private to the two people on the task');
  }
  if (!task.volunteer) {
    throw ApiError.badRequest('Chat opens once a volunteer claims the task');
  }

  return { task, isWisher, other: isWisher ? task.volunteer : task.wisher };
}

/** GET /api/chat/:taskId */
export const getMessages = asyncHandler(async (req, res) => {
  const { task, other } = await loadRoom(req.params.taskId, req.user._id);

  const closed = !ACTIVE_STATES.includes(task.status);

  const messages = closed
    ? []
    : await Message.find({ task: task._id, isDeleted: false })
        .populate('sender', 'name avatarColor')
        .sort({ createdAt: 1 })
        .limit(300);

  // Mark the other side's messages as read.
  if (!closed) {
    Message.updateMany(
      { task: task._id, sender: { $ne: req.user._id }, readAt: null },
      { $set: { readAt: new Date() } }
    ).catch(() => {});
  }

  res.json({
    success: true,
    closed,
    closedReason: closed
      ? task.status === TASK_STATUS.SETTLED
        ? 'This chat closed when the bounty was settled.'
        : 'This chat is closed.'
      : null,
    // Allow-list rather than relying on toPublic(), which disappears the
    // moment a document is converted to a plain object.
    other: {
      id: other._id,
      name: other.name,
      avatarColor: other.avatarColor,
      avatar: other.avatar || null,
      trustScore: other.trustScore,
      badge: other.badge,
    },
    taskStatus: task.status,
    messages: messages.map((m) => ({
      id: m._id,
      body: m.body,
      kind: m.kind,
      senderId: m.sender?._id || m.sender,
      senderName: m.sender?.name,
      senderColor: m.sender?.avatarColor,
      mine: String(m.sender?._id || m.sender) === String(req.user._id),
      readAt: m.readAt,
      createdAt: m.createdAt,
    })),
  });
});

/**
 * POST /api/chat/:taskId
 * HTTP fallback for sending. The live path is the socket handler; this exists
 * so an offline-queued message can still be delivered on reconnect.
 */
export const sendMessage = asyncHandler(async (req, res) => {
  const { task } = await loadRoom(req.params.taskId, req.user._id);

  if (!ACTIVE_STATES.includes(task.status)) {
    throw ApiError.badRequest('This chat is closed');
  }

  const body = String(req.body.body || '').trim();
  if (!body) throw ApiError.badRequest('Message cannot be empty');
  if (body.length > 800) throw ApiError.badRequest('Message is too long');

  const msg = await Message.create({ task: task._id, sender: req.user._id, body });

  const payload = {
    id: msg._id,
    body: msg.body,
    kind: msg.kind,
    senderId: req.user._id,
    senderName: req.user.name,
    senderColor: req.user.avatarColor,
    createdAt: msg.createdAt,
    taskId: task._id,
  };

  global.__io?.to(`task:${task._id}`).emit('chat:message', payload);

  res.status(201).json({ success: true, message: payload });
});

/** GET /api/chat — rooms with unread counts, for the inbox badge. */
export const getRooms = asyncHandler(async (req, res) => {
  const tasks = await Task.find({
    status: { $in: ACTIVE_STATES },
    $or: [{ wisher: req.user._id }, { volunteer: req.user._id }],
  })
    .populate([
      { path: 'wisher', select: 'name avatarColor avatar' },
      { path: 'volunteer', select: 'name avatarColor avatar' },
    ])
    .sort({ claimedAt: -1 });

  const rooms = await Promise.all(
    tasks.map(async (t) => {
      const [last, unread] = await Promise.all([
        Message.findOne({ task: t._id, isDeleted: false }).sort({ createdAt: -1 }),
        Message.countDocuments({
          task: t._id,
          isDeleted: false,
          sender: { $ne: req.user._id },
          readAt: null,
        }),
      ]);
      const isWisher = t.wisher._id.equals(req.user._id);
      const other = isWisher ? t.volunteer : t.wisher;
      return {
        taskId: t._id,
        taskTitle: t.title,
        bounty: t.bounty,
        status: t.status,
        other: other
          ? { id: other._id, name: other.name, avatarColor: other.avatarColor, avatar: other.avatar || null }
          : null,
        lastMessage: last ? { body: last.body, at: last.createdAt, kind: last.kind } : null,
        unread,
      };
    })
  );

  res.json({
    success: true,
    rooms,
    totalUnread: rooms.reduce((sum, r) => sum + r.unread, 0),
  });
});

export default { getMessages, sendMessage, getRooms };
