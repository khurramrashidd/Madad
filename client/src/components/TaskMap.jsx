import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Circle, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * OpenStreetMap via Leaflet. No API key, no billing card, no usage caps —
 * which matters for a student project that has to keep working after the demo.
 */

// Leaflet's default marker images break under bundlers; we draw our own in
// SVG instead, which also lets markers carry the bounty amount.
const pin = (color, label) =>
  L.divIcon({
    className: '',
    html: `
      <div style="position:relative;display:grid;place-items:center">
        <svg width="34" height="44" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg">
          <path d="M17 0C7.6 0 0 7.6 0 17c0 12 17 27 17 27s17-15 17-27C34 7.6 26.4 0 17 0z" fill="${color}"/>
          <circle cx="17" cy="16.5" r="11" fill="#fff"/>
        </svg>
        <span style="position:absolute;top:7px;font:700 10px/1 Inter,sans-serif;color:#1C1917">${label}</span>
      </div>`,
    iconSize: [34, 44],
    iconAnchor: [17, 44],
    popupAnchor: [0, -40],
  });

const meIcon = L.divIcon({
  className: '',
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#6366F1;border:3px solid #fff;box-shadow:0 0 0 2px rgba(99,102,241,.35)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

/** Keeps the viewport in sync when the centre changes (e.g. a new GPS fix). */
function Recenter({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, zoom ?? map.getZoom(), { animate: true });
  }, [center, zoom, map]);
  return null;
}

export default function TaskMap({
  center,
  tasks = [],
  radius,
  height = 240,
  zoom = 15,
  showMe = true,
  interactive = true,
  singlePin = null,
}) {
  const { config } = useAuth();
  const fallback = config?.defaultCenter || { lat: 18.9894, lng: 73.1175 };
  const position = useMemo(
    () => (center ? [center.lat, center.lng] : [fallback.lat, fallback.lng]),
    [center, fallback.lat, fallback.lng]
  );

  return (
    <div style={{ height }} className="rounded-2xl overflow-hidden border border-ink-200">
      <MapContainer
        center={position}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={interactive}
        dragging={interactive}
        zoomControl={interactive}
        attributionControl
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          maxZoom={19}
        />

        <Recenter center={position} zoom={zoom} />

        {showMe && center && <Marker position={position} icon={meIcon} />}

        {radius && center && (
          <Circle
            center={position}
            radius={radius}
            pathOptions={{ color: '#F59E0B', fillColor: '#F59E0B', fillOpacity: 0.07, weight: 1.5 }}
          />
        )}

        {singlePin && (
          <Marker
            position={[singlePin.lat, singlePin.lng]}
            icon={pin('#F59E0B', singlePin.label ?? '')}
          >
            {singlePin.title && <Popup>{singlePin.title}</Popup>}
          </Marker>
        )}

        {tasks.map((t) => {
          const [lng, lat] = t.location?.coordinates || [];
          if (lat == null || lng == null) return null;
          return (
            <Marker key={t.id} position={[lat, lng]} icon={pin('#F59E0B', t.bounty)}>
              <Popup>
                <div className="text-sm">
                  <p className="font-semibold">{t.title}</p>
                  <p className="text-ink-500 mt-0.5">₹{t.bounty} · {t.distanceLabel}</p>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
