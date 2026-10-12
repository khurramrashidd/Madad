import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { getToken, getSocketUrl, discoverServer } from '../api/client.js';
import { useAuth } from './AuthContext.jsx';
import { SOCKET_EVENTS } from '../utils/constants.js';

const SocketContext = createContext(null);

/**
 * One socket for the whole app. Components subscribe through `on()`, which
 * returns its own unsubscribe function — that pattern keeps listeners from
 * leaking when a screen unmounts mid-event.
 */
export function SocketProvider({ children }) {
  const { isAuthenticated, patchUser } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [notifications, setNotifications] = useState([]);
  // Bumped when the app finds the laptop at a different address (USB vs
  // Wi-Fi), so the socket reconnects there.
  const [serverEpoch, setServerEpoch] = useState(0);

  useEffect(() => {
    const onChange = () => setServerEpoch((n) => n + 1);
    window.addEventListener('madad:server-changed', onChange);
    return () => window.removeEventListener('madad:server-changed', onChange);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
      return;
    }

    const socket = io(getSocketUrl() || '/', {
      auth: { token: getToken() },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => {
      setConnected(true);
      socket.emit(SOCKET_EVENTS.FEED_JOIN);
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', (err) => {
      setConnected(false);
      // Maybe the laptop is reachable at another address (USB vs Wi-Fi).
      discoverServer();
      if (!import.meta.env.PROD) console.warn('[socket]', err.message);
    });

    socket.on(SOCKET_EVENTS.NOTIFICATION, (n) => {
      setNotifications((prev) => [n, ...prev].slice(0, 30));
    });

    // Trust changes arrive live so the header badge updates without a refetch.
    socket.on(SOCKET_EVENTS.TRUST_UPDATED, (data) => {
      patchUser({
        trustScore: data.trustScore,
        badge: data.badge,
        isRestricted: data.isRestricted,
      });
    });

    socketRef.current = socket;
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated, patchUser, serverEpoch]);

  /** Subscribe to an event. Returns an unsubscribe function. */
  const on = useCallback((event, handler) => {
    const socket = socketRef.current;
    if (!socket) return () => {};
    socket.on(event, handler);
    return () => socket.off(event, handler);
  }, []);

  const emit = useCallback((event, ...args) => {
    socketRef.current?.emit(event, ...args);
  }, []);

  /** Promise-wrapped emit for events where the server acknowledges. */
  const emitAck = useCallback(
    (event, payload, timeoutMs = 6000) =>
      new Promise((resolve) => {
        const socket = socketRef.current;
        if (!socket?.connected) return resolve({ ok: false, error: 'Not connected' });

        let settled = false;
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            resolve({ ok: false, error: 'Timed out' });
          }
        }, timeoutMs);

        socket.emit(event, payload, (res) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(res || { ok: false, error: 'No response' });
        });
      }),
    []
  );

  const dismissNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearNotifications = useCallback(() => setNotifications([]), []);

  return (
    <SocketContext.Provider
      value={{
        socket: socketRef.current,
        connected,
        on,
        emit,
        emitAck,
        notifications,
        dismissNotification,
        clearNotifications,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used inside <SocketProvider>');
  return ctx;
}

export default SocketContext;
