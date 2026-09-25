// A labeled card of label/value rows — the shape every detail page's info grid is built from
// (first on PlayerProfileClient, now shared with CoachProfileClient too). Extracted once a second
// consumer needed the identical thing, rather than duplicating it a second time.
export function InfoCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-hp-surface border border-white/8 p-5">
      <h3 className="text-xs font-mono font-semibold uppercase tracking-widest text-hp-paper/45 mb-4">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-hp-paper/50 text-sm flex-shrink-0">{label}</span>
      <span className="text-hp-paper text-sm text-right">{value}</span>
    </div>
  );
}
