#!/usr/bin/env node
/**
 * Madad environment doctor.
 *
 * Checks everything needed to run the web app and build the Android app, and
 * says exactly what to do about anything missing. Run it whenever something
 * stops working — it is faster than guessing.
 *
 *   npm run doctor
 */
import fs from 'fs';
import path from 'path';
import {
  ROOT, SERVER, CLIENT, c, icon, heading, line, run,
  portInUse, lanAddresses, exists, readEnv, parseMajor,
  findAndroidSdk, adbBinary, exe, parseAdbDevices, deviceLabel,
} from './lib.mjs';

const problems = [];
const warnings = [];
const fail = (label, fix) => { problems.push({ label, fix }); };
const warn = (label, fix) => { warnings.push({ label, fix }); };

console.log('');
console.log(c.bold('  Madad — environment check'));
console.log(c.dim(`  ${process.platform} · node ${process.version} · ${ROOT}`));

// ─────────────────────────────── Core toolchain
heading('Core toolchain');

const nodeMajor = parseMajor(process.version);
if (nodeMajor >= 18) {
  line(icon.ok, 'Node.js', process.version);
} else {
  line(icon.fail, 'Node.js', `${process.version} — need 18 or newer`);
  fail('Node.js is too old', 'Install the LTS build from https://nodejs.org');
}

const npm = await run('npm', ['--version']);
npm.ok
  ? line(icon.ok, 'npm', `v${npm.stdout}`)
  : (line(icon.fail, 'npm', 'not found'), fail('npm is missing', 'Reinstall Node.js — npm ships with it'));

// ─────────────────────────────── MongoDB
heading('MongoDB');

const mongoUp = await portInUse(27017);
if (mongoUp) {
  line(icon.ok, 'mongod listening', 'port 27017');
} else {
  line(icon.fail, 'mongod listening', 'nothing on port 27017');
  fail(
    'MongoDB is not running',
    process.platform === 'win32'
      ? 'Run in an ADMIN PowerShell:  net start MongoDB\n' +
        '           Not installed? https://www.mongodb.com/try/download/community\n' +
        '           (tick "Install MongoDB as a Service" during setup)'
      : process.platform === 'darwin'
        ? 'brew services start mongodb-community'
        : 'sudo systemctl start mongod'
  );
}

const mongosh = await run('mongosh', ['--version']);
if (mongosh.ok) line(icon.ok, 'mongosh', mongosh.stdout.split('\n')[0]);
else line(icon.info, 'mongosh', 'not on PATH (optional — only a convenience)');

// ─────────────────────────────── Project files
heading('Project files');

for (const [label, dir] of [['server', SERVER], ['client', CLIENT]]) {
  const pkg = exists(path.join(dir, 'package.json'));
  const mods = exists(path.join(dir, 'node_modules'));

  if (!pkg) {
    line(icon.fail, `${label}/package.json`, 'missing');
    fail(`${label} folder looks wrong`, 'Re-extract the project zip');
  } else if (!mods) {
    line(icon.fail, `${label}/node_modules`, 'not installed');
    fail(`${label} dependencies missing`, `cd ${label}  &&  npm install`);
  } else {
    line(icon.ok, `${label} dependencies`, 'installed');
  }

  const envFile = path.join(dir, '.env');
  if (!exists(envFile)) {
    line(icon.fail, `${label}/.env`, 'missing');
    fail(`${label}/.env not created`, `Copy-Item ${label}\\.env.example ${label}\\.env`);
  } else {
    line(icon.ok, `${label}/.env`, 'present');
  }
}

// Where the demo tasks are.
const serverEnv = readEnv(path.join(SERVER, '.env'));
if (serverEnv.SEED_CENTER_LAT === '28.6304' && serverEnv.SEED_CENTER_LNG === '77.2177') {
  line(icon.warn, 'Demo area', 'still the old New Delhi default');
  warn(
    'Demo tasks are centred on New Delhi',
    'npm start moves them to Panvel automatically. Somewhere else?\n' +
    '           npm run move-demo -- <place name>'
  );
} else {
  line(icon.ok, 'Demo area', serverEnv.SEED_CITY || `${serverEnv.SEED_CENTER_LAT}, ${serverEnv.SEED_CENTER_LNG}`);
}

