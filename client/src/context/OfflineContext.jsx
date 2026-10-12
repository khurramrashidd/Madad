import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../api/client.js';
import { getQueue, dequeue, markAttempt, getQueueCount, enqueue, makeClientRef } from '../db/offline.js';
import { useAuth } from './AuthContext.jsx';

const OfflineContext = createContext(null);

/**
 * Offline engine.
 *
 * "Online" here means one thing: the Madad backend answers. The browser's
 * navigator.onLine is not used to decide that, in either direction:
 *   · it says "online" behind a captive portal or a dead gateway, and
 *   · on a phone with Wi-Fi and mobile data off it says "offline" — even
 *     though the USB tunnel to the laptop works perfectly well.
 * So every decision is a real request to /api/health.
 *
 * `reason` tells the banner what to say: 'network' when the device has no
 * connection at all, 'server' when it has one but the laptop is not answering.
 *
 * Anything the user does offline is queued and replayed in order on
 * reconnect. Each item carries a clientRef the server uses as an idempotency
 * key, so a replayed queue cannot create duplicates.
 */
export function OfflineProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [online, setOnline] = useState(true);
  const [reason, setReason] = useState(null);
  const [queueCount, setQueueCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [syncResult, setSyncResult] = useState(null);
  const syncingRef = useRef(false);

  const refreshCount = useCallback(async () => {
    setQueueCount(await getQueueCount());
  }, []);

  /** Confirm connectivity for real rather than trusting navigator.onLine. */
  const verifyOnline = useCallback(async () => {
    try {
      await api.health();
      setOnline(true);
      setReason(null);
      return true;
    } catch {
      setOnline(false);
      setReason(navigator.onLine ? 'server' : 'network');
      return false;
    }
  }, []);

  /** Replay the queue oldest-first. */
  const sync = useCallback(async () => {
    if (syncingRef.current || !isAuthenticated) return;

    const items = await getQueue();
    if (!items.length) {
      await refreshCount();
      return;
    }

    if (!(await verifyOnline())) return;

    syncingRef.current = true;
    setSyncing(true);
    let synced = 0;
    let failed = 0;

    for (const item of items) {
      try {
        if (item.type === 'create_task') {
          await api.tasks.create({ ...item.payload, createdVia: 'offline_sync' });
        } else if (item.type === 'send_message') {
          await api.chat.send(item.payload.taskId, item.payload.body);
        } else if (item.type === 'claim_task') {
          await api.tasks.claim(item.payload.taskId);
        }
        await dequeue(item.clientRef);
        synced++;
      } catch (err) {
        // A 4xx means the server rejected it on its merits — replaying will
        // never help, so drop it. A network error means try again later.
        if (err.status >= 400 && err.status < 500) {
          await dequeue(item.clientRef);
          failed++;
        } else {
          await markAttempt(item.clientRef, err.message);
          break; // preserve ordering: stop at the first transient failure
        }
      }
    }

    syncingRef.current = false;
    setSyncing(false);
    setLastSync(Date.now());
    await refreshCount();

    if (synced || failed) {
      setSyncResult({ synced, failed, at: Date.now() });
      window.dispatchEvent(new CustomEvent('madad:synced', { detail: { synced, failed } }));
    }
  }, [isAuthenticated, refreshCount, verifyOnline]);

  // Browser connectivity events.
  useEffect(() => {
    const goOnline = async () => {
      if (await verifyOnline()) sync();
    };
    // Losing Wi-Fi does not mean losing the laptop (the cable may still be in).
    const goOffline = () => verifyOnline();

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [sync, verifyOnline]);

  // While online: a failed request, or a quiet check every 20 s, notices the
  // laptop going away (npm start stopped, cable pulled) without waiting for
  // the user to hit an error.
  useEffect(() => {
    if (!online) return;
    let pending = null;
    const check = () => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        verifyOnline();
      }, 300);
    };
    window.addEventListener('madad:unreachable', check);
    const id = setInterval(verifyOnline, 20000);
    return () => {
      window.removeEventListener('madad:unreachable', check);
      clearInterval(id);
      if (pending) clearTimeout(pending);
    };
  }, [online, verifyOnline]);

  // Poll while offline so we notice recovery even without an 'online' event
  // (Capacitor's WebView is unreliable about firing it).
  useEffect(() => {
    if (online) return;
    const id = setInterval(() => {
      verifyOnline().then((ok) => ok && sync());
    }, 6000);
    return () => clearInterval(id);
  }, [online, sync, verifyOnline]);

  // Check for real as soon as the app opens.
  useEffect(() => {
    verifyOnline();
  }, [verifyOnline]);

  useEffect(() => {
    refreshCount();
    if (isAuthenticated) sync();
  }, [isAuthenticated, refreshCount, sync]);

  /** Queue an action for later. Returns the clientRef for optimistic UI. */
  const queueAction = useCallback(
    async (type, payload) => {
      const clientRef = payload.clientRef || makeClientRef(type);
      await enqueue(type, { ...payload, clientRef });
      await refreshCount();
      return clientRef;
    },
    [refreshCount]
  );

  return (
    <OfflineContext.Provider
      value={{
        online,
        offline: !online,
        reason,
        queueCount,
        syncing,
        lastSync,
        syncResult,
        sync,
        queueAction,
        refreshCount,
        verifyOnline,
        dismissSyncResult: () => setSyncResult(null),
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  const ctx = useContext(OfflineContext);
  if (!ctx) throw new Error('useOffline must be used inside <OfflineProvider>');
  return ctx;
}

export default OfflineContext;
