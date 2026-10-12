import { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import { Copy, Check, ExternalLink, AlertTriangle } from 'lucide-react';
import Spinner from './Spinner.jsx';

/**
 * UPI payment handshake.
 *
 * No gateway, no escrow, no PCI scope. We render a standard UPI intent URI as
 * a QR code; the wisher scans it with their own bank app and the money goes
 * straight to the volunteer. Madad never sees or holds a rupee — which is
 * exactly why it needs no payment licence.
 */
export default function UpiQr({ payment, onPaid, paying = false, alreadyPaid = false }) {
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [copied, setCopied] = useState(null);
  const [qrError, setQrError] = useState(false);
  const copyTimer = useRef(null);

  useEffect(() => {
    if (!payment?.ready || !payment.uri) return;
    let alive = true;

    QRCode.toDataURL(payment.uri, {
      width: 480,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#1C1917', light: '#FFFFFF' },
    })
      .then((url) => alive && setQrDataUrl(url))
      .catch(() => alive && setQrError(true));

    return () => {
      alive = false;
    };
  }, [payment]);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const copy = async (text, which) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API needs a secure context; fall back to the old trick.
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      try { document.execCommand('copy'); } catch { /* give up quietly */ }
      document.body.removeChild(el);
    }
    setCopied(which);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(null), 1800);
  };

  if (!payment) {
    return (
      <div className="grid place-items-center py-10">
        <Spinner size={24} className="text-brand-500" />
      </div>
    );
  }

  if (!payment.ready) {
    return (
      <div className="card p-5 text-center border-danger/20 bg-danger/5">
        <AlertTriangle className="mx-auto text-danger mb-2" size={24} />
        <p className="font-semibold text-ink-800">Cannot generate the QR yet</p>
        <p className="text-sm text-ink-600 mt-1">{payment.reason}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card p-5 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Pay directly to</p>
        <p className="font-display font-bold text-lg mt-0.5">{payment.payeeName}</p>
        <p className="font-display font-bold text-4xl text-brand-600 tabular-nums mt-2">
          ₹{payment.amount}
        </p>

        <div className="my-4 grid place-items-center">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={`UPI QR code to pay ₹${payment.amount} to ${payment.payeeName}`}
              className="w-56 h-56 rounded-2xl border-4 border-ink-100"
            />
          ) : qrError ? (
            <div className="w-56 h-56 rounded-2xl border-4 border-ink-100 grid place-items-center text-sm text-ink-500 p-4">
              Could not draw the QR. Use the UPI ID below instead.
            </div>
          ) : (
            <div className="w-56 h-56 skeleton rounded-2xl" />
          )}
        </div>

        <p className="text-sm text-ink-500 leading-relaxed">
          Scan with GPay, PhonePe, Paytm or any UPI app.
          <br />
          <span className="text-xs">Madad never holds your money — this pays them directly.</span>
        </p>
      </div>

      {/* Manual fallback, because scanning a screen from a screen often fails. */}
      <div className="card p-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Or pay manually</p>

        <button
          onClick={() => copy(payment.manual.upiId, 'upi')}
          className="w-full flex items-center justify-between gap-2 p-3 rounded-xl bg-ink-50 active:scale-[0.99] transition-transform"
        >
          <div className="text-left min-w-0">
            <p className="text-[11px] text-ink-400 font-medium">UPI ID</p>
            <p className="font-mono text-sm font-semibold truncate">{payment.manual.upiId}</p>
          </div>
          {copied === 'upi' ? <Check size={18} className="text-success shrink-0" /> : <Copy size={18} className="text-ink-400 shrink-0" />}
        </button>

        <a
          href={payment.uri}
          className="btn-outline btn-md w-full"
          // On Android this fires the UPI app chooser directly.
        >
          <ExternalLink size={16} />
          Open in a UPI app
        </a>
      </div>

      {onPaid && (
        <button onClick={onPaid} disabled={paying || alreadyPaid} className="btn-primary btn-lg w-full">
          {paying ? <Spinner size={18} /> : null}
          {alreadyPaid ? 'Waiting for them to confirm…' : `I have paid ₹${payment.amount}`}
        </button>
      )}

      {alreadyPaid && (
        <p className="text-xs text-center text-ink-500 leading-relaxed px-4">
          The task settles once the volunteer confirms they received it.
          Both sides have to agree — that is what keeps trust scores honest.
        </p>
      )}
    </div>
  );
}
