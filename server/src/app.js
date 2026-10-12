import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';

import env from './config/env.js';
import { corsDelegate } from './config/origins.js';
import { notFound, errorHandler } from './middleware/error.js';
import { apiLimiter } from './middleware/rateLimit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import authRoutes from './routes/authRoutes.js';
import taskRoutes from './routes/taskRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import userRoutes from './routes/userRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import voiceRoutes from './routes/voiceRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import safetyRoutes from './routes/safetyRoutes.js';
import geoRoutes from './routes/geoRoutes.js';

const clientDist = path.resolve(__dirname, '../../client/dist');
const clientIndex = path.join(clientDist, 'index.html');
const hasClientBuild = fs.existsSync(clientIndex);

/**
 * CSP hashes for the inline scripts in index.html.
 *
 * index.html carries one small inline script that applies the saved theme
 * before first paint — React cannot do that job, because by the time the
 * bundle has parsed the browser has already painted a white page and a
 * dark-mode user sees a flash on every cold start.
 *
 * A strict `script-src 'self'` blocks it, so the policy has to permit that
 * exact script. The hash is computed from the built file at startup rather
 * than hard-coded: a hard-coded hash would go stale the first time anyone
 * edited the script, silently reintroducing the flash and logging a CSP
 * violation on every page load — the sort of bug that goes unnoticed for
 * months.
 */
function inlineScriptHashes() {
  if (!hasClientBuild) return [];
  try {
    const html = fs.readFileSync(clientIndex, 'utf8');
    const hashes = [];
    // Inline <script> blocks only — anything with src= is covered by 'self'.
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      if (!m[1].trim()) continue;
      const digest = crypto.createHash('sha256').update(m[1], 'utf8').digest('base64');
      hashes.push(`'sha256-${digest}'`);
    }
    return hashes;
  } catch {
    return [];
  }
}

const app = express();

app.set('trust proxy', 1);

/**
 * In production this process also serves the SPA, so a real Content Security
 * Policy is worth having. The allow-list is exactly what the app needs:
 * OpenStreetMap for map tiles, Open-Meteo for the weather strip, Nominatim
 * for place names, and `data:`/`blob:` for the QR code canvas and the
 * compressed avatar the profile screen produces.
 *
 * In development it stays off, because Vite's dev server injects inline
 * scripts and a hot-reload websocket that no sane policy would permit.
 */
const cspDirectives = {
  defaultSrc: ["'self'"],
  // 'unsafe-inline' for styles only: Leaflet and the app both set inline
  // style attributes, which no nonce can cover.
  styleSrc: ["'self'", "'unsafe-inline'"],
  // 'self' plus the exact hash of the pre-paint theme script. No
  // 'unsafe-inline', so an injected script still cannot run.
  scriptSrc: ["'self'", ...inlineScriptHashes()],
  imgSrc: ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org'],
  connectSrc: [
    "'self'",
    'https://api.open-meteo.com',
    'https://nominatim.openstreetmap.org',
    'https://*.tile.openstreetmap.org',
    // Socket.IO upgrades to wss:// on the same origin.
    'wss:',
  ],
  fontSrc: ["'self'", 'data:'],
  objectSrc: ["'none'"],
  frameAncestors: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
};

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // Leaflet tiles come from a third-party origin.
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: env.isProd ? { directives: cspDirectives } : false,
  })
);

/**
 * CORS on the API only.
 *
 * It used to be applied to every request, including the app's own static
 * assets — and because an ES module script is fetched in CORS mode even
 * same-origin, the browser sent an Origin header for the app's own bundle.
 * Any deployment whose hostname was not listed in CLIENT_ORIGIN then
 * rejected its own JavaScript, so the page loaded and nothing on it worked.
 *
 * Static files need no CORS policy: they are served to the page that asked
 * for them, from the same origin. Scoping this to /api keeps the policy where
 * it actually matters — the Android app and other cross-origin API clients.
 */
app.use('/api', cors(corsDelegate));

app.use(compression());
/**
 * 1 MB was too tight once profiles carry an avatar. The client downscales to
 * a 256 px WebP (~20-40 KB as a data URI) before upload, so 4 MB is slack
 * rather than a target — but it means a slightly large image is rejected by
 * the validator with a clear message instead of by the body parser with an
 * opaque 413.
 */
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: true, limit: '4mb' }));
if (!env.isProd) app.use(morgan('dev'));

