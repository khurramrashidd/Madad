#!/usr/bin/env node
/**
 * Patches the generated Android project.
 *
 * `npx cap add android` scaffolds a stock Android app that cannot do what
 * Madad needs: no location, no microphone, and — on Android 9+ — no plain HTTP,
 * which silently kills every API call to a laptop dev server. This script
 * applies those changes so they are not a hand-editing step you can forget.
 *
 * Safe to run repeatedly: every edit checks for itself first.
 *
 *   npm run android:patch
 */
import fs from 'fs';
import path from 'path';
import { CLIENT, c, exists, findAndroidSdk } from './lib.mjs';

const ANDROID = path.join(CLIENT, 'android');

if (!exists(ANDROID)) {
  console.error('');
  console.error(c.red('  No android/ folder yet.'));
  console.error(c.dim('  Create it first:  npm run android:init'));
  console.error('');
  process.exit(1);
}

const changes = [];
const skipped = [];
const notes = [];

// ─────────────────── 0. Point Gradle at the Android SDK ───────────────────
/**
 * Without this, Gradle fails with "SDK location not found" — even when the SDK
 * is sitting right there, because ANDROID_HOME is not set. Android Studio
 * writes local.properties itself; a command-line build has nobody to do it.
 *
 * local.properties is per-machine and gitignored by Capacitor, so writing it
 * here is exactly where it belongs. The SDK lookup lives in lib.mjs so the
 * doctor, this patcher and android:run all agree on where the SDK is.
 */
const localProps = path.join(ANDROID, 'local.properties');
if (exists(localProps) && /sdk\.dir=/.test(fs.readFileSync(localProps, 'utf8'))) {
  skipped.push('Gradle already knows the SDK location');
} else {
  const sdk = findAndroidSdk();
  if (sdk) {
    // Gradle properties files treat a backslash as an escape character, so a
    // Windows path has to be escaped or Gradle reads "C:UsersyouAppData".
    const escaped = sdk.replace(/\\/g, '\\\\');
    fs.writeFileSync(
      localProps,
      `# Written by scripts/patch-android.mjs — machine-specific, not committed.\nsdk.dir=${escaped}\n`,
      'utf8'
    );
    changes.push(`pointed Gradle at the Android SDK (${sdk})`);
  } else {
    notes.push(
      'Could not find your Android SDK. Open Android Studio → Settings →\n' +
      '           Languages & Frameworks → Android SDK, copy the path, then create\n' +
      `           ${localProps}\n` +
      '           containing:  sdk.dir=C:\\\\path\\\\to\\\\Sdk'
    );
  }
}

// ─────────────────────────── 1. Permissions ───────────────────────────
const manifestPath = path.join(ANDROID, 'app', 'src', 'main', 'AndroidManifest.xml');
if (!exists(manifestPath)) {
  console.error(c.red(`  Manifest not found at ${manifestPath}`));
  process.exit(1);
}

let manifest = fs.readFileSync(manifestPath, 'utf8');

const PERMISSIONS = [
  ['android.permission.INTERNET', 'talk to the API'],
  ['android.permission.ACCESS_NETWORK_STATE', 'detect going offline'],
  ['android.permission.ACCESS_FINE_LOCATION', 'precise GPS for the radius feed'],
  ['android.permission.ACCESS_COARSE_LOCATION', 'fallback location'],
  ['android.permission.RECORD_AUDIO', 'voice-to-task dictation'],
  ['android.permission.MODIFY_AUDIO_SETTINGS', 'microphone capture'],
  ['android.permission.VIBRATE', 'haptics'],
];

const missing = PERMISSIONS.filter(([p]) => !manifest.includes(`"${p}"`));

if (missing.length) {
  const block = missing.map(([p, why]) => `    <uses-permission android:name="${p}" />${' '.repeat(Math.max(1, 52 - p.length))}<!-- ${why} -->`).join('\n');

  if (manifest.includes('</manifest>')) {
    manifest = manifest.replace('</manifest>', `\n${block}\n</manifest>`);
    changes.push(`added ${missing.length} permission(s)`);
  }
} else {
  skipped.push('permissions already present');
}

// ───────────────── 2. Allow cleartext HTTP to the dev server ─────────────────
// Android 9+ blocks plain HTTP by default. The dev server is HTTP on a LAN IP,
// so without this every request fails with a bare "network error" and no clue.
if (!manifest.includes('android:usesCleartextTraffic')) {
  manifest = manifest.replace(
    /<application([^>]*?)>/,
    '<application$1\n        android:usesCleartextTraffic="true">'
  );
  changes.push('allowed cleartext HTTP (needed for the LAN dev server)');
} else {
  skipped.push('cleartext traffic already allowed');
}

fs.writeFileSync(manifestPath, manifest, 'utf8');

// ───────────────── 3. App display name ─────────────────
const stringsPath = path.join(ANDROID, 'app', 'src', 'main', 'res', 'values', 'strings.xml');
if (exists(stringsPath)) {
  let strings = fs.readFileSync(stringsPath, 'utf8');
  const before = strings;
  strings = strings
    .replace(/(<string name="app_name">)[^<]*(<\/string>)/, '$1Madad$2')
    .replace(/(<string name="title_activity_main">)[^<]*(<\/string>)/, '$1Madad$2');
  if (strings !== before) {
    fs.writeFileSync(stringsPath, strings, 'utf8');
    changes.push('set the launcher name to "Madad"');
  } else {
    skipped.push('launcher name already set');
  }
}

// ───────────────── 4. Splash + status bar colours ─────────────────
const colorsPath = path.join(ANDROID, 'app', 'src', 'main', 'res', 'values', 'colors.xml');
if (exists(colorsPath)) {
  let colors = fs.readFileSync(colorsPath, 'utf8');
  const before = colors;

  const wanted = {
    colorPrimary: '#F59E0B',
    colorPrimaryDark: '#D97706',
    colorAccent: '#F59E0B',
    splashBackground: '#F59E0B',
  };

  for (const [name, value] of Object.entries(wanted)) {
    const re = new RegExp(`(<color name="${name}">)[^<]*(</color>)`);
    if (re.test(colors)) colors = colors.replace(re, `$1${value}$2`);
    else colors = colors.replace('</resources>', `    <color name="${name}">${value}</color>\n</resources>`);
  }

  if (colors !== before) {
    fs.writeFileSync(colorsPath, colors, 'utf8');
    changes.push('applied the saffron brand colours');
  } else {
    skipped.push('brand colours already applied');
  }
}

// ───────────────── Report ─────────────────
console.log('');
console.log(c.bold('  Android project patched'));
console.log(c.dim('  ─────────────────────────────────────────────'));

if (changes.length) {
  changes.forEach((ch) => console.log(`  ${c.green('+')} ${ch}`));
} else {
  console.log(c.dim('  Nothing to change.'));
}
skipped.forEach((s) => console.log(`  ${c.dim('·')} ${c.dim(s)}`));

if (notes.length) {
  console.log('');
  notes.forEach((n) => {
    console.log(`  ${c.yellow('!')} ${n}`);
  });
}

console.log('');
console.log(c.dim('  Permissions are requested at runtime, the first time each'));
console.log(c.dim('  feature is used — granting them here does not prompt the user.'));
console.log('');
