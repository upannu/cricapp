// The centered "value over label" stat-card shape was already identical across six of the seven
// list pages (Bookings/Sessions/Reports/Session Packs each defined their own copy of this exact
// function; Coaches/Academy inlined the same markup raw) — one shared component instead of five
// near-duplicates. Optional `onClick` turns a card into a filter shortcut (e.g. "Expiring in 7
// Days" jumping straight to that status filter) rather than a dead number; `active` highlights it
// when the filter it links to is the one currently applied.
export function StatCard({
  label, value, color = "text-white", onClick, active,
}: {
  label: string;
  value: string | number;
  color?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const content = (
    <>
      <div className={`text-2xl font-bold mb-1 ${color}`}>{value}</div>
      <div className="text-xs text-zinc-400">{label}</div>
    </>
  );

  if (!onClick) {
    return <div className="bg-surface rounded-2xl p-5 text-center">{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`bg-surface rounded-2xl p-5 text-center transition-colors cursor-pointer hover:bg-white/5 ${
        active ? "ring-1 ring-pace-green" : ""
      }`}
    >
      {content}
    </button>
  );
}
