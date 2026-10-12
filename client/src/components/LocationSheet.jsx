import { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, Search, AlertTriangle, Check, Loader2, Settings } from 'lucide-react';
import Sheet from './Sheet.jsx';
import { api } from '../api/client.js';
import { useI18n } from '../context/I18nContext.jsx';

/**
 * "Where are you?" — the escape hatch.
 *
 * The original app had one answer to a failed location lookup: an empty state
 * reading "Turn on location", with a button that called the same API that had
 * just failed. For a denied permission that button can never work, and for a
 * device with broken GPS or a browser on plain HTTP it never will either. The
 * user is simply stuck, and the app looks broken rather than limited.
 *
 * So this sheet does three things, in order of how good the answer is:
 *
 *   1. retry the device — worth one tap when the failure was a timeout
 *   2. search for a place by name — always works, needs only a keyboard
 *   3. explain precisely why the automatic attempt failed
 *
 * (3) matters as much as the others. "Location is blocked" with the actual
 * remedy ("tap the icon beside the address bar") is actionable; a generic
 * error is not.
 */
export default function LocationSheet({ open, onClose, location }) {
  const { t } = useI18n();
  const {
    status, error, areaName, isManual, blocked, canOpenSettings, setManual, clearManual, refresh, openSettings,
  } = location || {};

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setSearchError(null);
    }
  }, [open]);

  const runSearch = async (e) => {
    e?.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;

    setSearching(true);
    setSearchError(null);
    setResults([]);
    try {
      const r = await api.geo.search(q);
      if (!r.results?.length) setSearchError(t('location.noResults'));
      else setResults(r.results);
    } catch {
      setSearchError(t('location.noResults'));
    } finally {
      setSearching(false);
    }
  };

  const choose = (place) => {
    setManual?.({ lat: place.lat, lng: place.lng, name: place.name });
    onClose?.();
  };

  const retryDevice = () => {
    if (isManual) clearManual?.();
    else refresh?.();
    onClose?.();
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('location.pickTitle')}>
      <div className="space-y-5 pb-4">
        {/* Why the automatic attempt did not work. Shown first, because it is
            the question the user actually has. */}
        {error && (
          <div className="flex gap-2.5 p-3 rounded-xl bg-warn/10 text-ink-700">
            <AlertTriangle size={16} className="text-warn shrink-0 mt-0.5" />
            <p className="text-[12.5px] leading-relaxed">{error}</p>
          </div>
        )}

        {/* Current state, so switching back is discoverable. */}
        {areaName && (
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-ink-100">
            <MapPin size={16} className={isManual ? 'text-info' : 'text-brand-600'} />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold text-ink-800 truncate">{areaName}</p>
              <p className="text-[11px] text-ink-500">
                {isManual ? t('location.manual') : t('location.approximate')}
              </p>
            </div>
            <Check size={16} className="text-brand-600 shrink-0" />
          </div>
        )}

        {/* Option 1 — try the device again, or open settings if blocked. */}
        {(!blocked || isManual) && (
          <button onClick={retryDevice} className="btn-outline btn-md w-full">
            <Navigation size={16} />
            {isManual ? t('location.useMyLocation') : t('location.tryAgain')}
          </button>
        )}

        {/* When permission is denied on native, offer to re-request or open settings. */}
        {blocked && !isManual && canOpenSettings && (
          <button
            onClick={async () => {
              const result = await openSettings?.();
              if (result === 'granted') onClose?.();
            }}
            className="btn-primary btn-md w-full"
          >
            <Settings size={16} />
            {t('location.enableLocation') || 'Enable Location'}
          </button>
        )}

        {/* Option 2 — type it in. */}
        <div>
          <p className="label">{t('location.setManually')}</p>
          <p className="text-[12px] text-ink-500 leading-relaxed mb-2.5">{t('location.pickBody')}</p>

          <form onSubmit={runSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('location.pickPlaceholder')}
                aria-label={t('location.pickTitle')}
                className="input pl-9"
                enterKeyHint="search"
              />
            </div>
            <button
              type="submit"
              disabled={query.trim().length < 2 || searching}
              className="btn-primary btn-md px-4 shrink-0"
            >
              {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            </button>
          </form>

          {searchError && <p className="hint text-danger">{searchError}</p>}

          {results.length > 0 && (
            <ul className="mt-3 space-y-2">
              {results.map((place) => (
                <li key={`${place.lat},${place.lng}`}>
                  <button
                    onClick={() => choose(place)}
                    className="w-full text-left p-3 rounded-xl border border-ink-200 bg-surface
                               hover:border-brand-500 hover:bg-brand-50 transition-colors"
                  >
                    <p className="text-[13.5px] font-semibold text-ink-800">{place.name}</p>
                    {place.label && (
                      <p className="text-[11.5px] text-ink-500 line-clamp-2 mt-0.5">{place.label}</p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-[11px] text-ink-400 leading-relaxed">
          A hand-picked area is used for the feed and for distances. Distances will be measured from
          the centre of that area, so they are rough — switch back to GPS for exact ones.
        </p>
      </div>
    </Sheet>
  );
}
