import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  X, Trophy, Bell, Star, Wallet, ShieldCheck, HelpCircle, Settings,
  LayoutDashboard, LogOut, Sun, Moon, Monitor, Languages, Check,
} from 'lucide-react';

import Avatar from './Avatar.jsx';
import { BADGE_META } from '../utils/constants.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { useI18n } from '../context/I18nContext.jsx';

/**
 * The navigation drawer.
 *
 * The bottom bar holds the five things people do constantly — browse, their
 * tasks, post, chat, profile. Everything else was previously reachable only
 * by knowing a URL, which meant the leaderboard, the trust history and the
 * admin dashboard were effectively invisible. That is what this is for:
 * secondary destinations and account-level settings, in one place, without
 * stealing a sixth slot from the bottom bar that a thumb can barely hit.
 *
 * It slides from the left, is dismissible by backdrop, Escape or swipe-ish
 * tap, traps initial focus for keyboard users, and renders nothing at all
 * when closed so it costs nothing on the feed.
 */
export default function Sidebar({ open, onClose }) {
  const { user, isAdmin, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { t, lang, setLanguage, languages } = useI18n();
  const navigate = useNavigate();
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus inside the drawer so a keyboard user is not left behind it.
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const go = (to) => {
    onClose?.();
    navigate(to);
  };

  const handleLogout = async () => {
    onClose?.();
    await logout();
    navigate('/login', { replace: true });
  };

  const completion = user?.stats?.tasksCompleted ?? 0;
  const posted = user?.stats?.tasksPosted ?? 0;

  const links = [
    { to: '/leaderboard', icon: Trophy, label: t('nav.leaderboard') },
    { to: '/notifications', icon: Bell, label: t('nav.notifications') },
    { to: `/profile/${user?.id}`, icon: Star, label: t('nav.reviews') },
    { to: '/earnings', icon: Wallet, label: t('nav.earnings') },
    { to: '/safety', icon: ShieldCheck, label: t('nav.safety') },
    { to: '/help', icon: HelpCircle, label: t('nav.help') },
  ];

  const themeOptions = [
    { value: 'light', icon: Sun, label: t('theme.light') },
    { value: 'dark', icon: Moon, label: t('theme.dark') },
    { value: 'system', icon: Monitor, label: t('theme.system') },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex" role="dialog" aria-modal="true" aria-label={t('nav.menu')}>
      <div className="absolute inset-0 bg-ink-950/50 animate-fade-in" onClick={onClose} />

      <div
        ref={panelRef}
        className="relative w-[85%] max-w-[20rem] h-full bg-surface shadow-lift flex flex-col
                   animate-slide-in-left"
      >
        {/* ---- Account card ---- */}
        <div className="shrink-0 safe-top px-4 pt-3 pb-4 bg-brand-700 text-white">
          <div className="flex items-start justify-between">
            <Link to="/profile" onClick={onClose} className="flex items-center gap-3 min-w-0">
              <Avatar name={user?.name} color={user?.avatarColor} src={user?.avatar} size={46} ring />
              <span className="min-w-0">
                <span className="block font-display font-bold text-[15px] truncate">
                  {user?.name || '—'}
                </span>
                <span className="block text-[11.5px] text-brand-100 truncate">
                  {user?.city || user?.email || ''}
                </span>
              </span>
            </Link>
            <button
              ref={closeRef}
              onClick={onClose}
              aria-label={t('common.close')}
              className="p-1.5 -mr-1 rounded-lg text-brand-100 hover:bg-brand-600/60"
            >
              <X size={20} />
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2">
            {/*
              Not <TrustBadge>: its tints are tuned for the app's pale
              surfaces, and `bg-success/10 text-success` on this green header
              is green-on-green — legible in theory, unreadable in practice.
              A solid light chip is the same information at proper contrast.
            */}
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface/95 text-brand-800
                         text-[11.5px] font-bold"
              title={`Trust score: ${user?.trustScore}/100`}
            >
              <span aria-hidden="true">{BADGE_META[user?.badge]?.icon ?? '🌱'}</span>
              {BADGE_META[user?.badge]?.label ?? 'Newcomer'}
              <span className="tabular-nums opacity-70">{user?.trustScore}</span>
            </span>
            {/* The UPI state belongs here: without it you cannot claim
                anything, and discovering that at the moment you try is a
                frustrating way to find out. */}
            {!user?.hasUpi && (
              <button
                onClick={() => go('/profile')}
                className="px-2 py-1 rounded-full bg-money-400 text-ink-900 text-[10px] font-bold uppercase tracking-wide"
              >
                Add UPI ID
              </button>
            )}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-brand-800/50 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-brand-200 font-semibold">
                {t('profile.tasksDone')}
              </p>
              <p className="font-display font-bold text-lg leading-tight">{completion}</p>
            </div>
            <div className="rounded-xl bg-brand-800/50 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-brand-200 font-semibold">
                {t('profile.tasksPosted')}
              </p>
              <p className="font-display font-bold text-lg leading-tight">{posted}</p>
            </div>
          </div>
        </div>

        {/* ---- Navigation ---- */}
        <nav className="flex-1 overflow-y-auto py-2">
          {links.map(({ to, icon: Icon, label }) => (
            <button
              key={to}
              onClick={() => go(to)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left text-[14.5px] font-medium
                         text-ink-700 hover:bg-ink-100 active:bg-ink-200 transition-colors"
            >
              <Icon size={19} className="text-ink-400 shrink-0" />
              {label}
            </button>
          ))}

          {isAdmin && (
            <button
              onClick={() => go('/admin')}
              className="w-full flex items-center gap-3 px-4 py-3 text-left text-[14.5px] font-semibold
                         text-brand-700 hover:bg-brand-50 transition-colors"
            >
              <LayoutDashboard size={19} className="shrink-0" />
              {t('nav.admin')}
            </button>
          )}

          <div className="my-2 mx-4 border-t border-ink-100" />

          {/* ---- Appearance ---- */}
          <div className="px-4 py-2">
            <p className="text-[10.5px] font-bold uppercase tracking-wide text-ink-400 mb-2">
              {t('nav.theme')}
            </p>
            <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={t('nav.theme')}>
              {themeOptions.map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  aria-pressed={theme === value}
                  className={`flex flex-col items-center gap-1 py-2 rounded-xl text-[11px] font-semibold
                              transition-colors ${
                                theme === value
                                  ? 'bg-brand-600 text-white'
                                  : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
                              }`}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* ---- Language ---- */}
          <div className="px-4 py-2">
            <p className="text-[10.5px] font-bold uppercase tracking-wide text-ink-400 mb-2 flex items-center gap-1.5">
              <Languages size={12} />
              {t('nav.language')}
            </p>
            <div className="space-y-1">
              {languages.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setLanguage(l.code)}
                  aria-pressed={lang === l.code}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-[13.5px]
                              font-medium transition-colors ${
                                lang === l.code
                                  ? 'bg-brand-50 text-brand-800'
                                  : 'text-ink-700 hover:bg-ink-100'
                              }`}
                >
                  <span>{l.native}</span>
                  {lang === l.code && <Check size={15} className="text-brand-600" />}
                </button>
              ))}
            </div>
          </div>

          <div className="my-2 mx-4 border-t border-ink-100" />

          <button
            onClick={() => go('/profile')}
            className="w-full flex items-center gap-3 px-4 py-3 text-left text-[14.5px] font-medium
                       text-ink-700 hover:bg-ink-100 transition-colors"
          >
            <Settings size={19} className="text-ink-400 shrink-0" />
            {t('nav.settings')}
          </button>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-left text-[14.5px] font-medium
                       text-danger hover:bg-danger/5 transition-colors"
          >
            <LogOut size={19} className="shrink-0" />
            {t('nav.logout')}
          </button>
        </nav>

        <div className="shrink-0 px-4 py-3 border-t border-ink-100 safe-bottom">
          <p className="text-[10.5px] text-ink-400 leading-relaxed">
            Madad never touches your money. Bounties are paid directly over UPI.
          </p>
        </div>
      </div>
    </div>
  );
}
