import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  Search, SlidersHorizontal, Map as MapIcon, List, WifiOff, RefreshCw,
  Navigation, Plus, Maximize2,
} from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import { useOffline } from '../context/OfflineContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import { useLocation as useGeo } from '../context/LocationContext.jsx';
import TaskCard, { TaskCardSkeleton } from '../components/TaskCard.jsx';
import TaskMap from '../components/TaskMap.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Sheet from '../components/Sheet.jsx';
import {
  CATEGORIES, RADIUS_OPTIONS, SOCKET_EVENTS, DEFAULT_RADIUS_M, MAX_RADIUS_M, formatRadius,
} from '../utils/constants.js';

/**
 * The live feed.
 *
 * Tasks appear the instant someone nearby posts one, and vanish the instant
 * someone claims one. The feed is anchored to the device's position, which is
 * owned by LocationProvider rather than this screen — the header, the weather
 * and the map all need the same position, and three watches would be three
 * times the battery drain.
 *
 * The brand/user/notification row lives in AppHeader now; what remains here
 * is what belongs to the feed specifically: search, filters, categories.
 */
export default function Feed() {
  const { user } = useAuth();
  const { on, connected } = useSocket();
  const { offline } = useOffline();
  const toast = useToast();
  const { t } = useI18n();
  const { openLocationSheet } = useOutletContext() || {};

  const {
    coords, status: geoStatus, located, blocked, isApproximate, refresh: refreshGps,
  } = useGeo();

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState(null);
  const [newIds, setNewIds] = useState(new Set());

  const [view, setView] = useState('list');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [category, setCategory] = useState('all');
  const [radius, setRadius] = useState(DEFAULT_RADIUS_M);
  const [sort, setSort] = useState('distance');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const listRef = useRef(null);

  useEffect(() => {
    const t2 = setTimeout(() => setDebouncedQuery(query), 350);
    return () => clearTimeout(t2);
  }, [query]);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!coords) return;
      silent ? setRefreshing(true) : setLoading(true);
      setError(null);
      try {
        const res = await api.tasks.feed({
          lng: coords.lng, lat: coords.lat, radius, category, q: debouncedQuery, sort,
        });
        setTasks(res.tasks || []);
        setFromCache(Boolean(res.fromCache));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [coords, radius, category, debouncedQuery, sort]
  );

  useEffect(() => { load(); }, [load]);

  // ---- Live updates ----
  useEffect(() => {
    const offNew = on(SOCKET_EVENTS.TASK_NEW, (task) => {
      if (task.wisher?.id === user?.id) return;
      /**
       * The server now sends each recipient their own distance, so this
       * filter actually works. It used to receive `distance: null` on every
       * push — the guard never fired, and a task posted anywhere in the
       * country appeared live on everyone's feed.
       */
      if (task.distance != null && task.distance > radius) return;

      setTasks((prev) => (prev.some((x) => x.id === task.id) ? prev : [task, ...prev]));
      setNewIds((prev) => new Set(prev).add(task.id));
      setTimeout(() => {
        setNewIds((prev) => { const next = new Set(prev); next.delete(task.id); return next; });
      }, 4000);
    });
    const offClaimed = on(SOCKET_EVENTS.TASK_CLAIMED, ({ id, volunteerId }) => {
      setTasks((prev) => prev.filter((x) => x.id !== id));
      if (volunteerId === user?.id) toast.success('Task claimed — open it to coordinate');
    });
    const offRemoved = on(SOCKET_EVENTS.TASK_REMOVED, ({ id }) =>
      setTasks((prev) => prev.filter((x) => x.id !== id)));
    const offUpdated = on(SOCKET_EVENTS.TASK_UPDATED, (task) =>
      setTasks((prev) => prev.map((x) => (x.id === task.id ? { ...x, ...task } : x))));
    return () => { offNew(); offClaimed(); offRemoved(); offUpdated(); };
  }, [on, user?.id, radius, toast]);

  const activeFilters =
    (category !== 'all' ? 1 : 0) +
    (radius !== DEFAULT_RADIUS_M ? 1 : 0) +
    (sort !== 'distance' ? 1 : 0);

  /** Next radius up, for the "widen the search" shortcut on an empty feed. */
  const nextRadius = RADIUS_OPTIONS.find((r) => r.value > radius)?.value ?? null;

  return (
    <div className="flex flex-col h-full">
      {/* ---- Feed controls ---- */}
      <div className="shrink-0 bg-surface border-b border-ink-100 px-4 py-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('feed.search')}
              aria-label={t('feed.search')}
              className="w-full h-10 pl-9 pr-3 rounded-xl bg-ink-100 text-sm outline-none text-ink-900
                         placeholder:text-ink-400 focus:ring-2 focus:ring-brand-500/30 focus:bg-surface transition"
            />
          </div>
          <button
            onClick={() => setFiltersOpen(true)}
            className="relative h-10 w-10 grid place-items-center rounded-xl bg-ink-100 text-ink-600 hover:bg-ink-200"
            aria-label={t('feed.filters')}
          >
            <SlidersHorizontal size={17} />
            {activeFilters > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-brand-600 text-white text-[10px] font-bold grid place-items-center">
                {activeFilters}
              </span>
            )}
          </button>
          <button
            onClick={() => setView((v) => (v === 'list' ? 'map' : 'list'))}
            className="h-10 w-10 grid place-items-center rounded-xl bg-ink-100 text-ink-600 hover:bg-ink-200"
            aria-label={view === 'list' ? 'Show map' : 'Show list'}
          >
            {view === 'list' ? <MapIcon size={17} /> : <List size={17} />}
          </button>
        </div>

        {/* Category strip */}
        <div className="flex gap-1.5 mt-3 overflow-x-auto no-scrollbar -mx-4 px-4">
          <button onClick={() => setCategory('all')} className={category === 'all' ? 'seg-on shrink-0' : 'seg-off shrink-0'}>
            All
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              className={category === c.value ? 'seg-on shrink-0' : 'seg-off shrink-0'}
            >
              <span aria-hidden="true" className="mr-1">{c.icon}</span>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---- Body ---- */}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {fromCache && (
          <div className="mx-4 mt-3 p-3 rounded-xl bg-ink-100 text-ink-600 text-xs flex items-center gap-2">
            <WifiOff size={14} className="shrink-0" />
            {t('feed.cached')}
          </div>
        )}

        {/*
          Location is blocked AND we have no position at all. Note this is now
          a genuinely rare state: the hook falls back to an IP-derived
          position before giving up, so reaching here means even that failed.
          Either way the user is offered a way forward rather than a dead end.
        */}
        {blocked && !coords ? (
          <EmptyState
            icon={Navigation}
            tone="brand"
            title={t('location.enable')}
            message={t('location.enableBody')}
            action={
              <div className="flex flex-col gap-2 w-full max-w-xs">
                <button onClick={refreshGps} className="btn-primary btn-md">
                  {t('location.enableButton')}
                </button>
                <button onClick={openLocationSheet} className="btn-ghost btn-md">
                  {t('location.setManually')}
                </button>
              </div>
            }
          />
        ) : (
          <>
            {view === 'map' && coords && (
              <div className="p-4 pb-0">
                <TaskMap center={coords} tasks={tasks} radius={Math.min(radius, 25000)} height={300} />
              </div>
            )}

            <div className="p-4 space-y-3">
              {loading || (!coords && !blocked) ? (
                <>
                  <TaskCardSkeleton />
                  <TaskCardSkeleton />
                  <TaskCardSkeleton />
                </>
              ) : error ? (
                <EmptyState
                  icon={WifiOff}
                  tone="danger"
                  title="Couldn’t load the feed"
                  message={error}
                  action={<button onClick={() => load()} className="btn-primary btn-md">{t('common.retry')}</button>}
                />
              ) : tasks.length === 0 ? (
                <EmptyState
                  icon={category !== 'all' || debouncedQuery ? Search : Plus}
                  tone="brand"
                  title={category !== 'all' || debouncedQuery ? t('feed.noMatches') : t('feed.nothingNearby')}
                  message={
                    category !== 'all' || debouncedQuery
                      ? t('feed.noMatchesBody')
                      : t('feed.nothingNearbyBody')
                  }
                  action={
                    <div className="flex flex-col gap-2 w-full max-w-xs">
                      <Link to="/create" className="btn-primary btn-md">{t('feed.postTask')}</Link>
                      {/*
                        The single most useful button on an empty hyperlocal
                        feed. Someone in a village with nothing within 5 km
                        needs to look further, not to be told there is
                        nothing.
                      */}
                      {nextRadius && (
                        <button onClick={() => setRadius(nextRadius)} className="btn-ghost btn-md">
                          <Maximize2 size={15} />
                          {t('feed.widenSearch')} →{' '}
                          {RADIUS_OPTIONS.find((r) => r.value === nextRadius)?.label}
                        </button>
                      )}
                    </div>
                  }
                />
              ) : (
                <>
                  <div className="flex items-center justify-between px-1">
                    <p className="text-xs font-semibold text-ink-500">
                      {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'} {formatRadius(radius)}
                      {isApproximate && (
                        <span className="text-ink-400"> · {t('location.approximateHint')}</span>
                      )}
                    </p>
                    <button
                      onClick={() => { refreshGps(); load({ silent: true }); }}
                      className="text-xs font-semibold text-ink-500 inline-flex items-center gap-1 hover:text-ink-800"
                    >
                      <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
                      {t('feed.refresh')}
                    </button>
                  </div>

                  {tasks.map((task) => (
                    <TaskCard key={task.id} task={task} isNew={newIds.has(task.id)} />
                  ))}

                  <p className="text-center text-xs text-ink-400 py-4">{t('feed.expiryNote')}</p>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* ---- Filters ---- */}
      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title={t('feed.filters')}>
        <div className="space-y-6 pb-4">
          <div>
            <p className="label">{t('feed.distance')}</p>
            <div className="grid grid-cols-3 gap-2">
              {RADIUS_OPTIONS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRadius(r.value)}
                  className={`h-11 rounded-xl text-sm font-semibold transition-colors
                              ${radius === r.value ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600'}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {radius >= MAX_RADIUS_M && (
              <p className="hint">
                Showing tasks anywhere in India. Most will be too far to actually do — useful for
                seeing how the app is being used, less so for finding work.
              </p>
            )}
          </div>

          <div>
            <p className="label">{t('feed.sortBy')}</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { v: 'distance', l: t('feed.closest') },
                { v: 'bounty', l: t('feed.highestBounty') },
                { v: 'newest', l: t('feed.newest') },
              ].map((s) => (
                <button
                  key={s.v}
                  onClick={() => setSort(s.v)}
                  className={`h-11 rounded-xl text-sm font-semibold transition-colors
                              ${sort === s.v ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600'}`}
                >
                  {s.l}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                setCategory('all'); setRadius(DEFAULT_RADIUS_M); setSort('distance'); setQuery('');
              }}
              className="btn-ghost btn-md flex-1"
            >
              {t('feed.reset')}
            </button>
            <button onClick={() => setFiltersOpen(false)} className="btn-primary btn-md flex-1">
              {t('feed.showResults')}
            </button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
