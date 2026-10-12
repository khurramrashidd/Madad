import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, X, Check, ShieldAlert, Shield, MapPin } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Avatar from './Avatar.jsx';
import Spinner from './Spinner.jsx';

/**
 * Demo account switcher — development only.
 *
 * Madad needs two people to show anything interesting: you cannot claim your
 * own task. Normally that means two browser windows and two logins. This lets
 * you hop between the seeded accounts in one window, which makes both testing
 * and presenting far less fiddly.
 *
 * It renders nothing in a production build, and the endpoint it calls 404s
 * there too — so this cannot ship working credentials by accident.
 */
export default function DemoSwitcher() {
  const { user, login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [password, setPassword] = useState('password123');
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(null);
  const [unavailable, setUnavailable] = useState(false);
  const [moving, setMoving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.auth.demoAccounts();
      setAccounts(res.accounts || []);
      setPassword(res.password || 'password123');
    } catch {
      // Seed not run, or this is a production build.
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && !accounts.length && !unavailable) load();
  }, [open, accounts.length, unavailable, load]);

  if (!__DEMO_TOOLS__) return null;

  /**
   * Demo tasks are scattered around one point. If you are somewhere else,
   * every task is out of range and the feed looks empty. This moves the whole
   * demo (nothing is deleted) so it sits around where you are right now.
   */
  const moveDemoHere = () => {
    if (!navigator.geolocation) {
      toast.error('This device cannot share its location');
      return;
    }
    setMoving(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await api.auth.demoRecentre(pos.coords.latitude, pos.coords.longitude);
          toast.success(
            r.moved
              ? `Demo tasks moved to ${r.city || 'your location'}`
              : 'No demo tasks to move — run npm run seed first'
          );
          if (r.moved) setTimeout(() => window.location.reload(), 900);
        } catch (err) {
          toast.error(err.message || 'Could not move the demo tasks');
        } finally {
          setMoving(false);
        }
      },
      (err) => {
        setMoving(false);
        toast.error(err.code === 1 ? 'Allow location access for Madad first' : 'Could not get your location — try again outdoors or near a window');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  };

  const switchTo = async (account) => {
    if (account.email === user?.email) {
      setOpen(false);
      return;
    }
    setSwitching(account.email);
    try {
      await login({ email: account.email, password });
      toast.success(`Now signed in as ${account.name}`);
      setOpen(false);
      // Land on the feed — the switched-to account's view of a detail page is
      // usually not what you wanted.
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(err.message || 'Could not switch account');
    } finally {
      setSwitching(null);
    }
  };

  return (
    <>
      {/* Launcher */}
      <button
        onClick={() => setOpen(true)}
        // z-50 keeps it tappable above the guide card.
        className="fixed z-50 right-4 flex items-center gap-2 h-10 pl-2 pr-3.5 rounded-full
                   bg-ink-900 text-ink-50 shadow-lift active:scale-95 transition-transform"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 4.75rem)' }}
        aria-label="Switch demo account"
      >
        {user ? (
          <Avatar name={user.name} color={user.avatarColor} size={26} />
        ) : (
          <Users size={18} className="ml-1" />
        )}
        <span className="text-xs font-bold">Demo</span>
      </button>

      {!open ? null : (
        <div className="fixed inset-0 z-[60] flex items-end justify-center" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-ink-950/50 animate-fade-in" onClick={() => setOpen(false)} />

          <div className="relative w-full max-w-lg bg-surface rounded-t-3xl shadow-lift animate-slide-up
                          max-h-[85vh] flex flex-col">
            <div className="shrink-0 pt-3 pb-1 grid place-items-center">
              <div className="w-10 h-1 rounded-full bg-ink-200" />
            </div>

            <div className="shrink-0 flex items-start justify-between px-5 pb-2">
              <div>
                <h2 className="font-display font-bold text-lg">Switch account</h2>
                <p className="text-xs text-ink-500 mt-0.5">
                  Jump between demo users without logging out
                </p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close"
                      className="p-1.5 -mr-1.5 rounded-lg text-ink-400 hover:bg-ink-100">
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto px-5 pb-5 flex-1">
              {loading ? (
                <div className="grid place-items-center py-10">
                  <Spinner size={22} className="text-brand-500" />
                </div>
              ) : unavailable ? (
                <div className="py-8 text-center">
                  <p className="font-semibold text-ink-800">No demo accounts found</p>
                  <p className="text-sm text-ink-500 mt-1.5 leading-relaxed">
                    Load them by running this in your terminal:
                  </p>
                  <code className="inline-block mt-3 px-3 py-2 rounded-lg bg-ink-100 text-sm font-mono">
                    npm run seed
                  </code>
                </div>
              ) : (
                <div className="space-y-2">
                  {accounts.map((a) => {
                    const isCurrent = a.email === user?.email;
                    return (
                      <button
                        key={a.email}
                        onClick={() => switchTo(a)}
                        disabled={Boolean(switching)}
                        className={`w-full p-3 rounded-xl flex items-center gap-3 text-left transition-colors
                                    ${isCurrent ? 'bg-brand-50 border-2 border-brand-300' : 'bg-ink-50 border-2 border-transparent hover:bg-ink-100'}
                                    disabled:opacity-60`}
                      >
                        <Avatar name={a.name} color={a.avatarColor} size={40} />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold truncate">{a.name}</p>
                            {a.role === 'admin' && <Shield size={13} className="text-info shrink-0" />}
                            {a.isRestricted && <ShieldAlert size={13} className="text-danger shrink-0" />}
                          </div>
                          {a.hint && <p className="text-xs text-ink-500 truncate">{a.hint}</p>}
                          <p className="text-[11px] text-ink-400 mt-0.5">
                            Trust {a.trustScore}
                            {a.tasksCompleted > 0 && ` · ${a.tasksCompleted} done`}
                            {!a.hasUpi && ' · no UPI yet'}
                          </p>
                        </div>

                        {switching === a.email ? (
                          <Spinner size={18} className="text-brand-600 shrink-0" />
                        ) : isCurrent ? (
                          <span className="chip bg-brand-600 text-white shrink-0">
                            <Check size={12} /> you
                          </span>
                        ) : null}
                      </button>
                    );
                  })}

                  <button
                    onClick={moveDemoHere}
                    disabled={moving}
                    className="w-full mt-3 p-3 rounded-xl flex items-center gap-3 text-left bg-surface border-2 border-dashed border-ink-200 hover:border-brand-300 disabled:opacity-60"
                  >
                    <span className="w-10 h-10 rounded-full bg-brand-50 text-brand-600 grid place-items-center shrink-0">
                      {moving ? <Spinner size={18} className="text-brand-600" /> : <MapPin size={18} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold">Move demo tasks to me</span>
                      <span className="block text-xs text-ink-500">Feed empty? Put the demo around where you are now</span>
                    </span>
                  </button>

                  <p className="text-[11px] text-ink-400 text-center pt-2 leading-relaxed">
                    This panel only exists in demo builds.
                    It is stripped from a production web build.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
