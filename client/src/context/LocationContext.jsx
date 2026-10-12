import { createContext, useContext, useEffect, useRef } from 'react';
import useGeolocation from '../hooks/useGeolocation.js';
import { useSocket } from './SocketContext.jsx';
import { SOCKET_EVENTS } from '../utils/constants.js';

/**
 * One position for the whole app.
 *
 * The header needs it for the area name and the weather; the feed needs it to
 * query; the task detail screen needs it for distance. If each called
 * `useGeolocation` itself there would be three independent `watchPosition`
 * watches running at once — three times the GPS wake-ups on a phone whose
 * battery is the whole reason people hesitate to leave an app open. One
 * watch, shared.
 *
 * This is also the right place to tell the server where we are, because the
 * server uses live socket positions to decide who a new task is pushed to.
 * Doing it here means it happens once per move rather than once per consumer.
 */
const LocationContext = createContext(null);

export function LocationProvider({ children }) {
  // `watch: true` — the feed is meant to follow you as you walk.
  const location = useGeolocation({ watch: true, syncToServer: true });
  const { emit, connected } = useSocket();
  const lastSent = useRef(null);

  const { coords } = location;

  /**
   * Report the position over the socket so geo-targeted pushes reach us.
   *
   * Throttled by distance rather than by time: standing still should send
   * nothing at all, and a 50 m walk does not change who should hear about a
   * task 3 km away. Roughly 200 m of movement is the threshold.
   */
  useEffect(() => {
    if (!connected || !coords) return;

    const prev = lastSent.current;
    const movedEnough =
      !prev ||
      Math.abs(prev.lat - coords.lat) > 0.002 ||
      Math.abs(prev.lng - coords.lng) > 0.002;

    if (!movedEnough) return;
    lastSent.current = coords;
    emit?.(SOCKET_EVENTS.LOCATION_UPDATE, { lng: coords.lng, lat: coords.lat });
  }, [connected, coords, emit]);

  // A reconnect gets a fresh report — the server forgot us when the socket
  // dropped, so without this we would silently stop receiving nearby tasks.
  useEffect(() => {
    if (connected) lastSent.current = null;
  }, [connected]);

  return <LocationContext.Provider value={location}>{children}</LocationContext.Provider>;
}

export function useLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocation must be used inside <LocationProvider>');
  return ctx;
}

export default LocationContext;
