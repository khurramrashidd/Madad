#!/usr/bin/env node
/**
 * Moves the demo tasks to where you are. Nothing is deleted.
 *
 *   npm run move-demo -- Panvel              by place name (needs internet)
 *   npm run move-demo -- "Kharghar, Navi Mumbai"
 *   npm run move-demo -- 18.9894 73.1175 Panvel   by coordinates
 *   npm run move-demo                        to the area set in server/.env
 *
 * It also saves the new area in server/.env, so `npm run seed` builds fresh
 * demo data there too.
 *
 * `--auto` is what `npm start` runs: it only moves the data if it is more
 * than 25 km from the area in server/.env (for example, still in New Delhi
 * after the default changed to Panvel).
 *
 * Inside the app there is the same thing as a button:
 * Demo → "Move demo tasks to me", which uses the phone's GPS.
 */
import path from 'path';
import { pathToFileURL } from 'url';
import { SERVER, c, readEnv, writeEnvKey, portInUse, exists } from './lib.mjs';

const ENV_FILE = path.join(SERVER, '.env');
const args = process.argv.slice(2);
const AUTO = args.includes('--auto');
const rest = args.filter((a) => !a.startsWith('--'));

const say = (t = '') => console.log(`  ${t}`);
const fail = (t, ...more) => {
  console.log('');
  console.log(c.red(`  ✗ ${t}`));
  more.forEach((m) => say(m));
  console.log('');
  process.exit(1);
};

const fromServer = (rel) => import(pathToFileURL(path.join(SERVER, 'src', rel)).href);

if (!exists(path.join(SERVER, 'node_modules', 'mongoose'))) {
  fail('Server packages are not installed.', 'Run:  npm run install:all');
}
if (!(await portInUse(27017))) {
  fail('MongoDB is not running.', 'Start it first (Windows, admin terminal):  net start MongoDB');
}

// ── Work out the target ────────────────────────────────────────────
const envNow = readEnv(ENV_FILE);
let target = null;

if (rest.length >= 2 && Number.isFinite(Number(rest[0])) && Number.isFinite(Number(rest[1]))) {
  target = { lat: Number(rest[0]), lng: Number(rest[1]), name: rest.slice(2).join(' ') || null };
  if (Math.abs(target.lat) > 90 || Math.abs(target.lng) > 180) {
    fail('Those coordinates are not valid.', 'Latitude comes first, e.g.  npm run move-demo -- 18.9894 73.1175 Panvel');
  }
} else if (rest.length) {
  const query = rest.join(' ');
  const { findPlace } = await fromServer('utils/placeName.js');
  if (!AUTO) say(c.dim(`looking up "${query}"…`));
  const hit = await findPlace(query);
  if (!hit) {
    fail(`Could not find "${query}".`,
      'Check the spelling and your internet connection, or give coordinates instead:',
      c.bold('  npm run move-demo -- 18.9894 73.1175 Panvel'),
      c.dim('  (Google Maps: long-press a spot to see its coordinates)'));
  }
  target = { lat: hit.lat, lng: hit.lng, name: hit.name };
  if (!AUTO) say(c.dim(`found: ${hit.label}`));
} else {
  const lat = Number(envNow.SEED_CENTER_LAT ?? 18.9894);
  const lng = Number(envNow.SEED_CENTER_LNG ?? 73.1175);
  target = { lat, lng, name: envNow.SEED_CITY || 'Panvel' };
}

// ── Move ───────────────────────────────────────────────────────────
const mongoose = (await import(pathToFileURL(path.join(SERVER, 'node_modules', 'mongoose', 'index.js')).href)).default;
const { recentreDemo, currentCentre, kmBetween } = await fromServer('seed/recentre.js');
const uri = envNow.MONGO_URI || 'mongodb://127.0.0.1:27017/madad';

try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 6000 });
} catch (err) {
  fail('Could not connect to MongoDB.', err.message);
}

try {
  const from = await currentCentre();
  if (!from) {
    if (!AUTO) say(c.yellow('There are no tasks to move. Load the demo first:  npm run seed'));
  } else {
    const km = kmBetween(from, target);
    if (AUTO && km < 25) {
      // Already in the right area — nothing to say.
    } else if (km < 0.05) {
      say(c.green('✓ ') + `The demo is already at ${target.name || 'that spot'}.`);
    } else {
      const r = await recentreDemo({ lat: target.lat, lng: target.lng }, target.name);
      const where = target.name || `${target.lat.toFixed(4)}, ${target.lng.toFixed(4)}`;
      say(c.green('✓ ') + `Moved ${r.tasks} demo tasks and ${r.users} demo users ${Math.round(km)} km, to ${c.bold(where)}`);
      say(c.dim('  nothing was deleted — chats, reviews and trust scores are unchanged'));
    }
  }

  // Remember the area, so `npm run seed` and the app's default centre match.
  if (!AUTO) {
    writeEnvKey(ENV_FILE, 'SEED_CENTER_LAT', target.lat.toFixed(6));
    writeEnvKey(ENV_FILE, 'SEED_CENTER_LNG', target.lng.toFixed(6));
    if (target.name) writeEnvKey(ENV_FILE, 'SEED_CITY', target.name);
    say(c.dim('  saved as the demo area in server/.env — restart npm start to use it as the default map centre'));
  }
} finally {
  await mongoose.connection.close();
}
