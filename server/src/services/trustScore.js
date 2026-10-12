import User from '../models/User.js';
import Notification from '../models/Notification.js';
import env from '../config/env.js';
import {
  TRUST_EVENTS,
  TRUST_MIN,
  TRUST_MAX,
  BADGES,
} from '../utils/constants.js';

/**
 * Trust engine.
 *
 * Madad never holds money, so nothing stops a wisher from ghosting after a
 * task is done. Trust score is the whole enforcement mechanism: it is the
 * cost of behaving badly. Points move on verified events only — never on
 * self-reported claims — and the two-sided payment confirmation is what makes
 * "PAID_ON_TIME" verifiable at all.
 *
 * Score bands:
 *   0-39   restricted — cannot post or claim
 *   40-59  newcomer
 *   60-79  reliable
 *   80-92  trusted
 *   93-100 champion
 */

const clamp = (n) => Math.max(TRUST_MIN, Math.min(TRUST_MAX, Math.round(n)));

export function badgeFor(score, isRestricted) {
  if (isRestricted || score < env.trust.restrictBelow) return BADGES.RESTRICTED;
  if (score >= 93) return BADGES.CHAMPION;
  if (score >= 80) return BADGES.TRUSTED;
  if (score >= 60) return BADGES.RELIABLE;
  return BADGES.NEWCOMER;
}

/**
 * Diminishing returns on gains: climbing from 90 to 100 should be much harder
 * than climbing from 50 to 60, otherwise everyone maxes out in a week and the
 * score stops carrying information. Penalties always land at full weight.
 */
function scaleDelta(currentScore, delta) {
  if (delta <= 0) return delta;
  const headroom = (TRUST_MAX - currentScore) / TRUST_MAX; // 1 → 0
  const factor = 0.35 + 0.65 * headroom;
  return delta * factor;
}

/**
 * Apply a trust event to a user.
 * @param {string} userId
 * @param {keyof TRUST_EVENTS} eventKey
 * @param {{ task?: string, note?: string, overrideDelta?: number, io?: any }} opts
 */
export async function applyTrustEvent(userId, eventKey, opts = {}) {
  const spec = TRUST_EVENTS[eventKey];
  if (!spec) throw new Error(`Unknown trust event: ${eventKey}`);

  const user = await User.findById(userId);
  if (!user) return null;

  const rawDelta =
    typeof opts.overrideDelta === 'number' ? opts.overrideDelta : spec.delta;
  const effectiveDelta = scaleDelta(user.trustScore, rawDelta);
  const before = user.trustScore;
  const after = clamp(before + effectiveDelta);

  user.trustScore = after;

  // Restriction is sticky-ish: it trips automatically below the floor and
  // lifts automatically once the user climbs back above it, unless an admin
  // restricted them manually (restrictedReason starting with "admin:").
  const adminLocked = user.restrictedReason?.startsWith('admin:');
  if (!adminLocked) {
    if (after < env.trust.restrictBelow && !user.isRestricted) {
      user.isRestricted = true;
      user.restrictedReason = `Trust score fell below ${env.trust.restrictBelow}`;
      await Notification.create({
        user: user._id,
        type: 'restricted',
        title: 'Your account is restricted',
        body: `Your trust score dropped to ${after}. You cannot post or claim tasks until it recovers above ${env.trust.restrictBelow}.`,
      });
    } else if (after >= env.trust.restrictBelow && user.isRestricted) {
      user.isRestricted = false;
      user.restrictedReason = null;
    }
  }

  user.badge = badgeFor(after, user.isRestricted);

  user.trustHistory.push({
    key: spec.key,
    label: opts.note || spec.label,
    delta: Number((after - before).toFixed(2)),
    scoreAfter: after,
    task: opts.task,
    note: opts.note,
  });
  // Keep the history bounded.
  if (user.trustHistory.length > 60) {
    user.trustHistory = user.trustHistory.slice(-60);
  }

  await user.save();

  if (opts.io && after !== before) {
    opts.io.to(`user:${user._id}`).emit('trust:updated', {
      trustScore: after,
      badge: user.badge,
      delta: after - before,
      reason: spec.label,
      isRestricted: user.isRestricted,
    });
  }

  return { before, after, delta: after - before, badge: user.badge, user };
}

/**
 * Completion streak. Three tasks finished inside 7 days of each other earns a
 * bonus — rewards consistency rather than one-off heroics.
 */
export async function bumpStreak(userId, opts = {}) {
  const user = await User.findById(userId);
  if (!user) return null;

  const last = user.stats.lastCompletedAt;
  const withinWindow = last && Date.now() - last.getTime() < 7 * 24 * 60 * 60 * 1000;

  user.stats.currentStreak = withinWindow ? user.stats.currentStreak + 1 : 1;
  user.stats.bestStreak = Math.max(user.stats.bestStreak, user.stats.currentStreak);
  user.stats.lastCompletedAt = new Date();
  await user.save();

  if (user.stats.currentStreak > 0 && user.stats.currentStreak % 3 === 0) {
    await applyTrustEvent(userId, 'STREAK_BONUS', {
      ...opts,
      note: `${user.stats.currentStreak}-task streak`,
    });
  }
  return user.stats.currentStreak;
}

export function breakStreak(user) {
  user.stats.currentStreak = 0;
  return user;
}

/** Guard used by routes: throws-free boolean check. */
export function canTransact(user) {
  return Boolean(user) && !user.isRestricted && user.trustScore >= env.trust.restrictBelow;
}

export default { applyTrustEvent, bumpStreak, breakStreak, badgeFor, canTransact };
