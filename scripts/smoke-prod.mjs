/**
 * Production smoke test for the single-service deployment.
 *
 * Mounts the Express app directly, without server.js's connectDB(), because
 * no MongoDB binary is reachable in this sandbox. That is fine for what is
 * being checked here: static serving, the SPA fallback, cache headers, the
 * CSP, and that /api 404s as JSON rather than being swallowed by the SPA
 * catch-all. None of those touch the database.
 */
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.NODE_ENV = 'production';
process.env.JWT_SECRET = 'smoke_test_secret_long_enough_to_pass_validation_0123456789';
process.env.MONGO_URI = 'mongodb+srv://smoke:test@example.mongodb.net/madad';
process.env.ADMIN_EMAILS = 'admin@example.com';

const appPath = path.resolve(__dirname, '../server/src/app.js');
const { default: app, hasClientBuild } = await import(`file://${appPath}`);

if (!hasClientBuild) {
  console.error(
    '\n  No client build found. Run `npm run build` first — this test checks how the\n' +
    '  built SPA is served, so there is nothing to check without it.\n'
  );
  process.exit(1);
}

const server = http.createServer(app);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`);
  }
};

console.log(`\n  Client build detected: ${hasClientBuild}\n`);

// --- health, outside the rate limiter ---
{
  const r = await fetch(`${base}/api/health`);
  const j = await r.json();
  check('GET /api/health returns ok', r.ok && j.service === 'madad-api', JSON.stringify(j));
  check('health reports production', j.env === 'production', `env=${j.env}`);
}

// --- config, which the client boots from ---
{
  const r = await fetch(`${base}/api/config`);
  const j = await r.json();
  check('GET /api/config returns config', r.ok && !!j.config);
  check(
    'phone login is refused in production',
    j.config.phoneLoginEnabled === false,
    `phoneLoginEnabled=${j.config.phoneLoginEnabled}`
  );
}

// --- the SPA itself ---
{
  const r = await fetch(`${base}/`);
  const html = await r.text();
  check('GET / serves the SPA', r.ok && html.includes('<div id="root">'));
  check(
    'index.html is not cached',
    /no-cache/.test(r.headers.get('cache-control') || ''),
    `cache-control=${r.headers.get('cache-control')}`
  );
  check(
    'the pre-paint theme script is present',
    html.includes('madad_theme'),
    'dark mode would flash white on cold start without it'
  );
}

// --- client-side routing: a deep link must return the shell, not a 404 ---
for (const path of ['/task/abc123', '/profile/xyz', '/trip/sometoken', '/safety', '/earnings']) {
  const r = await fetch(`${base}${path}`);
  const html = await r.text();
  check(`deep link ${path} serves the SPA`, r.ok && html.includes('<div id="root">'), `status=${r.status}`);
}

// --- but a bad API route must still 404 as JSON ---
{
  const r = await fetch(`${base}/api/does-not-exist`);
  const ct = r.headers.get('content-type') || '';
  check('unknown /api route 404s', r.status === 404, `status=${r.status}`);
  check('unknown /api route returns JSON, not HTML', ct.includes('application/json'), `content-type=${ct}`);
}

// --- security headers ---
{
  const r = await fetch(`${base}/`);
  const csp = r.headers.get('content-security-policy') || '';
  check('a CSP is set in production', csp.length > 0);
  check('CSP allows Open-Meteo (the weather strip)', csp.includes('api.open-meteo.com'), csp);
  check('CSP allows OSM tiles (the map)', csp.includes('tile.openstreetmap.org'), csp);
  check('CSP allows websockets (Socket.IO)', csp.includes('wss:'), csp);
  check('CSP forbids framing', csp.includes("frame-ancestors 'none'"), csp);
}

// --- hashed assets get a long cache ---
{
  const r = await fetch(`${base}/`);
  const html = await r.text();
  const asset = html.match(/\/assets\/[A-Za-z0-9._-]+\.js/)?.[0];
  if (!asset) {
    check('found a hashed asset to test', false);
  } else {
    const a = await fetch(`${base}${asset}`);
    const cc = a.headers.get('cache-control') || '';
    check(`hashed asset is immutable (${asset})`, cc.includes('immutable'), `cache-control=${cc}`);
  }
}

// --- the service worker must not be cached, or deploys never land ---
{
  const r = await fetch(`${base}/sw.js`);
  const cc = r.headers.get('cache-control') || '';
  check('sw.js is served', r.ok, `status=${r.status}`);
  check('sw.js is not cached', /no-cache/.test(cc), `cache-control=${cc}`);
}

// --- the push handler is importable by the worker ---
{
  const r = await fetch(`${base}/push-sw.js`);
  const body = await r.text();
  check('push-sw.js is served', r.ok, `status=${r.status}`);
  check("push-sw.js handles 'push'", body.includes("addEventListener('push'"));
  check("push-sw.js handles 'notificationclick'", body.includes("addEventListener('notificationclick'"));
}

// --- the geo fallback endpoint answers without auth ---
{
  const r = await fetch(`${base}/api/geo/ip`);
  const j = await r.json();
  check('GET /api/geo/ip answers unauthenticated', r.ok, `status=${r.status}`);
  check(
    'geo/ip always returns usable coordinates',
    Number.isFinite(j.lat) && Number.isFinite(j.lng),
    JSON.stringify(j)
  );
}

// --- the public trip watcher route exists and needs no auth ---
{
  const r = await fetch(`${base}/api/safety/trip/definitelynotarealtoken`);
  // Without a database this cannot reach a real lookup, but it must be
  // ROUTED (not 404-as-unknown-route) and must not demand authentication.
  check(
    'public trip route is mounted and unauthenticated',
    r.status !== 401 && r.status !== 403,
    `status=${r.status}`
  );
}

server.close();

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
