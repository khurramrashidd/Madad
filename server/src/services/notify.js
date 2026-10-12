import webpush from 'web-push';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import env from '../config/env.js';
import { SOCKET_EVENTS } from '../utils/constants.js';

let pushReady = false;
if (env.vapid.enabled) {
  webpush.setVapidDetails(env.vapid.subject, env.vapid.publicKey, env.vapid.privateKey);
  pushReady = true;
  console.log('[push] Web Push enabled');
} else {
  console.log('[push] VAPID keys not set — in-app notifications only');
}

/**
 * Creates a notification, pushes it down the user's socket room, and fires a
 * Web Push if they subscribed. Every channel is best-effort: a failed push
 * must never break the request that triggered it.
 */
export async function notify(userId, payload, io) {
  const doc = await Notification.create({ user: userId, ...payload });

  if (io) {
    io.to(`user:${userId}`).emit(SOCKET_EVENTS.NOTIFICATION, {
      id: doc._id,
      type: doc.type,
      title: doc.title,
      body: doc.body,
      task: doc.task,
      link: doc.link,
      createdAt: doc.createdAt,
    });
  }

  if (pushReady) sendWebPush(userId, payload).catch(() => {});
  return doc;
}

async function sendWebPush(userId, { title, body, link }) {
  const user = await User.findById(userId).select('pushSubscriptions');
  if (!user?.pushSubscriptions?.length) return;

  const notification = JSON.stringify({
    title,
    body,
    url: link || '/',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
  });

  const dead = [];
  await Promise.all(
    user.pushSubscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, notification);
      } catch (err) {
        // 404/410 means the browser dropped the subscription — prune it.
        if (err.statusCode === 404 || err.statusCode === 410) dead.push(sub.endpoint);
      }
    })
  );

  if (dead.length) {
    await User.updateOne(
      { _id: userId },
      { $pull: { pushSubscriptions: { endpoint: { $in: dead } } } }
    );
  }
}

export const isPushEnabled = () => pushReady;
export default { notify, isPushEnabled };
