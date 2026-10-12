import { z } from 'zod';
import User from '../models/User.js';
import Task from '../models/Task.js';
import Review from '../models/Review.js';
import Notification from '../models/Notification.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { isValidUpiId } from '../services/upi.js';
import { TASK_STATUS } from '../utils/constants.js';
import { placeName } from '../utils/placeName.js';

/**
 * A profile photo arrives as a data URI the client has already downscaled.
 * Both limits matter: the MIME allow-list keeps an SVG (which can carry
 * script) out of an <img> that other users will render, and the size cap is
 * the real defence — without it, one user could park megabytes in a document
 * that is read on every feed request.
 */
const AVATAR_MAX_BYTES = 400_000;
const avatarSchema = z
  .string()
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, 'Unsupported image format')
  .refine((v) => v.length <= AVATAR_MAX_BYTES, 'That image is too large — try a smaller photo');

const updateSchema = z.object({
  name: z.string().trim().min(2).max(50).optional(),
  bio: z.string().trim().max(200).optional(),
  upiId: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/, 'Enter a valid UPI ID, e.g. name@okhdfcbank')
    .optional()
    .or(z.literal('')),
  city: z.string().trim().max(60).optional(),
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  // '' clears the photo and falls back to the coloured initial.
  avatar: avatarSchema.optional().or(z.literal('')),
  trustedContact: z
    .object({
      name: z.string().trim().max(50).optional().default(''),
      phone: z
        .string()
        .trim()
        .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number')
        .optional()
        .or(z.literal('')),
    })
    .optional(),
  preferences: z
    .object({
      language: z.enum(['en', 'hi', 'hinglish']).optional(),
      theme: z.enum(['light', 'dark', 'system']).optional(),
      notifyNearbyTasks: z.boolean().optional(),
    })
    .optional(),
});

/** PATCH /api/users/me */
export const updateMe = asyncHandler(async (req, res) => {
  const r = updateSchema.safeParse(req.body);
  if (!r.success) throw ApiError.badRequest(r.error.issues[0].message);

  const data = r.data;
  if (data.upiId === '') data.upiId = null;
  if (data.upiId && !isValidUpiId(data.upiId)) throw ApiError.badRequest('Invalid UPI ID');
  if (data.avatar === '') data.avatar = null;

  // Nested objects must be merged, not replaced: sending only a theme change
  // would otherwise wipe the saved language.
  const { trustedContact, preferences, ...flat } = data;
  Object.assign(req.user, flat);
  if (trustedContact) {
    req.user.trustedContact = { ...req.user.trustedContact?.toObject?.() ?? req.user.trustedContact, ...trustedContact };
  }
  if (preferences) {
    req.user.preferences = { ...req.user.preferences?.toObject?.() ?? req.user.preferences, ...preferences };
  }

  await req.user.save();

  res.json({ success: true, user: req.user.toPrivate() });
});

/**
 * PUT /api/users/me/location — called as the user moves, drives the feed.
 *
 * Also works out the name of the area ("Panvel") for the feed header. That
 * lookup needs the internet and is skipped quietly without it.
 */
export const updateLocation = asyncHandler(async (req, res) => {
  const lng = Number(req.body.lng);
  const lat = Number(req.body.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) {
    throw ApiError.badRequest('Invalid coordinates');
  }

  let city = req.body.city ? String(req.body.city).trim().slice(0, 60) : null;
  if (!city) city = await placeName(lat, lng);

  // updateOne rather than save(): two screens can report a position at the
  // same moment, and parallel save() calls on one document throw.
  const $set = { location: { type: 'Point', coordinates: [lng, lat] }, locationUpdatedAt: new Date() };
  if (city) $set.city = city;
  await User.updateOne({ _id: req.user._id }, { $set });

  res.json({ success: true, location: $set.location, city: city || req.user.city });
});

/** GET /api/users/:id — public profile with recent reviews. */
export const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');

  const [reviews, recentTasks] = await Promise.all([
    Review.find({ subject: user._id })
      .populate('reviewer', 'name avatarColor')
      .sort({ createdAt: -1 })
      .limit(10),
    Task.find({
      $or: [{ wisher: user._id }, { volunteer: user._id }],
      status: TASK_STATUS.SETTLED,
    })
      .select('title category bounty settledAt')
      .sort({ settledAt: -1 })
      .limit(5),
  ]);

  res.json({
    success: true,
    user: user.toPublic(),
    verification: user.verificationLevel(),
    reviews: reviews.map((r) => ({
      id: r._id,
      rating: r.rating,
      comment: r.comment,
      tags: r.tags,
      role: r.role,
      reviewer: { name: r.reviewer?.name, avatarColor: r.reviewer?.avatarColor },
      createdAt: r.createdAt,
    })),
    recentTasks,
  });
});

/** GET /api/users/me/trust — score breakdown for the profile screen. */
export const getTrustHistory = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    trustScore: req.user.trustScore,
    badge: req.user.badge,
    isRestricted: req.user.isRestricted,
    restrictedReason: req.user.restrictedReason,
    history: [...req.user.trustHistory].reverse().slice(0, 30),
  });
});

/** GET /api/users/leaderboard */
export const getLeaderboard = asyncHandler(async (req, res) => {
  const scope = req.query.scope === 'streak' ? 'streak' : 'trust';

  const sort = scope === 'streak'
    ? { 'stats.currentStreak': -1, trustScore: -1 }
    : { trustScore: -1, 'stats.tasksCompleted': -1 };

  const users = await User.find({ isRestricted: false, 'stats.tasksCompleted': { $gt: 0 } })
    .sort(sort)
    .limit(20);

  res.json({
    success: true,
    scope,
    leaders: users.map((u, i) => ({ rank: i + 1, ...u.toPublic() })),
  });
});

/** POST /api/users/:id/block */
export const blockUser = asyncHandler(async (req, res) => {
  if (req.params.id === String(req.user._id)) {
    throw ApiError.badRequest('You cannot block yourself');
  }
  const target = await User.findById(req.params.id);
  if (!target) throw ApiError.notFound('User not found');

  const already = req.user.blockedUsers.some((id) => String(id) === req.params.id);
  if (already) {
    req.user.blockedUsers = req.user.blockedUsers.filter((id) => String(id) !== req.params.id);
  } else {
    req.user.blockedUsers.push(target._id);
  }
  await req.user.save();

  res.json({ success: true, blocked: !already });
});

/** GET /api/users/me/notifications */
export const getNotifications = asyncHandler(async (req, res) => {
  const items = await Notification.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .limit(40);

  res.json({
    success: true,
    notifications: items,
    unread: items.filter((n) => !n.readAt).length,
  });
});

/** POST /api/users/me/notifications/read */
export const markNotificationsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { user: req.user._id, readAt: null },
    { $set: { readAt: new Date() } }
  );
  res.json({ success: true });
});

/** POST /api/users/me/push — store a Web Push subscription. */
export const savePushSubscription = asyncHandler(async (req, res) => {
  const sub = req.body.subscription;
  if (!sub?.endpoint) throw ApiError.badRequest('Invalid push subscription');

  const exists = req.user.pushSubscriptions.some((s) => s.endpoint === sub.endpoint);
  if (!exists) {
    req.user.pushSubscriptions.push(sub);
    await req.user.save();
  }
  res.json({ success: true });
});

export default {
  updateMe, updateLocation, getProfile, getTrustHistory, getLeaderboard,
  blockUser, getNotifications, markNotificationsRead, savePushSubscription,
};
