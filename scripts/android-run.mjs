#!/usr/bin/env node
/**
 * Puts Madad on an Android phone. One command, every step owned here.
 *
 *   npm run android:run                 build → install → launch on your phone over USB
 *   npm run android:apk                 just build an APK to hand to someone
 *   npm run android:reverse             re-open the USB tunnel after replugging
 *
 *   options (after `--`):
 *     --wifi            talk to the laptop over Wi-Fi instead of the USB tunnel
 *     --emulator        prefer a running emulator over a plugged-in phone
 *     --device <id>     deploy to one specific device (ids from `npm run doctor`)
 *
 * Why this exists rather than `npx cap run android`:
 *
 *   · Capacitor picks the first device adb lists. On this machine that was a
 *     stuck, offline Android Studio emulator — not the phone — and the deploy
 *     died after a 5-second adb timeout. Here a real phone always wins, and an
 *     offline emulator is ignored.
 *   · adb is found inside the SDK, so nothing has to be on PATH.
 *   · USB mode opens an `adb reverse` tunnel: the phone reaches the laptop's
 *     backend through the cable at localhost:5000. No IP address, no shared
 *     Wi-Fi, no Windows Firewall rule, and campus networks that block devices
 *     from seeing each other stop mattering.
 *   · Install and launch are retried, and an old install signed with a
 *     different key is replaced instead of failing.
 *   · Whatever happens at the end, a working APK is left in the project folder.
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  ROOT, CLIENT, SERVER, c, exists, readEnv, portInUse, lanAddresses, run,
  findAndroidSdk, adbBinary, exe, parseAdbDevices, pickDevice, deviceLabel,
} from './lib.mjs';

// ─────────────────────────────── options ───────────────────────────────
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valueOf = (f) => {
  const i = argv.indexOf(f);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined;
};

const BUILD_ONLY = has('--build-only');
const REVERSE_ONLY = has('--reverse-only');
const FORCE_WIFI = has('--wifi');
const PREFER_EMULATOR = has('--emulator');
const WANT_SERIAL = valueOf('--device');

const isWin = process.platform === 'win32';
const ANDROID = path.join(CLIENT, 'android');
const APP_ID = 'com.madad.app';
const ACTIVITY = `${APP_ID}/${APP_ID}.MainActivity`;
const APK = path.join(ANDROID, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const APK_COPY = path.join(ROOT, 'Madad-debug.apk');
const API_PORT = Number(readEnv(path.join(SERVER, '.env')).PORT || 5000);

// ─────────────────────────────── output ────────────────────────────────
let stepNo = 0;
const step = (t) => console.log(`\n${c.bold(`  ${++stepNo}.`)} ${c.bold(t)}`);
const ok = (t) => console.log(`     ${c.green('✓')} ${t}`);
const info = (t) => console.log(`     ${c.dim(t)}`);
const warn = (t) => console.log(`     ${c.yellow('!')} ${t}`);

function fail(title, lines = []) {
  console.log('');
  console.log(c.red(c.bold(`  ✗ ${title}`)));
  if (lines.length) console.log('');
  lines.forEach((l) => console.log(`    ${l}`));
  if (exists(APK_COPY)) {
    console.log('');
    console.log(c.dim(`    A previously built APK is still at: ${APK_COPY}`));
  }
  console.log('');
  process.exit(1);
}

/** Runs a long command with its output visible. Resolves to the exit code. */
function stream(cmd, args, { cwd, env } = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, env: env || process.env, stdio: 'inherit', shell: isWin });
    p.on('close', (code) => resolve(code ?? 1));
    p.on('error', () => resolve(1));
  });
}

// ─────────────────────────────── adb ───────────────────────────────────
let ADB = 'adb';

const TRANSIENT = /offline|unresponsive|daemon|protocol fault|connection reset|closed|cannot connect|no devices\/emulators/i;

/** adb with one automatic server restart if the connection was flaky. */
async function adb(args, { timeout = 30000 } = {}) {
  let r = await exe(ADB, args, { timeout });
  if (!r.ok && (r.timedOut || TRANSIENT.test(`${r.stdout}\n${r.stderr}`))) {
    await exe(ADB, ['kill-server'], { timeout: 10000 });
    await exe(ADB, ['start-server'], { timeout: 25000 });
    r = await exe(ADB, args, { timeout });
  }
  return r;
}

