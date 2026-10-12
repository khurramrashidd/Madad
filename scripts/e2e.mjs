#!/usr/bin/env node
/**
 * End-to-end test of the whole task lifecycle.
 *
 *   npm run test:e2e
 *
 * Starts the real server against a THROWAWAY database (madad_e2e) and drives
 * it over HTTP exactly as the app does — so this exercises the real routes,
 * real middleware, real Mongoose models and real MongoDB queries.
 *
 * Your demo data is never touched: a separate database is used and dropped at
 * the end.
 *
 * What it proves, in order:
 *   · two people can register and sign in
 *   · a posted task reaches the geo feed, and the poster never sees their own
 *   · claiming is atomic — a second claimer loses cleanly
 *   · the handshake code gates completion, and a wrong code is rejected
 *   · the UPI link is built correctly and is never exposed to outsiders
 *   · settlement needs BOTH sides; one side alone settles nothing
 *   · trust scores move only on a verified settlement
 *   · profile edits save (the Mongoose parallel-save bug stays fixed)
 */
import { spawn } from 'child_process';
import path from 'path';
import { SERVER, c, portInUse, readEnv, exists, loadMongoose } from './lib.mjs';

const PORT = Number(process.env.E2E_PORT || 5099);
const DB = 'madad_e2e';
const BASE = `http://127.0.0.1:${PORT}/api`;

let pass = 0;
let fail = 0;
const failures = [];

function check(label, condition, detail = '') {
  if (condition) {
    pass++;
    console.log(`  ${c.green('✓')} ${label}`);
  } else {
    fail++;
    failures.push({ label, detail });
    console.log(`  ${c.red('✗')} ${label}${detail ? c.dim(`\n      ${detail}`) : ''}`);
  }
}

function section(title) {
  console.log('');
  console.log(c.bold(`  ${title}`));
  console.log(c.dim(`  ${'─'.repeat(44)}`));
}

/** Minimal HTTP helper. Returns { status, body } and never throws on 4xx/5xx. */
async function call(method, pathname, { token, body } = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let parsed = null;
  const text = await res.text();
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  return { status: res.status, body: parsed };
}

const get = (p, t) => call('GET', p, { token: t });
const post = (p, t, b) => call('POST', p, { token: t, body: b });
const patch = (p, t, b) => call('PATCH', p, { token: t, body: b });
const put = (p, t, b) => call('PUT', p, { token: t, body: b });

/**
 * Swaps the database name in a MongoDB connection string.
 *
 * Done by hand rather than with a regex, because the obvious regex eats the
 * host when the URI carries no database name — turning
 * `mongodb://localhost:27017` into `mongodb://madad_e2e`. This script drops
 * whatever it connects to, so that mistake would be expensive.
 *
 * Handles: a missing database name, query strings, replica-set host lists and
 * mongodb+srv:// with credentials.
 */
export function testDbUri(uri, dbName) {
  const [beforeQuery, query] = String(uri).split('?');
  const schemeEnd = beforeQuery.indexOf('://');
  if (schemeEnd === -1) throw new Error(`Not a MongoDB connection string: ${uri}`);

  const scheme = beforeQuery.slice(0, schemeEnd + 3);
  const rest = beforeQuery.slice(schemeEnd + 3);
  // Everything up to the first slash is credentials + host(s).
  const slash = rest.indexOf('/');
  const hosts = slash === -1 ? rest : rest.slice(0, slash);

  return `${scheme}${hosts}/${dbName}${query ? `?${query}` : ''}`;
}

// A fixed point so the feed radius maths is predictable.
const LNG = 77.2177;
const LAT = 28.6304;

let server = null;

async function shutdown(code) {
  if (server) {
    try {
      if (process.platform === 'win32') spawn('taskkill', ['/pid', server.pid, '/f', '/t'], { shell: true });
      else server.kill('SIGTERM');
    } catch { /* already gone */ }
  }
  // Give the socket a moment to release before exiting.
  await new Promise((r) => setTimeout(r, 400));
  process.exit(code);
}

