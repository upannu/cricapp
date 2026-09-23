import Link from "next/link";
import { EditorialButton } from "@/components/editorial/EditorialUI";

/** Shared header/footer chrome for the public Cricket Board Partnership pages (landing, apply,
 * success), the Organisations hub, and the specialist program pages — same dark editorial theme
 * as the homepage (Barlow Condensed, hp-* tokens, the real vectorized logo) and as LegalPageShell,
 * but a full-width content slot rather than LegalPageShell's narrow single-column prose layout,
 * since these pages need a proper hero + card-grid marketing layout, not an article. The logo
 * links to / (the actual homepage), not any one of these pages. `minimal` drops the nav/footer for
 * the multi-step application form, where a visitor mid-form shouldn't be tempted away by unrelated
 * links. */
export function PartnershipPageShell({ children, minimal = false }: { children: React.ReactNode; minimal?: boolean }) {
  return (
    <div className="min-h-screen bg-hp-ink">
      <div className="flex items-center justify-between px-6 sm:px-10 py-4 max-w-6xl mx-auto">
        <Link href="/" className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- small static logo mark, next/image is overkill */}
          <img src="/hp-logo.svg" alt="CRIC HQ" width={40} height={40}
            style={{ height: 40, width: "auto", objectFit: "contain", mixBlendMode: "screen" }} />
        </Link>
        {!minimal && (
          <div className="flex items-center gap-6">
            <Link href="/about" className="font-mono text-xs tracking-[0.2em] text-hp-paper/72 hover:text-hp-paper uppercase transition-colors">
              About
            </Link>
            <Link href="/organisations" className="font-mono text-xs tracking-[0.2em] text-hp-paper/72 hover:text-hp-paper uppercase transition-colors">
              Organisations
            </Link>
            <Link href="/login" className="font-mono text-xs tracking-[0.2em] text-hp-paper/72 hover:text-hp-paper uppercase transition-colors">
              Login
            </Link>
            <Link href="/contact" className="font-mono text-xs tracking-[0.2em] text-hp-paper/72 hover:text-hp-paper uppercase transition-colors">
              Contact
            </Link>
            <EditorialButton href="/signup" size="md">Get Started</EditorialButton>
          </div>
        )}
      </div>

      {children}

      {!minimal && (
        <div className="border-t border-white/8">
          <div className="max-w-6xl mx-auto px-6 sm:px-10 py-6 flex flex-col items-end gap-2 text-sm text-hp-paper/52">
            <div className="flex flex-wrap justify-end gap-5 font-mono text-xs uppercase tracking-wider">
              <Link href="/about" className="hover:text-hp-paper transition-colors">About</Link>
              <Link href="/organisations" className="hover:text-hp-paper transition-colors">Organisations</Link>
              <Link href="/contact" className="hover:text-hp-paper transition-colors">Contact</Link>
              <Link href="/terms" className="hover:text-hp-paper transition-colors">Terms &amp; Conditions</Link>
              <Link href="/privacy" className="hover:text-hp-paper transition-colors">Privacy</Link>
            </div>
            <p className="text-right text-xs text-hp-paper/30 font-mono">
              Copyright © {new Date().getFullYear()} CRIC HQ PTY LTD. All rights reserved. Design &amp; Developed by Kaus Milestone Pty Ltd
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
