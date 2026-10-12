/**
 * Shared helpers for the Madad setup scripts.
 * Zero dependencies on purpose — these must run before `npm install` does.
 */
import { execFile } from 'child_process';
import net from 'net';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import fs from 'fs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SERVER = path.join(ROOT, 'server');
export const CLIENT = path.join(ROOT, 'client');

const useColor = process.env.NO_COLOR === undefined && process.stdout.isTTY !== false;
const wrap = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);

export const c = {
  bold: (s) => wrap(1, s),
  dim: (s) => wrap(2, s),
  red: (s) => wrap(31, s),
  green: (s) => wrap(32, s),
  yellow: (s) => wrap(33, s),
  blue: (s) => wrap(36, s),
};

export const icon = {
  ok: c.green('  OK  '),
  warn: c.yellow(' WARN '),
  fail: c.red(' FAIL '),
  info: c.blue(' INFO '),
};

export function heading(text) {
  console.log('');
  console.log(c.bold(text));
  console.log(c.dim('─'.repeat(Math.max(text.length, 46))));
}

export function line(status, label, detail = '') {
  console.log(`[${status}] ${label.padEnd(30)} ${c.dim(detail)}`);
}

/**
 * Runs a command and captures its output.
 * On Windows many toolchain entries are .cmd/.bat shims, which execFile cannot
 * launch without a shell — so we always request one there.
 */
export function run(cmd, args = [], opts = {}) {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { timeout: opts.timeout ?? 15000, windowsHide: true, shell: process.platform === 'win32', ...opts },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          code: err?.code ?? 0,
          stdout: String(stdout || '').trim(),
          stderr: String(stderr || '').trim(),
        });
      }
    );
  });
}

/** True if something is listening on the port (i.e. the port is NOT free). */
export function portInUse(port, host = '127.0.0.1', timeout = 1200) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(v);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

/**
 * The machine's LAN address — what a phone on the same Wi-Fi must dial.
 * Virtual adapters (VirtualBox, WSL, Docker, VPNs) are filtered out because
 * picking one of those is the single most common reason "it works on my
 * laptop but not on my phone".
 */
export function lanAddresses() {
  const skip = /^(vEthernet|VirtualBox|VMware|Loopback|Hyper-V|Docker|WSL|utun|tun|tap|ZeroTier|Tailscale)/i;
  const out = [];

  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (skip.test(name)) continue;
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      if (a.address.startsWith('169.254.')) continue; // self-assigned, no DHCP
      const priv =
        a.address.startsWith('192.168.') ||
        a.address.startsWith('10.') ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(a.address);
      out.push({ name, address: a.address, private: priv });
    }
  }

  // Home/campus Wi-Fi first, then anything else.
  out.sort((x, y) => {
    if (x.private !== y.private) return x.private ? -1 : 1;
    const w = (n) => (/wi-?fi|wlan|wireless/i.test(n) ? 0 : 1);
    return w(x.name) - w(y.name);
  });
  return out;
}

export const exists = (p) => {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
};

