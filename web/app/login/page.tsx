"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth /*, DEMO_ACCOUNTS */ } from "@/lib/auth";
// import type { UserRole } from "@/lib/types";

// -- Demo account styles (uncomment below section to re-enable quick-login for local testing) --
// const ROLE_LABELS: Record<UserRole, string> = {
//   platform_admin: "Platform Admin",
//   academy_admin: "Academy Admin",
//   coach: "Coach",
// };
// const ROLE_DESC: Record<UserRole, string> = {
//   platform_admin: "Full access across all academies",
//   academy_admin: "Manages their academy's coaches & players",
//   coach: "Views only their own players & sessions",
// };
// const ROLE_STYLES: Record<UserRole, { badge: string; card: string }> = {
//   platform_admin: { badge: "bg-amber/20 text-amber border-amber/30", card: "border-amber/20 hover:border-amber/50" },
//   academy_admin:  { badge: "bg-blue-500/20 text-blue-400 border-blue-500/30", card: "border-blue-500/20 hover:border-blue-500/50" },
//   coach:          { badge: "bg-pace-green/20 text-pace-green border-pace-green/30", card: "border-pace-green/20 hover:border-pace-green/50" },
// };

export default function LoginPage() {
  const router = useRouter();
  const { login, resendConfirmation } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailUnconfirmed, setEmailUnconfirmed] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [resendError, setResendError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setEmailUnconfirmed(false);
    setResent(false);
    const err = await login(email.trim(), password);
    if (err) {
      if (err === "EMAIL_NOT_CONFIRMED") {
        setEmailUnconfirmed(true);
        setError("Please confirm your email address before signing in — check your inbox for the link.");
      } else {
        setError(err.startsWith("ACCOUNT_DISABLED::") ? err.slice("ACCOUNT_DISABLED::".length) : "Invalid email or password.");
      }
      setLoading(false);
    } else {
      router.push("/players");
    }
  }

  async function handleResend() {
    setResending(true);
    setResendError("");
    const err = await resendConfirmation(email.trim());
    setResending(false);
    if (err) setResendError(err);
    else setResent(true);
  }

  // async function quickLogin(email: string) {
  //   setLoading(true);
  //   setError("");
  //   const err = await login(email, "pace2024");
  //   if (err) { setError(err); setLoading(false); }
  //   else { router.push("/players"); }
  // }

  return (
    <div className="min-h-screen bg-ink relative overflow-hidden">
      {/* Ambient brand glow behind the hero — mirrors the "product demo" landing pattern
          (dark background, glowing hero card) without borrowing anyone else's brand color. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse 1000px 640px at 50% -5%, rgba(0,212,170,0.16), transparent 70%)" }}
      />

      {/* Top bar */}
      <div className="relative flex items-center justify-between px-6 sm:px-10 py-2 max-w-6xl mx-auto">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- small static badge, next/image is overkill */}
          <img src="/crichq_logo.jpeg" alt="CRIC HQ" width={32} height={32}
            className="w-8 h-8 rounded-full bg-white p-0.5 object-contain flex-shrink-0" />
          <span className="text-lg font-bold tracking-widest text-white font-mono">CRIC HQ</span>
        </div>
        <div className="flex items-center gap-5">
          <Link href="/about" className="text-base text-zinc-400 hover:text-white transition-colors font-mono">
            About
          </Link>
          <Link href="#signin" className="text-base text-zinc-400 hover:text-white transition-colors font-mono">
            Login
          </Link>
          <Link href="/contact" className="text-base text-zinc-400 hover:text-white transition-colors font-mono">
            Contact
          </Link>
        </div>
      </div>

      <div className="relative px-4 pb-16 flex flex-col items-center">
        <DemoCard />

        <h1 className="mt-4 text-lg sm:text-xl font-bold text-white text-center max-w-xl leading-tight font-mono">
          Every degree of the action, measured.
        </h1>
        <p className="mt-2 text-zinc-400 text-center max-w-xs sm:max-w-2xl text-xs sm:text-sm font-mono sm:whitespace-nowrap">
          AI biomechanics from any phone video — no lab, no lasers.
        </p>

        <div id="signin" className="w-full max-w-2xl mt-4 scroll-mt-6">
          {/* Login card */}
          <div className="bg-surface rounded-2xl p-6 shadow-2xl mb-6">
            <h2 className="text-lg font-semibold text-white mb-4 text-center">Sign in</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); setEmailUnconfirmed(false); setResent(false); }}
                  className="w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm"
                  placeholder="your@email.com"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); setEmailUnconfirmed(false); setResent(false); }}
                  className="w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm"
                  placeholder="••••••••"
                  required
                />
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              {emailUnconfirmed && (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending || resent}
                  className="text-xs font-bold text-pace-green hover:underline transition-colors cursor-pointer disabled:opacity-70 disabled:no-underline disabled:cursor-default"
                >
                  {resending ? "Sending…" : resent ? "✓ Confirmation email sent" : "Resend confirmation email"}
                </button>
              )}
              {resendError && <p className="text-red-400 text-xs">{resendError}</p>}
              <div className="flex justify-end">
                <Link href="/forgot-password" className="text-xs font-bold text-zinc-500 hover:text-pace-green transition-colors">
                  Forgot password?
                </Link>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-pace-green text-black font-bold py-3.5 rounded-xl hover:opacity-90 transition-opacity text-sm uppercase tracking-wider cursor-pointer disabled:opacity-60"
              >
                {loading ? "Signing in…" : "Sign In"}
              </button>
            </form>
          </div>

          {/* Sign up link */}
          <p className="text-center text-zinc-400 text-sm mt-4">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-pace-green hover:underline font-medium">
              Create one
            </Link>
          </p>

          {/* QR code — quick mobile access to the site. Hidden for now, not removed.
          <div className="flex flex-col items-center justify-center gap-2 mt-8">
            <img src="/crichq_qr_code.png" alt="QR code linking to crichq.com.au" width={64} height={64}
              className="w-16 h-16 rounded-lg bg-white p-1.5 flex-shrink-0" />
            <p className="text-zinc-500 text-xs leading-relaxed text-center">
              Scan to open crichq.com.au on your phone
            </p>
          </div>
          */}

          {/* DEMO ACCOUNTS — uncomment for local testing only
          <div>
            <p className="text-xs text-zinc-500 text-center uppercase tracking-wider mb-4">Demo accounts — click to sign in</p>
            <div className="space-y-2">
              {DEMO_ACCOUNTS.map((u) => {
                const styles = ROLE_STYLES[u.role];
                const initials = u.name.split(" ").map((n) => n[0]).join("");
                return (
                  <button key={u.id} type="button" disabled={loading}
                    onClick={() => quickLogin(u.email)}
                    className={`w-full flex items-center gap-4 bg-surface rounded-xl px-5 py-3.5 border transition-colors cursor-pointer group disabled:opacity-50 ${styles.card}`}>
                    <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{initials}</div>
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-white text-sm font-semibold">{u.name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${styles.badge}`}>{ROLE_LABELS[u.role]}</span>
                      </div>
                      <p className="text-zinc-500 text-xs">{ROLE_DESC[u.role]}</p>
                    </div>
                    <span className="text-zinc-600 group-hover:text-white transition-colors text-sm">→</span>
                  </button>
                );
              })}
            </div>
          </div>
          */}
        </div>

        <div className="w-full max-w-4xl mt-8 flex flex-wrap items-center justify-between gap-4 text-base text-zinc-500 font-mono">
          <div className="flex flex-wrap gap-5">
            <Link href="/about" className="hover:text-white transition-colors">About</Link>
            <Link href="/contact" className="hover:text-white transition-colors">Contact</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms &amp; Conditions</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
          </div>
          <div className="text-right">
            <div className="text-sm">© {new Date().getFullYear()} CRIC HQ PTY LTD. All rights reserved.</div>
            <div className="text-xs text-zinc-600 mt-0.5">Design &amp; Developed by Kaus Milestone Pty Ltd</div>
          </div>
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
    <div className="relative w-full max-w-2xl rounded-2xl overflow-hidden border border-pace-green/30 shadow-[0_0_70px_-20px_rgba(0,212,170,0.45)]">
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
