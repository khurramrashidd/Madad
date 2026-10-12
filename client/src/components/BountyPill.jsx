/** The ₹ bounty. The one place amber is used — money, and only money. */
export default function BountyPill({ amount, boosted = false, size = 'md' }) {
  const cls =
    size === 'lg'
      ? 'text-xl px-3.5 py-1.5'
      : size === 'sm'
      ? 'text-sm px-2.5 py-0.5'
      : 'text-base px-3 py-1';
  return (
    <span className={`pill-money font-display ${cls}`}>
      ₹{amount}
      {boosted && <span className="text-[10px] font-sans font-bold text-money-600">↑ boosted</span>}
    </span>
  );
}
