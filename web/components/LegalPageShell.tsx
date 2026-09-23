import Link from "next/link";

/** Shared chrome for the public Contact/Terms/Privacy pages — same dark editorial theme (Barlow
 * Condensed, hp-* tokens, the real vectorized logo) as the homepage and PartnershipPageShell, plus
 * a footer that cross-links the three so a visitor on any one can reach the others. The logo links
 * to / (the actual homepage) rather than /login, matching every other public shell — /login is now
 * a lean sign-in-only page, not the site's front door. */
export function LegalPageShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-hp-ink">
      <div className="flex items-center justify-between px-6 sm:px-10 py-4 max-w-3xl mx-auto">
        <Link href="/" className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- small static logo mark, next/image is overkill */}
          <img src="/hp-logo.svg" alt="CRIC HQ" width={36} height={36}
            style={{ height: 36, width: "auto", objectFit: "contain", mixBlendMode: "screen" }} />
        </Link>
        <div className="flex items-center gap-5">
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
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 sm:px-10 pb-20">
        <h1 className="font-display font-black uppercase text-3xl text-hp-paper mt-6 mb-8">{title}</h1>
        <div className="text-sm text-hp-paper/72 leading-relaxed space-y-5">
          {children}
        </div>
      </div>

      <div className="border-t border-white/8">
        <div className="max-w-3xl mx-auto px-6 sm:px-10 py-6 flex flex-col items-end gap-2 text-sm text-hp-paper/52">
          <div className="flex flex-wrap justify-end gap-5 font-mono text-xs uppercase tracking-wider">
            <Link href="/about" className="hover:text-hp-paper transition-colors">About</Link>
            <Link href="/organisations" className="hover:text-hp-paper transition-colors">Organisations</Link>
            <Link href="/partnerships/cricket-board" className="hover:text-hp-paper transition-colors">Cricket Board Partnership</Link>
            <Link href="/contact" className="hover:text-hp-paper transition-colors">Contact</Link>
            <Link href="/terms" className="hover:text-hp-paper transition-colors">Terms &amp; Conditions</Link>
            <Link href="/privacy" className="hover:text-hp-paper transition-colors">Privacy</Link>
          </div>
          <p className="text-right text-xs text-hp-paper/30 font-mono">
            Copyright © {new Date().getFullYear()} CRIC HQ PTY LTD. All rights reserved. Design &amp; Developed by Kaus Milestone Pty Ltd
          </p>
        </div>
      </div>
    </div>
  );
}
