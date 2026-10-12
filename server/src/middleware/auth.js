import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import env from '../config/env.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { ROLES } from '../utils/constants.js';

export function signToken(userId) {
  return jwt.sign({ id: userId }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

function extractToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  if (req.cookies?.token) return req.cookies.token;
  return null;
}

/** Requires a valid token. Attaches req.user. */
export const protect = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized('Please log in to continue');

  const decoded = verifyToken(token);
  const user = await User.findById(decoded.id);
  if (!user) throw ApiError.unauthorized('That account no longer exists');

  /**
   * Touch lastActiveAt without going through the document.
   *
   * Using `user.save()` here would be a second save racing on the SAME
   * document instance that the route handler is about to save (profile edits,
   * location updates, blocking). Mongoose rejects that with "Can't save() the
   * same doc multiple times in parallel". updateOne writes straight to the
   * collection and leaves the in-memory document untouched, so handlers are
   * free to save it themselves.
   */
  User.updateOne({ _id: user._id }, { $set: { lastActiveAt: new Date() } })
    .catch(() => {}); // fire-and-forget, never block the request

  req.user = user;
  next();
});

/** Attaches req.user when a token is present, but never rejects. */
export const optionalAuth = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const decoded = verifyToken(token);
    req.user = await User.findById(decoded.id);
  } catch {
    // ignore — treated as anonymous
  }
  next();
});

export const adminOnly = (req, res, next) => {
  if (req.user?.role !== ROLES.ADMIN) {
    return next(ApiError.forbidden('Admin access required'));
  }
  next();
};

/**
 * Blocks restricted users from the actions that move money or make promises.
 * Browsing stays open — being restricted shouldn't make the app look broken.
 */
export const requireGoodStanding = (req, res, next) => {
  if (req.user?.isRestricted) {
    return next(
      ApiError.forbidden(
        req.user.restrictedReason ||
          'Your account is restricted. Complete pending obligations to restore it.'
      )
    );
  }
  next();
};

/** Volunteer needs a UPI ID on file before they can claim anything. */
export const requireUpi = (req, res, next) => {
  if (!req.user?.upiId) {
    return next(
      ApiError.badRequest('Add your UPI ID in your profile before claiming tasks')
    );
  }
  next();
};
