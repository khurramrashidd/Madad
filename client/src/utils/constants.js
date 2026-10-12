/** Mirrors server/src/utils/constants.js — keep the two in sync. */

export const TASK_STATUS = {
  OPEN: 'open',
  CLAIMED: 'claimed',
  DELIVERED: 'delivered',
  PAID_PENDING: 'paid_pending',
  SETTLED: 'settled',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  DISPUTED: 'disputed',
};

export const STATUS_META = {
  open: { label: 'Open', tone: 'bg-brand-100 text-brand-800' },
  claimed: { label: 'In progress', tone: 'bg-info/10 text-info' },
  // Tinted with the app's own semantic colours rather than Tailwind's default
  // palette, so these chips invert correctly in dark mode.
  delivered: { label: 'Awaiting payment', tone: 'bg-warn/10 text-warn' },
  paid_pending: { label: 'Confirming payment', tone: 'bg-info/10 text-info' },
  settled: { label: 'Settled', tone: 'bg-success/10 text-success' },
  cancelled: { label: 'Cancelled', tone: 'bg-ink-100 text-ink-500' },
  expired: { label: 'Expired', tone: 'bg-ink-100 text-ink-500' },
  disputed: { label: 'Disputed', tone: 'bg-danger/10 text-danger' },
};

export const CATEGORIES = [
  { value: 'delivery', label: 'Delivery', icon: '📦' },
  { value: 'printout', label: 'Printouts', icon: '🖨️' },
  { value: 'heavy_lifting', label: 'Heavy Lifting', icon: '💪' },
  { value: 'queue_standing', label: 'Queue Standing', icon: '🧍' },
  { value: 'shopping', label: 'Shopping', icon: '🛒' },
  { value: 'pet_care', label: 'Pet Care', icon: '🐕' },
  { value: 'tech_help', label: 'Tech Help', icon: '💻' },
  { value: 'tutoring', label: 'Tutoring', icon: '📚' },
  { value: 'other', label: 'Other', icon: '✨' },
];

export const categoryMeta = (value) =>
  CATEGORIES.find((c) => c.value === value) || CATEGORIES[CATEGORIES.length - 1];

export const BADGE_META = {
  newcomer: { label: 'Newcomer', tone: 'bg-ink-100 text-ink-600', icon: '🌱' },
  reliable: { label: 'Reliable', tone: 'bg-info/10 text-info', icon: '👍' },
  trusted: { label: 'Trusted', tone: 'bg-success/10 text-success', icon: '⭐' },
  champion: { label: 'Champion', tone: 'bg-brand-100 text-brand-800', icon: '🏆' },
  restricted: { label: 'Restricted', tone: 'bg-danger/10 text-danger', icon: '🚫' },
};

export const SOCKET_EVENTS = {
  TASK_NEW: 'task:new',
  TASK_CLAIMED: 'task:claimed',
  TASK_UPDATED: 'task:updated',
  TASK_REMOVED: 'task:removed',
  CHAT_MESSAGE: 'chat:message',
  CHAT_TYPING: 'chat:typing',
  CHAT_CLOSED: 'chat:closed',
  NOTIFICATION: 'notification:new',
  TRUST_UPDATED: 'trust:updated',
  TRIP_LOCATION: 'trip:location',
  SOS_RAISED: 'sos:raised',
  FEED_JOIN: 'feed:join',
  LOCATION_UPDATE: 'location:update',
  CHAT_JOIN: 'chat:join',
  CHAT_LEAVE: 'chat:leave',
  CHAT_SEND: 'chat:send',
  CHAT_TYPING_SEND: 'chat:typing:send',
};

/** Must match server/src/utils/constants.js. */
export const MAX_RADIUS_M = 2_000_000;
export const DEFAULT_RADIUS_M = 5000;

/**
 * Distance filter options.
 *
 * The product is hyperlocal and the default stays at 5 km, but capping the
 * filter there made the app unusable outside a dense city: someone in a
 * village with nothing within 5 km was simply told "nothing nearby" with no
 * way to look further. The top option exists so that is never a dead end.
 */
export const RADIUS_OPTIONS = [
  { value: 500, label: '500 m' },
  { value: 2000, label: '2 km' },
  { value: 5000, label: '5 km' },
  { value: 25000, label: '25 km' },
  { value: 100000, label: '100 km' },
  { value: MAX_RADIUS_M, label: 'Anywhere' },
];

/**
 * Human distance: "300 m", "0.5 km", "5.2 km", "500 km".
 *
 * Mirrors formatDistance in server/src/utils/geo.js. The server labels what
 * it sends, but the client re-derives it for positions that never reach the
 * server — a live socket push, or a distance recomputed as the user moves.
 */
export function formatDistance(meters) {
  if (meters == null || !Number.isFinite(Number(meters))) return null;
  const m = Math.max(0, Math.round(Number(meters)));

  if (m < 50) return 'a few steps away';
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;

  const km = m / 1000;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/** "within 5 km" / "anywhere in India" — for the feed's result count line. */
export function formatRadius(meters) {
  if (meters >= MAX_RADIUS_M) return 'anywhere in India';
  if (meters < 1000) return `within ${meters} m`;
  const km = meters / 1000;
  return `within ${km < 10 ? km.toFixed(1).replace(/\.0$/, '') : Math.round(km)} km`;
}

export const DISPUTE_REASONS = [
  { value: 'not_paid', label: 'They did not pay me' },
  { value: 'not_done', label: 'The task was not done' },
  { value: 'no_show', label: 'They never turned up' },
  { value: 'wrong_amount', label: 'Wrong amount was paid' },
  { value: 'abusive', label: 'Abusive behaviour' },
  { value: 'other', label: 'Something else' },
];

export const REVIEW_TAGS = {
  positive: ['punctual', 'polite', 'careful', 'fast', 'clear'],
  negative: ['late', 'rude', 'careless'],
};
