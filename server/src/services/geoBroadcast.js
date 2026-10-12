/**
 * Geo-targeted real-time delivery.
 *
 * The naive version of a live feed is `io.emit('task:new', task)` — every
 * connected client in the country is handed every new task and left to filter
 * it client-side. That is wrong in two ways. It leaks tasks to people who
 * have no business seeing them, and it does not actually work: the payload
 * broadcast to a room has no single "distance", because distance is a fact
 * about the *recipient*, not about the task.
 *
 * So instead of one broadcast, this sends one tailored payload per nearby
 * socket. Each recipient's own last known position decides whether they hear
 * about the task at all, and the payload they receive carries the distance
 * from *them*, already formatted. The client then has a real number to filter
 * its radius against instead of a null.
 *
 * Sockets register their position on connect and refresh it as the device
 * moves, so this works off live positions rather than whatever was last
 * written to the database.
 */
import { haversineMeters, formatDistance } from '../utils/geo.js';
import { LIVE_BROADCAST_RADIUS_M } from '../utils/constants.js';

/**
 * socketId → { coords: [lng, lat], userId }
 *
 * In-memory and per-process, which is the right scope: a position is only
 * useful while that socket is connected, and it dies with it. A multi-instance
 * deployment would need the Socket.IO Redis adapter, but a single free-tier
 * instance is exactly one process.
 */
const positions = new Map();

export function rememberPosition(socketId, userId, coords) {
  if (!Array.isArray(coords) || coords.length !== 2) return;
  const [lng, lat] = coords.map(Number);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return;
  positions.set(socketId, { coords: [lng, lat], userId: String(userId) });
}

export function forgetPosition(socketId) {
  positions.delete(socketId);
}

export const trackedSocketCount = () => positions.size;

/**
 * Sends `event` to every connected socket within `radius` of `coords`,
 * with each recipient's own distance mixed into the payload.
 *
 * @param io          the Socket.IO server
 * @param coords      [lng, lat] the event happened at
 * @param event       event name
 * @param payload     base payload, shared by all recipients
 * @param options.radius   metres; defaults to the live broadcast radius
 * @param options.exclude  user id to skip (normally the person who acted)
 * @param options.decorate (distance) => extra payload fields
 * @returns number of sockets the event reached
 */
export function emitNearby(io, coords, event, payload, options = {}) {
  if (!io || !Array.isArray(coords)) return 0;
  const { radius = LIVE_BROADCAST_RADIUS_M, exclude = null, decorate } = options;
  const excludeId = exclude ? String(exclude) : null;

  let delivered = 0;

  for (const [socketId, entry] of positions) {
    if (excludeId && entry.userId === excludeId) continue;

    const socket = io.sockets.sockets.get(socketId);
    if (!socket) {
      // The socket went away without a disconnect handler firing.
      positions.delete(socketId);
      continue;
    }

    const distance = haversineMeters(entry.coords, coords);
    if (distance > radius) continue;

    socket.emit(event, {
      ...payload,
      distance,
      distanceLabel: formatDistance(distance),
      ...(decorate ? decorate(distance) : {}),
    });
    delivered += 1;
  }

  return delivered;
}

/**
 * Ids of users near a point, nearest first — used to decide who is worth
 * sending a push notification to about a new task.
 *
 * Deliberately reads from live socket positions rather than the database:
 * someone with the app open right now is far likelier to actually pick the
 * task up than someone whose stored location happens to be close.
 */
export function usersNearby(coords, radius = LIVE_BROADCAST_RADIUS_M, exclude = null) {
  if (!Array.isArray(coords)) return [];
  const excludeId = exclude ? String(exclude) : null;
  const seen = new Map();

  for (const entry of positions.values()) {
    if (excludeId && entry.userId === excludeId) continue;
    const distance = haversineMeters(entry.coords, coords);
    if (distance > radius) continue;
    // One entry per user, even with several tabs open — keep the closest.
    const prev = seen.get(entry.userId);
    if (!prev || distance < prev) seen.set(entry.userId, distance);
  }

  return [...seen.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([userId, distance]) => ({ userId, distance }));
}

export default { rememberPosition, forgetPosition, emitNearby, usersNearby, trackedSocketCount };
