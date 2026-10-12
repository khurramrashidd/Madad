/**
 * Shared enums and constants. Keep the client's copy (client/src/utils/constants.js)
 * in sync with this file.
 */

export const TASK_STATUS = {
  OPEN: 'open',           // visible on the public feed
  CLAIMED: 'claimed',     // a volunteer accepted; removed from feed
  DELIVERED: 'delivered', // handshake code verified, awaiting payment
  PAID_PENDING: 'paid_pending', // wisher says paid, volunteer hasn't confirmed
  SETTLED: 'settled',     // both sides confirmed; chat soft-deleted
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  DISPUTED: 'disputed',
};

export const OPEN_STATES = [TASK_STATUS.OPEN];
export const ACTIVE_STATES = [
  TASK_STATUS.CLAIMED,
  TASK_STATUS.DELIVERED,
  TASK_STATUS.PAID_PENDING,
];
export const CLOSED_STATES = [
  TASK_STATUS.SETTLED,
  TASK_STATUS.CANCELLED,
  TASK_STATUS.EXPIRED,
];

export const TASK_CATEGORIES = [
  'delivery',
  'printout',
  'heavy_lifting',
  'queue_standing',
  'shopping',
  'pet_care',
  'tech_help',
  'tutoring',
  'other',
];

export const CATEGORY_LABELS = {
  delivery: 'Delivery',
  printout: 'Printouts',
  heavy_lifting: 'Heavy Lifting',
  queue_standing: 'Queue Standing',
  shopping: 'Shopping',
  pet_care: 'Pet Care',
  tech_help: 'Tech Help',
  tutoring: 'Tutoring',
  other: 'Other',
};

export const ROLES = {
  USER: 'user',
  ADMIN: 'admin',
};

export const BADGES = {
  NEWCOMER: 'newcomer',
  RELIABLE: 'reliable',
  TRUSTED: 'trusted',
  CHAMPION: 'champion',
  RESTRICTED: 'restricted',
};

/** Trust score deltas. Positive rewards, negative penalties. */
export const TRUST_EVENTS = {
  TASK_POSTED: { key: 'TASK_POSTED', delta: 0, label: 'Posted a task' },
  TASK_COMPLETED: { key: 'TASK_COMPLETED', delta: +4, label: 'Completed a task' },
  PAID_ON_TIME: { key: 'PAID_ON_TIME', delta: +5, label: 'Paid the bounty' },
  PAYMENT_CONFIRMED: { key: 'PAYMENT_CONFIRMED', delta: +2, label: 'Confirmed receipt' },
  GOOD_REVIEW: { key: 'GOOD_REVIEW', delta: +3, label: 'Received a 4-5 star review' },
  BAD_REVIEW: { key: 'BAD_REVIEW', delta: -5, label: 'Received a 1-2 star review' },
  VOLUNTEER_FLAKED: { key: 'VOLUNTEER_FLAKED', delta: -15, label: 'Abandoned a claimed task' },
  WISHER_CANCELLED_LATE: { key: 'WISHER_CANCELLED_LATE', delta: -10, label: 'Cancelled after a claim' },
  NON_PAYMENT: { key: 'NON_PAYMENT', delta: -25, label: 'Failed to pay a bounty' },
  DISPUTE_LOST: { key: 'DISPUTE_LOST', delta: -20, label: 'Lost a dispute' },
  DISPUTE_WON: { key: 'DISPUTE_WON', delta: +2, label: 'Won a dispute' },
  ADMIN_ADJUSTMENT: { key: 'ADMIN_ADJUSTMENT', delta: 0, label: 'Adjusted by an admin' },
  STREAK_BONUS: { key: 'STREAK_BONUS', delta: +3, label: 'Completion streak bonus' },
};

export const TRUST_MIN = 0;
export const TRUST_MAX = 100;

/** Minutes before an unclaimed task auto-expires. */
export const TASK_EXPIRY_MINUTES = 90;

/** Days a settled chat is kept (soft-deleted) for dispute resolution. */
export const CHAT_RETENTION_DAYS = 7;

/** Default radius, in metres, for the "near me" feed. */
export const DEFAULT_RADIUS_M = 5000;

/**
 * Upper bound on the feed radius.
 *
 * The product is hyperlocal, so the default stays at 5 km — but a user in a
 * village may genuinely have nothing within 5 km, and being told "nothing
 * nearby" with no way to widen the search is a dead end. 2,000 km covers
 * mainland India end to end, which is what the "Anywhere" option means in
 * practice. $geoNear still uses the 2dsphere index, so a wide radius costs
 * no more than a narrow one.
 */
export const MAX_RADIUS_M = 2_000_000;

/**
 * The radius choices offered in the UI. Kept here so the server and client
 * cannot disagree about what "5 km" means.
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
 * How far a brand-new task is pushed in real time.
 *
 * A task is only broadcast to people who could plausibly do it. Without this
 * the server fans every new task out to every connected client in the
 * country. 100 km is deliberately wider than the default feed radius so that
 * someone browsing with a wide filter still sees it arrive live.
 */
export const LIVE_BROADCAST_RADIUS_M = 100000;

export const SOCKET_EVENTS = {
  // server → client
  TASK_NEW: 'task:new',
  TASK_CLAIMED: 'task:claimed',
  TASK_UPDATED: 'task:updated',
  TASK_REMOVED: 'task:removed',
  CHAT_MESSAGE: 'chat:message',
  CHAT_TYPING: 'chat:typing',
  CHAT_CLOSED: 'chat:closed',
  NOTIFICATION: 'notification:new',
  TRUST_UPDATED: 'trust:updated',
  /** A party to an active task started sharing their live position. */
  TRIP_LOCATION: 'trip:location',
  /** Someone on an active task triggered an SOS. */
  SOS_RAISED: 'sos:raised',
  // client → server
  FEED_JOIN: 'feed:join',
  FEED_LEAVE: 'feed:leave',
  /** The client's position moved; decides who gets live task pushes. */
  LOCATION_UPDATE: 'location:update',
  CHAT_JOIN: 'chat:join',
  CHAT_LEAVE: 'chat:leave',
  CHAT_SEND: 'chat:send',
  CHAT_TYPING_SEND: 'chat:typing:send',
};
