export function ComingSoonPage({
  title,
  description,
  features,
}: {
  title: string;
  description: string;
  features: string[];
}) {
  return (
    <div className="max-w-2xl mx-auto px-6 py-20 text-center">
      {/* Icon */}
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-surface mb-6">
        <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
          <path
            d="M3 26 L9 17 L15 19.5 L21 9 L27 13"
            stroke="#00D4AA"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="27" cy="13" r="2.5" fill="#FF6B2B" />
        </svg>
      </div>

      {/* Badge */}
      <div className="inline-flex items-center gap-2 bg-pace-green/10 border border-pace-green/20 rounded-full px-4 py-1.5 mb-6">
        <span className="w-1.5 h-1.5 rounded-full bg-pace-green animate-pulse" />
        <span className="text-pace-green text-xs font-semibold uppercase tracking-wider">
          Coming Soon
        </span>
      </div>

      <h1 className="text-3xl font-bold text-white mb-4">{title}</h1>
      <p className="text-zinc-400 text-base leading-relaxed mb-10">
        {description}
      </p>

      {/* Features list */}
      <div className="bg-surface rounded-2xl p-6 text-left">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-4">
          What&apos;s included
        </p>
        <ul className="space-y-3">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-3">
              <span className="mt-0.5 text-pace-green text-sm">✓</span>
              <span className="text-zinc-300 text-sm">{f}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
