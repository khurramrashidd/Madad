import { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * Bottom sheet. The right modal shape for a thumb on a phone — dialogs
 * centred on screen are a desktop habit.
 */
export default function Sheet({ open, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    // Stop the page behind scrolling while the sheet is up.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink-950/50 animate-fade-in" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-surface rounded-t-3xl shadow-lift animate-slide-up
                      max-h-[90vh] flex flex-col">
        <div className="shrink-0 pt-3 pb-1 grid place-items-center">
          <div className="w-10 h-1 rounded-full bg-ink-200" />
        </div>

        {title && (
          <div className="shrink-0 flex items-center justify-between px-5 pb-3">
            <h2 className="font-display font-bold text-lg">{title}</h2>
            <button onClick={onClose} aria-label="Close" className="p-1.5 -mr-1.5 rounded-lg text-ink-400 hover:bg-ink-100">
              <X size={20} />
            </button>
          </div>
        )}

        <div className="overflow-y-auto px-5 pb-2 flex-1">{children}</div>

        {footer && <div className="shrink-0 p-5 pt-3 border-t border-ink-100 safe-bottom">{footer}</div>}
      </div>
    </div>
  );
}
