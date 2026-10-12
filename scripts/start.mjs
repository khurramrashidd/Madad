#!/usr/bin/env node
/**
 * One command to run Madad.
 *
 *   npm start
 *
 * Does everything in order and stops with a plain-English explanation at the
 * first thing that is actually broken:
 *
 *   1. is MongoDB running?
 *   2. do the .env files exist?        (creates them if not)
 *   3. are dependencies installed?     (installs them if not)
 *   4. does the database have data?    (seeds it if not, and keeps it in
 *                                       the demo area — Panvel by default)
 *   5. start the backend and frontend
 *   6. open the browser
 *   7. keep a USB tunnel open to any Android phone that is plugged in, so
 *      the phone app reaches this laptop without any extra command
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  ROOT, SERVER, CLIENT, c, run, portInUse, exists, readEnv, writeEnvKey, parseMajor, loadMongoose,
  exe,
} from './lib.mjs';
import { startPhoneTunnels } from './phone-tunnel.mjs';

const step = (n, text) => console.log(`\n${c.bold(`  ${n}.`)} ${c.bold(text)}`);
const ok = (text) => console.log(`     ${c.green('✓')} ${text}`);
const info = (text) => console.log(`     ${c.dim(text)}`);

function die(title, ...fixes) {
  console.log('');
  console.log(c.red(`  ✗ ${title}`));
  console.log('');
  fixes.forEach((f) => console.log(`    ${f}`));
  console.log('');
  process.exit(1);
}

/** Runs a command to completion, streaming its output. */
function exec(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`))));
    p.on('error', reject);
  });
}

console.log('');
console.log(c.bold('  ╭────────────────────────────────────────────╮'));
console.log(c.bold('  │   Madad — starting up                      │'));
console.log(c.bold('  ╰────────────────────────────────────────────╯'));

// ─────────────────────────── 1. Node ───────────────────────────
if (parseMajor(process.version) < 18) {
  die(`Node ${process.version} is too old — Madad needs 18 or newer.`,
      'Install the LTS build from https://nodejs.org and try again.');
}

// ─────────────────────────── 2. MongoDB ───────────────────────────
step(1, 'Checking MongoDB');
if (!(await portInUse(27017))) {
  die(
    'MongoDB is not running.',
    c.bold('Windows:'),
    '  Open PowerShell as Administrator and run:',
    c.bold('    net start MongoDB'),
    '',
    '  Not installed yet? Download Community Server from',
    '  https://www.mongodb.com/try/download/community',
    `  ${c.yellow('During setup, tick "Install MongoDB as a Service".')}`,
    '',
    c.bold('Mac:    ') + 'brew services start mongodb-community',
    c.bold('Linux:  ') + 'sudo systemctl start mongod'
  );
}
ok('MongoDB is running on port 27017');

// ─────────────────────────── 3. Config files ───────────────────────────
step(2, 'Checking config files');
for (const [label, dir] of [['server', SERVER], ['client', CLIENT]]) {
  const env = path.join(dir, '.env');
  const example = path.join(dir, '.env.example');
  if (!exists(env)) {
    if (!exists(example)) die(`${label}/.env.example is missing.`, 'Re-extract the project zip.');
    fs.copyFileSync(example, env);
    ok(`created ${label}/.env`);
  } else {
    ok(`${label}/.env is there`);
  }
}

// The demo area used to default to New Delhi. Anyone still on that default
// gets Panvel; anyone who chose their own area keeps it.
{
  const serverEnvFile = path.join(SERVER, '.env');
  const e = readEnv(serverEnvFile);
  if (e.SEED_CENTER_LAT === '28.6304' && e.SEED_CENTER_LNG === '77.2177') {
    writeEnvKey(serverEnvFile, 'SEED_CENTER_LAT', '18.9894');
    writeEnvKey(serverEnvFile, 'SEED_CENTER_LNG', '73.1175');
    writeEnvKey(serverEnvFile, 'SEED_CITY', 'Panvel');
    ok('demo area set to Panvel (it was the old New Delhi default)');
    info('somewhere else?  npm run move-demo -- <place name>');
  }
}

// ─────────────────────────── 4. Dependencies ───────────────────────────
step(3, 'Checking dependencies');
for (const [label, dir] of [['server', SERVER], ['client', CLIENT]]) {
  if (!exists(path.join(dir, 'node_modules'))) {
    info(`installing ${label} packages — this takes a minute the first time…`);
    try {
      await exec('npm', ['install', '--no-audit', '--no-fund'], dir);
    } catch {
      die(`Could not install ${label} dependencies.`,
          `Try it by hand:  cd ${label}  then  npm install`);
    }
    ok(`${label} packages installed`);
  } else {
    ok(`${label} packages are there`);
  }
}

// ─────────────────────────── 5. Database ───────────────────────────
// Madad is a real product: accounts and tasks are created by people signing
// up, not seeded. The database just has to be reachable. (If you ever want a
// few sample tasks to look at, run `npm run seed` yourself.)
step(4, 'Checking the database');
let userCount = null;
try {
  const mongoose = await loadMongoose();
  const uri = readEnv(path.join(SERVER, '.env')).MONGO_URI || 'mongodb://127.0.0.1:27017/madad';
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 6000 });
  userCount = await mongoose.connection.db.collection('users').countDocuments();
  await mongoose.connection.close();
} catch {
  info('could not read the database yet — it will be created on first use');
}
if (userCount === 0 || userCount === null) ok('ready — create an account in the app to begin');
else ok(`${userCount} account${userCount === 1 ? '' : 's'} registered`);

// ─────────────────────────── 6. Ports ───────────────────────────
step(5, 'Checking ports');
const apiPort = Number(readEnv(path.join(SERVER, '.env')).PORT || 5000);
for (const [label, port] of [['Backend', apiPort], ['Frontend', 5173]]) {
  if (await portInUse(port)) {
    die(
      `Port ${port} is already in use (needed for the ${label.toLowerCase()}).`,
      'Madad is probably already running in another terminal — check your other tabs.',
      '',
      'If not, free the port:',
      process.platform === 'win32'
        ? c.bold(`  netstat -ano | findstr :${port}`) + '   then   ' + c.bold('taskkill /PID <number> /F')
        : c.bold(`  lsof -ti:${port} | xargs kill -9`)
    );
  }
}
ok(`ports ${apiPort} and 5173 are free`);

// ─────────────────────────── 7. Launch ───────────────────────────
step(6, 'Starting the app');
console.log('');

const children = [];
const launch = (name, color, cwd) => {
  const p = spawn('npm', ['run', 'dev'], { cwd, shell: process.platform === 'win32' });
  const tag = c[color](`[${name}]`);

  const pipe = (stream) => {
    stream.on('data', (buf) => {
      String(buf).split('\n').filter((l) => l.trim()).forEach((l) => console.log(`${tag} ${l}`));
    });
  };
  pipe(p.stdout);
  pipe(p.stderr);

  p.on('close', (code) => {
    if (code !== 0 && !shuttingDown) {
      console.log(`${tag} ${c.red(`stopped unexpectedly (exit ${code})`)}`);
    }
  });

  children.push(p);
  return p;
};

launch('api', 'yellow', SERVER);
launch('web', 'blue', CLIENT);

// Wait for both to answer before opening a browser — otherwise the user
// lands on a connection-refused page and assumes it is broken.
const waitFor = async (port, label, timeoutMs = 60000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portInUse(port)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(c.yellow(`\n  ${label} is taking longer than expected to start.`));
  return false;
};

await waitFor(apiPort, 'Backend');
const webUp = await waitFor(5173, 'Frontend');

if (webUp) {
  const url = 'http://localhost:5173';
  const opener = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]]
    : ['xdg-open', [url]];
  run(opener[0], opener[1], { timeout: 5000 }).catch(() => {});

  console.log('');
  console.log(c.green(c.bold('  ╭────────────────────────────────────────────╮')));
  console.log(c.green(c.bold('  │   Madad is running                         │')));
  console.log(c.green(c.bold('  ╰────────────────────────────────────────────╯')));
  console.log('');
  console.log(`  Open:  ${c.bold(url)}`);
  console.log('');
  console.log(c.bold('  First time'));
  console.log(c.dim('  ─────────────────────────────────────────────'));
  console.log('  1. Open the link above and tap ' + c.bold('Create an account') + '.');
  console.log('  2. Allow location when the browser asks — the feed is built around you.');
  console.log('  3. Add your UPI ID in Profile so you can be paid.');
  console.log('');
  console.log(c.dim('  To see it working with two people, register a second account on'));
  console.log(c.dim('  your phone (or another browser): one posts a task, the other claims it.'));
  console.log(c.dim('  Put the app on your phone:  npm run android:run'));
  console.log('');
  console.log(c.dim('  Press Ctrl+C to stop.'));
  console.log('');
}

// ─────────────────────────── Phone tunnel ───────────────────────────
// The Android app reaches this laptop through the USB cable (adb reverse).
// That tunnel disappears whenever the phone is unplugged or adb restarts, and
// the app then cannot reach the laptop — so while Madad runs, any phone that
// is plugged in gets the tunnel (re)opened within a few seconds.
startPhoneTunnels({ port: apiPort, isStopping: () => shuttingDown }).catch(() => {});

// Wi-Fi route for the phone: Windows Firewall blocks incoming connections to
// port 5000 unless a rule allows it. Only a hint — adding it needs admin.
async function firewallHint() {
  if (process.platform !== 'win32') return;
  const r = await exe('netsh', ['advfirewall', 'firewall', 'show', 'rule', 'name=Madad API'], { timeout: 8000 });
  if (r.ok && /Madad API/.test(r.stdout)) return;
  console.log(c.dim('  Phone over Wi-Fi instead of the cable? Allow it through Windows Firewall once,'));
  console.log(c.dim('  in a Command Prompt opened with "Run as administrator":'));
  console.log(c.dim(`    netsh advfirewall firewall add rule name="Madad API" dir=in action=allow protocol=TCP localport=${apiPort}`));
  console.log('');
}

if (webUp) firewallHint().catch(() => {});

// ─────────────────────────── Shutdown ───────────────────────────
let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(c.dim('\n  Stopping…'));
  children.forEach((p) => {
    try {
      // On Windows a plain kill leaves the npm child processes orphaned.
      if (process.platform === 'win32') spawn('taskkill', ['/pid', p.pid, '/f', '/t'], { shell: true });
      else p.kill('SIGTERM');
    } catch { /* already gone */ }
  });
  setTimeout(() => process.exit(0), 900);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
