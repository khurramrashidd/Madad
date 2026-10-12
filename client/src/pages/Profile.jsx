import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  LogOut, Trophy, Shield, Wallet, Check, Edit3, ChevronRight,
  TrendingUp, TrendingDown, Settings, Flame, Camera, Bell, BellOff,
  ShieldCheck, Mail, Phone, Image as ImageIcon, History, Info, X, Loader2,
} from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import { usePush } from '../hooks/usePush.js';
import { compressImage } from '../lib/image.js';
import Avatar from '../components/Avatar.jsx';
import TrustBadge from '../components/TrustBadge.jsx';
import TrustMeter from '../components/TrustMeter.jsx';
import Sheet from '../components/Sheet.jsx';
import Spinner from '../components/Spinner.jsx';

/** Own profile: identity, UPI, trust breakdown, stats. */
export default function Profile() {
  const { user, config, logout, refresh, isAdmin, setUser } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { t } = useI18n();
  const push = usePush();

  const [trust, setTrust] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ name: '', bio: '', upiId: '', city: '' });
  const fileInput = useRef(null);

  useEffect(() => {
    api.users.trust().then(setTrust).catch(() => {});
  }, []);

  useEffect(() => {
    if (user) setForm({ name: user.name || '', bio: user.bio || '', upiId: user.upiId || '', city: user.city || '' });
  }, [user]);

  /**
   * Pick, compress and upload a profile photo.
   *
   * The compression happens in the browser (see lib/image.js) — a 4 MB camera
   * photo becomes a ~25 KB WebP before anything is sent, which is what makes
   * storing it in the user document viable at all.
   */
  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    // Reset immediately so picking the same file twice still fires onChange.
    e.target.value = '';
    if (!file) return;

    setUploading(true);
    try {
      const dataUri = await compressImage(file);
      const r = await api.users.updateMe({ avatar: dataUri });
      setUser?.(r.user);
      toast.success('Photo updated');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async () => {
    setUploading(true);
    try {
      const r = await api.users.updateMe({ avatar: '' });
      setUser?.(r.user);
      toast.success('Photo removed');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.users.updateMe(form);
      await refresh();
      toast.success('Profile updated');
      setSheet(null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  if (!user) return null;

  const stats = user.stats || {};

  return (
    <div className="flex flex-col h-full bg-ink-50">
      <header className="shrink-0 bg-surface border-b border-ink-100 safe-top px-4 pb-3 flex items-center justify-between">
        <h1 className="font-display font-bold text-xl">Profile</h1>
        <button onClick={() => setSheet('edit')} className="p-2 rounded-lg text-ink-500 hover:bg-ink-100" aria-label="Edit profile">
          <Settings size={19} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-8">
        {/* Identity */}
        <div className="card p-5 text-center">
          {/* The photo is tappable, with the camera badge making that
              discoverable — an avatar that happens to be a button is not. */}
          <button
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="relative inline-block rounded-full group"
            aria-label={user.avatar ? t('profile.changePhoto') : 'Add a photo'}
          >
            <Avatar name={user.name} color={user.avatarColor} src={user.avatar} size={72} />
            <span
              className="absolute -bottom-0.5 -right-0.5 w-7 h-7 rounded-full bg-brand-600 text-white
                         grid place-items-center ring-2 ring-surface shadow-sm"
            >
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
            </span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            onChange={pickPhoto}
            className="hidden"
          />

          <h2 className="font-display font-bold text-xl mt-3">{user.name}</h2>
          {user.bio && <p className="text-sm text-ink-500 mt-1 leading-relaxed">{user.bio}</p>}

          <div className="flex items-center justify-center gap-2 mt-3">
            <TrustBadge score={user.trustScore} badge={user.badge} size="lg" />
            {user.rating && (
              <span className="chip bg-ink-100 text-ink-700 px-3 py-1.5">⭐ {user.rating}</span>
            )}
          </div>

          {user.avatar && (
            <button
              onClick={removePhoto}
              disabled={uploading}
              className="text-[11.5px] font-semibold text-ink-400 hover:text-danger mt-3"
            >
              {t('profile.removePhoto')}
            </button>
          )}
        </div>

        {/*
          Account checks — deliberately NOT called "verification".

          The OTP flow in this build is mocked, so there is no SMS provider
          and no identity check of any kind. A green "Verified" badge here
          would be a lie that other users would reasonably rely on when
          deciding whether to meet someone alone. What can be said truthfully
          is which signals an account has, and that is what this shows.
        */}
        <div className="card p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <ShieldCheck size={14} className="text-ink-400" />
            <p className="text-[10.5px] font-bold uppercase tracking-wide text-ink-400">
              {t('profile.verification')}
            </p>
          </div>

          <div className="space-y-2">
            <CheckRow icon={Mail} label="Email on file" done />
            <CheckRow
              icon={Phone}
              label={user.phone ? `Mobile number added (${user.phone})` : 'No mobile number'}
              done={Boolean(user.phone)}
            />
            <CheckRow icon={Wallet} label="UPI ID added" done={Boolean(user.upiId)} />
            <CheckRow icon={ImageIcon} label="Profile photo added" done={Boolean(user.avatar)} />
            <CheckRow
              icon={History}
              label={`${stats.tasksCompleted || 0} tasks completed`}
              done={(stats.tasksCompleted || 0) >= 3}
            />
          </div>

          <div className="mt-3 flex gap-2 p-2.5 rounded-xl bg-ink-100">
            <Info size={14} className="text-ink-500 shrink-0 mt-0.5" />
            <p className="text-[11.5px] text-ink-600 leading-relaxed">
              {t('profile.notVerifiedNote')}
            </p>
          </div>
        </div>

        {/* Notifications */}
        {push.status !== 'unsupported' && push.status !== 'unconfigured' && (
          <div className="card p-4 flex items-start gap-3">
            <span
              className={`shrink-0 w-10 h-10 rounded-xl grid place-items-center
                          ${push.isEnabled ? 'bg-success/10 text-success' : 'bg-ink-100 text-ink-500'}`}
            >
              {push.isEnabled ? <Bell size={19} /> : <BellOff size={19} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm">
                {push.isEnabled ? t('push.enabled') : t('push.enable')}
              </p>
              <p className="text-[12px] text-ink-500 leading-relaxed mt-0.5">
                {push.status === 'denied' ? t('push.blocked') : t('push.body')}
              </p>
              {push.error && <p className="text-[12px] text-danger mt-1">{push.error}</p>}

              {push.canEnable && (
                <button
                  onClick={push.subscribe}
                  disabled={push.busy}
                  className="btn-primary btn-sm mt-2.5"
                >
                  {push.busy ? <Spinner size={14} /> : <Bell size={14} />}
                  {t('push.enable')}
                </button>
              )}
            </div>
            {push.isEnabled && <Check size={18} className="text-success shrink-0" />}
          </div>
        )}

        {user.isRestricted && (
          <div className="card p-4 border-danger/30 bg-danger/5">
            <p className="font-semibold text-danger text-sm">Your account is restricted</p>
            <p className="text-sm text-ink-600 mt-1 leading-relaxed">
              {user.restrictedReason}. Settle any outstanding payments and complete
              tasks reliably to bring your score back up.
            </p>
          </div>
        )}

        {/* Trust */}
        <div className="card p-5">
          <TrustMeter score={user.trustScore} restrictBelow={config?.trustRestrictBelow ?? 40} />

          {trust?.history?.length > 0 && (
            <div className="mt-5 pt-4 border-t border-ink-100">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-400 mb-3">Recent changes</p>
              <div className="space-y-2">
                {trust.history.slice(0, 6).map((h, i) => (
                  <div key={i} className="flex items-center gap-2.5 text-sm">
                    {h.delta >= 0
                      ? <TrendingUp size={15} className="text-success shrink-0" />
                      : <TrendingDown size={15} className="text-danger shrink-0" />}
                    <span className="flex-1 truncate text-ink-600">{h.label}</span>
                    <span className={`font-semibold tabular-nums shrink-0 ${h.delta >= 0 ? 'text-success' : 'text-danger'}`}>
                      {h.delta >= 0 ? '+' : ''}{h.delta}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* UPI */}
        <button onClick={() => setSheet('edit')} className="card p-4 w-full flex items-center gap-3 text-left">
          <div className={`w-10 h-10 rounded-xl grid place-items-center shrink-0
                           ${user.upiId ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
            <Wallet size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm">UPI ID</p>
            <p className="text-sm text-ink-500 font-mono truncate">
              {user.upiId || 'Not set — you cannot claim tasks yet'}
            </p>
          </div>
          {user.upiId ? <Check size={18} className="text-success shrink-0" /> : <Edit3 size={16} className="text-ink-400 shrink-0" />}
        </button>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Tasks completed" value={stats.tasksCompleted || 0} />
          <Stat label="Tasks posted" value={stats.tasksPosted || 0} />
          <Stat label="Earned" value={`₹${stats.totalEarned || 0}`} tone="text-success" />
          <Stat label="Spent" value={`₹${stats.totalSpent || 0}`} />
        </div>

        {stats.currentStreak > 0 && (
          <div className="card p-4 flex items-center gap-3 bg-brand-50 border-brand-200">
            <Flame size={22} className="text-brand-600 shrink-0" />
            <div>
              <p className="font-semibold text-sm">{stats.currentStreak}-task streak</p>
              <p className="text-xs text-ink-600">Best: {stats.bestStreak}. Every 3 in a row earns bonus trust.</p>
            </div>
          </div>
        )}

        {/* Links */}
        <div className="card divide-y divide-ink-100">
          <NavRow to="/earnings" icon={Wallet} label={t('nav.earnings')} />
          <NavRow to="/safety" icon={ShieldCheck} label={t('nav.safety')} />
          <NavRow to="/leaderboard" icon={Trophy} label={t('nav.leaderboard')} />
          <NavRow to="/help" icon={Info} label={t('nav.help')} />
          {isAdmin && <NavRow to="/admin" icon={Shield} label={t('nav.admin')} />}
        </div>

        <button onClick={signOut} className="btn-ghost btn-md w-full text-danger">
          <LogOut size={16} /> Sign out
        </button>

        <p className="text-center text-xs text-ink-400 pt-2">
          Madad · zero commission, zero escrow
        </p>
      </div>

      <Sheet open={sheet === 'edit'} onClose={() => setSheet(null)} title="Edit profile">
        <div className="space-y-4 pb-4">
          <div>
            <label className="label" htmlFor="pname">Name</label>
            <input id="pname" className="input" value={form.name}
                   onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={50} />
          </div>

          <div>
            <label className="label" htmlFor="pupi">UPI ID</label>
            <input id="pupi" className="input font-mono text-sm" value={form.upiId}
                   onChange={(e) => setForm((f) => ({ ...f, upiId: e.target.value }))}
                   placeholder="yourname@okhdfcbank" />
            <p className="text-xs text-ink-500 mt-1.5 leading-relaxed">
              Wishers pay straight into this. Madad never holds your money, so
              getting this right matters.
            </p>
          </div>

          <div>
            <label className="label" htmlFor="pbio">Bio</label>
            <textarea id="pbio" rows={3} className="textarea" value={form.bio}
                      onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                      maxLength={200} placeholder="What kind of tasks do you like doing?" />
          </div>

          <div>
            <label className="label" htmlFor="pcity">City</label>
            <input id="pcity" className="input" value={form.city}
                   onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} maxLength={60} />
          </div>

          <button onClick={save} disabled={busy} className="btn-primary btn-lg w-full">
            {busy ? <Spinner size={18} /> : 'Save changes'}
          </button>
        </div>
      </Sheet>
    </div>
  );
}

/**
 * One row of the account-checks list.
 *
 * A present check is green; an absent one is muted rather than red. These are
 * not failures — an account without a photo is perfectly valid — and marking
 * them in danger colours would imply something is wrong.
 */
function CheckRow({ icon: Icon, label, done }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`shrink-0 w-6 h-6 rounded-lg grid place-items-center
                    ${done ? 'bg-success/10 text-success' : 'bg-ink-100 text-ink-400'}`}
      >
        {done ? <Check size={13} strokeWidth={3} /> : <Icon size={12} />}
      </span>
      <span className={`text-[12.5px] ${done ? 'text-ink-700 font-medium' : 'text-ink-500'}`}>
        {label}
      </span>
    </div>
  );
}

function Stat({ label, value, tone = '' }) {
  return (
    <div className="card p-4">
      <p className={`font-display font-bold text-2xl tabular-nums ${tone}`}>{value}</p>
      <p className="text-xs text-ink-500 mt-0.5">{label}</p>
    </div>
  );
}

function NavRow({ to, icon: Icon, label }) {
  return (
    <Link to={to} className="flex items-center gap-3 p-4">
      <Icon size={19} className="text-ink-500 shrink-0" />
      <span className="font-medium text-sm flex-1">{label}</span>
      <ChevronRight size={17} className="text-ink-300" />
    </Link>
  );
}
