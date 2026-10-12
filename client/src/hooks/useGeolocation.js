import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  getCurrentPosition, watchPosition, requestPermission, permissionState,
  classifyError, isNativePlatform, geoAvailability, reRequestPermission,
} from '../lib/geo.js';

/**
 * Where the user is — with an answer in every case, not just the happy one.
 *
 * The feed is built entirely around position, so "we could not determine your
 * location" is not an acceptable end state: it leaves the app showing nothing
 * with no way forward. This hook therefore works down a chain, and only the
 * last link can fail:
 *
 *   1. a position the user set by hand   — always wins, never overridden
 *   2. a cached fix from last time       — instant, so the first paint is not blank
 *   3. a fast coarse fix (Wi-Fi / cell)  — usually ~200 ms, good to a few hundred metres
 *   4. a precise GPS fix                 — upgrades (3) when the hardware obliges
 *   5. coarse position from the IP        — city-level, clearly labelled approximate
 *   6. the configured default area        — so the app still works at all
 *
 * `status` tells the UI which link answered, because the honest message
 * differs: a denied permission needs browser settings, an insecure origin
 * needs HTTPS, and a timeout just needs another tap.
 *
 *   locating   — asking the device now
 *   ready      — live GPS fix
 *   coarse     — network-derived fix, accurate enough for the feed
 *   cached     — last known fix, refreshing
 *   manual     — the user chose this area themselves
 *   approximate— from the IP address; offer to improve it
 *   denied     — permission refused; cannot be retried without settings
 *   insecure   — not an HTTPS origin, so the browser will not share location
 *   unsupported— no geolocation on this device at all
 *   timeout / error — transient; retrying is reasonable
 */
const CACHE_KEY = 'madad_last_location';
const MANUAL_KEY = 'madad_manual_location';

const readJson = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // private mode, or storage disabled
  }
};

const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode — the app still works, it just forgets */
  }
};

function readCached() {
  const parsed = readJson(CACHE_KEY);
  if (!parsed || !Number.isFinite(parsed.lat)) return null;
  if (Date.now() - parsed.at > 24 * 60 * 60 * 1000) return null; // a day-old fix is stale
  return parsed;
}

/** A position the user picked by hand. No expiry — it was deliberate. */
export function readManualLocation() {
  const parsed = readJson(MANUAL_KEY);
  return parsed && Number.isFinite(parsed.lat) ? parsed : null;
}

export function clearManualLocation() {
  try {
    localStorage.removeItem(MANUAL_KEY);
  } catch {
    /* nothing to clear */
  }
}

const MESSAGES = {
  denied: isNativePlatform()
    ? "Location is blocked for Madad. Tap Enable Location below to allow it, then come back."
    : "Location is blocked for Madad. Allow it in your browser site settings (tap the icon beside the address bar), then try again.",
  insecure:
    'Your browser only shares location over a secure (https://) address. Tasks are showing ' +
    'for an approximate area instead.',
  unsupported: 'This device cannot share its location. Pick your area manually instead.',
  timeout: 'Finding you took too long — usually a weak GPS signal indoors. Try again, or set your area manually.',
  error: 'Could not get your location. Try again, or set your area manually.',
};

