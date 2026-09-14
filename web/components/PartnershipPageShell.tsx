import Link from "next/link";

/** Shared header/footer chrome for the public Cricket Board Partnership pages (landing, apply,
 * success) — same dark theme/logo as LegalPageShell, but a full-width content slot rather than
 * LegalPageShell's narrow single-column prose layout, since these pages need a proper hero +
 * card-grid marketing layout, not an article. `minimal` drops the nav/footer for the multi-step
 * application form, where a visitor mid-form shouldn't be tempted away by unrelated links. */
export function PartnershipPageShell({ children, minimal = false }: { children: React.ReactNode; minimal?: boolean }) {
  return (
    <div className="min-h-screen bg-ink">
      <div className="flex items-center justify-between px-6 sm:px-10 py-4 max-w-6xl mx-auto">
        <Link href="/partnerships/cricket-board" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- small static badge, next/image is overkill */}
          <img src="/crichq_logo.jpeg" alt="CRIC HQ" width={32} height={32}
            className="w-8 h-8 rounded-full bg-white p-0.5 object-contain flex-shrink-0" />
          <span className="text-lg font-bold tracking-widest text-white font-mono">CRIC HQ</span>
        </Link>
        {!minimal && (
          <div className="flex items-center gap-5">
            <Link href="/about" className="text-base text-zinc-400 hover:text-white transition-colors font-mono">
              About
            </Link>
            <Link href="/login#signin" className="text-base text-zinc-400 hover:text-white transition-colors font-mono">
              Login
            </Link>
            <Link href="/contact" className="text-base text-zinc-400 hover:text-white transition-colors font-mono">
              Contact
            </Link>
          </div>
        )}
      </div>

      {children}

      {!minimal && (
        <div className="border-t border-zinc-800">
          <div className="max-w-6xl mx-auto px-6 sm:px-10 py-6 flex flex-col items-end gap-2 text-sm text-zinc-500">
            <div className="flex flex-wrap justify-end gap-5 text-base">
              <Link href="/about" className="hover:text-white transition-colors">About</Link>
              <Link href="/contact" className="hover:text-white transition-colors">Contact</Link>
              <Link href="/terms" className="hover:text-white transition-colors">Terms &amp; Conditions</Link>
              <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            </div>
            <p className="text-right text-xs text-zinc-600">
              Copyright © {new Date().getFullYear()} CRIC HQ PTY LTD. All rights reserved. Design &amp; Developed by Kaus Milestone Pty Ltd
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
