import Link from "next/link";

/** Shared chrome for the public Contact/Terms/Privacy pages — same dark theme and logo header as
 * /login, plus a footer that cross-links the three so a visitor on any one can reach the others. */
export function LegalPageShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink">
      <div className="flex items-center justify-between px-6 sm:px-10 py-4 max-w-3xl mx-auto">
        <Link href="/login" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- small static badge, next/image is overkill */}
          <img src="/crichq_logo.jpeg" alt="CRIC HQ" width={32} height={32}
            className="w-8 h-8 rounded-full bg-white p-0.5 object-contain flex-shrink-0" />
          <span className="text-lg font-bold tracking-widest text-white font-mono">CRIC HQ</span>
        </Link>
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
      </div>

      <div className="max-w-3xl mx-auto px-6 sm:px-10 pb-20">
        <h1 className="text-2xl font-bold text-white mt-6 mb-8">{title}</h1>
        <div className="text-sm text-zinc-300 leading-relaxed space-y-5">
          {children}
        </div>
      </div>

      <div className="border-t border-zinc-800">
        <div className="max-w-3xl mx-auto px-6 sm:px-10 py-6 flex flex-wrap items-center justify-between gap-4 text-sm text-zinc-500">
          <span>© {new Date().getFullYear()} CRIC HQ PTY LTD. All rights reserved.</span>
          <div className="flex gap-5 text-base">
            <Link href="/about" className="hover:text-white transition-colors">About</Link>
            <Link href="/contact" className="hover:text-white transition-colors">Contact</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms &amp; Conditions</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
