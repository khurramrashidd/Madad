import { Link } from 'react-router-dom';
import { Menu, MapPin, Bell, Navigation, AlertTriangle } from 'lucide-react';
import Avatar from './Avatar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import { useWeather } from '../hooks/useWeather.js';
import { istShortDate } from '../lib/datetime.js';

/**
 * The app header.
 *
 * Layout: brand and menu on the left, the user on the right, and a context
 * strip underneath carrying where you are, what day it is, and the weather.
 *
 * The strip is not decoration. Every item on it is something a user is about
 * to act on: the area name confirms the feed is anchored where they actually
 * are (the single most common confusion in a location-based app), the date is
 * in IST because they are arranging to meet someone today, and the weather
 * matters because deciding whether to walk ten minutes for ₹50 is a different
 * decision in 38°C or in rain.
 *
 * It is also the natural home for the location *state*. When the position is
 * approximate or hand-set, saying so here — next to the place name — is far
 * clearer than a banner elsewhere, and it gives the fix a single obvious
 * place to live.
 */
export default function AppHeader({
  onOpenMenu,
  location = {},
  unreadCount = 0,
  live = false,
  onFixLocation,
}) {
  const { user } = useAuth();
  const { t, greeting } = useI18n();
  const weather = useWeather(location.coords);

  const {
    areaName, status, isApproximate, isManual, blocked, retryable,
  } = location;

  const firstName = user?.name?.split(' ')[0] || '';

  // What to show where the place name goes, by location state.
  const placeLabel =
    status === 'locating' && !areaName
      ? t('feed.findingYou')
      : areaName || (blocked ? t('location.enable') : t('feed.nearYou'));

  const needsAttention = blocked || isApproximate || retryable;

  return (
    <header className="shrink-0 bg-surface border-b border-ink-100 safe-top">
      {/* ---- Row 1: brand · menu · user ---- */}
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
        <button
          onClick={onOpenMenu}
          aria-label={t('nav.menu')}
          className="p-2 -ml-1 rounded-xl text-ink-600 hover:bg-ink-100 active:scale-95 transition"
        >
          <Menu size={22} />
        </button>

        <Link to="/" className="flex items-center gap-2 min-w-0" aria-label="Madad home">
          <span className="grid place-items-center w-8 h-8 rounded-xl bg-brand-600 shrink-0">
            <span className="font-display font-extrabold text-base text-white leading-none">M</span>
          </span>
          <span className="font-display font-extrabold text-lg tracking-tighter2 text-ink-900">
            Madad
          </span>
        </Link>

        <div className="flex-1" />

        <Link
          to="/notifications"
          className="relative p-2 rounded-xl text-ink-500 hover:bg-ink-100"
          aria-label={t('nav.notifications')}
        >
          <Bell size={20} />
          {unreadCount > 0 && (
            <span
              className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-danger text-white
                         text-[10px] font-bold grid place-items-center ring-2 ring-surface"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>

        {/* The user, on the right. Name is hidden on the narrowest phones
            where it would crowd the brand out — the avatar still identifies
            the account, and the greeting below carries the name anyway. */}
        <Link to="/profile" className="flex items-center gap-2 pl-1 min-w-0" aria-label={t('nav.profile')}>
          <span className="hidden xs:block text-right min-w-0">
            <span className="block text-[13px] font-semibold text-ink-800 truncate max-w-[7rem] leading-tight">
              {firstName}
            </span>
            {user?.trustScore != null && (
              <span className="block text-[10px] font-semibold text-ink-400 leading-tight">
                {user.trustScore} trust
              </span>
            )}
          </span>
          <Avatar name={user?.name} color={user?.avatarColor} src={user?.avatar} size={34} ring />
        </Link>
      </div>

      {/* ---- Row 2: greeting ---- */}
      <div className="px-4 pb-1.5">
        <p className="text-[15px] font-display font-bold text-ink-900 truncate">
          {greeting()}
          {firstName ? `, ${firstName}` : ''}
        </p>
      </div>

      {/* ---- Row 3: location · date · weather ---- */}
      <div className="px-4 pb-2.5 flex items-center gap-2 text-[11.5px] text-ink-500 overflow-hidden">
        <button
          onClick={needsAttention ? onFixLocation : undefined}
          className={`flex items-center gap-1 min-w-0 rounded-lg -mx-1 px-1 py-0.5
                      ${needsAttention ? 'hover:bg-ink-100 active:scale-95 transition' : 'cursor-default'}`}
          aria-label={needsAttention ? t('location.setManually') : undefined}
        >
          {blocked ? (
            <AlertTriangle size={13} className="text-warn shrink-0" />
          ) : isManual ? (
            <MapPin size={13} className="text-info shrink-0" />
          ) : (
            <MapPin size={13} className="text-brand-600 shrink-0" />
          )}

          <span className="font-semibold text-ink-700 truncate max-w-[9rem]">{placeLabel}</span>

          {live && (
            <span className="relative flex w-1.5 h-1.5 shrink-0 ml-0.5" title={t('feed.live')}>
              <span className="absolute inline-flex w-full h-full rounded-full bg-success opacity-60 animate-pulse-ring" />
              <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-success" />
            </span>
          )}

          {/* State is stated plainly rather than implied. A user who thinks a
              city-level IP guess is their GPS position will not understand
              why the distances look wrong. */}
          {isApproximate && !blocked && (
            <span className="shrink-0 ml-0.5 px-1.5 py-px rounded-full bg-ink-100 text-[9.5px] font-bold uppercase tracking-wide text-ink-500">
              {isManual ? t('location.manual') : t('location.approximate')}
            </span>
          )}
          {needsAttention && <Navigation size={11} className="shrink-0 text-ink-400 ml-0.5" />}
        </button>

        <span className="text-ink-300 shrink-0">·</span>
        <span className="shrink-0 font-medium">{istShortDate()}</span>

        {weather && (
          <>
            <span className="text-ink-300 shrink-0">·</span>
            <span className="shrink-0 font-medium" title={weather.label}>
              <span aria-hidden="true">{weather.icon}</span> {weather.temp}°C
            </span>
          </>
        )}
      </div>
    </header>
  );
}
