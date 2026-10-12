import crypto from 'crypto';
import { DEFAULT_RADIUS_M, MAX_RADIUS_M } from './constants.js';

/** Cryptographically random 4-digit handshake code, zero-padded. */
export function generateHandshakeCode() {
  return String(crypto.randomInt(0, 10000)).padStart(4, '0');
}

/** Random hex string, used for client refs and misc tokens. */
export function randomToken(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

/** Great-circle distance in metres between two [lng, lat] pairs. */
export function haversineMeters([lng1, lat1], [lng2, lat2]) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

/**
 * Human distance: "300 m", "0.5 km", "5.2 km", "500 km".
 *
 * Precision drops as distance grows, because that is how people actually
 * think about it. Under a kilometre, metres rounded to the nearest 10 are
 * what you'd say out loud ("about 300 m"). Between 1 and 10 km one decimal
 * still carries meaning. Past 10 km the decimal is noise, so "512 km" rather
 * than "512.3 km".
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

/** Clamp a user-supplied radius to something sane. */
export function normalizeRadius(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_RADIUS_M;
  return Math.min(Math.max(Math.round(n), 100), MAX_RADIUS_M);
}

/**
 * Parse lng/lat from a query string, returning null when either is missing or
 * out of range — callers fall back to the user's stored location.
 */
export function parseCoords(lng, lat) {
  const x = Number(lng);
  const y = Number(lat);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < -180 || x > 180 || y < -90 || y > 90) return null;
  return [x, y];
}

/**
 * Jitter a point by up to `meters` so the public feed doesn't broadcast
 * somebody's exact front door. The precise location is only revealed to the
 * volunteer after they claim the task.
 */
export function fuzzCoords([lng, lat], meters = 150) {
  const r = meters / 111320;
  const angle = Math.random() * 2 * Math.PI;
  const dist = Math.sqrt(Math.random()) * r;
  return [
    Number((lng + (dist * Math.cos(angle)) / Math.cos((lat * Math.PI) / 180)).toFixed(6)),
    Number((lat + dist * Math.sin(angle)).toFixed(6)),
  ];
}

export default {
  generateHandshakeCode,
  randomToken,
  haversineMeters,
  formatDistance,
  normalizeRadius,
  parseCoords,
  fuzzCoords,
};
