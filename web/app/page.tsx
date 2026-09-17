import Link from "next/link";

export const metadata = {
  title: "CRIC HQ — Fast Bowling Performance Platform",
  description: "AI biomechanics from any phone video, coach workflow tools, and performance tracking for fast bowlers — no lab, no lasers.",
};

/** The site's actual homepage — previously / just redirected straight to /login, which doubled
 * as both the marketing landing page and the sign-in form. Split apart so the logo has somewhere
 * real to point to (see PartnershipPageShell/LegalPageShell) and /login can be a lean,
 * sign-in-only page like its siblings (/signup, /forgot-password). Middleware treats / like
 * /login: a signed-in visitor is bounced straight to /players instead of seeing this. */
export default function HomePage() {
  return (
    <div className="min-h-screen bg-ink relative overflow-hidden">
      {/* Ambient brand glow behind the hero — mirrors the "product demo" landing pattern
          (dark background, glowing hero card) without borrowing anyone else's brand color. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse 1000px 640px at 50% -5%, rgba(0,212,170,0.16), transparent 70%)" }}
      />

      {/* Top bar */}
      <div className="relative flex items-center justify-between px-6 sm:px-10 py-4 max-w-6xl mx-auto">
        <Link href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- small static badge, next/image is overkill */}
          <img src="/crichq_logo.jpeg" alt="CRIC HQ" width={32} height={32}
            className="w-8 h-8 rounded-full bg-white p-0.5 object-contain flex-shrink-0" />
          <span className="text-lg font-bold tracking-widest text-white font-mono">CRIC HQ</span>
        </Link>
        <div className="flex items-center gap-5">
          <Link href="/about" className="text-base text-zinc-400 hover:text-white transition-colors font-mono">
            About
          </Link>
          <Link href="/organisations" className="text-base text-zinc-400 hover:text-white transition-colors font-mono">
            Organisations
          </Link>
          <Link href="/login" className="text-base text-zinc-400 hover:text-white transition-colors font-mono">
            Login
          </Link>
          <Link href="/contact" className="text-base text-zinc-400 hover:text-white transition-colors font-mono">
            Contact Us
          </Link>
        </div>
      </div>

      <div className="relative w-full px-4 pb-16 flex flex-col items-center">
        <DemoCard />

        <h1 className="mt-4 mx-auto text-lg sm:text-xl font-bold text-white text-center max-w-xl leading-tight font-mono">
          Every degree of the action, measured.
        </h1>
        <p className="mt-2 mx-auto text-zinc-400 text-center max-w-xs sm:max-w-2xl text-xs sm:text-sm font-mono sm:whitespace-nowrap">
          AI biomechanics from any phone video — no lab, no lasers.
        </p>

        <div className="w-full max-w-2xl mx-auto mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/login"
            className="inline-block px-7 py-3 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity">
            Sign In
          </Link>
          <Link href="/signup"
            className="inline-block px-7 py-3 text-zinc-300 text-sm font-bold rounded-xl border border-zinc-700 hover:bg-zinc-800 transition-colors">
            Create an Account
          </Link>
        </div>

        <div className="w-full max-w-4xl mx-auto mt-16 flex flex-col items-center gap-2 text-base text-zinc-500 font-mono">
          <div className="flex flex-wrap justify-center gap-5">
            <Link href="/terms" className="hover:text-white transition-colors">Terms &amp; Conditions</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
          </div>
          <p className="text-center text-xs text-zinc-600">
            Copyright © {new Date().getFullYear()} CRIC HQ PTY LTD. All rights reserved. Design &amp; Developed by Kaus Milestone Pty Ltd
          </p>
        </div>
      </div>
    </div>
  );
}

/** A branded mockup of the app's own AI biomechanics analysis — a real skeleton-overlay video
 * generated from an actual uploaded session clip (pose detection + drawing reuse lib/pose.ts's
 * and lib/skeleton-overlay.ts's exact approach), not stock footage, styled as a "video analysis"
 * demo card so a first-time visitor sees the actual product before they even sign in. The phase
 * labels (Run-up / BFC / FFC / Release) match lib/biomechanics.ts's real delivery-phase
 * detection, not invented copy. login-photo-2.jpg is kept as the poster frame while the video
 * loads/loops. */
function DemoCard() {
  const phases = ["Run-up", "BFC", "FFC", "Release"];
  return (
    <div className="relative w-full max-w-2xl mx-auto rounded-2xl overflow-hidden border border-pace-green/30 shadow-[0_0_70px_-20px_rgba(0,212,170,0.45)]">
      <div className="flex items-center justify-between bg-ink/95 px-4 py-2.5 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- small static badge, next/image is overkill */}
          <img src="/crichq_logo.jpeg" alt="" width={16} height={16} className="w-4 h-4 rounded-full bg-white p-0.5 flex-shrink-0" />
          <span className="text-[11px] font-bold tracking-widest text-white">CRIC HQ</span>
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold text-pace-green bg-pace-green/10 border border-pace-green/30 uppercase tracking-wider">
            Video Analysis
          </span>
        </div>
        <span className="text-[11px] text-zinc-500 hidden sm:inline">U16 · Right-Arm Fast</span>
      </div>

      <div className="relative">
        <video
          src="/hero-demo.webm"
          poster="/login-photo-2.jpg"
          autoPlay
          loop
          muted
          playsInline
          aria-label="Skeleton-tracked bowling delivery from a real CRIC HQ AI biomechanics report"
          className="w-full h-[300px] sm:h-[380px] object-cover"
          style={{ objectPosition: "50% 40%" }}
        />
        <div className="absolute top-4 right-4 bg-ink/90 border border-pace-green/40 rounded-lg px-3 py-2 backdrop-blur-sm">
          <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">Front Knee Angle</div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold font-mono text-white">165°</span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-pace-green/20 text-pace-green">LOW RISK</span>
          </div>
        </div>
      </div>

      <div className="bg-ink/95 px-5 py-3 border-t border-zinc-800">
        <div className="relative h-1 rounded-full bg-zinc-800">
          <div className="absolute inset-y-0 left-0 w-2/3 rounded-full bg-pace-green/60" />
          {phases.map((label, i) => (
            <div key={label} className="absolute top-1/2 -translate-y-1/2" style={{ left: `${(i / (phases.length - 1)) * 100}%` }}>
              <div className="w-2.5 h-2.5 rounded-full bg-pace-green border-2 border-ink -translate-x-1/2" />
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2 text-[9px] text-zinc-500 uppercase tracking-wider">
          {phases.map((label) => <span key={label}>{label}</span>)}
        </div>
      </div>
    </div>
  );
}
