import { useState } from 'react';
import { WifiOff, RefreshCw, CloudUpload } from 'lucide-react';
import { useOffline } from '../context/OfflineContext.jsx';

/**
 * Persistent connectivity strip. Offline is a normal state in this app, not an
 * error — so it is reported calmly and always says what will happen next.
 */
const isNative = () => Boolean(window.Capacitor?.isNativePlatform?.());

export default function OfflineBanner() {
  const { offline, reason, queueCount, syncing, sync, verifyOnline } = useOffline();
  const [checking, setChecking] = useState(false);

  if (!offline && !queueCount && !syncing) return null;

  if (offline) {
    const serverDown = reason === 'server' || isNative();
    const retry = async () => {
      setChecking(true);
      if (await verifyOnline()) sync();
      setChecking(false);
    };
    return (
      <div className="bg-ink-800 text-ink-50 px-4 py-2 text-sm animate-slide-up">
        <div className="flex items-center gap-2">
          <WifiOff size={15} className="text-brand-400 shrink-0" />
          <span className="font-medium shrink-0">{serverDown ? 'Can\u2019t reach Madad' : 'Offline'}</span>
          <span className="text-ink-300 truncate">
            {queueCount > 0
              ? `— ${queueCount} ${queueCount === 1 ? 'action' : 'actions'} will send when you reconnect`
              : '— showing your last saved feed'}
          </span>
          <button onClick={retry} disabled={checking}
                  className="ml-auto shrink-0 flex items-center gap-1 font-semibold text-brand-300 disabled:opacity-60">
            <RefreshCw size={13} className={checking ? 'animate-spin' : ''} /> Retry
          </button>
        </div>
        {serverDown && (
          <p className="text-xs text-ink-300 mt-1 leading-snug">
            {isNative()
              ? 'Keep npm start running on the laptop, and either keep the USB cable in or join the same Wi-Fi as the laptop.'
              : 'The Madad server is not answering. Is npm start still running on the laptop?'}
          </p>
        )}
      </div>
    );
  }

  if (syncing) {
    return (
      <div className="bg-info text-white px-4 py-2 flex items-center gap-2 text-sm">
        <RefreshCw size={15} className="animate-spin shrink-0" />
        <span className="font-medium">Syncing your queued actions…</span>
      </div>
    );
  }

  return (
    <button onClick={sync} className="w-full bg-brand-600 text-white px-4 py-2 flex items-center gap-2 text-sm">
      <CloudUpload size={15} className="shrink-0" />
      <span className="font-semibold">
        {queueCount} {queueCount === 1 ? 'action' : 'actions'} waiting
      </span>
      <span className="ml-auto underline underline-offset-2 font-medium">Send now</span>
    </button>
  );
}
