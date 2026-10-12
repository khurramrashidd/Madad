import { Capacitor } from '@capacitor/core';

/**
 * One geolocation API for both worlds, with the failure modes handled.
 *
 * On the web this is `navigator.geolocation`. Inside the Android app that
 * exists too, but Capacitor's own Geolocation plugin is the reliable path: it
 * drives the native permission dialog and the device's fused location
 * provider, which the WebView's geolocation does not always reach. Everything
 * returns the same plain `{ lat, lng, accuracy }`, so callers never branch on
 * platform.
 *
 * ---- Why this file is not three lines long ----
 *
 * The naive call — `getCurrentPosition(ok, err, { enableHighAccuracy: true })`
 * — is where "the app can't detect my location" comes from, for four separate
 * reasons:
 *
 * 1. `enableHighAccuracy: true` asks for a GPS fix. A laptop has no GPS
 *    radio, and a phone indoors may take 30+ seconds or never succeed. The
 *    request then times out and reports failure, even though a perfectly
 *    good Wi-Fi-derived position was available in 200 ms.
 *
 * 2. Browsers only expose geolocation in a *secure context*. Over plain HTTP
 *    on a LAN address the API is either missing or silently rejects. The
 *    symptom is indistinguishable from a denied permission, so the app shows
 *    the wrong advice.
 *
 * 3. Once permission is denied, calling the API again can never succeed — the
 *    browser does not re-prompt. A "Try again" button that cannot work is
 *    worse than no button.
 *
 * 4. Some devices return a position *and* an error, or hang without doing
 *    either. Nothing resolves and the UI sits on a spinner forever.
 *
 * So: check the context first, ask for a fast coarse fix before a slow
 * precise one, treat a denial as terminal, and put a hard ceiling on every
 * wait.
 */

export const isNativePlatform = () => {
  try {
    return Boolean(Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
};

async function plugin() {
  const m = await import('@capacitor/geolocation');
  return m.Geolocation;
}

const toFix = (pos, source = 'gps') => ({
  lat: pos.coords.latitude,
  lng: pos.coords.longitude,
  accuracy: pos.coords.accuracy ?? null,
  source,
  at: Date.now(),
});

/**
 * Is geolocation even possible here?
 *
 * `window.isSecureContext` is the authoritative answer on the web: it is true
 * for HTTPS and for localhost, false for http:// on any other host. The
 * native app is always permitted, since it goes through the OS rather than
 * the WebView's origin rules.
 */
export function geoAvailability() {
  if (isNativePlatform()) return { ok: true };

  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { ok: false, reason: 'unsupported' };
  }
  if (!navigator.geolocation) {
    return { ok: false, reason: 'unsupported' };
  }
  if (!window.isSecureContext) {
    return {
      ok: false,
      reason: 'insecure',
      // Worth stating precisely, because the fix is not on the user's side.
      detail:
        'Browsers only share precise location over HTTPS. Open the app on its https:// address ' +
        '(or localhost) and location will work.',
    };
  }
  return { ok: true };
}

/** 'granted' | 'denied' | 'prompt' — best effort; defaults to 'prompt'. */
export async function permissionState() {
  if (isNativePlatform()) {
    try {
      const { location, coarseLocation } = await (await plugin()).checkPermissions();
      const state = location === 'prompt-with-rationale' ? 'prompt' : location;
      if (state === 'granted' || coarseLocation === 'granted') return 'granted';
      return state === 'denied' ? 'denied' : 'prompt';
    } catch {
      return 'prompt';
    }
  }
  if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
    try {
      const s = await navigator.permissions.query({ name: 'geolocation' });
      return s.state; // 'granted' | 'denied' | 'prompt'
    } catch {
      return 'prompt';
    }
  }
  return 'prompt';
}

/** Ask for permission up front (native shows the dialog; web is implicit). */
export async function requestPermission() {
  if (isNativePlatform()) {
    try {
      const { location, coarseLocation } = await (await plugin()).requestPermissions();
      return location === 'granted' || coarseLocation === 'granted' ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  }
  return 'prompt';
}

/**
 * Re-request location permission on native.
 *
 * On Android this re-shows the system permission dialog. If the user previously
 * chose "Don't allow" permanently, the dialog won't appear — in that case
 * we return 'permanently_denied' so the UI can tell them to go to Settings
 * manually. On the web there is no programmatic way to re-ask — returns false.
 *
 * @returns {'granted'|'denied'|'permanently_denied'|false}
 */
export async function reRequestPermission() {
  if (!isNativePlatform()) return false;
  try {
    const G = await plugin();

    // Check the current state first: if it's 'prompt' or 'prompt-with-rationale',
    // the system dialog can still appear. If it's 'denied', the user chose
    // "Don't allow" and Android won't show the dialog again.
    const before = await G.checkPermissions();
    const wasDenied = before.location === 'denied' && before.coarseLocation === 'denied';

    const result = await G.requestPermissions();
    if (result.location === 'granted' || result.coarseLocation === 'granted') {
      return 'granted';
    }

    // If the state was denied before AND after requestPermissions, the system
    // dialog was suppressed — the user must go to OS settings manually.
    return wasDenied ? 'permanently_denied' : 'denied';
  } catch {
    return 'denied';
  }
}

/**
 * A single position request with a guaranteed outcome.
 *
 * The browser's own `timeout` is not trusted on its own: some
 * implementations never fire the error callback at all. The extra
 * `setTimeout` race means this always settles.
 */
function rawPosition(options) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(ceiling);
      fn(value);
    };

    const ceiling = setTimeout(
      () => done(reject, Object.assign(new Error('Location request timed out'), { code: 3 })),
      (options.timeout || 10000) + 2000
    );

    try {
      navigator.geolocation.getCurrentPosition(
        (p) => done(resolve, p),
        (e) => done(reject, e),
        options
      );
    } catch (err) {
      done(reject, err);
    }
  });
}

