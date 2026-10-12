import { BADGE_META } from '../utils/constants.js';

/**
 * Trust score chip. The score is the product's entire enforcement mechanism,
 * so it is shown everywhere a person appears.
 */
export default function TrustBadge({ score, badge, size = 'sm', showScore = true }) {
  const meta = BADGE_META[badge] || BADGE_META.newcomer;
  const pad = size === 'lg' ? 'px-3 py-1.5 text-sm' : 'px-2 py-0.5 text-xs';

  return (
    <span className={`chip ${meta.tone} ${pad}`} title={`Trust score: ${score}/100`}>
      <span aria-hidden="true">{meta.icon}</span>
      <span className="font-semibold">{meta.label}</span>
      {showScore && score != null && <span className="opacity-70 tabular-nums">{score}</span>}
    </span>
  );
}
