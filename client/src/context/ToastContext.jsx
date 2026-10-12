import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X, WifiOff } from 'lucide-react';

const ToastContext = createContext(null);

const TONES = {
  success: { icon: CheckCircle2, cls: 'bg-ink-900 text-ink-50', iconCls: 'text-success' },
  error: { icon: AlertCircle, cls: 'bg-danger text-white', iconCls: 'text-white' },
  info: { icon: Info, cls: 'bg-ink-900 text-ink-50', iconCls: 'text-brand-400' },
  offline: { icon: WifiOff, cls: 'bg-ink-700 text-ink-50', iconCls: 'text-brand-400' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message, tone = 'info', duration = 3200) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev.slice(-2), { id, message, tone }]);
      if (duration) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  const toast = {
    success: (m, d) => push(m, 'success', d),
    error: (m, d) => push(m, 'error', d ?? 4200),
    info: (m, d) => push(m, 'info', d),
    offline: (m, d) => push(m, 'offline', d),
  };

  // Surface sync results from the offline engine without every screen wiring
  // up its own listener.
  useEffect(() => {
    const onSynced = (e) => {
      const { synced, failed } = e.detail || {};
      if (synced) {
        toast.success(
          `${synced} queued ${synced === 1 ? 'action' : 'actions'} synced`
        );
      }
      if (failed) toast.error(`${failed} queued ${failed === 1 ? 'action' : 'actions'} could not be synced`);
    };
    window.addEventListener('madad:synced', onSynced);
    return () => window.removeEventListener('madad:synced', onSynced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed left-0 right-0 z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none"
           style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)' }}>
        {toasts.map((t) => {
          const { icon: Icon, cls, iconCls } = TONES[t.tone] || TONES.info;
          return (
            <div
              key={t.id}
              role="status"
              className={`${cls} pointer-events-auto flex items-center gap-2.5 w-full max-w-sm
                          px-4 py-3 rounded-2xl shadow-lift animate-slide-up`}
            >
              <Icon size={18} className={`${iconCls} shrink-0`} />
              <span className="text-sm font-medium flex-1">{t.message}</span>
              <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="opacity-60 hover:opacity-100">
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

export default ToastContext;
