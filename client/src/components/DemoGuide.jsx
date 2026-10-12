import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Compass, X, ChevronLeft, ChevronRight, Check, Lightbulb,
  UserCheck, ArrowRight, RotateCcw, Minus,
} from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Spinner from './Spinner.jsx';
import { DEMO_STEPS, TOTAL_STEPS } from '../utils/demoSteps.js';

const KEY = 'madad_guide_step';
const OPEN_KEY = 'madad_guide_open';

const read = (k, fallback) => {
  try {
    const v = localStorage.getItem(k);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* private mode */
  }
};

/**
 * Step-by-step walkthrough of the full task lifecycle.
 *
 * The thing that makes Madad confusing to drive alone is that every stage
 * belongs to a different person. So each step names the account you need to be
 * on, and offers a one-tap switch when you are on the wrong one — which
 * removes the mistake everybody makes.
 *
 * Development only.
 */
export default function DemoGuide() {
  const { user, login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [open, setOpen] = useState(() => read(OPEN_KEY, false));
  const [index, setIndex] = useState(() => read(KEY, 0));
  const [switching, setSwitching] = useState(false);

  useEffect(() => write(KEY, index), [index]);
  useEffect(() => write(OPEN_KEY, open), [open]);

  // The welcome overlay's "Walk me through it" button opens this.
  useEffect(() => {
    const onOpen = () => { setIndex(0); setOpen(true); };
    window.addEventListener('madad:open-guide', onOpen);
    return () => window.removeEventListener('madad:open-guide', onOpen);
  }, []);

  const step = DEMO_STEPS[index];

  const switchAccount = useCallback(async () => {
    if (!step?.asEmail) return;
    setSwitching(true);
    try {
      await login({ email: step.asEmail, password: 'password123' });
      toast.success(`Signed in as ${step.as}`);
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(err.message || 'Could not switch — have you run npm run seed?');
    } finally {
      setSwitching(false);
    }
  }, [step, login, toast, navigate]);

  if (!__DEMO_TOOLS__) return null;

  // Collapsed launcher
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed z-40 left-4 flex items-center gap-2 h-10 pl-3 pr-3.5 rounded-full
                   bg-brand-600 text-white shadow-lift active:scale-95 transition-transform"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 4.75rem)' }}
        aria-label="Open the guided walkthrough"
      >
        <Compass size={17} />
        <span className="text-xs font-bold">Guide</span>
        <span className="text-[10px] font-bold bg-ink-950/15 rounded px-1.5 py-0.5 tabular-nums">
          {index + 1}/{TOTAL_STEPS}
        </span>
      </button>
    );
  }

  const onRightAccount =
    !step.asEmail || user?.email === step.asEmail;

  return (
    <div
      // Sits above the launcher row so it never covers the Demo switcher.
      className="fixed z-40 left-3 right-3 max-w-md mx-auto animate-slide-up"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 8.25rem)' }}
    >
      <div className="card shadow-lift overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-ink-900 text-ink-50">
          <Compass size={16} className="text-brand-400 shrink-0" />
          <span className="text-xs font-bold flex-1">
            Walkthrough
            <span className="opacity-60 font-medium ml-1.5 tabular-nums">
              step {index + 1} of {TOTAL_STEPS}
            </span>
          </span>
          <button onClick={() => setOpen(false)} aria-label="Minimise"
                  className="p-1 opacity-70 hover:opacity-100">
            <Minus size={16} />
          </button>
          <button
            onClick={() => { setIndex(0); setOpen(false); }}
            aria-label="Close walkthrough"
            className="p-1 opacity-70 hover:opacity-100"
          >
            <X size={16} />
          </button>
        </div>

        {/* Progress */}
        <div className="h-1 bg-ink-100">
          <div
            className="h-full bg-brand-500 transition-all duration-300"
            style={{ width: `${((index + 1) / TOTAL_STEPS) * 100}%` }}
          />
        </div>

        <div className="p-4">
          <h3 className="font-display font-bold text-base leading-snug">{step.title}</h3>

          {/* Account requirement — the part people get wrong */}
          {step.asEmail && (
            <div
              className={`mt-3 p-2.5 rounded-xl flex items-center gap-2.5
                          ${onRightAccount ? 'bg-success/10' : 'bg-brand-50 border border-brand-200'}`}
            >
              <UserCheck
                size={16}
                className={onRightAccount ? 'text-success shrink-0' : 'text-brand-600 shrink-0'}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold">
                  {onRightAccount ? `You are ${step.as} — correct` : `Switch to ${step.as}`}
                </p>
                {!onRightAccount && (
                  <p className="text-[11px] text-ink-500 truncate">
                    currently {user?.name || 'signed out'}
                  </p>
                )}
              </div>
              {!onRightAccount && (
                <button
                  onClick={switchAccount}
                  disabled={switching}
                  className="btn-primary btn-sm shrink-0 text-xs"
                >
                  {switching ? <Spinner size={13} /> : <>Switch <ArrowRight size={12} /></>}
                </button>
              )}
            </div>
          )}

          {!step.asEmail && step.as && (
            <p className="mt-3 text-xs font-semibold text-ink-500">As: {step.as}</p>
          )}

          {/* Instructions */}
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex gap-2.5">
              <dt className="shrink-0 w-10 text-[11px] font-bold uppercase tracking-wide text-ink-400 pt-0.5">Go</dt>
              <dd className="text-ink-700 leading-snug">{step.go}</dd>
            </div>
            <div className="flex gap-2.5">
              <dt className="shrink-0 w-10 text-[11px] font-bold uppercase tracking-wide text-ink-400 pt-0.5">Do</dt>
              <dd className="text-ink-900 font-medium leading-snug">{step.do}</dd>
            </div>
          </dl>

          {step.why && (
            <p className="mt-3 pt-3 border-t border-ink-100 text-xs text-ink-500 leading-relaxed">
              {step.why}
            </p>
          )}

          {step.tip && (
            <div className="mt-2.5 flex gap-2 p-2.5 rounded-lg bg-brand-50">
              <Lightbulb size={14} className="text-brand-600 shrink-0 mt-0.5" />
              <p className="text-xs text-brand-900 leading-relaxed">{step.tip}</p>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              className="btn-ghost btn-sm px-2.5"
              aria-label="Previous step"
            >
              <ChevronLeft size={16} />
            </button>

            {index < TOTAL_STEPS - 1 ? (
              <button onClick={() => setIndex((i) => i + 1)} className="btn-dark btn-sm flex-1">
                Done — next step <ChevronRight size={15} />
              </button>
            ) : (
              <button
                onClick={() => { setIndex(0); setOpen(false); toast.success('Walkthrough finished'); }}
                className="btn-primary btn-sm flex-1"
              >
                <Check size={15} /> Finish
              </button>
            )}

            <button
              onClick={() => setIndex(0)}
              className="btn-ghost btn-sm px-2.5"
              aria-label="Start over"
              title="Start over"
            >
              <RotateCcw size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
