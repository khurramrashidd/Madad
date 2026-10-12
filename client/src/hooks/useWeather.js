import { useState, useEffect, useRef } from 'react';

/**
 * Current weather for the header strip.
 *
 * Open-Meteo, called straight from the browser. Three reasons it is the right
 * choice here: no API key and no signup (so nothing for the operator to
 * configure, and no secret that could leak from a client-side call), it is
 * free for non-commercial use, and going browser-to-Open-Meteo means the
 * weather still appears while the app's own backend is cold-starting on a
 * free host.
 *
 * It is also strictly decorative. Every failure path resolves to "no weather"
 * and the header simply omits the chip — a missing temperature must never
 * look like the app is broken.
 */

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const CACHE_KEY = 'madad_weather';
const CACHE_TTL = 30 * 60 * 1000; // weather does not change in ten minutes
/** Re-fetch only once the user has moved meaningfully, not on every GPS jitter. */
const MOVED_ENOUGH = 0.1; // degrees, roughly 11 km

/**
 * WMO weather codes → a short label and an emoji.
 *
 * An emoji rather than an icon font: it costs nothing to download, renders at
 * any size, and already matches the platform's own visual language.
 */
const WMO = {
  0: ['Clear', '☀️'],
  1: ['Mainly clear', '🌤️'],
  2: ['Partly cloudy', '⛅'],
  3: ['Overcast', '☁️'],
  45: ['Fog', '🌫️'],
  48: ['Freezing fog', '🌫️'],
  51: ['Light drizzle', '🌦️'],
  53: ['Drizzle', '🌦️'],
  55: ['Heavy drizzle', '🌦️'],
  56: ['Freezing drizzle', '🌧️'],
  57: ['Freezing drizzle', '🌧️'],
  61: ['Light rain', '🌦️'],
  63: ['Rain', '🌧️'],
  65: ['Heavy rain', '🌧️'],
  66: ['Freezing rain', '🌧️'],
  67: ['Freezing rain', '🌧️'],
  71: ['Light snow', '🌨️'],
  73: ['Snow', '🌨️'],
  75: ['Heavy snow', '❄️'],
  77: ['Snow grains', '🌨️'],
  80: ['Showers', '🌦️'],
  81: ['Showers', '🌧️'],
  82: ['Heavy showers', '⛈️'],
  85: ['Snow showers', '🌨️'],
  86: ['Snow showers', '❄️'],
  95: ['Thunderstorm', '⛈️'],
  96: ['Thunderstorm, hail', '⛈️'],
  97: ['Thunderstorm', '⛈️'],
  99: ['Thunderstorm, hail', '⛈️'],
};

export function describeWeather(code, isDay = 1) {
  const [label, icon] = WMO[code] || ['—', '🌡️'];
  // A clear night is a moon, not a sun.
  if (!isDay && (code === 0 || code === 1)) return { label: 'Clear', icon: '🌙' };
  return { label, icon };
}

const readCache = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export function useWeather(coords) {
  const [weather, setWeather] = useState(() => {
    const c = readCache();
    return c && Date.now() - c.at < CACHE_TTL ? c.value : null;
  });
  const fetchedFor = useRef(null);

  useEffect(() => {
    if (!coords?.lat) return;

    // Skip the call if we already have fresh weather for roughly this place.
    const cached = readCache();
    if (
      cached &&
      Date.now() - cached.at < CACHE_TTL &&
      Math.abs(cached.lat - coords.lat) < MOVED_ENOUGH &&
      Math.abs(cached.lng - coords.lng) < MOVED_ENOUGH
    ) {
      setWeather(cached.value);
      return;
    }

    const key = `${coords.lat.toFixed(2)},${coords.lng.toFixed(2)}`;
    if (fetchedFor.current === key) return;
    fetchedFor.current = key;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    let cancelled = false;

    (async () => {
      try {
        const url =
          `${ENDPOINT}?latitude=${coords.lat.toFixed(4)}&longitude=${coords.lng.toFixed(4)}` +
          '&current=temperature_2m,weather_code,is_day,apparent_temperature' +
          '&timezone=auto';

        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`weather ${res.status}`);
        const data = await res.json();
        const cur = data?.current;
        if (!cur || !Number.isFinite(cur.temperature_2m)) throw new Error('no current block');

        const value = {
          temp: Math.round(cur.temperature_2m),
          feelsLike: Number.isFinite(cur.apparent_temperature)
            ? Math.round(cur.apparent_temperature)
            : null,
          code: cur.weather_code,
          isDay: cur.is_day,
          ...describeWeather(cur.weather_code, cur.is_day),
        };

        if (cancelled) return;
        setWeather(value);
        try {
          localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ at: Date.now(), lat: coords.lat, lng: coords.lng, value })
          );
        } catch {
          /* private mode */
        }
      } catch {
        // Offline, blocked, rate-limited, or the shape changed. The header
        // just leaves the chip out; nothing else depends on this.
        if (!cancelled) fetchedFor.current = null;
      } finally {
        clearTimeout(timer);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [coords?.lat, coords?.lng]);

  return weather;
}

export default useWeather;
