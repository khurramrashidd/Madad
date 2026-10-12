/**
 * Logic tests that need no database.
 * Run: node src/seed/selftest.js
 */
import assert from 'assert';
import { buildUpiUri, buildPaymentPayload, isValidUpiId } from '../services/upi.js';
import { parseTranscript } from '../services/sarvam.js';
import { badgeFor } from '../services/trustScore.js';
import { haversineMeters, formatDistance, normalizeRadius, parseCoords, generateHandshakeCode, fuzzCoords } from '../utils/geo.js';
import { DEFAULT_RADIUS_M, MAX_RADIUS_M } from '../utils/constants.js';
import {
  rememberPosition, forgetPosition, emitNearby, usersNearby, trackedSocketCount,
} from '../services/geoBroadcast.js';
import app from '../app.js';
import { recentreDemo, kmBetween } from './recentre.js';
import { pickPlaceName } from '../utils/placeName.js';

let pass = 0, fail = 0;
const pending = [];
const t = (name, fn) => {
  const run = async () => {
    try { await fn(); pass++; console.log(`  ✓ ${name}`); }
    catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); }
  };
  // Sync tests run immediately so output stays in order; async ones queue.
  const r = run();
  pending.push(r);
};

console.log('\n── UPI deep links ──');
t('accepts valid VPAs', () => {
  assert(isValidUpiId('rohan.mehta@okicici'));
  assert(isValidUpiId('kinza@okhdfcbank'));
});
t('rejects malformed VPAs', () => {
  assert(!isValidUpiId('notaupiid'));
  assert(!isValidUpiId('@okaxis'));
  assert(!isValidUpiId('a@b@c'));
});
t('builds a spec-compliant upi:// URI', () => {
  const uri = buildUpiUri({ payeeVpa: 'rohan@okicici', payeeName: 'Rohan Mehta', amount: 90, note: 'Madad delivery', ref: '507f1f77bcf86cd799439011' });
  assert(uri.startsWith('upi://pay?'), 'wrong scheme');
  const p = new URLSearchParams(uri.split('?')[1]);
  assert.strictEqual(p.get('pa'), 'rohan@okicici');
  assert.strictEqual(p.get('am'), '90.00');
  assert.strictEqual(p.get('cu'), 'INR');
  assert.strictEqual(p.get('pn'), 'Rohan Mehta');
});
t('strips punctuation from the note (UPI apps reject it)', () => {
  const uri = buildUpiUri({ payeeVpa: 'ab@okaxis', payeeName: 'X', amount: 10, note: 'Pay #123 @ 50%!' });
  const note = new URLSearchParams(uri.split('?')[1]).get('tn');
  assert(!/[#@%!]/.test(note), `note still has punctuation: ${note}`);
});
t('refuses an invalid amount', () => {
  assert.throws(() => buildUpiUri({ payeeVpa: 'ab@okaxis', payeeName: 'X', amount: -5 }));
  assert.throws(() => buildUpiUri({ payeeVpa: 'ab@okaxis', payeeName: 'X', amount: 0 }));
  assert.throws(() => buildUpiUri({ payeeVpa: 'ab@okaxis', payeeName: 'X', amount: 'abc' }));
});
t('refuses an invalid payee', () => {
  assert.throws(() => buildUpiUri({ payeeVpa: 'notavpa', payeeName: 'X', amount: 50 }));
});
t('payment payload degrades gracefully with no UPI ID', () => {
  const r = buildPaymentPayload({ volunteer: { name: 'A', upiId: null }, task: { bounty: 50, _id: 'x', category: 'other' } });
  assert.strictEqual(r.ready, false);
  assert(r.reason.includes('UPI'));
});

console.log('\n── Voice transcript parsing ──');
t('pulls "50 rupees" out of English speech', () => {
  const r = parseTranscript('I need someone to deliver a printout to Hostel B, I will pay 50 rupees');
  assert.strictEqual(r.bounty, 50, `got ${r.bounty}`);
});
t('handles the ₹ symbol and "rs" prefix', () => {
  assert.strictEqual(parseTranscript('Pick up my parcel ₹80').bounty, 80);
  assert.strictEqual(parseTranscript('carry my bags rs 150').bounty, 150);
});
t('handles Hinglish amounts', () => {
  const r = parseTranscript('mujhe printout chahiye, 40 rupaye dunga');
  assert.strictEqual(r.bounty, 40, `got ${r.bounty}`);
});
t('handles spelled-out numbers', () => {
  assert.strictEqual(parseTranscript('walk my dog for fifty rupees').bounty, 50);
});
t('detects category from verbs', () => {
  assert.strictEqual(parseTranscript('deliver this envelope for 60 rupees').category, 'delivery');
  assert.strictEqual(parseTranscript('need 20 printouts, 40 rupees').category, 'printout');
  assert.strictEqual(parseTranscript('help me lift a heavy fridge, 150 rupees').category, 'heavy_lifting');
  assert.strictEqual(parseTranscript('stand in the queue at the bank, 100 rupees').category, 'queue_standing');
});
t('extracts a landmark', () => {
  const r = parseTranscript('drop this near Central Library, 50 rupees');
  assert(/central library/i.test(r.landmark), `got "${r.landmark}"`);
});
t('strips money talk out of the title', () => {
  const r = parseTranscript('I need someone to buy medicine for 50 rupees');
  assert(!/50|rupees/i.test(r.title), `title still has money: "${r.title}"`);
  assert(r.title.length >= 5);
});
t('flags a missing bounty instead of inventing one', () => {
  const r = parseTranscript('please bring me a coffee');
  assert.strictEqual(r.bounty, null);
  assert(r.missing.includes('bounty'));
});
t('ignores amounts outside the allowed range', () => {
  assert.strictEqual(parseTranscript('pay 9999 rupees').bounty, null);
  assert.strictEqual(parseTranscript('pay 2 rupees').bounty, null);
});
t('survives empty input', () => {
  const r = parseTranscript('');
  assert.strictEqual(r.confidence, 0);
});

console.log('\n── Trust badge bands ──');
t('maps scores to the right badge', () => {
  assert.strictEqual(badgeFor(95, false), 'champion');
  assert.strictEqual(badgeFor(85, false), 'trusted');
  assert.strictEqual(badgeFor(70, false), 'reliable');
  assert.strictEqual(badgeFor(45, false), 'newcomer');
  assert.strictEqual(badgeFor(28, false), 'restricted');
});
t('an explicit restriction always wins', () => {
  assert.strictEqual(badgeFor(99, true), 'restricted');
});

console.log('\n── Geo helpers ──');
t('haversine matches a known distance', () => {
  // Connaught Place → India Gate is roughly 2.8 km.
  const d = haversineMeters([77.2177, 28.6304], [77.2295, 28.6129]);
  assert(d > 2000 && d < 3500, `got ${d} m`);
});
t('zero distance for the same point', () => {
  assert.strictEqual(haversineMeters([77.2, 28.6], [77.2, 28.6]), 0);
});
t('formats distances for humans', () => {
  assert.strictEqual(formatDistance(320), '320 m');
  assert.strictEqual(formatDistance(1400), '1.4 km');
  // Precision drops as distance grows — a decimal on 512 km is noise.
  assert.strictEqual(formatDistance(500), '500 m');
  assert.strictEqual(formatDistance(5200), '5.2 km');
  assert.strictEqual(formatDistance(512_300), '512 km');
  assert.strictEqual(formatDistance(20), 'a few steps away');
  assert.strictEqual(formatDistance(null), null);
  assert.strictEqual(formatDistance('nonsense'), null);
});
t('clamps radius to sane bounds', () => {
  assert.strictEqual(normalizeRadius(-5), DEFAULT_RADIUS_M);
  assert.strictEqual(normalizeRadius('abc'), DEFAULT_RADIUS_M);
  assert.strictEqual(normalizeRadius(500), 500);
  // "Anywhere" has to survive the clamp, or a village user can never widen.
  assert.strictEqual(normalizeRadius(MAX_RADIUS_M), MAX_RADIUS_M);
  assert.strictEqual(normalizeRadius(99_999_999), MAX_RADIUS_M);
  assert.strictEqual(normalizeRadius(100_000), 100_000);
});
/**
 * Geo-targeted broadcast.
 *
 * This is the guard on the bug where every new task was pushed to every
 * connected client in the country, with `distance: null` — so the client's
 * own radius filter could never reject anything.
 */
t('a new task only reaches sockets within range', () => {
  const sent = [];
  // A minimal stand-in for the Socket.IO server: emitNearby only needs to
  // look sockets up by id and call emit on them.
  const fakeSockets = new Map();
  const mkSocket = (id) => {
    const s = { id, emit: (event, payload) => sent.push({ id, event, payload }) };
    fakeSockets.set(id, s);
    return s;
  };
  const io = { sockets: { sockets: fakeSockets } };

  const panvel = [73.1175, 18.9894];
  const nearby = [73.1200, 18.9910];   // ~300 m away
  const mumbai = [72.8777, 19.0760];   // ~30 km away
  const delhi = [77.2090, 28.6139];    // ~1150 km away

  mkSocket('near');
  mkSocket('mid');
  mkSocket('far');
  mkSocket('self');

  rememberPosition('near', 'user-near', nearby);
  rememberPosition('mid', 'user-mid', mumbai);
  rememberPosition('far', 'user-far', delhi);
  rememberPosition('self', 'user-poster', panvel);

  const delivered = emitNearby(io, panvel, 'task:new', { id: 't1' }, {
    radius: 100000,
    exclude: 'user-poster',
  });

  const reached = sent.map((s) => s.id).sort();
  assert.deepStrictEqual(reached, ['mid', 'near'], `reached: ${reached.join(',')}`);
  assert.strictEqual(delivered, 2);

  // The poster must not be told about their own task.
  assert(!reached.includes('self'), 'the poster should be excluded');
  // Someone 1150 km away has no business seeing a ₹50 errand.
  assert(!reached.includes('far'), 'out-of-range sockets should be skipped');

  // Each recipient gets THEIR OWN distance, already formatted. This is the
  // part that was null before, which is why client-side filtering never ran.
  const near = sent.find((s) => s.id === 'near').payload;
  assert(near.distance > 0 && near.distance < 1000, `near distance: ${near.distance}`);
  assert.strictEqual(typeof near.distanceLabel, 'string');
  assert(/m$/.test(near.distanceLabel), `expected metres, got ${near.distanceLabel}`);

  const mid = sent.find((s) => s.id === 'mid').payload;
  assert(mid.distance > near.distance, 'distances must differ per recipient');
  assert(/km$/.test(mid.distanceLabel), `expected km, got ${mid.distanceLabel}`);

  forgetPosition('near');
  forgetPosition('mid');
  forgetPosition('far');
  forgetPosition('self');
});

t('nearby users are returned nearest first, deduplicated per person', () => {
  const panvel = [73.1175, 18.9894];
  // Two tabs open for the same person, at slightly different positions.
  rememberPosition('s1', 'alice', [73.1200, 18.9910]);
  rememberPosition('s2', 'alice', [73.1500, 19.0100]);
  rememberPosition('s3', 'bob', [73.1300, 18.9950]);
  rememberPosition('s4', 'carol', [77.2090, 28.6139]); // Delhi, out of range

  const found = usersNearby(panvel, 100000);
  const ids = found.map((f) => f.userId);

  assert.deepStrictEqual(ids, ['alice', 'bob'], `got ${ids.join(',')}`);
  // Alice appears once, at her CLOSEST position, not twice.
  assert(found[0].distance < 1000, `alice should use her nearest tab: ${found[0].distance}`);

  ['s1', 's2', 's3', 's4'].forEach(forgetPosition);
});

t('a position is rejected unless it is a valid coordinate pair', () => {
  const before = trackedSocketCount();
  rememberPosition('bad1', 'u', [999, 0]);
  rememberPosition('bad2', 'u', [0]);
  rememberPosition('bad3', 'u', null);
  rememberPosition('bad4', 'u', ['abc', 'def']);
  assert.strictEqual(trackedSocketCount(), before, 'invalid positions must not be stored');
});

t('rejects out-of-range coordinates', () => {
  assert.strictEqual(parseCoords(200, 28), null);
  assert.strictEqual(parseCoords('abc', 28), null);
  assert.deepStrictEqual(parseCoords('77.2', '28.6'), [77.2, 28.6]);
});
t('handshake codes are always 4 digits', () => {
  for (let i = 0; i < 500; i++) {
    const c = generateHandshakeCode();
    assert(/^\d{4}$/.test(c), `bad code: ${c}`);
  }
});
t('handshake codes are not obviously biased', () => {
  const seen = new Set();
  for (let i = 0; i < 400; i++) seen.add(generateHandshakeCode());
  assert(seen.size > 300, `only ${seen.size} unique in 400 — poor entropy`);
});
t('location fuzzing moves the pin but keeps it close', () => {
  const orig = [77.2177, 28.6304];
  const f = fuzzCoords(orig, 200);
  const moved = haversineMeters(orig, f);
  assert(moved > 0, 'pin did not move at all');
  assert(moved < 400, `moved too far: ${moved} m`);
});


console.log('\n── Privacy: no private fields on the wire ──');
t('publicPerson never leaks upiId, email or password', async () => {
  const mongoose = (await import('mongoose')).default;
  await import('../models/User.js');
  const Task = (await import('../models/Task.js')).default;
  const { __testSerialize } = await import('../controllers/taskController.js');

  const User = mongoose.model('User');
  const volunteer = new User({
    name: 'Rohan', email: 'r@x.com', password: 'secret123',
    upiId: 'rohan@okicici', trustScore: 90, phone: '9000000099',
  });
  const wisher = new User({ name: 'Kinza', email: 'k@x.com', password: 'secret123', upiId: 'kinza@okhdfcbank' });

  const task = new Task({
    title: 'A test task title', bounty: 50, wisher,
    location: { type: 'Point', coordinates: [77.2, 28.6] },
  });
  task.volunteer = volunteer;

  const wire = JSON.stringify(__testSerialize(task, null));
  for (const secret of ['rohan@okicici', 'kinza@okhdfcbank', 'secret123', 'r@x.com', '9000000099']) {
    assert(!wire.includes(secret), `LEAKED "${secret}" in the serialized task`);
  }
  assert(wire.includes('Rohan') && wire.includes('Kinza'), 'names should still be present');
});

t('the handshake code is never serialized', async () => {
  const mongoose = (await import('mongoose')).default;
  await import('../models/User.js');
  const Task = (await import('../models/Task.js')).default;
  const { __testSerialize } = await import('../controllers/taskController.js');

  const task = new Task({
    title: 'Another test task', bounty: 50,
    wisher: new mongoose.Types.ObjectId(),
    location: { type: 'Point', coordinates: [77.2, 28.6] },
    handshakeCode: '4827',
  });
  assert(!JSON.stringify(__testSerialize(task, null)).includes('4827'), 'handshake code leaked');
});

console.log('\n── Demo area ──');
t('moving the demo keeps its layout and lands it on the new centre', async () => {
  // In-memory stand-ins for the two models: just the calls recentre makes.
  const fake = (docs) => ({
    docs,
    find: (filter) => ({
      lean: async () => docs.filter((d) => !filter.email || filter.email.test(d.email)),
    }),
    bulkWrite: async (ops) => {
      for (const { updateOne } of ops) {
        const d = docs.find((x) => x._id === updateOne.filter._id);
        d.location.coordinates = updateOne.update.$set['location.coordinates'];
      }
    },
    updateMany: async (filter, update) => {
      docs.filter((d) => filter.email.test(d.email)).forEach((d) => Object.assign(d, update.$set));
    },
  });
  const delhi = [[77.2177, 28.6304], [77.2200, 28.6330], [77.2150, 28.6280]];
  const Task = fake(delhi.map((c, i) => ({ _id: `t${i}`, location: { coordinates: [...c] } })));
  const User = fake([
    { _id: 'u1', email: 'rohan@madad.local', city: 'New Delhi', location: { coordinates: [77.2177, 28.6304] } },
    { _id: 'u2', email: 'real@gmail.com', city: 'Pune', location: { coordinates: [73.85, 18.52] } },
  ]);
  const panvel = { lat: 18.9894, lng: 73.1175 };
  const r = await recentreDemo(panvel, 'Panvel', { Task, User });

  assert.strictEqual(r.moved, true);
  assert.strictEqual(r.tasks, 3);
  assert.strictEqual(r.users, 1, 'only demo accounts move');
  assert(r.fromKm > 1000 && r.fromKm < 1300, `Delhi to Panvel is ~1,150 km, got ${r.fromKm}`);
  // The median task is now exactly on the centre…
  assert.deepStrictEqual(Task.docs[0].location.coordinates, [73.1175, 18.9894]);
  // …and the others keep their distance from it.
  const before = haversineMeters(delhi[0], delhi[1]);
  const after = haversineMeters(Task.docs[0].location.coordinates, Task.docs[1].location.coordinates);
  assert(Math.abs(before - after) < 25, `spacing changed: ${before} → ${after}`);
  assert.strictEqual(User.docs[0].city, 'Panvel');
  assert.strictEqual(User.docs[1].city, 'Pune', 'a real account is never touched');
  assert.deepStrictEqual(User.docs[1].location.coordinates, [73.85, 18.52]);
});

t('moving with no tasks is a harmless no-op', async () => {
  const empty = { find: () => ({ lean: async () => [] }) };
  const r = await recentreDemo({ lat: 19, lng: 73 }, 'X', { Task: empty, User: empty });
  assert.strictEqual(r.moved, false);
});

t('distance helper agrees with the geo helper', () => {
  const a = { lat: 28.6304, lng: 77.2177 };
  const b = { lat: 18.9894, lng: 73.1175 };
  const km = kmBetween(a, b);
  const m = haversineMeters([a.lng, a.lat], [b.lng, b.lat]);
  assert(Math.abs(km * 1000 - m) / m < 0.005);
});

t('place names prefer the local area over the district', () => {
  assert.strictEqual(pickPlaceName({ suburb: 'Kharghar', city: 'Navi Mumbai', state_district: 'Raigad' }), 'Kharghar');
  assert.strictEqual(pickPlaceName({ city: 'Panvel', state_district: 'Raigad' }), 'Panvel');
  assert.strictEqual(pickPlaceName({ village: 'Bhatan', county: 'Panvel' }), 'Bhatan');
  assert.strictEqual(pickPlaceName({}), null);
  assert.strictEqual(pickPlaceName(undefined), null);
});

console.log('\n── Express wiring ──');
t('every API router is mounted', () => {
  const routes = [];
  const walk = (stack, prefix = '') => {
    for (const layer of stack) {
      if (layer.route) routes.push(prefix + layer.route.path);
      else if (layer.name === 'router' && layer.handle?.stack) {
        const m = layer.regexp.source
          .replace('^\\/', '/').replace('\\/?(?=\\/|$)', '')
          .replace(/\\\//g, '/').replace(/\$$/, '');
        walk(layer.handle.stack, prefix + m);
      }
    }
  };
  walk(app._router.stack);
  const joined = routes.join(' ');
  for (const expected of ['/api/health', '/api/config', '/tasks', '/auth', '/chat', '/users', '/reviews', '/voice', '/admin']) {
    assert(joined.includes(expected) || routes.some(r => r.includes(expected.replace('/api',''))),
      `route group missing: ${expected}\n      saw: ${joined.slice(0, 300)}`);
  }
  console.log(`      (${routes.length} routes registered)`);
});

await Promise.all(pending);

console.log(`\n${'─'.repeat(50)}`);
console.log(fail === 0 ? `  ALL ${pass} TESTS PASSED` : `  ${pass} passed, ${fail} FAILED`);
console.log(`${'─'.repeat(50)}\n`);
process.exit(fail === 0 ? 0 : 1);
