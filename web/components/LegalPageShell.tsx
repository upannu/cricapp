import Image from "next/image";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";

/** Shared chrome for the public Contact/About/Terms/Privacy pages — same dark editorial theme
 * (Barlow Condensed, hp-* tokens, the real vectorized logo) as the homepage and
 * PartnershipPageShell. Uses the same SiteNav/SiteFooter as every other public shell so neither
 * changes shape between pages. `backgroundImage` is deliberately opt-in and kept to a short band
 * (480px, fully faded to flat ink) rather than the taller bands used elsewhere — these pages are
 * dense prose/a form, not a short centered hero, so the photo needs to hand off to flat ink before
 * any body text or form field reaches it. Terms/Privacy intentionally never pass one: a photo
 * behind a legal document reads as a design mistake, not a feature. */
export function LegalPageShell({
  title, children, backgroundImage,
}: {
  title: string;
  children: React.ReactNode;
  backgroundImage?: string;
}) {
  return (
    <div className="relative min-h-screen bg-hp-ink">
      {backgroundImage && (
        <div className="absolute inset-x-0 top-0 h-[480px] overflow-hidden">
          <Image src={backgroundImage} alt="" aria-hidden="true" fill priority sizes="100vw"
            className="object-cover object-center opacity-55" />
          <div className="absolute inset-0 bg-gradient-to-b from-hp-ink/40 via-hp-ink/60 to-hp-ink" />
        </div>
      )}

      <div className="relative">
        <SiteNav />

        <div className="max-w-3xl mx-auto px-6 sm:px-10 pb-20 pt-[108px]">
          <h1 className="font-display font-black uppercase text-3xl text-hp-paper mt-6 mb-8">{title}</h1>
          <div className="text-sm text-hp-paper/72 leading-relaxed space-y-5">
            {children}
          </div>
        </div>

        <SiteFooter />
      </div>
    </div>
  );
}