if (serverEnv.JWT_SECRET?.includes('change_me')) {
  line(icon.info, 'JWT secret', 'still the development default');
}

// ─────────────────────────────── Ports
heading('Ports');

const apiPort = Number(serverEnv.PORT || 5000);
for (const [label, port] of [['API', apiPort], ['Vite dev server', 5173]]) {
  const busy = await portInUse(port);
  if (!busy) {
    line(icon.ok, `${label} port ${port}`, 'free');
  } else {
    line(icon.warn, `${label} port ${port}`, 'already in use');
    warn(
      `Port ${port} is occupied`,
      'Either it is already your own dev server (fine), or something else has it.\n' +
      (process.platform === 'win32'
        ? `           netstat -ano | findstr :${port}     then  taskkill /PID <pid> /F`
        : `           lsof -ti:${port} | xargs kill -9`)
    );
  }
}

// ─────────────────────────────── Network
heading('Network (for testing on your phone)');

const addrs = lanAddresses();
if (addrs.length === 0) {
  line(icon.warn, 'LAN address', 'none found');
  warn('No network address', 'Connect to Wi-Fi, then run this again.');
} else {
  addrs.forEach((a, i) => {
    line(i === 0 ? icon.ok : icon.info, i === 0 ? 'LAN address (best)' : 'also available',
         `${a.address}   ${c.dim(`[${a.name}]`)}`);
  });
  console.log('');
  console.log(c.dim(`         Phone URL:  http://${addrs[0].address}:5173`));
  console.log(c.dim(`         Set it automatically with:  npm run set-ip`));
}

