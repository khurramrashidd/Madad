import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * Back arrow plus title, for the full-screen pages that sit outside the tabs.
 *
 * Several pages had hand-rolled copies of this with slightly different
 * padding and icon sizes. One component means the back button is in the same
 * place on every screen, which is the kind of consistency people notice only
 * when it is missing.
 */
export default function PageHeader({ title, subtitle, action, fallbackTo = '/' }) {
  const navigate = useNavigate();

  const goBack = () => {
    // A deep link opened directly has no history to go back to; land on the
    // feed rather than leaving the user on a dead screen.
    if (window.history.length > 1) navigate(-1);
    else navigate(fallbackTo, { replace: true });
  };

  return (
    <header className="shrink-0 bg-surface border-b border-ink-100 safe-top px-4 py-3">
      <div className="flex items-center gap-3">
        <button
          onClick={goBack}
          className="p-1.5 -ml-1.5 rounded-lg text-ink-500 hover:bg-ink-100 shrink-0"
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-display font-bold text-lg text-ink-900 truncate">{title}</h1>
          {subtitle && <p className="text-[11.5px] text-ink-500 truncate">{subtitle}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}
