import Link from "next/link";
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
 * mode keeps just a bare logo, not the full SiteNav. */
export function PartnershipPageShell({ children, minimal = false }: { children: React.ReactNode; minimal?: boolean }) {
  return (
    <div className="min-h-screen bg-hp-ink">
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
  );
}
