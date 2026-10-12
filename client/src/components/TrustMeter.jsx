/** Horizontal trust gauge with the restriction threshold marked. */
export default function TrustMeter({ score = 0, restrictBelow = 40 }) {
  const tone =
    score < restrictBelow ? 'bg-danger'
      : score < 60 ? 'bg-brand-500'
      : score < 80 ? 'bg-info'
      : 'bg-success';

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm font-semibold text-ink-600">Trust score</span>
        <span className="text-2xl font-display font-bold tabular-nums">{score}<span className="text-sm text-ink-400 font-sans font-medium">/100</span></span>
      </div>

      <div className="relative h-2.5 bg-ink-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${tone} rounded-full transition-all duration-700 ease-out`}
          style={{ width: `${Math.max(2, score)}%` }}
        />
      </div>

      {/* Threshold marker — makes the consequence legible at a glance. */}
      <div className="relative h-4 mt-0.5">
        <div className="absolute flex flex-col items-center -translate-x-1/2" style={{ left: `${restrictBelow}%` }}>
          <div className="w-px h-1.5 bg-ink-300" />
          <span className="text-[10px] text-ink-400 font-medium whitespace-nowrap">restricted below {restrictBelow}</span>
        </div>
      </div>
    </div>
  );
}
