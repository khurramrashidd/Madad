/**
 * One origin policy, shared by the REST API and the Socket.IO handshake.
 *
 * These two used to decide independently who was allowed to connect, which is
 * the kind of split that produces an app whose pages load but whose live feed
 * silently never connects. One function, both callers.
 *
 * In the single-service production deployment the SPA is served by this same
 * process, so the browser treats API and socket calls as same-origin and
 * sends no Origin header at all — this check is then a no-op. It earns its
 * keep for the Android app (which runs at capacitor://localhost) and for
 * local development from a phone on the same Wi-Fi.
 */
import env from './env.js';

/** Capacitor's Android WebView and a file:// shell use these schemes. */
const NATIVE_SCHEME = /^(capacitor|ionic|file):\/\//;
const LOCALHOST = /^https?:\/\/localhost(:\d+)?$/;
const LAN_IP = /^https?:\/\/(\d{1,3}\.){3}\d{1,3}(:\d+)?$/;

/**
 * @param {string|undefined} origin  the request's Origin header
 * @param {string|undefined} host    the request's own Host, for same-origin checks
 * @returns {boolean}
 */
export function isOriginAllowed(origin, host) {
  // No Origin header: curl, a plain same-origin navigation, or the native app.
  if (!origin) return true;

  /**
   * Same-origin requests are ALWAYS allowed, and this check has to come
   * first.
   *
   * It is not a convenience. An ES module script (`<script type="module">`,
   * which is what Vite emits) is fetched in CORS mode even when it is
   * same-origin, so the browser sends an Origin header for the app's own
   * JavaScript. Without this, a deployment whose own URL is not listed in
   * CLIENT_ORIGIN rejects its own bundle and the site does not load at all —
   * the page renders, every script 500s, and nothing works.
   *
   * Comparing against the request's Host means the service is correct on
   * whatever hostname it is deployed to, with nothing to configure.
   */
  if (host) {
    try {
      if (new URL(origin).host === host) return true;
    } catch {
      // A malformed Origin is not same-origin; fall through to the list.
    }
  }

  if (env.clientOrigins.includes(origin)) return true;
  if (NATIVE_SCHEME.test(origin)) return true;

  // The Android app is served from http://localhost regardless of build mode,
  // so localhost stays allowed in production too.
  if (LOCALHOST.test(origin)) return true;

  // A raw LAN IP is only trusted in development, where it is how a real phone
  // reaches the laptop. In production it would be an open door.
  if (!env.isProd && LAN_IP.test(origin)) return true;

  return false;
}

/**
 * Express `cors` delegate.
 *
 * Denies by withholding the CORS headers (`origin: false`) rather than by
 * throwing. Throwing turns a disallowed cross-origin request into a 500,
 * which misreports a policy decision as a server fault — and, because the
 * error handler returns JSON, hands the browser `application/json` where it
 * expected a stylesheet.
 */
export function corsDelegate(req, callback) {
  const origin = req.headers.origin;
  const allowed = isOriginAllowed(origin, req.headers.host);
  callback(null, { origin: allowed ? origin || true : false, credentials: true });
}

/** Socket.IO `cors.origin` callback form (same shape, different contract). */
export function socketCorsOrigin(origin, callback) {
  // Socket.IO does not hand the request to this callback, so the same-origin
  // shortcut is unavailable here. That is acceptable: a same-origin socket
  // sends no Origin header on the websocket upgrade, and the polling
  // fallback is same-origin too, so it never reaches this check in the
  // single-service deployment.
  callback(null, isOriginAllowed(origin));
}

export default { isOriginAllowed, corsDelegate, socketCorsOrigin };
