import Link from "next/link";
import Image from "next/image";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";

/** Shared header/footer chrome for the public Cricket Board Partnership pages (landing, apply,
 * success), the Organisations hub, and the specialist program pages — same dark editorial theme
 * as the homepage (Barlow Condensed, hp-* tokens, the real vectorized logo) and as LegalPageShell,
 * but a full-width content slot rather than LegalPageShell's narrow single-column prose layout,
 * since these pages need a proper hero + card-grid marketing layout, not an article. Uses the same
 * SiteNav/SiteFooter as the homepage so neither visibly changes shape when a visitor clicks from
 * the homepage into one of these pages. `minimal` drops the nav/footer for the multi-step
 * application form, where a visitor mid-form shouldn't be tempted away by unrelated links — that
 * mode keeps just a bare logo, not the full SiteNav. `backgroundImage` (minimal mode only) gives
 * the form pages the same cricket-photo backdrop as their landing-page counterpart's PageHero, as
 * a fixed-height band pinned to the top rather than stretched across the full (variable-length)
 * page — `fill` over the whole scrollable height would force `object-cover` to zoom in hard on
 * tall single-column apply forms, blowing the photo up into an unrecognisable crop. The band fades
 * to flat hp-ink at its own bottom edge, so it reads as a hero photo the page scrolls past, not a
 * stretched backdrop. */
export function PartnershipPageShell({
  children, minimal = false, backgroundImage,
}: {
  children: React.ReactNode;
  minimal?: boolean;
  backgroundImage?: string;
}) {
  return (
    <div className="relative min-h-screen bg-hp-ink">
      {minimal && backgroundImage && (
        <div className="absolute inset-x-0 top-0 h-[620px] overflow-hidden">
          <Image src={backgroundImage} alt="" aria-hidden="true" fill priority sizes="100vw"
            className="object-cover object-center opacity-60" />
          <div className="absolute inset-0 bg-gradient-to-b from-hp-ink/35 via-hp-ink/55 to-hp-ink" />
        </div>
      )}

      <div className="relative">
        {minimal ? (
          <div className="flex items-center px-6 sm:px-10 py-4 max-w-6xl mx-auto">
            <Link href="/" className="flex items-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- small static logo mark, next/image is overkill */}
              <img src="/hp-logo.svg" alt="CRIC HQ" width={40} height={40}
                style={{ height: 40, width: "auto", objectFit: "contain", mixBlendMode: "screen" }} />
            </Link>
          </div>
        ) : (
          <SiteNav />
        )}

        <div className={minimal ? undefined : "pt-[84px]"}>
          {children}
        </div>

        {!minimal && <SiteFooter />}
      </div>
    </div>
  );
}
