import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import { socketCorsOrigin } from '../config/origins.js';
import User from '../models/User.js';
import Task from '../models/Task.js';
import Message from '../models/Message.js';
import { notify } from '../services/notify.js';
import { rememberPosition, forgetPosition } from '../services/geoBroadcast.js';
import { SOCKET_EVENTS, ACTIVE_STATES } from '../utils/constants.js';

/**
 * Real-time layer.
 *
 * Rooms in use:
 *   feed          — everyone browsing; gets task created/claimed/removed events
 *   user:<id>     — one per signed-in user; notifications and trust updates
 *   task:<id>     — private chat room, joinable only by the task's two parties
 *
 * Every socket is authenticated at handshake time with the same JWT the REST
 * API uses. An unauthenticated socket is rejected outright rather than being
 * allowed to listen anonymously.
 */
export function initSockets(httpServer) {
  const io = new Server(httpServer, {
    // Same origin policy as the REST API. In the single-service production
    // deployment the SPA is served by this very process, so requests are
    // same-origin and never reach this check; it matters for the Android app
    // (capacitor://localhost) and for local development across a LAN.
    cors: { origin: socketCorsOrigin, credentials: true },
    pingTimeout: 30000,
    transports: ['websocket', 'polling'],
  });

  // Handshake auth.
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, env.jwtSecret);
      const user = await User.findById(decoded.id).select('name avatarColor isRestricted blockedUsers location');
      if (!user) return next(new Error('Account not found'));

      socket.userId = user._id.toString();
      socket.user = user;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`);
    socket.join('feed');

    // Seed this socket's position from the user's last stored location so a
    // freshly connected client is reachable before its first GPS fix lands.
    rememberPosition(socket.id, socket.userId, socket.user.location?.coordinates);

    if (!env.isProd) console.log(`[socket] ${socket.user.name} connected (${socket.id})`);

    socket.on(SOCKET_EVENTS.FEED_JOIN, () => socket.join('feed'));
    socket.on(SOCKET_EVENTS.FEED_LEAVE, () => socket.leave('feed'));

    /**
     * The client reports its live position as the device moves. This is what
     * decides whether a new task is pushed to this socket, so it is kept per
     * connection rather than read back from the database on every broadcast.
     */
    socket.on(SOCKET_EVENTS.LOCATION_UPDATE, ({ lng, lat } = {}) => {
      rememberPosition(socket.id, socket.userId, [lng, lat]);
    });

    /** Join a private task chat — membership is re-checked server-side. */
    socket.on(SOCKET_EVENTS.CHAT_JOIN, async (taskId, ack) => {
      try {
        const task = await Task.findById(taskId).select('wisher volunteer status');
        if (!task) return ack?.({ ok: false, error: 'Task not found' });

        const isParty =
          task.wisher.equals(socket.userId) || task.volunteer?.equals(socket.userId);
        if (!isParty) return ack?.({ ok: false, error: 'Not your task' });

        if (!ACTIVE_STATES.includes(task.status)) {
          return ack?.({ ok: false, error: 'This chat is closed', closed: true });
        }

        socket.join(`task:${taskId}`);
        ack?.({ ok: true });
      } catch {
        ack?.({ ok: false, error: 'Could not open chat' });
      }
    });

    socket.on(SOCKET_EVENTS.CHAT_LEAVE, (taskId) => socket.leave(`task:${taskId}`));

    /** Send a chat message. Authorisation is checked on every single send. */
    socket.on(SOCKET_EVENTS.CHAT_SEND, async ({ taskId, body, clientRef }, ack) => {
      try {
        const text = String(body || '').trim();
        if (!text) return ack?.({ ok: false, error: 'Message is empty' });
        if (text.length > 800) return ack?.({ ok: false, error: 'Message is too long' });

        const task = await Task.findById(taskId)
          .select('wisher volunteer status title')
          .populate('wisher', 'name')
          .populate('volunteer', 'name');
        if (!task) return ack?.({ ok: false, error: 'Task not found' });

        const isWisher = task.wisher._id.equals(socket.userId);
        const isVolunteer = task.volunteer?._id.equals(socket.userId);
        if (!isWisher && !isVolunteer) return ack?.({ ok: false, error: 'Not your task' });
        if (!ACTIVE_STATES.includes(task.status)) {
          return ack?.({ ok: false, error: 'This chat is closed' });
        }

        const msg = await Message.create({ task: taskId, sender: socket.userId, body: text });

        const payload = {
          id: msg._id,
          taskId,
          body: msg.body,
          kind: 'text',
          senderId: socket.userId,
          senderName: socket.user.name,
          senderColor: socket.user.avatarColor,
          createdAt: msg.createdAt,
          clientRef, // echoed so the sender can reconcile its optimistic bubble
        };

        io.to(`task:${taskId}`).emit(SOCKET_EVENTS.CHAT_MESSAGE, payload);
        ack?.({ ok: true, message: payload });

        // Notify the other side if they aren't currently in the room.
        const recipientId = isWisher ? task.volunteer?._id : task.wisher._id;
        if (recipientId) {
          const room = io.sockets.adapter.rooms.get(`task:${taskId}`);
          const recipientSockets = await io.in(`user:${recipientId}`).fetchSockets();
          const isPresent = recipientSockets.some((s) => room?.has(s.id));

          if (!isPresent) {
            notify(recipientId, {
              type: 'new_message',
              title: `${socket.user.name} messaged you`,
              body: text.slice(0, 80),
              task: taskId,
              link: `/chat/${taskId}`,
            }, io).catch(() => {});
          }
        }
      } catch (err) {
        console.error('[socket] send failed:', err.message);
        ack?.({ ok: false, error: 'Could not send message' });
      }
    });

    socket.on(SOCKET_EVENTS.CHAT_TYPING_SEND, ({ taskId, typing }) => {
      socket.to(`task:${taskId}`).emit(SOCKET_EVENTS.CHAT_TYPING, {
        taskId,
        userId: socket.userId,
        name: socket.user.name,
        typing: Boolean(typing),
      });
    });

    socket.on('disconnect', () => {
      forgetPosition(socket.id);
      if (!env.isProd) console.log(`[socket] ${socket.user.name} disconnected`);
    });
  });

  // Controllers reach the io instance through this rather than passing it down
  // through every function signature.
  global.__io = io;
  console.log('[socket] Socket.IO ready');
  return io;
}

export default initSockets;
