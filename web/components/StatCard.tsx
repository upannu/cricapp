// The "label over value" stat-card shape, left-aligned with a large text-3xl number — this was
// Players' own distinct look; every other page instead used a centered "value over label" shape
// (five near-identical copies of the same function, plus two pages inlining the same markup raw).
// Now that this is the one shared component, every list page's stat strip renders identically —
// Players included, migrated onto this component rather than kept as a one-off. Optional
// `onClick` turns a card into a filter shortcut (e.g. "Expiring in 7 Days" jumping straight to
// that status filter) rather than a dead number; `active` highlights it when the filter it links
// to is the one currently applied.
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
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
    </>
  );

  if (!onClick) {
    return <div className="bg-surface rounded-2xl p-4">{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`bg-surface rounded-2xl p-4 text-left transition-colors cursor-pointer hover:bg-white/5 ${
        active ? "ring-1 ring-pace-green" : ""
      }`}
    >
      {content}
    </button>
  );
}