/**
 * The real entry point: get a usable position as fast as possible, then
 * improve it if we can.
 *
 * Two passes, because they answer different questions. The coarse pass asks
 * "roughly where am I" and is normally answered instantly from Wi-Fi and cell
 * towers — accurate to a few hundred metres, which is already enough to show
 * a 5 km feed. The precise pass asks "exactly where am I" and may need the
 * GPS radio and several seconds. Running the coarse pass first means the user
 * sees their feed immediately instead of watching a spinner wait for a
 * satellite lock that may never come.
 *
 * @param onCoarse called if the fast pass lands first, so the UI can paint
 */
export async function getCurrentPosition({ onCoarse } = {}) {
  const availability = geoAvailability();
  if (!availability.ok) {
    throw Object.assign(new Error(availability.detail || 'Location is unavailable'), {
      kind: availability.reason,
    });
  }

  if (isNativePlatform()) {
    const G = await plugin();
    // Coarse first, precise second — same strategy as the web path.
    // The fused provider returns a network-derived fix almost instantly with
    // enableHighAccuracy: false, so the feed appears in under a second.
    // The precise pass upgrades it if GPS is available.
    let coarseNative = null;
    try {
      const pos = await G.getCurrentPosition({ enableHighAccuracy: false, timeout: 5000 });
      coarseNative = toFix(pos, 'coarse');
      onCoarse?.(coarseNative);
    } catch {
      // No coarse fix — still try GPS below.
    }

    try {
      const pos = await G.getCurrentPosition({ enableHighAccuracy: true, timeout: 12000 });
      return toFix(pos);
    } catch {
      if (coarseNative) return coarseNative;
      throw Object.assign(new Error('Location unavailable'), { kind: 'timeout' });
    }
  }

  let coarse = null;
  try {
    const pos = await rawPosition({
      enableHighAccuracy: false,
      timeout: 7000,
      maximumAge: 120000, // a two-minute-old network fix is fine to start with
    });
    coarse = toFix(pos, 'coarse');
    onCoarse?.(coarse);
  } catch (err) {
    // A denial is terminal — the precise pass cannot succeed either.
    if (err?.code === 1) throw Object.assign(err, { kind: 'denied' });
  }

  try {
    const pos = await rawPosition({
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0, // we want a fresh, precise fix here
    });
    return toFix(pos, 'gps');
  } catch (err) {
    // The coarse fix is a real answer. Returning it beats reporting failure
    // just because the satellites were slow.
    if (coarse) return coarse;
    throw Object.assign(err, { kind: classifyError(err) });
  }
}

/**
 * Live position. Calls onUpdate as the device moves; returns a function that
 * stops the watch.
 */
export async function watchPosition(onUpdate, onError, opts = {}) {
  const availability = geoAvailability();
  if (!availability.ok) {
    onError?.({ kind: availability.reason, message: availability.detail });
    return () => {};
  }

  const options = { enableHighAccuracy: true, timeout: 25000, maximumAge: 10000, ...opts };

  if (isNativePlatform()) {
    const G = await plugin();
    const id = await G.watchPosition(options, (pos, err) => {
      if (err) onError?.(err);
      else if (pos) onUpdate(toFix(pos));
    });
    return () => G.clearWatch({ id }).catch(() => {});
  }

  const id = navigator.geolocation.watchPosition(
    (p) => onUpdate(toFix(p)),
    (e) => onError?.(e),
    options
  );
  return () => navigator.geolocation.clearWatch(id);
}

/** Normalises web and native errors to one of our status strings. */
export function classifyError(err) {
  if (!err) return 'error';
  if (err.kind) return err.kind;
  if (err.code === 1) return 'denied';
  if (err.code === 3) return 'timeout';
  if (err.code === 2) return 'error'; // position unavailable
  const msg = String(err.message || err).toLowerCase();
  if (msg.includes('denied') || msg.includes('permission')) return 'denied';
  if (msg.includes('timed out') || msg.includes('timeout')) return 'timeout';
  if (msg.includes('secure') || msg.includes('https')) return 'insecure';
  if (msg.includes('not supported') || err.code === 0) return 'unsupported';
  return 'error';
}