async function main() {
  console.log('');
  console.log(c.bold('  Madad — end-to-end test'));
  console.log(c.dim(`  real server · real MongoDB · throwaway database "${DB}"`));

  // ── Preconditions ───────────────────────────────────────────────
  if (!(await portInUse(27017))) {
    console.log('');
    console.log(c.red('  MongoDB is not running.'));
    console.log(c.dim('  Windows:  net start MongoDB      (Administrator PowerShell)'));
    console.log(c.dim('  Mac:      brew services start mongodb-community'));
    console.log(c.dim('  Linux:    sudo systemctl start mongod'));
    console.log('');
    process.exit(1);
  }
  if (!exists(path.join(SERVER, 'node_modules'))) {
    console.log(c.red('\n  Server dependencies missing. Run:  npm run install:all\n'));
    process.exit(1);
  }
  if (await portInUse(PORT)) {
    console.log(c.red(`\n  Port ${PORT} is busy. Set a different one:  E2E_PORT=5098 npm run test:e2e\n`));
    process.exit(1);
  }

  // ── Wipe the test database ──────────────────────────────────────
  const mongoose = await loadMongoose();
  const baseUri = testDbUri(
    readEnv(path.join(SERVER, '.env')).MONGO_URI || 'mongodb://127.0.0.1:27017/madad',
    DB
  );

  await mongoose.connect(baseUri, { serverSelectionTimeoutMS: 8000 });

  // Belt and braces: this script drops a whole database, so refuse outright if
  // we are not connected to the throwaway one. A URI we failed to rewrite must
  // never cost somebody their real data.
  if (mongoose.connection.name !== DB) {
    console.log(c.red(`\n  Refusing to run: expected database "${DB}" but connected to "${mongoose.connection.name}".`));
    console.log(c.dim(`  Check MONGO_URI in server/.env — it could not be rewritten safely.\n`));
    await mongoose.connection.close();
    process.exit(1);
  }

  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();

  // ── Boot the real server ────────────────────────────────────────
  // dotenv does not override variables already present in the environment, so
  // these win over the developer's own .env.
  server = spawn('node', ['src/server.js'], {
    cwd: SERVER,
    env: { ...process.env, PORT: String(PORT), MONGO_URI: baseUri, NODE_ENV: 'development', PLACE_NAMES: 'off' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverLog = '';
  server.stdout.on('data', (b) => { serverLog += b; });
  server.stderr.on('data', (b) => { serverLog += b; });

  const deadline = Date.now() + 30000;
  let up = false;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) { up = true; break; }
    } catch { /* not listening yet */ }
    await new Promise((r) => setTimeout(r, 400));
  }

  if (!up) {
    console.log(c.red('\n  The server did not start.\n'));
    console.log(c.dim(serverLog.slice(-1500)));
    await shutdown(1);
  }

  // ─────────────────────────── Accounts ───────────────────────────
  section('Accounts');

  const wisherReg = await post('/auth/register', null, {
    name: 'E2E Wisher', email: 'e2e-wisher@test.local', password: 'password123',
    upiId: 'wisher@okhdfcbank',
  });
  check('wisher registers', wisherReg.status === 201, `got ${wisherReg.status}: ${wisherReg.body?.message}`);
  const wisher = wisherReg.body?.token;

  const volReg = await post('/auth/register', null, {
    name: 'E2E Volunteer', email: 'e2e-vol@test.local', password: 'password123',
    upiId: 'volunteer@okicici',
  });
  check('volunteer registers', volReg.status === 201, `got ${volReg.status}: ${volReg.body?.message}`);
  const volunteer = volReg.body?.token;

  const rivalReg = await post('/auth/register', null, {
    name: 'E2E Rival', email: 'e2e-rival@test.local', password: 'password123',
    upiId: 'rival@okaxis',
  });
  const rival = rivalReg.body?.token;

  const dupe = await post('/auth/register', null, {
    name: 'Dupe', email: 'e2e-wisher@test.local', password: 'password123',
  });
  check('duplicate email is rejected', dupe.status === 409, `got ${dupe.status}`);

  const badLogin = await post('/auth/login', null, {
    email: 'e2e-wisher@test.local', password: 'wrongpassword',
  });
  check('wrong password is rejected', badLogin.status === 401, `got ${badLogin.status}`);

  const me = await get('/auth/me', wisher);
  check('token identifies the right account', me.body?.user?.email === 'e2e-wisher@test.local');
  check('password is never returned', !JSON.stringify(me.body).includes('password123'));

  // ──────────────────── Profile save (regression) ─────────────────
  section('Profile edit (parallel-save regression)');

  // This is the bug that broke "Save changes": the auth middleware used to run
  // its own save() on the same document the handler was about to save.
  const edit = await patch('/users/me', wisher, { bio: 'Edited by the e2e test', city: 'Testville' });
  check('profile edit saves', edit.status === 200,
        `got ${edit.status}: ${edit.body?.message}`);
  check('edit actually persisted', edit.body?.user?.bio === 'Edited by the e2e test');

  const editAgain = await patch('/users/me', wisher, { bio: 'Edited twice' });
  check('a second edit also saves', editAgain.status === 200, `got ${editAgain.status}: ${editAgain.body?.message}`);

  // Hammer it concurrently — the original bug was a race.
  const racers = await Promise.all([
    patch('/users/me', wisher, { bio: 'race 1' }),
    patch('/users/me', wisher, { bio: 'race 2' }),
    patch('/users/me', wisher, { bio: 'race 3' }),
  ]);
  check('concurrent edits do not error',
        racers.every((r) => r.status === 200),
        racers.map((r) => `${r.status} ${r.body?.message || ''}`).join(' | '));

  // ─────────────────────────── Posting ────────────────────────────
  section('Posting a task');

  const create = await post('/tasks', wisher, {
    title: 'E2E test task — collect printouts',
    description: 'Created by the automated end-to-end test.',
    category: 'printout', bounty: 75, lng: LNG, lat: LAT,
    landmark: 'Test Library',
  });
  check('task is created', create.status === 201, `got ${create.status}: ${create.body?.message}`);
  const taskId = create.body?.task?.id;
  check('task starts open', create.body?.task?.status === 'open');
  check('handshake code is NOT in the create response',
        !JSON.stringify(create.body).match(/handshakeCode/));

  const tooCheap = await post('/tasks', wisher, {
    title: 'Bounty far below the minimum', category: 'other',
    bounty: 1, lng: LNG, lat: LAT,
  });
  check('a bounty below the minimum is rejected', tooCheap.status === 400, `got ${tooCheap.status}`);

  const idempotent1 = await post('/tasks', wisher, {
    title: 'Offline draft synced twice', category: 'other',
    bounty: 30, lng: LNG, lat: LAT, clientRef: 'e2e-fixed-ref',
  });
  const idempotent2 = await post('/tasks', wisher, {
    title: 'Offline draft synced twice', category: 'other',
    bounty: 30, lng: LNG, lat: LAT, clientRef: 'e2e-fixed-ref',
  });
  check('the same clientRef does not post twice',
        idempotent2.body?.deduplicated === true &&
        idempotent1.body?.task?.id === idempotent2.body?.task?.id,
        `first=${idempotent1.body?.task?.id} second=${idempotent2.body?.task?.id}`);

  // ───────────────────────────── Feed ─────────────────────────────
  section('Geo feed');

  const feedVol = await get(`/tasks?lng=${LNG}&lat=${LAT}&radius=3000`, volunteer);
  check('feed responds', feedVol.status === 200, `got ${feedVol.status}`);
  const onFeed = (feedVol.body?.tasks || []).find((t) => t.id === taskId);
  check('the new task is on the volunteer feed', Boolean(onFeed));
  check('distance is calculated', onFeed?.distance != null && onFeed.distance < 500,
        `distance=${onFeed?.distance}`);

  const feedWisher = await get(`/tasks?lng=${LNG}&lat=${LAT}&radius=3000`, wisher);
  check('the poster does NOT see their own task',
        !(feedWisher.body?.tasks || []).some((t) => t.id === taskId));

  const farFeed = await get(`/tasks?lng=72.8777&lat=19.0760&radius=3000`, volunteer);
  check('a task 1,100 km away is outside the radius',
        !(farFeed.body?.tasks || []).some((t) => t.id === taskId));

  check('the volunteer UPI ID is not exposed on the feed',
        !JSON.stringify(feedVol.body).includes('okhdfcbank'),
        'a private field reached a public payload');

  // ───────────────────────────── Claim ────────────────────────────
  section('Claiming');

  const selfClaim = await post(`/tasks/${taskId}/claim`, wisher);
  check('you cannot claim your own task', selfClaim.status === 400, `got ${selfClaim.status}`);

  // Two volunteers race for the same task — exactly one must win.
  const [claimA, claimB] = await Promise.all([
    post(`/tasks/${taskId}/claim`, volunteer),
    post(`/tasks/${taskId}/claim`, rival),
  ]);
  const winners = [claimA, claimB].filter((r) => r.status === 200);
  const losers = [claimA, claimB].filter((r) => r.status !== 200);
  check('exactly one of two simultaneous claims wins',
        winners.length === 1 && losers.length === 1,
        `statuses: ${claimA.status}, ${claimB.status}`);
  check('the loser gets a clean 409, not a crash',
        losers[0]?.status === 409, `got ${losers[0]?.status}`);

  // Work out which token actually won so the rest of the test follows it.
  const winnerToken = claimA.status === 200 ? volunteer : rival;
  const loserToken = claimA.status === 200 ? rival : volunteer;

  const afterClaim = await get(`/tasks?lng=${LNG}&lat=${LAT}&radius=3000`, loserToken);
  check('a claimed task leaves the public feed',
        !(afterClaim.body?.tasks || []).some((t) => t.id === taskId));

  // ──────────────────────── Handshake code ────────────────────────
  section('Handshake code');

  const asWisher = await get(`/tasks/${taskId}`, wisher);
  const code = asWisher.body?.task?.handshakeCode;
  check('the wisher is shown the code', typeof code === 'string' && /^\d{4}$/.test(code), `got ${code}`);

  const asVolunteer = await get(`/tasks/${taskId}`, winnerToken);
  check('the volunteer is NOT shown the code', !asVolunteer.body?.task?.handshakeCode);

  const asOutsider = await get(`/tasks/${taskId}`, loserToken);
  check('an outsider is not shown the code', !asOutsider.body?.task?.handshakeCode);
  check('an outsider gets a fuzzed location',
        asOutsider.body?.task?.isExactLocation === false);

  // Pick a code guaranteed to differ — a 1-in-10,000 collision with '0000'
  // would otherwise verify the handshake for real and derail everything after.
  const notTheCode = code === '0000' ? '1111' : '0000';
  const wrongCode = await post(`/tasks/${taskId}/handshake`, winnerToken, { code: notTheCode });
  check('a wrong handshake code is rejected', wrongCode.status === 400, `got ${wrongCode.status}`);

  const outsiderCode = await post(`/tasks/${taskId}/handshake`, loserToken, { code });
  check('someone else cannot verify the code', outsiderCode.status === 403, `got ${outsiderCode.status}`);

  const goodCode = await post(`/tasks/${taskId}/handshake`, winnerToken, { code });
  check('the correct code is accepted', goodCode.status === 200, `got ${goodCode.status}: ${goodCode.body?.message}`);
  check('task moves to delivered', goodCode.body?.task?.status === 'delivered');

  // ──────────────────────────── Payment ───────────────────────────
  section('Payment');

  const payment = await get(`/tasks/${taskId}/payment`, wisher);
  check('payment details are available', payment.status === 200, `got ${payment.status}`);
  const uri = payment.body?.payment?.uri;
  check('a UPI deep link is built', typeof uri === 'string' && uri.startsWith('upi://pay?'), `got ${uri}`);

  if (uri) {
    const params = new URLSearchParams(uri.split('?')[1]);
    check('the UPI link pays the volunteer', params.get('pa') === 'volunteer@okicici' || params.get('pa') === 'rival@okaxis',
          `pa=${params.get('pa')}`);
    check('the UPI link carries the right amount', params.get('am') === '75.00', `am=${params.get('am')}`);
    check('the UPI link is in rupees', params.get('cu') === 'INR');
  }

  const outsiderPay = await get(`/tasks/${taskId}/payment`, loserToken);
  check('an outsider cannot see the payment details', outsiderPay.status === 403, `got ${outsiderPay.status}`);

  // ───────────────────── Two-sided settlement ─────────────────────
  section('Settlement needs both sides');

  const volConfirmsEarly = await post(`/tasks/${taskId}/confirm`, winnerToken);
  check('the volunteer cannot confirm before the wisher pays',
        volConfirmsEarly.status === 400, `got ${volConfirmsEarly.status}`);

  const markPaid = await post(`/tasks/${taskId}/paid`, wisher, { reference: 'E2E123' });
  check('the wisher can mark it paid', markPaid.status === 200, `got ${markPaid.status}: ${markPaid.body?.message}`);
  check('one side alone does NOT settle it',
        markPaid.body?.task?.status === 'paid_pending',
        `status=${markPaid.body?.task?.status}`);

  const wrongConfirm = await post(`/tasks/${taskId}/confirm`, wisher);
  check('the wisher cannot confirm receipt on the volunteer\'s behalf',
        wrongConfirm.status === 403, `got ${wrongConfirm.status}`);

  const trustBefore = (await get('/users/me/trust', winnerToken)).body?.trustScore;

  const confirm = await post(`/tasks/${taskId}/confirm`, winnerToken);
  check('the volunteer confirms receipt', confirm.status === 200, `got ${confirm.status}: ${confirm.body?.message}`);
  check('now it settles', confirm.body?.task?.status === 'settled',
        `status=${confirm.body?.task?.status}`);

  // ─────────────────────────── Trust ──────────────────────────────
  section('Trust engine');

  const trustAfter = (await get('/users/me/trust', winnerToken)).body?.trustScore;
  check('the volunteer gains trust on settlement',
        trustAfter > trustBefore, `before=${trustBefore} after=${trustAfter}`);

  // The volunteer earns two rewards (+4 completed, +2 confirmed). If they are
  // applied at the same time, one overwrites the other. Recompute what the
  // score must be when both land, using the engine's own scaling rule.
  const gain = (score, delta) => Math.round(score + delta * (0.35 + 0.65 * ((100 - score) / 100)));
  const expectedTrust = Math.min(100, gain(gain(trustBefore, 4), 2));
  check('both of the volunteer\'s rewards are applied, not just one',
        trustAfter === expectedTrust,
        `before=${trustBefore} expected=${expectedTrust} got=${trustAfter}`);

  const wisherTrust = await get('/users/me/trust', wisher);
  check('the trust history records the reason',
        (wisherTrust.body?.history || []).some((h) => /pa(id|yment)/i.test(h.label || '')),
        JSON.stringify(wisherTrust.body?.history?.slice(0, 3)));

  const volProfile = await get('/auth/me', winnerToken);
  check('completed-task counter increments',
        volProfile.body?.user?.stats?.tasksCompleted >= 1,
        `tasksCompleted=${volProfile.body?.user?.stats?.tasksCompleted}`);

  // ─────────────────────────── Reviews ────────────────────────────
  section('Reviews');

  const review = await post(`/reviews/${taskId}`, wisher, { rating: 5, comment: 'Quick and tidy.' });
  check('a review can be left on a settled task', review.status === 201, `got ${review.status}: ${review.body?.message}`);

  const reviewTwice = await post(`/reviews/${taskId}`, wisher, { rating: 1 });
  check('the same person cannot review twice', reviewTwice.status === 409, `got ${reviewTwice.status}`);

  const badRating = await post(`/reviews/${taskId}`, winnerToken, { rating: 9 });
  check('an out-of-range rating is rejected', badRating.status === 400, `got ${badRating.status}`);

  // ───────────────────────────── Chat ─────────────────────────────
  section('Ephemeral chat');

  const chat = await get(`/chat/${taskId}`, wisher);
  check('chat closes once the task settles', chat.body?.closed === true,
        `closed=${chat.body?.closed}`);
  check('closed chat returns no messages', (chat.body?.messages || []).length === 0);

  const outsiderChat = await get(`/chat/${taskId}`, loserToken);
  check('an outsider cannot open the chat', outsiderChat.status === 403, `got ${outsiderChat.status}`);

  // ───────────────────── Auth and restriction ─────────────────────
  section('Access control');

  const noToken = await get('/tasks/mine');
  check('a protected route needs a token', noToken.status === 401, `got ${noToken.status}`);

  const badToken = await get('/tasks/mine', 'not-a-real-token');
  check('a forged token is rejected', badToken.status === 401, `got ${badToken.status}`);

  const notAdmin = await get('/admin/stats', wisher);
  check('a normal user cannot reach the admin API', notAdmin.status === 403, `got ${notAdmin.status}`);

  // ─────────────────────────── Location ───────────────────────────
  section('Location');

  const PANVEL = { lat: 18.9894, lng: 73.1175 };
  const loc = await put('/users/me/location', volunteer, { ...PANVEL, city: 'Panvel' });
  check('a location update saves', loc.status === 200, `got ${loc.status}: ${loc.body?.message}`);
  check('the area name comes back for the header', loc.body?.city === 'Panvel', `city=${loc.body?.city}`);

  // Two screens can report a position at the same moment.
  const locRace = await Promise.all([1, 2, 3].map((i) =>
    put('/users/me/location', volunteer, { lat: PANVEL.lat + i / 1e4, lng: PANVEL.lng, city: 'Panvel' })));
  check('simultaneous location updates all save', locRace.every((r) => r.status === 200),
        locRace.map((r) => r.status).join(','));
  const meAfter = await get('/auth/me', volunteer);
  check('the profile shows the new area', meAfter.body?.user?.city === 'Panvel', `city=${meAfter.body?.user?.city}`);

  // A fresh open task in the old area, so there is something to look for.
  const marker = await post('/tasks', wisher, {
    title: 'E2E marker task for moving the demo', category: 'other', bounty: 20, lng: LNG, lat: LAT,
  });
  const markerId = marker.body?.task?.id;
  const moved = await post('/auth/demo-recentre', volunteer, PANVEL);
  check('"Move demo tasks to me" moves the tasks', moved.status === 200 && moved.body?.moved === true && moved.body?.tasks > 0,
        `got ${moved.status}: ${JSON.stringify(moved.body).slice(0, 160)}`);
  const oldArea = await get(`/tasks?lng=${LNG}&lat=${LAT}&radius=25000`, volunteer);
  const newArea = await get(`/tasks?lng=${PANVEL.lng}&lat=${PANVEL.lat}&radius=25000`, volunteer);
  const has = (r) => (r.body?.tasks || []).some((t) => t.id === markerId);
  check('after moving, the task is near the new area and gone from the old one',
        Boolean(markerId) && has(newArea) && !has(oldArea),
        `marker=${markerId} new=${has(newArea)} old=${has(oldArea)}`);

  // ─────────────────────────── Results ────────────────────────────
  console.log('');
  console.log(c.dim(`  ${'─'.repeat(44)}`));

  if (fail === 0) {
    console.log(c.green(c.bold(`  ALL ${pass} CHECKS PASSED`)));
    console.log(c.dim('  The full lifecycle works against a real database.'));
  } else {
    console.log(c.red(c.bold(`  ${pass} passed, ${fail} FAILED`)));
    console.log('');
    failures.forEach((f, i) => {
      console.log(`  ${i + 1}. ${f.label}`);
      if (f.detail) console.log(c.dim(`     ${f.detail}`));
    });
  }
  console.log('');

  // Drop the throwaway database.
  try {
    await mongoose.connect(baseUri, { serverSelectionTimeoutMS: 5000 });
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    console.log(c.dim(`  Cleaned up the "${DB}" database. Your demo data was not touched.`));
    console.log('');
  } catch { /* best effort */ }

  await shutdown(fail === 0 ? 0 : 1);
}

process.on('SIGINT', () => shutdown(1));

main().catch(async (err) => {
  console.error(c.red(`\n  The test crashed: ${err.message}\n`));
  console.error(c.dim(err.stack?.split('\n').slice(0, 6).join('\n')));
  await shutdown(1);
});
