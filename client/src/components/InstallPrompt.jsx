import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

const DISMISS_KEY = 'madad_install_dismissed';

/**
 * Add-to-homescreen nudge. Chrome fires beforeinstallprompt only when the PWA
 * criteria are met (manifest, service worker, HTTPS or localhost), so this
 * appearing at all is itself proof the app is installable.
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try { dismissed = localStorage.getItem(DISMISS_KEY) === '1'; } catch { /* private mode */ }
    if (dismissed) return;

    // In demo builds the guide and account switcher already occupy the
    // bottom of the screen; a third floating card there is just clutter.
    if (__DEMO_TOOLS__) return;

    // Already installed — nothing to prompt.
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if (window.Capacitor?.isNativePlatform?.()) return;

    const onPrompt = (e) => {
      e.preventDefault();
      setDeferred(e);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', () => setVisible(false));
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
  };

  const dismiss = () => {
    setVisible(false);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
  };

  if (!visible) return null;

  return (
    <div className="fixed left-4 right-4 z-40 animate-slide-up"
         style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 4.75rem)' }}>
      <div className="card p-3.5 flex items-center gap-3 shadow-lift max-w-lg mx-auto">
        <div className="w-10 h-10 rounded-xl bg-brand-600 grid place-items-center shrink-0">
          <span className="font-display font-extrabold text-white">M</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">Install Madad</p>
          <p className="text-xs text-ink-500">Works offline once installed</p>
        </div>
        <button onClick={install} className="btn-primary btn-sm shrink-0">
          <Download size={14} /> Install
        </button>
        <button onClick={dismiss} className="p-1 text-ink-400 shrink-0" aria-label="Dismiss">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