async function listDevices() {
  await exe(ADB, ['start-server'], { timeout: 25000 });
  const r = await adb(['devices', '-l'], { timeout: 15000 });
  return parseAdbDevices(r.stdout);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Explains every device that is plugged in but not usable. */
function reportUnusable(devices) {
  for (const d of devices) {
    if (d.state === 'device') continue;
    if (d.emulator && d.state === 'offline') {
      warn(`${d.serial} is a stuck emulator — ignoring it.`);
      info('  Close it, or in Android Studio: Device Manager → ⋮ → Cold Boot Now.');
    } else if (d.state === 'unauthorized') {
      warn(`${deviceLabel(d)} has not allowed this computer yet.`);
    } else if (d.state === 'offline') {
      warn(`${deviceLabel(d)} is offline — unplug it, plug it back in, unlock the screen.`);
    } else {
      warn(`${deviceLabel(d)} is "${d.state}".`);
    }
  }
}

/**
 * Finds the device to use, waiting up to 40s for a phone that is plugged in
 * but still showing the "Allow USB debugging?" prompt.
 */
async function findTarget() {
  let devices = await listDevices();

  const waitingForAllow = () =>
    devices.some((d) => d.state === 'unauthorized' && !d.emulator) && !pickDevice(devices, { serial: WANT_SERIAL, preferEmulator: PREFER_EMULATOR });

  if (waitingForAllow()) {
    warn('Your phone is asking for permission.');
    info('  Unlock it and tap "Allow" on the "Allow USB debugging?" popup.');
    info('  Tick "Always allow from this computer" so it never asks again.');
    info('  Waiting up to 40 seconds…');
    const until = Date.now() + 40000;
    while (Date.now() < until && waitingForAllow()) {
      await sleep(2000);
      devices = await listDevices();
    }
  }

  reportUnusable(devices);
  return { target: pickDevice(devices, { serial: WANT_SERIAL, preferEmulator: PREFER_EMULATOR }), devices };
}

/** An emulator that is "online" may still be booting; installs fail until it finishes. */
async function waitForBoot(serial) {
  const until = Date.now() + 120000;
  let shown = false;
  while (Date.now() < until) {
    const r = await adb(['-s', serial, 'shell', 'getprop', 'sys.boot_completed'], { timeout: 10000 });
    if (r.stdout.trim() === '1') return true;
    if (!shown) { info('waiting for the emulator to finish booting…'); shown = true; }
    await sleep(3000);
  }
  return false;
}

async function openTunnel(serial) {
  const r = await adb(['-s', serial, 'reverse', `tcp:${API_PORT}`, `tcp:${API_PORT}`], { timeout: 15000 });
  return r.ok;
}

function installHint(text) {
  if (/INSTALL_FAILED_USER_RESTRICTED|Install canceled by user/i.test(text)) {
    return [
      'The phone blocked the install.',
      '',
      c.bold('Xiaomi / Redmi / POCO:') + ' Settings → Additional settings → Developer options →',
      '  turn on "Install via USB" and "USB debugging (Security settings)".',
      c.bold('Oppo / Realme / Vivo:') + ' Developer options → turn off "Permission monitoring".',
      c.bold('Any phone:') + ' watch the screen during install — some ask you to tap "Install".',
    ];
  }
  if (/INSUFFICIENT_STORAGE/i.test(text)) return ['The phone is out of storage. Free up ~100 MB and try again.'];
  if (/offline|no devices|not found/i.test(text)) {
    return ['The phone dropped off during install. Replug the cable, unlock the screen, run again.'];
  }
  return [`adb said: ${text.split('\n').slice(-3).join(' ').slice(0, 300)}`];
}

async function install(serial) {
  const attempt = () => adb(['-s', serial, 'install', '-r', APK], { timeout: 240000 });

  let r = await attempt();
  let text = `${r.stdout}\n${r.stderr}`;

  // An earlier build signed with a different key (another laptop, a release
  // build) blocks an in-place update. Replacing it is the only way forward.
  if (/INSTALL_FAILED_UPDATE_INCOMPATIBLE|signatures do not match|INSTALL_FAILED_VERSION_DOWNGRADE/i.test(text)) {
    info('an older build signed with a different key is installed — replacing it');
    await adb(['-s', serial, 'uninstall', APP_ID], { timeout: 60000 });
    r = await attempt();
    text = `${r.stdout}\n${r.stderr}`;
  }

  // One more go for a connection that blinked mid-transfer.
  if (!/\bSuccess\b/.test(text) && /offline|closed|reset|timed out/i.test(text)) {
    await sleep(2000);
    r = await attempt();
    text = `${r.stdout}\n${r.stderr}`;
  }

  return { ok: /\bSuccess\b/.test(text), text };
}

async function launch(serial) {
  await adb(['-s', serial, 'shell', 'am', 'force-stop', APP_ID], { timeout: 10000 });
  let r = await adb(['-s', serial, 'shell', 'am', 'start', '-n', ACTIVITY], { timeout: 20000 });
  if (r.ok && !/Error/i.test(r.stdout + r.stderr)) return true;
  // Fallback: ask the launcher to open it.
  r = await adb(['-s', serial, 'shell', 'monkey', '-p', APP_ID, '-c', 'android.intent.category.LAUNCHER', '1'], { timeout: 20000 });
  return r.ok;
}

// ─────────────────────────────── API URL ───────────────────────────────
/** The address a phone on the same Wi-Fi would use to reach this laptop. */
function wifiApiUrl() {
  const fromEnv = readEnv(path.join(CLIENT, '.env')).VITE_API_URL;
  const addrs = lanAddresses();

  if (fromEnv) {
    const host = fromEnv.replace(/^https?:\/\//, '').split(/[:/]/)[0];
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
    // A real hostname (a deployed backend) is kept as-is; an IP is only kept
    // if it still belongs to this machine — IPs go stale when you change Wi-Fi.
    if (!isIp && host !== 'localhost') return fromEnv;
    if (isIp && addrs.some((a) => a.address === host)) return fromEnv;
  }
  return addrs[0] ? `http://${addrs[0].address}:${API_PORT}` : null;
}

// ─────────────────────────────── main ──────────────────────────────────
async function main() {
  const title = REVERSE_ONLY ? 'Madad — reconnecting the USB tunnel'
    : BUILD_ONLY ? 'Madad — building the APK'
    : 'Madad — putting the app on your phone';
  console.log('');
  console.log(c.bold('  ╭────────────────────────────────────────────╮'));
  console.log(c.bold(`  │   ${title.padEnd(41)}│`));
  console.log(c.bold('  ╰────────────────────────────────────────────╯'));

  // ── Android SDK ──────────────────────────────────────────────────
  step('Finding the Android SDK');
  const sdk = findAndroidSdk();
  if (!sdk) {
    fail('Could not find the Android SDK.', [
      'Open Android Studio → More Actions → SDK Manager.',
      'Copy the "Android SDK Location" path, then run:',
      c.bold('  setx ANDROID_HOME "<that path>"'),
      'Close this terminal, open a new one, and run this command again.',
    ]);
  }
  ok(sdk);

  ADB = adbBinary(sdk);
  if (ADB === 'adb') {
    const probe = await exe('adb', ['version'], { timeout: 10000 });
    if (probe.missing) {
      fail('adb is missing from your Android SDK.', [
        'Android Studio → SDK Manager → SDK Tools tab →',
        'tick "Android SDK Platform-Tools" → Apply.',
      ]);
    }
  }

  // Every child process (Gradle, Capacitor) gets the SDK location too, so
  // it no longer matters whether this terminal was opened before or after
  // ANDROID_HOME was set.
  const childEnv = {
    ...process.env,
    ANDROID_HOME: sdk,
    ANDROID_SDK_ROOT: sdk,
  };

  // ── Reverse-only: reconnect and stop ─────────────────────────────
  if (REVERSE_ONLY) {
    step('Looking for your phone');
    const { target } = await findTarget();
    if (!target) {
      fail('No phone found.', [
        'Plug it in with a data cable, unlock the screen, and run this again.',
      ]);
    }
    if (!(await openTunnel(target.serial))) {
      fail('Could not open the USB tunnel.', ['Replug the cable and try again.']);
    }
    ok(`tunnel open on ${deviceLabel(target)}: phone localhost:${API_PORT} → laptop localhost:${API_PORT}`);
    info('Open the Madad app on your phone — it can reach the backend again.');
    console.log('');
    return;
  }

  // ── Device ───────────────────────────────────────────────────────
  let target = null;
  let devices = [];
  if (!BUILD_ONLY) {
    step('Looking for your phone');
    ({ target, devices } = await findTarget());
    if (target) {
      ok(`using ${deviceLabel(target)}`);
      const ignored = devices.filter((d) => d.state === 'device' && d.serial !== target.serial);
      if (ignored.length) info(`also connected, not used: ${ignored.map(deviceLabel).join(', ')}`);
      if (target.emulator && !(await waitForBoot(target.serial))) {
        fail('The emulator never finished booting.', [
          'In Android Studio: Device Manager → ⋮ next to the emulator → Cold Boot Now.',
        ]);
      }
    } else {
      warn('No usable phone found — I will still build the APK, and show you how to install it.');
    }
  }

  // ── How will the app reach the backend? ──────────────────────────
  step('Choosing how the app reaches your laptop');
  const useTunnel = Boolean(target) && !FORCE_WIFI && !BUILD_ONLY;
  let apiUrl;
  if (useTunnel) {
    apiUrl = `http://localhost:${API_PORT}`;
    ok('USB tunnel — no Wi-Fi, IP address or firewall involved');
    info('The phone will reach the backend through the cable.');
  } else {
    apiUrl = wifiApiUrl();
    if (!apiUrl) {
      warn('No Wi-Fi address found on this laptop.');
      apiUrl = `http://localhost:${API_PORT}`;
      info('Building for the USB tunnel instead — it will need the cable.');
    } else {
      ok(`over Wi-Fi to ${apiUrl}`);
      info('The phone must be on the same Wi-Fi as this laptop.');
      if (isWin) info('If it cannot connect, see "Windows Firewall" in ANDROID.md.');
    }
  }

  // Every other way this laptop can be reached goes in as a fallback. The
  // app tries them all and uses whichever answers: unplug the cable while on
  // the same Wi-Fi and it carries on over Wi-Fi instead of saying "offline".
  const fallbacks = [...new Set([
    `http://localhost:${API_PORT}`,
    ...lanAddresses().map((a) => `http://${a.address}:${API_PORT}`),
  ])].filter((u) => u !== apiUrl);
  if (fallbacks.length) info(`also tries: ${fallbacks.join(', ')}`);

  if (!(await portInUse(API_PORT))) {
    warn(`The backend is not running on port ${API_PORT}.`);
    info('Start it in another terminal with:  npm start');
    info('The app will install fine, but will show you as offline until it is running.');
  } else {
    ok(`backend is running on port ${API_PORT}`);
  }

  // ── Build the web app ───────────────────────────────────────────
  step('Building the app');
  const buildEnv = {
    ...childEnv,
    VITE_API_URL: apiUrl,
    VITE_API_FALLBACKS: fallbacks.join(','),
  };
  if ((await stream('npm', ['run', 'build'], { cwd: CLIENT, env: buildEnv })) !== 0) {
    fail('The web build failed.', ['Scroll up for the error. Try:  npm run install:all']);
  }
  ok('web app built');

  // ── Android project ─────────────────────────────────────────────
  if (!exists(ANDROID)) {
    step('Creating the Android project (first run only)');
    await run('npx', ['cap', 'telemetry', 'off'], { cwd: CLIENT, timeout: 60000, env: childEnv });
    if ((await stream('npx', ['cap', 'add', 'android'], { cwd: CLIENT, env: childEnv })) !== 0) {
      fail('Could not create the Android project.', ['Scroll up for the error.']);
    }
    if ((await stream('npx', ['@capacitor/assets', 'generate', '--android', '--assetPath', 'resources'], { cwd: CLIENT, env: childEnv })) !== 0) {
      warn('Icon generation failed — the app will use the default icon.');
    }
    ok('Android project created');
  }

  step('Preparing the Android project');
  // process.execPath + exe() = no shell, so a project path with spaces is safe.
  const patch = await exe(process.execPath, [path.join(ROOT, 'scripts', 'patch-android.mjs')], { cwd: ROOT, timeout: 30000, env: childEnv });
  const applied = patch.stdout.split('\n').filter((l) => /^\s*\+/.test(l.replace(/\x1b\[[0-9;]*m/g, '')));
  if (!patch.ok) fail('Patching the Android project failed.', [patch.stdout || patch.stderr]);
  applied.forEach((l) => info(l.replace(/\x1b\[[0-9;]*m/g, '').trim()));
  ok('permissions, SDK path and branding in place');

  if ((await stream('npx', ['cap', 'sync', 'android'], { cwd: CLIENT, env: childEnv })) !== 0) {
    fail('Copying the web app into the Android project failed.', ['Scroll up for the error.']);
  }
  ok('web app copied into the Android project');

  // ── Gradle ──────────────────────────────────────────────────────
  step('Compiling the APK');
  info('the first build takes a few minutes; later ones are much faster');
  const gradle = isWin
    ? stream('gradlew.bat', ['assembleDebug'], { cwd: ANDROID, env: childEnv })
    : stream('sh', ['gradlew', 'assembleDebug'], { cwd: ANDROID, env: childEnv });

  if ((await gradle) !== 0 || !exists(APK)) {
    fail('The Android build failed.', [
      'Scroll up to the first line starting with "* What went wrong".',
      '',
      c.bold('JDK error') + ' → Android Studio\'s own JDK works. Run, then reopen the terminal:',
      '  setx JAVA_HOME "C:\\Program Files\\Android\\Android Studio\\jbr"',
      c.bold('Missing SDK component') + ' → npm run android:open, let Android Studio finish',
      '  syncing (it installs what is missing), close it, run this again.',
    ]);
  }

  fs.copyFileSync(APK, APK_COPY);
  const mb = (fs.statSync(APK_COPY).size / 1024 / 1024).toFixed(1);
  ok(`APK ready: ${APK_COPY}  (${mb} MB)`);

  // ── Build-only, or nothing to install to ────────────────────────
  if (BUILD_ONLY || !target) {
    console.log('');
    console.log(c.bold('  To install it on a phone'));
    console.log(c.dim('  ─────────────────────────────────────────────'));
    console.log(`  Send ${c.bold('Madad-debug.apk')} to the phone (WhatsApp, Drive, USB copy),`);
    console.log('  open it there, and allow "Install unknown apps" when asked.');
    console.log(`  It reaches the backend at ${c.bold(apiUrl)}, so the phone must be`);
    console.log('  on the same Wi-Fi while this laptop is running npm start.');

    if (!BUILD_ONLY) {
      console.log('');
      console.log(c.bold('  Or let me install it directly — get the phone detected'));
      console.log(c.dim('  ─────────────────────────────────────────────'));
      console.log('  1. Use a data cable. Many cables only charge — this is the usual culprit.');
      console.log('  2. Unlock the phone. Pull down the notification shade, tap the USB');
      console.log('     notification, and choose "File transfer".');
      console.log('  3. Tap "Allow" on the "Allow USB debugging?" popup.');
      console.log('  4. Check:  npm run doctor   — your phone should be listed as connected.');
      console.log(`  5. Then:   ${c.bold('npm run android:run')}`);
    }
    console.log('');
    return;
  }

  // ── Install and launch ──────────────────────────────────────────
  step(`Installing on ${deviceLabel(target)}`);

  if (useTunnel) {
    if (!(await openTunnel(target.serial))) {
      fail('Could not open the USB tunnel to the phone.', [
        'Replug the cable and run again, or build for Wi-Fi instead:',
        c.bold('  npm run android:run -- --wifi'),
      ]);
    }
    ok(`USB tunnel open: phone localhost:${API_PORT} → laptop localhost:${API_PORT}`);
  }

  const result = await install(target.serial);
  if (!result.ok) fail('Installing on the phone failed.', installHint(result.text));
  ok('installed');

  if (!(await launch(target.serial))) {
    warn('Installed, but could not open it automatically — tap the Madad icon on the phone.');
  } else {
    ok('launched');
  }

  console.log('');
  console.log(c.green(c.bold('  ╭────────────────────────────────────────────╮')));
  console.log(c.green(c.bold('  │   Madad is running on your phone           │')));
  console.log(c.green(c.bold('  ╰────────────────────────────────────────────╯')));
  console.log('');
  console.log('  Sign in as  rohan@madad.local  /  password123');
  console.log('  or tap the Demo button to switch accounts.');
  console.log('');
  if (useTunnel) {
    console.log(c.dim('  Keep npm start running: it reopens the USB tunnel by itself whenever'));
    console.log(c.dim('  the phone is plugged in. Without the cable, the app uses Wi-Fi if the'));
    console.log(c.dim('  phone and laptop are on the same network.'));
  }
  console.log(c.dim('  Changed some code?        npm run android:run   (faster after the first time)'));
  console.log(c.dim(`  APK to share:             ${APK_COPY}`));
  console.log('');
}

main().catch((err) => {
  fail(`Unexpected error: ${err.message}`, [c.dim(String(err.stack || '').split('\n').slice(1, 4).join('\n'))]);
});
