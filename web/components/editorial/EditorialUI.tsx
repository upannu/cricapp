import Link from "next/link";

/** Shared visual primitives for the public marketing site's editorial style (the "Cricket.
 * Connected." homepage look — Barlow Condensed headlines, hp-* color tokens, pill buttons, dash
 * eyebrows). Used by every page wrapped in PartnershipPageShell/LegalPageShell so the whole public
 * site reads as one system instead of each page hand-rolling its own button/heading markup. */

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="block w-6 h-px bg-hp-cg/50 flex-shrink-0" />
      <span className="font-mono text-[10px] tracking-[0.3em] text-hp-paper/52 uppercase">{children}</span>
    </div>
  );
}

export function EditorialButton({
  href, children, variant = "primary", size = "md",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  size?: "md" | "lg";
}) {
  const padding = size === "lg" ? "px-10 py-4 text-sm" : "px-7 py-3 text-sm";
  const base = `inline-block ${padding} font-display font-black tracking-[0.12em] uppercase transition-colors`;
  const variantCls =
    variant === "primary"
      ? "bg-hp-cg text-hp-paper hover:bg-hp-cg/90"
      : "border border-white/25 text-hp-paper hover:bg-white/4 hover:border-white/40";
  return (
    <Link href={href} className={`${base} ${variantCls}`}>
      {children}
    </Link>
  );
}

export function EditorialHeading({
  children, size = "md", level = "h2",
}: {
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  /** The hero headline on each page should be the page's one real h1; every section heading
   * below it stays h2, so page structure remains one-h1-per-page even though they all share
   * this same visual component. */
  level?: "h1" | "h2";
}) {
  const style =
    size === "lg" ? { fontSize: "clamp(44px, 6vw, 80px)" }
    : size === "sm" ? { fontSize: "clamp(28px, 3.2vw, 40px)" }
    : { fontSize: "clamp(36px, 4.5vw, 58px)" };
  const className = "font-display font-black uppercase text-hp-paper leading-[0.95]";
  if (level === "h1") return <h1 className={className} style={style}>{children}</h1>;
  return <h2 className={className} style={style}>{children}</h2>;
}

/** Hairline-divided grid cell — replaces the old rounded/filled card pattern with the editorial
 * site's thin-divider grid treatment (see the homepage's pillar/audience sections). */
export function EditorialCell({
  title, body, first = false,
}: {
  title: string;
  body: string;
  first?: boolean;
}) {
  return (
    <div className={`p-6 ${first ? "" : "border-l border-white/8"}`}>
      <p className="font-display font-black text-hp-paper uppercase text-base mb-2">{title}</p>
      <p className="text-hp-paper/65 text-sm leading-relaxed">{body}</p>
    </div>
  );
}

/** A full hairline-divided capability/feature grid — the pattern repeated across every
 * organisation/program landing page (2, 3, or 4 columns depending on item count). */
export function CapabilityGrid({
  items, cols = 3,
}: {
  items: { title: string; body: string }[];
  cols?: 2 | 3 | 4;
}) {
  const colsCls = cols === 2 ? "sm:grid-cols-2" : cols === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3";
  return (
    <div className={`grid grid-cols-1 ${colsCls} border-t border-l border-white/8`}>
      {items.map((item) => (
        <div key={item.title} className="border-b border-r border-white/8">
          <EditorialCell title={item.title} body={item.body} first />
        </div>
      ))}
    </div>
  );
}