export function readEnv(file) {
  if (!exists(file)) return {};
  const map = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const l = raw.trim();
    if (!l || l.startsWith('#')) continue;
    const i = l.indexOf('=');
    if (i === -1) continue;
    map[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
  return map;
}

/** Rewrites one key in a .env file, preserving comments and key order. */
export function writeEnvKey(file, key, value) {
  let lines = exists(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/) : [];
  let found = false;

  lines = lines.map((l) => {
    if (new RegExp(`^\\s*${key}\\s*=`).test(l)) {
      found = true;
      return `${key}=${value}`;
    }
    return l;
  });

  if (!found) lines.push(`${key}=${value}`);
  fs.writeFileSync(file, lines.join('\n'), 'utf8');
}

export function parseMajor(versionText) {
  const m = String(versionText).match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? Number(m[1]) : null;
}

// ─────────────────────────── Android helpers ───────────────────────────

/**
 * Finds the Android SDK without relying on PATH or a freshly opened terminal.
 *
 * `setx ANDROID_HOME …` only reaches terminals opened afterwards, so an old
 * window still sees nothing. Order of preference:
 *   1. ANDROID_HOME / ANDROID_SDK_ROOT, if they point somewhere real
 *   2. sdk.dir in client/android/local.properties
 *   3. the default install locations for each OS
 */
export function findAndroidSdk() {
  const fromEnv = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (fromEnv && exists(fromEnv)) return fromEnv;

  const lp = path.join(CLIENT, 'android', 'local.properties');
  if (exists(lp)) {
    const m = fs.readFileSync(lp, 'utf8').match(/^\s*sdk\.dir\s*=\s*(.+?)\s*$/m);
    if (m) {
      // .properties escaping: Android Studio writes C\:\\Users\\..., we write C:\\Users\\...
      const p = m[1].replace(/\\(.)/g, '$1');
      if (exists(p)) return p;
    }
  }

  const home = process.env.USERPROFILE || process.env.HOME || '';
  const guesses = process.platform === 'win32'
    ? [
        path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Android', 'Sdk'),
        path.join(home, 'Android', 'Sdk'),
        'C:\\Android\\Sdk',
      ]
    : process.platform === 'darwin'
      ? [path.join(home, 'Library', 'Android', 'sdk')]
      : [path.join(home, 'Android', 'Sdk'), '/usr/lib/android-sdk'];

  return guesses.find((p) => exists(p)) || null;
}

/** adb inside the SDK, falling back to whatever is on PATH. */
export function adbBinary(sdk) {
  if (sdk) {
    const p = path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
    if (exists(p)) return p;
  }
  return 'adb';
}

/**
 * Runs a real executable directly — no shell.
 *
 * `run()` above goes through a shell on Windows so .cmd shims work, but a shell
 * splits paths on spaces. adb.exe is a real binary, so this avoids the shell
 * entirely and a path like "C:\Program Files\..." stays one argument.
 */
export function exe(file, args = [], opts = {}) {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      {
        timeout: opts.timeout ?? 30000,
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024,
        env: opts.env || process.env,
        ...(opts.cwd ? { cwd: opts.cwd } : {}),
      },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          code: err?.code ?? 0,
          timedOut: Boolean(err?.killed),
          missing: err?.code === 'ENOENT',
          stdout: String(stdout || '').trim(),
          stderr: String(stderr || '').trim(),
        });
      }
    );
  });
}

/**
 * Parses `adb devices -l`.
 *
 *   emulator-5554          offline transport_id:1
 *   R5CR10ABCDE            device usb:1-1 product:a52qnsxx model:SM_A525F device:a52q transport_id:2
 *   9b2c1f0a               unauthorized usb:1-2 transport_id:3
 */
export function parseAdbDevices(output) {
  return String(output || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^List of devices/i.test(l) && !l.startsWith('*') && !/^adb server/i.test(l))
    .map((l) => {
      const noPerm = /no permissions/i.test(l);
      const [serial, state, ...rest] = l.split(/\s+/);
      const props = {};
      for (const kv of rest) {
        const i = kv.indexOf(':');
        if (i > 0) props[kv.slice(0, i)] = kv.slice(i + 1);
      }
      return {
        serial,
        state: noPerm ? 'no permissions' : state,
        emulator: /^emulator-\d+$/.test(serial || ''),
        model: props.model ? props.model.replace(/_/g, ' ') : null,
        product: props.product || null,
      };
    })
    .filter((d) => d.serial && d.state);
}

/** A human label for a device line. */
export function deviceLabel(d) {
  if (d.emulator) return `${d.serial} (emulator)`;
  return d.model ? `${d.model} (${d.serial})` : d.serial;
}

/**
 * Chooses which device to deploy to.
 * A real phone always beats an emulator — the emulator in the original
 * failure was a stuck Android Studio window the user was not even using.
 */
export function pickDevice(devices, { serial, preferEmulator = false } = {}) {
  const online = devices.filter((d) => d.state === 'device');
  if (serial) return online.find((d) => d.serial === serial) || null;

  const phones = online.filter((d) => !d.emulator);
  const emus = online.filter((d) => d.emulator);
  if (preferEmulator) return emus[0] || phones[0] || null;
  return phones[0] || emus[0] || null;
}

/**
 * Loads Mongoose out of the server's own node_modules.
 *
 * These scripts live above server/, so they cannot `import 'mongoose'`
 * directly — the dependency is installed one level down. Importing it by
 * absolute path needs care on Windows: a raw path like
 * `D:\project\node_modules\mongoose\index.js` is rejected by the ESM loader
 * with "Received protocol 'd:'", because it reads the drive letter as a URL
 * scheme. pathToFileURL() turns it into the file:// URL the loader expects,
 * and is harmless on macOS and Linux.
 */
export async function loadMongoose() {
  const entry = path.join(SERVER, 'node_modules', 'mongoose', 'index.js');
  if (!exists(entry)) {
    throw new Error(
      'Mongoose is not installed in server/node_modules. Run:  npm run install:all'
    );
  }
  return (await import(pathToFileURL(entry).href)).default;
}
