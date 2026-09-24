import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";

/** Shared chrome for the public Contact/Terms/Privacy pages — same dark editorial theme (Barlow
 * Condensed, hp-* tokens, the real vectorized logo) as the homepage and PartnershipPageShell.
 * Uses the same SiteNav/SiteFooter as every other public shell so neither changes shape between
 * pages. */
export function LegalPageShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-hp-ink">
      <SiteNav />

      <div className="max-w-3xl mx-auto px-6 sm:px-10 pb-20 pt-[108px]">
        <h1 className="font-display font-black uppercase text-3xl text-hp-paper mt-6 mb-8">{title}</h1>
        <div className="text-sm text-hp-paper/72 leading-relaxed space-y-5">
          {children}
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
