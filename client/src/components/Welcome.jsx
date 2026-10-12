import { useState } from 'react';
import { ArrowRight, X } from 'lucide-react';

const KEY = 'madad_welcome_seen';

const seen = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};
const markSeen = () => {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* private mode */
  }
};

const CARDS = [
  {
    emoji: '🙋',
    title: 'Someone needs a small favour',
    body: 'A student posts a quick local task — collect my printouts, help me shift a box — and attaches a small cash bounty.',
  },
  {
    emoji: '⚡',
    title: 'A neighbour accepts it',
    body: 'The task appears instantly on nearby phones. The first person to accept it gets it, and it disappears from everyone else\'s feed.',
  },
  {
    emoji: '🔢',
    title: 'A code proves they met',
    body: 'When the job is done, the poster shows a 4-digit code and the helper types it in. You cannot fake a completion you never turned up for.',
  },
  {
    emoji: '🤝',
    title: 'They pay each other directly',
    body: 'A UPI QR code appears and the money goes bank to bank. Madad never holds a rupee — so there is no commission and no payment licence.',
  },
];

/**
 * First-run explainer.
 *
 * Madad has an unusual shape — two roles, a physical handshake, no escrow —
 * and dropping someone straight onto a feed of strangers' errands does not
 * explain any of it. Four cards, then out of the way for good.
 */
export default function Welcome({ onStartGuide }) {
  const [visible, setVisible] = useState(() => !seen());
  const [i, setI] = useState(0);

  if (!visible) return null;

  const close = (startGuide = false) => {
    markSeen();
    setVisible(false);
    if (startGuide) onStartGuide?.();
  };

  const card = CARDS[i];
  const last = i === CARDS.length - 1;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-5" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm animate-fade-in" />

      <div className="relative w-full max-w-sm bg-surface rounded-3xl shadow-lift animate-pop-in overflow-hidden">
        <button
          onClick={() => close(false)}
          aria-label="Skip"
          className="absolute top-3 right-3 p-1.5 rounded-lg text-ink-400 hover:bg-ink-100 z-10"
        >
          <X size={18} />
        </button>

        <div className="px-6 pt-10 pb-6 text-center">
          <div className="text-5xl mb-4" aria-hidden="true">{card.emoji}</div>
          <h2 className="font-display font-bold text-xl leading-snug">{card.title}</h2>
          <p className="text-sm text-ink-600 mt-2.5 leading-relaxed">{card.body}</p>
        </div>

        {/* Dots */}
        <div className="flex justify-center gap-1.5 pb-5">
          {CARDS.map((_, n) => (
            <button
              key={n}
              onClick={() => setI(n)}
              aria-label={`Card ${n + 1}`}
              className={`h-1.5 rounded-full transition-all ${n === i ? 'w-5 bg-brand-500' : 'w-1.5 bg-ink-200'}`}
            />
          ))}
        </div>

        <div className="px-5 pb-5 space-y-2">
          {last ? (
            <button onClick={() => close(false)} className="btn-primary btn-lg w-full">
              Get started <ArrowRight size={17} />
            </button>
          ) : (
            <>
              <button onClick={() => setI(i + 1)} className="btn-primary btn-lg w-full">
                Next <ArrowRight size={17} />
              </button>
              <button onClick={() => close(false)} className="btn-ghost btn-md w-full">
                Skip
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
