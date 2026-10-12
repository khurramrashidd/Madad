import env from '../config/env.js';
import { asyncHandler, ApiError } from '../utils/ApiError.js';
import { placeName, findPlace } from '../utils/placeName.js';

/**
 * Location services the browser cannot do for itself.
 *
 * All three of these exist to answer one question — "where is this user?" —
 * when the device's own GPS has not answered it. Between them they turn a
 * dead end ("Turn on location", with no way forward) into a chain of
 * progressively rougher but always-available answers.
 *
 * These run server-side rather than from the page on purpose: it keeps the
 * Content Security Policy down to 'self' plus two known hosts, it works
 * identically inside the Capacitor app, and the results can be cached across
 * every user instead of per browser.
 */

/**
 * Coarse position from the requesting IP address.
 *
 * City-level at best, and plain wrong on a mobile network that routes through
 * another state — which is exactly why this is the *fallback* and never the
 * primary source. Its job is to put the feed somewhere plausible so the user
 * sees tasks at all, with the UI stating clearly that the position is
 * approximate and offering to fix it.
 */
const ipCache = new Map();
const IP_CACHE_TTL = 6 * 60 * 60 * 1000;

const isPrivateIp = (ip) =>
  !ip ||
  ip === '::1' ||
  ip.startsWith('127.') ||
  ip.startsWith('10.') ||
  ip.startsWith('192.168.') ||
  /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
  ip.startsWith('fc') ||
  ip.startsWith('fd');

export const ipLocation = asyncHandler(async (req, res) => {
  // `trust proxy` is set, so req.ip is the real client address behind the host's
  // load balancer rather than the balancer's own.
  const raw = String(req.ip || '').replace(/^::ffff:/, '');

  const fallback = {
    success: true,
    source: 'default',
    approximate: true,
    lat: env.seed.lat,
    lng: env.seed.lng,
    city: env.seed.city,
    message: 'Using the default area — turn on location for tasks near you.',
  };

  // Local development, or a device on a LAN: there is nothing to look up.
  if (isPrivateIp(raw)) return res.json(fallback);

  const cached = ipCache.get(raw);
  if (cached && Date.now() - cached.at < IP_CACHE_TTL) {
    return res.json({ ...cached.value, cached: true });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    let data;
    try {
      // Keyless, no signup, CORS-friendly and generous on free use.
      const r = await fetch(`https://ipwho.is/${encodeURIComponent(raw)}`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Madad/1.0' },
      });
      data = r.ok ? await r.json() : null;
    } finally {
      clearTimeout(timer);
    }

    if (!data?.success || !Number.isFinite(data.latitude) || !Number.isFinite(data.longitude)) {
      return res.json(fallback);
    }

    const value = {
      success: true,
      source: 'ip',
      approximate: true,
      lat: Number(data.latitude),
      lng: Number(data.longitude),
      city: data.city || data.region || env.seed.city,
      message: 'Approximate location from your network. Turn on GPS for exact distances.',
    };

    ipCache.set(raw, { at: Date.now(), value });
    if (ipCache.size > 2000) ipCache.delete(ipCache.keys().next().value);

    res.json(value);
  } catch {
    // Offline, blocked, or the service is down — never fail the request.
    res.json(fallback);
  }
});

/** GET /api/geo/reverse?lat=&lng= — coordinates to a short area name. */
export const reverse = asyncHandler(async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw ApiError.badRequest('Invalid coordinates');
  }
  const name = await placeName(lat, lng);
  res.json({ success: true, city: name, lat, lng });
});

/**
 * GET /api/geo/search?q= — place name to coordinates.
 *
 * Powers the manual area picker, which is the last link in the fallback
 * chain. If GPS is off, denied, blocked by an insecure origin, or simply not
 * working on this device, the user can still type "Kharghar" and get a
 * working feed. An app that gives up at "location denied" is useless to
 * anyone whose phone has a broken GPS.
 */
export const search = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) throw ApiError.badRequest('Type at least two characters');

  const hit = await findPlace(q);
  if (!hit) {
    return res.json({ success: true, results: [] });
  }

  res.json({
    success: true,
    results: [{ lat: hit.lat, lng: hit.lng, name: hit.name, label: hit.label }],
  });
});

export default { ipLocation, reverse, search };