/**
 * Health check, mounted ahead of the rate limiter.
 *
 * Two things poll this: the offline engine in the client, which confirms a
 * real round trip before declaring itself back online, and the external
 * keep-alive cron that stops the free host idling. Neither should ever be
 * able to exhaust the API budget, and a 429 here would make the app believe
 * it is offline while it is not.
 */
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    service: 'madad-api',
    status: 'ok',
    env: env.nodeEnv,
    time: new Date().toISOString(),
    features: {
      sarvam: env.sarvam.enabled,
      webPush: env.vapid.enabled,
    },
  });
});

/** Config the client reads on boot so nothing is hardcoded twice. */
app.get('/api/config', (req, res) => {
  res.json({
    success: true,
    config: {
      minBounty: env.minBounty,
      maxBounty: env.maxBounty,
      trustRestrictBelow: env.trust.restrictBelow,
      defaultCenter: { lat: env.seed.lat, lng: env.seed.lng },
      city: env.seed.city,
      sarvamEnabled: env.sarvam.enabled,
      pushEnabled: env.vapid.enabled,
      vapidPublicKey: env.vapid.publicKey || null,
      /**
       * Whether to offer phone sign-in at all.
       *
       * It is mocked — a fixed code, no SMS provider — so it is refused in
       * production unless explicitly opted into. Telling the client lets the
       * login screen hide the tab, rather than offering a route that fails
       * the moment someone takes it.
       */
      phoneLoginEnabled: !env.isProd || process.env.ALLOW_MOCK_OTP === 'true',
    },
  });
});

app.use('/api', apiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/safety', safetyRoutes);
app.use('/api/geo', geoRoutes);

/**
 * Anything under /api that got this far genuinely does not exist. This has to
 * be registered before the SPA fallback, or a typo'd endpoint would be
 * answered with index.html and the client would try to parse HTML as JSON.
 */
app.use('/api', notFound);

/**
 * ---- Serving the built SPA ----
 *
 * The production deployment is a single service: this process serves both the
 * API and the React build, from one origin. That is not just simpler to
 * deploy, it removes two whole classes of problem — there is no cross-origin
 * request to configure, and the app is on HTTPS, which browsers require
 * before they will hand out precise geolocation at all.
 *
 * In development this block does nothing: Vite serves the client on :5173 and
 * proxies /api here, so client/dist does not exist and is not wanted.
 */
if (hasClientBuild) {
  const NO_CACHE = 'no-cache, no-store, must-revalidate';
  const IMMUTABLE = 'public, max-age=31536000, immutable';

  /**
   * Files whose name never changes, so a browser must re-check them on every
   * load. Getting this wrong is how a deploy appears not to have happened:
   * a cached index.html keeps referencing the previous build's asset names,
   * and a cached service worker keeps serving the previous build outright.
   */
  const NEVER_CACHE = new Set([
    'index.html',
    'sw.js',
    'registerSW.js',
    'manifest.webmanifest',
    'push-sw.js',
  ]);

  /**
   * Does this filename carry a content hash?
   *
   * Vite emits base64url hashes (`index-B4Xg3psk.js`), NOT hex — an earlier
   * `[0-9a-f]{8,}` test here matched nothing at all, so every asset was
   * served with `max-age=0` and re-downloaded on every visit. On a phone on
   * mobile data that is the difference between an instant load and half a
   * megabyte each time.
   */
  const isHashed = (name) =>
    /-[A-Za-z0-9_-]{8,}\.(js|css|woff2?|ttf|png|jpg|jpeg|svg|webp|ico)$/.test(name);

  app.use(
    express.static(clientDist, {
      // index.html is served by the SPA fallback below, so that one path
      // sets its own headers rather than relying on this.
      index: false,
      setHeaders(res, filePath) {
        const name = path.basename(filePath);
        if (NEVER_CACHE.has(name)) res.setHeader('Cache-Control', NO_CACHE);
        else if (isHashed(name)) res.setHeader('Cache-Control', IMMUTABLE);
      },
    })
  );

  /**
   * Client-side routing: every non-API path is the SPA. A deep link such as
   * /task/abc123 or a shared /trip/<token> pasted into a browser has to
   * return index.html, not a 404.
   *
   * The Cache-Control is set here explicitly because `sendFile` does not go
   * through the `setHeaders` hook above — it has its own defaults, and
   * without this the shell was being served cacheable.
   */
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    res.setHeader('Cache-Control', NO_CACHE);
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else if (env.isProd) {
  // Fail loudly rather than serving a blank page: in production a missing
  // build means the deploy's build command did not run.
  app.get('/', (req, res) => {
    res.status(503).type('text/plain').send(
      'The Madad API is running, but the client build is missing.\n' +
      'Expected: client/dist/index.html\n' +
      'Run `npm run build` (or check the host build command) and redeploy.\n'
    );
  });
}

app.use(notFound);
app.use(errorHandler);

export { hasClientBuild, clientDist };
export default app;
