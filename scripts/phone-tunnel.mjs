/**
 * Keeps a USB tunnel open to every Android phone that is plugged in.
 *
 * The Madad Android app reaches the laptop's backend at localhost:5000 on the
 * phone, which `adb reverse` forwards over the cable. That forward is lost
 * when the cable is unplugged, wobbles, or adb restarts — and the app then
 * shows "Can't reach Madad". `npm start` runs this so the tunnel comes back
 * by itself within a few seconds of the phone being plugged in.
 *
 * Does nothing (silently) on a machine without the Android SDK.
 */
import { c, findAndroidSdk, adbBinary, exe, parseAdbDevices, deviceLabel } from './lib.mjs';

/**
 * One pass: open the tunnel on any ready device that lacks it.
 * Returns the updated map of serial -> label, and logs changes.
 */
export async function tunnelTick({ adb, port, known, log = console.log }) {
  const r = await exe(adb, ['devices', '-l'], { timeout: 8000 });
  const ready = parseAdbDevices(r.stdout).filter((d) => d.state === 'device');
  const seen = new Set();

  for (const d of ready) {
    seen.add(d.serial);
    const list = await exe(adb, ['-s', d.serial, 'reverse', '--list'], { timeout: 8000 });
    if (list.ok && list.stdout.includes(`tcp:${port}`)) {
      if (!known.has(d.serial)) known.set(d.serial, deviceLabel(d));
      continue;
    }
    const open = await exe(adb, ['-s', d.serial, 'reverse', `tcp:${port}`, `tcp:${port}`], { timeout: 10000 });
    if (open.ok) {
      const again = known.has(d.serial);
      known.set(d.serial, deviceLabel(d));
      log(`${c.green('[phone]')} ${again ? 'reconnected' : 'connected'}: ${deviceLabel(d)} — the Madad app can reach this laptop over USB`);
    }
  }

  for (const [serial, label] of known) {
    if (!seen.has(serial)) {
      known.delete(serial);
      log(`${c.yellow('[phone]')} ${label} unplugged — the app will use Wi-Fi if it can, and reconnects when you plug it back in`);
    }
  }
  return known;
}

export async function startPhoneTunnels({ port, isStopping = () => false, everyMs = 4000, log = console.log } = {}) {
  const sdk = findAndroidSdk();
  if (!sdk) return null;
  const adb = adbBinary(sdk);
  if ((await exe(adb, ['version'], { timeout: 8000 })).missing) return null;
  await exe(adb, ['start-server'], { timeout: 20000 });

  const known = new Map();
  const tick = () => (isStopping() ? null : tunnelTick({ adb, port, known, log }).catch(() => {}));
  await tick();
  const id = setInterval(tick, everyMs);
  id.unref?.();
  return { stop: () => clearInterval(id), known };
}
