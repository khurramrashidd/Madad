import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, MicOff, ArrowLeft, MapPin, Sparkles, WifiOff, Check, AlertTriangle } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useOffline } from '../context/OfflineContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
// The app-wide position, rather than a second GPS watch on this screen.
import { useLocation as useGeo } from '../context/LocationContext.jsx';
import useVoiceInput from '../hooks/useVoiceInput.js';
import Spinner from '../components/Spinner.jsx';
import TaskMap from '../components/TaskMap.jsx';
import { CATEGORIES } from '../utils/constants.js';
import { makeClientRef } from '../db/offline.js';

/**
 * Post a task — by typing, or by talking.
 *
 * Offline, the form still works: the task is queued in IndexedDB with a
 * clientRef and posted the moment the connection returns. The server treats
 * that ref as an idempotency key, so a replayed queue cannot double-post.
 */
export default function CreateTask() {
  const navigate = useNavigate();
  const { user, config } = useAuth();
  const { offline, queueAction } = useOffline();
  const toast = useToast();
  const {
    coords, status: geoStatus, blocked, areaName, isPrecise, refresh: refreshGps,
  } = useGeo();

  /**
   * Is the pin good enough to post against without a warning?
   *
   * A GPS or network-derived fix is; an IP guess or a hand-picked town centre
   * is not, because the task could land kilometres from the actual errand.
   */
  const accurate = isPrecise || geoStatus === 'coarse';

  const voice = useVoiceInput({ language: 'en-IN' });

  const [form, setForm] = useState({
    title: '', description: '', category: 'other',
    bounty: '', landmark: '', address: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [usedVoice, setUsedVoice] = useState(false);

  const min = config?.minBounty ?? 10;
  const max = config?.maxBounty ?? 500;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // When the voice parser returns, pre-fill whatever it worked out.
  useEffect(() => {
    if (!voice.parsed) return;
    const p = voice.parsed;
    setForm((f) => ({
      ...f,
      title: p.title || f.title,
      description: p.description || f.description,
      category: p.category !== 'other' ? p.category : f.category,
      bounty: p.bounty ? String(p.bounty) : f.bounty,
      landmark: p.landmark || f.landmark,
    }));
    setUsedVoice(true);

    if (p.missing?.includes('bounty')) {
      toast.info('I did not catch an amount — add the bounty yourself');
    } else {
      toast.success('Filled from your voice note — check it before posting');
    }
  }, [voice.parsed, toast]);

  const validate = () => {
    if (form.title.trim().length < 5) return 'Give the task a clearer title (at least 5 characters)';
    const b = Number(form.bounty);
    if (!Number.isFinite(b) || b < min) return `The bounty must be at least ₹${min}`;
    if (b > max) return `The bounty cannot be more than ₹${max}`;
    if (!coords) return 'Turn on location so volunteers can see how far away this is';
    return null;
  };

  const submit = async (e) => {
    e.preventDefault();
    const problem = validate();
    if (problem) return setError(problem);

    setError(null);
    setBusy(true);

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
      bounty: Number(form.bounty),
      lng: coords.lng,
      lat: coords.lat,
      landmark: form.landmark.trim(),
      address: form.address.trim(),
      createdVia: usedVoice ? 'voice' : 'form',
      voiceTranscript: usedVoice ? voice.transcript : null,
      clientRef: makeClientRef('task'),
    };

    try {
      if (offline) {
        await queueAction('create_task', payload);
        toast.offline('Saved. This posts the moment you are back online.');
        navigate('/my-tasks');
        return;
      }

      const res = await api.tasks.create(payload);
      toast.success('Task posted — volunteers can see it now');
      navigate(`/task/${res.task.id}`);
    } catch (err) {
      // Network died between the check and the send — queue instead of losing it.
      if (err.isOffline) {
        await queueAction('create_task', payload);
        toast.offline('Connection dropped — saved and queued');
        navigate('/my-tasks');
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const bountyPresets = [30, 50, 100, 150];

  return (
    <div className="flex flex-col h-full bg-ink-50">
      <header className="shrink-0 bg-surface border-b border-ink-100 safe-top px-4 pb-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 -ml-1.5 rounded-lg text-ink-500 hover:bg-ink-100" aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <h1 className="font-display font-bold text-lg">Post a task</h1>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <form onSubmit={submit} className="p-4 space-y-4 pb-8">
          {user?.isRestricted && (
            <div className="p-3 rounded-xl bg-danger/10 text-danger text-sm font-medium">
              Your account is restricted, so you cannot post right now.
              {user.restrictedReason ? ` ${user.restrictedReason}.` : ''}
            </div>
          )}

          {offline && (
            <div className="p-3 rounded-xl bg-ink-800 text-ink-50 text-sm flex gap-2">
              <WifiOff size={16} className="shrink-0 mt-0.5 text-brand-400" />
              <span>You are offline. Fill this in anyway — it will post automatically when you reconnect.</span>
            </div>
          )}

          {/* Voice capture */}
          <div className="card p-4">
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={voice.listening ? voice.stop : voice.start}
                disabled={!voice.supported || offline}
                className={`relative shrink-0 w-14 h-14 rounded-2xl grid place-items-center transition-all
                            ${voice.listening ? 'bg-danger text-white scale-105' : 'bg-brand-600 text-white'}
                            disabled:opacity-40`}
                aria-label={voice.listening ? 'Stop recording' : 'Dictate your task'}
              >
                {voice.listening && (
                  <span className="absolute inset-0 rounded-2xl bg-danger animate-pulse-ring" />
                )}
                {voice.processing ? <Spinner size={22} />
                  : voice.listening ? <MicOff size={22} />
                  : <Mic size={22} />}
              </button>

              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm flex items-center gap-1.5">
                  Speak your task
                  <span className="chip bg-info/10 text-info text-[10px]">
                    {voice.strategy === 'sarvam' ? 'Sarvam AI' : 'Browser'}
                  </span>
                </p>
                <p className="text-xs text-ink-500 mt-0.5 leading-relaxed">
                  {voice.listening ? 'Listening… tap again to stop.'
                    : voice.processing ? 'Working out the details…'
                    : offline ? 'Voice input needs a connection.'
                    : !voice.supported ? 'Voice input is not available on this device.'
                    : 'Try: "Pick up my printouts from the library, I will pay 50 rupees"'}
                </p>

                {(voice.interim || voice.transcript) && (
                  <p className="mt-2 p-2.5 rounded-lg bg-ink-50 text-sm text-ink-700 italic">
                    “{voice.transcript || voice.interim}”
                  </p>
                )}
                {voice.error && <p className="mt-2 text-xs text-danger font-medium">{voice.error}</p>}
              </div>
            </div>

            {usedVoice && (
              <div className="mt-3 pt-3 border-t border-ink-100 flex items-center gap-1.5 text-xs text-success font-medium">
                <Check size={14} /> Form filled from your voice note — please check it
              </div>
            )}
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-danger/10 text-danger text-sm font-medium">{error}</div>
          )}

          {/* Title */}
          <div>
            <label className="label" htmlFor="title">What do you need?</label>
            <input
              id="title" required value={form.title} onChange={set('title')}
              className="input" maxLength={90}
              placeholder="Pick up 20 printouts from the library"
            />
          </div>

          {/* Category */}
          <div>
            <p className="label">Category</p>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value} type="button"
                  onClick={() => setForm((f) => ({ ...f, category: c.value }))}
                  className={`h-16 rounded-xl flex flex-col items-center justify-center gap-1 transition-colors
                              ${form.category === c.value ? 'bg-brand-600 text-white' : 'bg-surface border border-ink-200 text-ink-600'}`}
                >
                  <span className="text-lg" aria-hidden="true">{c.icon}</span>
                  <span className="text-[11px] font-semibold leading-none">{c.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Bounty */}
          <div>
            <label className="label" htmlFor="bounty">Bounty (₹{min}–₹{max})</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-display font-bold text-xl text-ink-400">₹</span>
              <input
                id="bounty" type="number" required inputMode="numeric"
                min={min} max={max} value={form.bounty} onChange={set('bounty')}
                className="input pl-10 font-display font-bold text-xl tabular-nums"
                placeholder="50"
              />
            </div>
            <div className="flex gap-2 mt-2">
              {bountyPresets.map((p) => (
                <button key={p} type="button"
                        onClick={() => setForm((f) => ({ ...f, bounty: String(p) }))}
                        className="flex-1 h-9 rounded-lg bg-surface border border-ink-200 text-sm font-semibold text-ink-600">
                  ₹{p}
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-500 mt-2">
              You pay this directly on UPI once the task is done. Madad takes nothing.
            </p>
          </div>

          {/* Details */}
          <div>
            <label className="label" htmlFor="description">
              Details <span className="font-normal text-ink-400">(optional)</span>
            </label>
            <textarea
              id="description" rows={3} value={form.description} onChange={set('description')}
              className="textarea" maxLength={600}
              placeholder="Anything the volunteer should know before they accept."
            />
          </div>

          <div>
            <label className="label" htmlFor="landmark">
              Landmark <span className="font-normal text-ink-400">(optional)</span>
            </label>
            <input id="landmark" value={form.landmark} onChange={set('landmark')}
                   className="input" maxLength={120} placeholder="Near Central Library" />
          </div>

          {/* Location */}
          {/*
            Where the task is.

            This is the single most consequential field on the form and the
            user never types it: the task is pinned to where they are
            standing, and that pin is what decides whose feed it reaches and
            what distance each of them is shown. So the position is stated
            plainly, with its accuracy — a task pinned from a rough IP guess
            could be kilometres from the real errand, and the poster should
            know that before they post rather than wonder why nobody came.
          */}
          <div>
            <p className="label">Where is this task?</p>
            {coords ? (
              <>
                <TaskMap center={coords} height={160} zoom={accurate ? 16 : 13} interactive={false}
                         singlePin={{ lat: coords.lat, lng: coords.lng, label: form.bounty || '?' }}
                         showMe={false} />

                <p className="text-xs text-ink-500 mt-2 flex items-center gap-1.5">
                  <MapPin size={13} className={accurate ? 'text-brand-600' : 'text-warn'} />
                  {areaName ? <span className="font-semibold text-ink-700">{areaName}</span> : null}
                  {geoStatus === 'ready'
                    ? 'Pinned to your GPS position'
                    : geoStatus === 'coarse'
                    ? 'Pinned to your network position'
                    : geoStatus === 'manual'
                    ? 'Pinned to the area you chose'
                    : geoStatus === 'approximate'
                    ? 'Pinned to an approximate area'
                    : geoStatus === 'cached'
                    ? 'Pinned to your last known position'
                    : 'Locating…'}
                </p>

                {!accurate && (
                  <div className="mt-2 flex gap-2 p-2.5 rounded-xl bg-warn/10">
                    <AlertTriangle size={14} className="text-warn shrink-0 mt-0.5" />
                    <p className="text-[11.5px] text-ink-600 leading-relaxed">
                      This pin is approximate, so distances others see may be off. Add a landmark
                      above so they can find you, or{' '}
                      <button
                        type="button"
                        onClick={refreshGps}
                        className="font-semibold text-brand-600 underline"
                      >
                        try GPS again
                      </button>
                      .
                    </p>
                  </div>
                )}

                <p className="text-xs text-ink-400 mt-1.5">
                  Only an approximate area is shown on the feed. The exact pin is revealed once
                  someone claims the task.
                </p>
              </>
            ) : blocked ? (
              <div className="rounded-2xl border border-ink-200 bg-surface p-4 text-center">
                <MapPin size={22} className="text-brand-600 mx-auto" />
                <p className="text-sm font-semibold text-ink-800 mt-2">Location is off</p>
                <p className="text-xs text-ink-500 mt-1">
                  A task needs a position so people nearby can find it.
                </p>
                <button type="button" onClick={refreshGps} className="btn-outline btn-sm mt-3">
                  Enable location
                </button>
              </div>
            ) : (
              <div className="h-40 skeleton rounded-2xl" />
            )}
          </div>

          <button type="submit" disabled={busy || user?.isRestricted} className="btn-primary btn-lg w-full !mt-6">
            {busy ? <Spinner size={18} />
              : offline ? <><WifiOff size={17} /> Save and post later</>
              : <><Sparkles size={17} /> Post task</>}
          </button>
        </form>
      </div>
    </div>
  );
}
