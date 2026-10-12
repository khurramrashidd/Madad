import rateLimit from 'express-rate-limit';
import env from '../config/env.js';

const skipInDev = () => !env.isProd && process.env.FORCE_RATE_LIMIT !== 'true';

const base = {
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInDev, // never let a rate limit ruin a live demo
  message: { success: false, message: 'Too many requests, please slow down' },
};

/** Broad limiter applied to every /api route. */
export const apiLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max: 600,
});

/** Tight limiter on login/register/OTP — the usual brute-force targets. */
export const authLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many attempts. Try again in 15 minutes.' },
});

/** Stops someone spamming the feed with junk tasks. */
export const createTaskLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'You have posted a lot of tasks this hour. Take a breather.' },
});

/** Chat flood control. */
export const messageLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  max: 40,
});