export function useGeolocation({ watch = false, syncToServer = true } = {}) {
  const { patchUser } = useAuth();

  // Read once, synchronously, so the first render already has a position.
  const initial = useRef(readManualLocation() || readCached()).current;
  const manualFirst = useRef(Boolean(readManualLocation())).current;

  const [coords, setCoords] = useState(initial ? { lat: initial.lat, lng: initial.lng } : null);
  const [accuracy, setAccuracy] = useState(initial?.accuracy ?? null);
  const [status, setStatus] = useState(manualFirst ? 'manual' : initial ? 'cached' : 'idle');
  const [error, setError] = useState(null);
  const [areaName, setAreaName] = useState(initial?.city ?? null);

  const lastSynced = useRef(0);
  const stopWatch = useRef(null);
  const mounted = useRef(true);
  /** A manual choice outranks every automatic source, including a live watch. */
  const isManual = useRef(manualFirst);

  /** Push a position to the server so the feed and the header name follow it. */
  const sync = useCallback(
    (fix, { force = false } = {}) => {
      if (!syncToServer) return;
      if (!force && Date.now() - lastSynced.current < 60000) return;
      lastSynced.current = Date.now();
      api.users
        .updateLocation(fix.lng, fix.lat, fix.city)
        .then((r) => {
          if (!mounted.current) return;
          if (r?.city) {
            setAreaName(r.city);
            patchUser?.({ city: r.city });
          }
        })
        .catch(() => {}); // a failed sync must never break the screen
    },
    [syncToServer, patchUser]
  );

  const onFix = useCallback(
    (fix) => {
      if (!mounted.current || isManual.current) return;

      setCoords({ lat: fix.lat, lng: fix.lng });
      setAccuracy(fix.accuracy);
      setStatus(fix.source === 'gps' ? 'ready' : 'coarse');
      setError(null);

      writeJson(CACHE_KEY, { ...fix, at: Date.now() });
      sync(fix);
    },
    [sync]
  );

  /**
   * Last resort before giving up: ask the server what our IP suggests.
   * Always returns something, because the server falls back to the configured
   * city centre rather than erroring.
   */
  const useIpFallback = useCallback(
    async (reason) => {
      try {
        const r = await api.geo.ip();
        if (!mounted.current || isManual.current) return false;
        if (!Number.isFinite(r?.lat)) return false;

        setCoords({ lat: r.lat, lng: r.lng });
        setAccuracy(null);
        setAreaName(r.city || null);
        setStatus('approximate');
        // Keep the real reason visible — the user should know why it is rough.
        setError(MESSAGES[reason] || null);
        return true;
      } catch {
        return false;
      }
    },
    []
  );

  const onErr = useCallback(
    async (err) => {
      if (!mounted.current || isManual.current) return;
      const kind = classifyError(err);

      // A good fix already on screen should not be replaced by an error from
      // a later watch callback.
      setStatus((s) => (s === 'ready' || s === 'coarse' ? s : kind));
      setError(MESSAGES[kind] || MESSAGES.error);

      // With no position at all, something approximate beats nothing.
      if (!coords) await useIpFallback(kind);
    },
    [coords, useIpFallback]
  );

  const locate = useCallback(async () => {
    if (isManual.current) return;

    const availability = geoAvailability();
    if (!availability.ok) {
      // No point prompting — go straight to the fallback and explain.
      setStatus(availability.reason);
      setError(MESSAGES[availability.reason] || availability.detail);
      await useIpFallback(availability.reason);
      return;
    }

    // Asking a browser that has already refused only produces the same
    // refusal, slower. Skip to the fallback and tell the user what to change.
    if (!isNativePlatform()) {
      const state = await permissionState();
      if (state === 'denied') {
        setStatus('denied');
        setError(MESSAGES.denied);
        if (!coords) await useIpFallback('denied');
        return;
      }
    }

    setStatus((s) => (s === 'ready' || s === 'coarse' ? s : 'locating'));

    try {
      if (isNativePlatform()) {
        const granted = await requestPermission();
        if (granted === 'denied') {
          setStatus('denied');
          setError(MESSAGES.denied);
          if (!coords) await useIpFallback('denied');
          return;
        }
      }
      // onCoarse paints the feed the moment a rough fix lands, rather than
      // waiting for the precise one.
      const fix = await getCurrentPosition({ onCoarse: onFix });
      onFix(fix);
    } catch (err) {
      await onErr(err);
    }
  }, [coords, onFix, onErr, useIpFallback]);

  /** Override everything with a hand-picked area. */
  const setManual = useCallback(
    (place) => {
      if (!place || !Number.isFinite(place.lat)) return;
      isManual.current = true;
      stopWatch.current?.();
      stopWatch.current = null;

      const fix = { lat: place.lat, lng: place.lng, accuracy: null, city: place.name || null };
      writeJson(MANUAL_KEY, { ...fix, at: Date.now() });
      setCoords({ lat: fix.lat, lng: fix.lng });
      setAccuracy(null);
      setAreaName(place.name || null);
      setStatus('manual');
      setError(null);
      sync(fix, { force: true });
    },
    [sync]
  );

  /** Drop the manual pin and go back to the device's own idea of where it is. */
  const clearManual = useCallback(() => {
    clearManualLocation();
    isManual.current = false;
    setStatus('locating');
    locate();
  }, [locate]);

  // One effect, deliberately with an empty dependency list.
  //
  // `locate` is recreated whenever `coords` changes, so depending on it here
  // would re-run the effect on every position update — restarting the watch,
  // re-requesting permission, and in the worst case looping. The callbacks are
  // read through a ref so the effect can stay mounted for the component's
  // whole life while still calling the current version.
  const locateRef = useRef(locate);
  locateRef.current = locate;
  const onFixRef = useRef(onFix);
  onFixRef.current = onFix;
  const onErrRef = useRef(onErr);
  onErrRef.current = onErr;

  useEffect(() => {
    mounted.current = true;
    locateRef.current();

    let cancelled = false;
    if (watch && !isManual.current) {
      watchPosition(
        (fix) => onFixRef.current(fix),
        (err) => onErrRef.current(err)
      ).then((stop) => {
        if (cancelled) stop();
        else stopWatch.current = stop;
      });
    }

    return () => {
      cancelled = true;
      mounted.current = false;
      stopWatch.current?.();
      stopWatch.current = null;
    };
  }, [watch]);

  // Re-check when the user comes back to the app: they may have just granted
  // permission in settings, or walked somewhere else entirely. On Android the
  // user may return from the Settings screen where they just toggled location
  // on — so we re-try even when the status was 'denied'.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (isManual.current) return;
      // Always re-try on 'denied' — the user may have just enabled it in OS settings.
      if (status === 'ready' || status === 'coarse') return;
      locateRef.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [status]);

  const located = Boolean(coords);
  const isPrecise = status === 'ready';

  /** Re-request permission on native; re-runs locate if granted. */
  const openSettings = useCallback(async () => {
    const result = await reRequestPermission();
    if (result === 'granted') {
      // Permission was just granted — re-run the location flow.
      locateRef.current();
      return 'granted';
    }
    if (result === 'permanently_denied') {
      // The system dialog was suppressed — update the message to tell the
      // user to go to OS Settings → Apps → Madad → Permissions manually.
      setError(
        'Location is permanently blocked. Go to your phone Settings > Apps > Madad > Permissions and enable Location, then come back.'
      );
      return 'permanently_denied';
    }
    return result; // 'denied' or false (web)
  }, []);

  return {
    coords,
    accuracy,
    status,
    error,
    areaName,
    isPrecise,
    /** We have *some* position and can show a feed. */
    located,
    /** Position is rough — fine for browsing, worth flagging on distances. */
    isApproximate: status === 'approximate' || status === 'manual' || status === 'coarse',
    /** Retrying cannot help; the user has to change something. */
    blocked: status === 'denied' || status === 'insecure' || status === 'unsupported',
    /** Retrying is worth offering. */
    retryable: status === 'timeout' || status === 'error' || status === 'approximate',
    isManual: status === 'manual',
    /** True when on native — the "Open Settings" button can work. */
    canOpenSettings: isNativePlatform(),
    refresh: locate,
    setManual,
    clearManual,
    openSettings,
  };
}

export default useGeolocation;
