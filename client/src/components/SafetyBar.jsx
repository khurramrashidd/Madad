import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ShieldAlert, Share2, Phone, Copy, Check, X, CircleStop, MapPin, Info,
} from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import { useLocation as useGeo } from '../context/LocationContext.jsx';
import Sheet from './Sheet.jsx';
import Spinner from './Spinner.jsx';

/**
 * Safety controls for an active task — the moment the risk is real.
 *
 * This appears only between the claim and settlement, because that is the
 * window in which two people who have never met are arranging to meet. Before
 * then there is no one to meet; after it, the errand is done.
 *
 * Two actions, in order of how often they are the right one:
 *
 *   Share my trip — the overwhelmingly common case. Someone should know where
 *     you are *before* anything goes wrong. Produces a link to send on
 *     WhatsApp, and then reports position every 20 seconds.
 *
 *   SOS — for when something already has. Alerts the other party and the
 *     operator, and surfaces the two numbers worth dialling.
 *
 * Nothing here claims to summon help. The copy says exactly what happens,
 * because a user who over-trusts this button might delay calling 112.
 */
const REPORT_EVERY_MS = 20000;

export default function SafetyBar({ task }) {
  const { user } = useAuth();
  const toast = useToast();
  const { t } = useI18n();
  const { coords } = useGeo();

  const [shareOpen, setShareOpen] = useState(false);
  const [sosOpen, setSosOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState(null);
  const [copied, setCopied] = useState(false);
  const [sosResult, setSosResult] = useState(null);

  const reporter = useRef(null);
  const coordsRef = useRef(coords);
  coordsRef.current = coords;

  const shareUrl = share ? `${window.location.origin}/trip/${share.token}` : null;

  /**
   * While a share is live, push the position up on a timer.
   *
   * Driven by an interval reading a ref rather than by a `coords` effect: a
   * GPS watch can fire several times a second, and this would then hammer the
   * server with writes nobody is reading that fast.
   */
  const startReporting = useCallback((token) => {
    clearInterval(reporter.current);
    const send = () => {
      const c = coordsRef.current;
      if (!c) return;
      api.safety.reportPosition(token, c.lng, c.lat).catch(() => {
        // An expired or ended share 404s — stop rather than retry forever.
      });
    };
    send();
    reporter.current = setInterval(send, REPORT_EVERY_MS);
  }, []);

  useEffect(() => () => clearInterval(reporter.current), []);

  const beginShare = async () => {
    setBusy(true);
    try {
      const r = await api.safety.startTrip(task.id);
      setShare(r.share);
      startReporting(r.share.token);
      setShareOpen(true);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const stopShare = async () => {
    if (!share) return;
    clearInterval(reporter.current);
    try {
      await api.safety.endTrip(share.token);
    } catch {
      /* already expired server-side; nothing to undo */
    }
    setShare(null);
    setShareOpen(false);
    toast.success('Stopped sharing your trip');
  };

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success(t('safety.linkCopied'));
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard is blocked in some WebViews — the input below is
      // selectable, so there is still a way to get the link out.
      toast.error('Copy the link from the box below');
    }
  };

  const nativeShare = async () => {
    if (!shareUrl) return;
    // The share sheet is the real path on a phone: it reaches WhatsApp in one
    // tap, which is where this link is actually going.
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'My Madad trip',
          text: `I'm doing a Madad task. You can see where I am here:`,
          url: shareUrl,
        });
        return;
      } catch {
        /* user dismissed the sheet — fall through to copying */
      }
    }
    copyLink();
  };

  const raiseSos = async () => {
    setBusy(true);
    try {
      const r = await api.safety.sos(
        task.id,
        coords ? { lng: coords.lng, lat: coords.lat } : undefined
      );
      setSosResult(r);
      toast.success(t('safety.sosRaised'));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const contact = sosResult?.trustedContact || user?.trustedContact;

  return (
    <>
      <div className="card p-3">
        <div className="flex items-center gap-1.5 mb-2.5 px-0.5">
          <ShieldAlert size={13} className="text-ink-400" />
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-ink-400">
            {t('safety.title')}
          </p>
        </div>

        <div className="flex gap-2">
          {share ? (
            <button onClick={() => setShareOpen(true)} className="btn-outline btn-md flex-1 !border-info !text-info">
              <MapPin size={16} className="animate-pulse" />
              Sharing live
            </button>
          ) : (
            <button onClick={beginShare} disabled={busy} className="btn-outline btn-md flex-1">
              {busy ? <Spinner size={16} /> : <Share2 size={16} />}
              {t('safety.shareTrip')}
            </button>
          )}

          <button
            onClick={() => { setSosResult(null); setSosOpen(true); }}
            className="btn-danger btn-md px-5 shrink-0"
            aria-label={t('safety.sosTitle')}
          >
            <ShieldAlert size={16} />
            {t('safety.sos')}
          </button>
        </div>

        {!user?.hasTrustedContact && (
          <p className="hint">
            No emergency contact saved yet —{' '}
            <a href="/safety" className="text-brand-600 font-semibold underline">
              add one
            </a>{' '}
            so SOS can offer you a call.
          </p>
        )}
      </div>

      {/* ---- Trip sharing ---- */}
      <Sheet open={shareOpen} onClose={() => setShareOpen(false)} title={t('safety.shareTrip')}>
        <div className="space-y-4 pb-4">
          <p className="text-[12.5px] text-ink-600 leading-relaxed">{t('safety.shareTripBody')}</p>

          {shareUrl && (
            <>
              <div className="flex items-center gap-2 p-3 rounded-xl bg-ink-100">
                <MapPin size={15} className="text-info shrink-0 animate-pulse" />
                <p className="text-[12px] text-ink-600 flex-1">
                  Your position is being shared, updating every 20 seconds.
                </p>
              </div>

              <div>
                <label className="label" htmlFor="trip-link">
                  Your trip link
                </label>
                <input
                  id="trip-link"
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.target.select()}
                  className="input text-[12px] font-mono"
                />
              </div>

              <div className="flex gap-2">
                <button onClick={nativeShare} className="btn-primary btn-md flex-1">
                  <Share2 size={16} />
                  Send to someone
                </button>
                <button onClick={copyLink} className="btn-ghost btn-md px-4 shrink-0" aria-label={t('safety.copyLink')}>
                  {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                </button>
              </div>

              <button onClick={stopShare} className="btn-outline btn-md w-full !text-danger !border-ink-200">
                <CircleStop size={16} />
                {t('safety.endTrip')}
              </button>

              <div className="flex gap-2 p-3 rounded-xl bg-ink-100">
                <Info size={14} className="text-ink-500 shrink-0 mt-0.5" />
                <p className="text-[11.5px] text-ink-600 leading-relaxed">
                  Whoever has this link can see your position until you stop sharing, or for six
                  hours — whichever comes first. They do not need a Madad account. They cannot see
                  the bounty, the chat, or who you are meeting.
                </p>
              </div>
            </>
          )}
        </div>
      </Sheet>

      {/* ---- SOS ---- */}
      <Sheet
        open={sosOpen}
        onClose={() => setSosOpen(false)}
        title={sosResult ? t('safety.sosRaised') : t('safety.sosTitle')}
      >
        <div className="space-y-4 pb-4">
          {!sosResult ? (
            <>
              <p className="text-[12.5px] text-ink-600 leading-relaxed">{t('safety.sosBody')}</p>

              {/* The emergency call is offered first and unconditionally — it
                  does not depend on raising the alert, and it is the thing
                  that actually matters in an emergency. */}
              <a href="tel:112" className="btn-danger btn-lg w-full">
                <Phone size={18} />
                {t('safety.call112')}
              </a>

              <div className="pt-1">
                <button onClick={raiseSos} disabled={busy} className="btn-outline btn-md w-full">
                  {busy ? <Spinner size={16} /> : <ShieldAlert size={16} />}
                  {t('safety.sosConfirm')}
                </button>
                <p className="hint">
                  This notifies the other person and the Madad team. It does not contact the police.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="flex gap-2.5 p-3 rounded-xl bg-success/10">
                <Check size={16} className="text-success shrink-0 mt-0.5" />
                <p className="text-[12.5px] text-ink-700 leading-relaxed">
                  Alert raised. The other person and the Madad team have been told.
                </p>
              </div>

              <a href="tel:112" className="btn-danger btn-lg w-full">
                <Phone size={18} />
                {t('safety.call112')}
              </a>

              {contact?.phone && (
                <a href={`tel:${contact.phone}`} className="btn-outline btn-md w-full">
                  <Phone size={16} />
                  {t('safety.callContact', { name: contact.name || contact.phone })}
                </a>
              )}

              {sosResult.otherParty?.phone && (
                <a href={`tel:${sosResult.otherParty.phone}`} className="btn-ghost btn-md w-full">
                  <Phone size={16} />
                  Call {sosResult.otherParty.name}
                </a>
              )}

              <button onClick={() => setSosOpen(false)} className="btn-ghost btn-md w-full">
                <X size={16} />
                {t('common.close')}
              </button>
            </>
          )}
        </div>
      </Sheet>
    </>
  );
}
