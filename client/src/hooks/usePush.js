import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Web Push subscription.
 *
 * The server half of this was already complete — VAPID keys, subscription
 * storage, pruning of dead endpoints — but nothing on the client ever asked
 * the browser for permission or registered a subscription, so no push
 * notification could ever arrive. This is that half.
 *
 * Status, which the UI needs to say something truthful:
 *
 *   unsupported — no service worker or no Push API (iOS Safari outside a
 *                 home-screen install, most notably)
 *   unconfigured— the server has no VAPID keys, so there is nothing to offer
 *   default     — supported and available; we can ask
 *   granted     — subscribed, or about to be
 *   denied      — refused; asking again does nothing, the user must change
 *                 it in browser settings
 */

/** VAPID public keys are base64url; PushManager wants a Uint8Array. */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

const supported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

export function usePush() {
  const { config } = useAuth();
  const [status, setStatus] = useState('default');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const vapidKey = config?.vapidPublicKey;
  const serverReady = Boolean(config?.pushEnabled && vapidKey);

  useEffect(() => {
    if (!supported()) {
      setStatus('unsupported');
      return;
    }
    if (config && !serverReady) {
      setStatus('unconfigured');
      return;
    }
    if (Notification.permission === 'denied') {
      setStatus('denied');
      return;
    }
    if (Notification.permission === 'granted') {
      // Granted at the OS level is not the same as subscribed — a cleared
      // site data or a new device needs a fresh subscription.
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => setStatus(sub ? 'granted' : 'default'))
        .catch(() => setStatus('default'));
      return;
    }
    setStatus('default');
  }, [config, serverReady]);

  const subscribe = useCallback(async () => {
    if (!supported() || !serverReady) return false;
    setBusy(true);
    setError(null);

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'denied' : 'default');
        return false;
      }

      const registration = await navigator.serviceWorker.ready;

      // Reuse an existing subscription rather than creating a second one for
      // the same browser — the server dedupes on endpoint, but a needless
      // re-subscribe can invalidate the old one mid-flight.
      let sub = await registration.pushManager.getSubscription();
      if (!sub) {
        sub = await registration.pushManager.subscribe({
          // Required by every current browser; a non-visible push is refused.
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
      }

      await api.users.savePush(sub.toJSON ? sub.toJSON() : sub);
      setStatus('granted');
      return true;
    } catch (err) {
      setError(err.message || 'Could not turn on notifications');
      setStatus(Notification.permission === 'denied' ? 'denied' : 'default');
      return false;
    } finally {
      setBusy(false);
    }
  }, [serverReady, vapidKey]);

  return {
    status,
    busy,
    error,
    /** Worth showing a prompt for. */
    canEnable: status === 'default' && serverReady,
    isEnabled: status === 'granted',
    subscribe,
  };
}

export default usePush;
