/**
 * Turns coordinates into a short place name ("Panvel", "Kharghar") for the
 * feed header.
 *
 * Uses OpenStreetMap's free Nominatim service — the same map data the app
 * already draws. It is a nicety, not a dependency: with no internet, a slow
 * reply or any error, this resolves to null and the caller keeps whatever
 * name it had.
 *
 * Nominatim's usage policy asks for an identifying User-Agent and at most one
 * request a second, so answers are cached per ~1 km square and calls are
 * spaced out.
 */
const cache = new Map();
let lastCall = 0;

const ENDPOINT = 'https://nominatim.openstreetmap.org';
const HEADERS = {
  'User-Agent': 'Madad/1.0 (student project; local demo)',
  'Accept-Language': 'en',
};

const keyFor = (lat, lng) => `${lat.toFixed(2)},${lng.toFixed(2)}`;

async function politeFetch(url, timeoutMs) {
  const wait = Math.max(0, lastCall + 1100 - Date.now());
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Picks the most useful local name out of a Nominatim address block. */
export function pickPlaceName(address = {}) {
  return (
    address.suburb ||
    address.neighbourhood ||
    address.town ||
    address.city ||
    address.village ||
    address.municipality ||
    address.county ||
    address.state_district ||
    null
  );
}

export async function placeName(lat, lng, { timeoutMs = 3500 } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (process.env.PLACE_NAMES === 'off') return null;

  const key = keyFor(lat, lng);
  if (cache.has(key)) return cache.get(key);

  try {
    const data = await politeFetch(
      `${ENDPOINT}/reverse?format=jsonv2&zoom=14&lat=${lat}&lon=${lng}`,
      timeoutMs
    );
    const name = pickPlaceName(data?.address);
    if (name) {
      cache.set(key, name.slice(0, 60));
      if (cache.size > 500) cache.delete(cache.keys().next().value);
    }
    return name ? name.slice(0, 60) : null;
  } catch {
    return null; // offline, slow, or blocked: not worth failing anything over
  }
}

/** Place name → coordinates, for `npm run move-demo -- Kharghar`. */
export async function findPlace(query, { timeoutMs = 8000 } = {}) {
  try {
    const data = await politeFetch(
      `${ENDPOINT}/search?format=jsonv2&limit=1&countrycodes=in&addressdetails=1&q=${encodeURIComponent(query)}`,
      timeoutMs
    );
    const hit = Array.isArray(data) ? data[0] : null;
    if (!hit) return null;
    return {
      lat: Number(hit.lat),
      lng: Number(hit.lon),
      name: pickPlaceName(hit.address) || String(query).split(',')[0].trim(),
      label: hit.display_name,
    };
  } catch {
    return null;
  }
}

export default placeName;
