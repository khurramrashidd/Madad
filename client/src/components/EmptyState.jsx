/** A dead end is a failure. Every empty screen names a next step. */
export default function EmptyState({ icon: Icon, title, message, action, tone = 'neutral' }) {
  const tones = {
    neutral: 'bg-ink-100 text-ink-400',
    brand: 'bg-brand-50 text-brand-600',
    danger: 'bg-danger/10 text-danger',
  };
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 animate-fade-in">
      {Icon && (
        <div className={`w-16 h-16 rounded-2xl grid place-items-center mb-4 ${tones[tone] || tones.neutral}`}>
          <Icon size={28} strokeWidth={1.9} />
        </div>
      )}
      <h3 className="font-display font-bold text-lg text-ink-900">{title}</h3>
      {message && <p className="text-sm text-ink-500 mt-1.5 max-w-xs leading-relaxed">{message}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