const clientEnv = readEnv(path.join(CLIENT, '.env'));
if (clientEnv.VITE_API_URL) {
  const host = clientEnv.VITE_API_URL.replace(/^https?:\/\//, '').split(':')[0];
  const known = addrs.some((a) => a.address === host);
  if (host === 'localhost' || host === '127.0.0.1') {
    line(icon.info, 'VITE_API_URL', `${clientEnv.VITE_API_URL} (laptop only)`);
  } else if (known) {
    line(icon.ok, 'VITE_API_URL', clientEnv.VITE_API_URL);
  } else {
    line(icon.warn, 'VITE_API_URL', `${clientEnv.VITE_API_URL} — not one of this machine's addresses`);
    warn('VITE_API_URL points at a stale IP',
         'Your laptop\'s IP changes when you switch networks. Fix it with:  npm run set-ip');
  }
} else {
  line(icon.ok, 'VITE_API_URL', 'blank — using the Vite proxy (correct for laptop dev)');
}

// ─────────────────────────────── Android
heading('Android build chain');

const java = await run('java', ['-version']);
// `java -version` writes to stderr, which is not an error. Some environments
// also prepend "Picked up JAVA_TOOL_OPTIONS: ..." noise, so find the line that
// actually carries the version rather than assuming it is the first one.
const javaText = `${java.stderr}\n${java.stdout}`;
const versionLine = javaText.split('\n').find((l) => /version\s+"/.test(l))?.trim();
if (java.ok && versionLine) {
  const v = versionLine;
  const major = Number((versionLine.match(/version "(?:1\.)?(\d+)/) || [])[1]);
  if (major && major >= 17) line(icon.ok, 'Java (JDK)', v);
  else {
    line(icon.warn, 'Java (JDK)', `${v} — Capacitor wants 17+`);
    warn('JDK version may be too old',
         'Android Studio bundles JDK 17. Set JAVA_HOME to:\n' +
         '           C:\\Program Files\\Android\\Android Studio\\jbr');
  }
} else {
  line(icon.warn, 'Java (JDK)', 'not found on PATH');
  warn('No JDK on PATH',
       'Only needed for the APK. Android Studio ships one — set JAVA_HOME to:\n' +
       '           C:\\Program Files\\Android\\Android Studio\\jbr');
}

// The same lookup android:run uses — env var, local.properties, then the
// default install location. Nothing needs to be on PATH.
const sdk = findAndroidSdk();
if (sdk) {
  const how = (process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT) ? '' : '  (found automatically)';
  line(icon.ok, 'Android SDK', `${sdk}${how}`);
} else {
  line(icon.warn, 'Android SDK', 'not found');
  warn('Android SDK missing',
       'Android Studio → More Actions → SDK Manager. Copy the "Android SDK Location",\n' +
       '           then:  setx ANDROID_HOME "<that path>"   and open a new terminal.');
}

const adbBin = adbBinary(sdk);
const adbRes = await exe(adbBin, ['devices', '-l'], { timeout: 20000 });
if (adbRes.missing) {
  line(icon.warn, 'adb', 'not found in the SDK');
  warn('adb is missing',
       'Android Studio → SDK Manager → SDK Tools → tick "Android SDK Platform-Tools".');
} else {
  const devices = parseAdbDevices(adbRes.stdout);
  const phones = devices.filter((d) => d.state === 'device' && !d.emulator);
  const emus = devices.filter((d) => d.state === 'device' && d.emulator);
  const stuck = devices.filter((d) => d.state === 'offline');
  const unauth = devices.filter((d) => d.state === 'unauthorized');

  if (phones.length) {
    line(icon.ok, 'Phone connected', phones.map(deviceLabel).join(', '));
  } else if (unauth.length) {
    line(icon.warn, 'Phone connected', 'waiting for you to allow this computer');
    warn('Phone is plugged in but not trusted',
         'Unlock it and tap "Allow" on the "Allow USB debugging?" popup.\n' +
         '           No popup? Unplug, replug, and check the notification shade.');
  } else {
    line(icon.info, 'Phone connected', 'none — plug in with a data cable and unlock it');
  }

  emus.forEach((d) => line(icon.info, 'Emulator running', deviceLabel(d)));
  stuck.forEach((d) => {
    line(icon.warn, d.emulator ? 'Stuck emulator' : 'Offline device', `${d.serial} — android:run ignores it`);
  });
  if (stuck.some((d) => d.emulator)) {
    warn('An emulator is stuck offline',
         'Harmless — npm run android:run skips it. To clear it: close the emulator window,\n' +
         '           or Android Studio → Device Manager → ⋮ → Cold Boot Now.');
  }
}

const androidDir = path.join(CLIENT, 'android');
line(exists(androidDir) ? icon.ok : icon.info, 'Android project',
     exists(androidDir) ? 'present' : 'not created yet — npm run android:run creates it');

// ─────────────────────────────── Summary
console.log('');
console.log(c.dim('─'.repeat(52)));

if (!problems.length && !warnings.length) {
  console.log(c.green(c.bold('  Everything checks out. You are ready to go.')));
  console.log('');
  console.log('  Start the app:      ' + c.bold('npm start'));
  console.log('  Run on your phone:  ' + c.bold('npm run android:run'));
  console.log('');
  process.exit(0);
}

if (problems.length) {
  console.log(c.red(c.bold(`  ${problems.length} problem(s) to fix:`)));
  problems.forEach((p, i) => {
    console.log(`\n  ${i + 1}. ${c.bold(p.label)}`);
    console.log(`     ${c.dim('fix:')} ${p.fix}`);
  });
}

if (warnings.length) {
  console.log('');
  console.log(c.yellow(c.bold(`  ${warnings.length} thing(s) worth a look:`)));
  warnings.forEach((w, i) => {
    console.log(`\n  ${i + 1}. ${c.bold(w.label)}`);
    console.log(`     ${c.dim('fix:')} ${w.fix}`);
  });
}

console.log('');
process.exit(problems.length ? 1 : 0);
