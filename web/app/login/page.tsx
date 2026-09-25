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

/** Lean, sign-in-only page — matches /signup and /forgot-password's chrome. Previously this page
 * doubled as the marketing landing page (hero, product demo video, nav) as well as the sign-in
 * form; that content moved to / (the actual homepage) so this page can just be what its name
 * says, consistent with its auth-flow siblings. */
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
    <div className="min-h-screen bg-hp-ink flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-3 mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- small static badge, next/image is overkill */}
            <img src="/hp-logo.svg" alt="CRIC HQ" width={48} height={36}
              style={{ height: 48, width: "auto", objectFit: "contain", mixBlendMode: "screen" }}
              className="flex-shrink-0" />
            <span className="font-display font-black text-3xl tracking-wide text-hp-paper uppercase">CRIC HQ</span>
          </div>
          <p className="font-mono text-hp-paper/52 text-xs uppercase tracking-[0.2em]">Fast Bowling Performance Platform</p>
        </div>

        <div className="border border-white/12 bg-hp-surface p-8">
          <h2 className="font-display font-black uppercase text-2xl text-hp-paper mb-6 text-center tracking-wide">Sign in</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-mono font-semibold text-hp-paper/52 uppercase tracking-widest mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); setEmailUnconfirmed(false); setResent(false); }}
                className="w-full bg-hp-ink px-4 py-3 text-hp-paper placeholder-hp-paper/30 border border-white/12 focus:border-hp-cg focus:outline-none transition-colors text-sm"
                placeholder="your@email.com"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-mono font-semibold text-hp-paper/52 uppercase tracking-widest mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); setEmailUnconfirmed(false); setResent(false); }}
                className="w-full bg-hp-ink px-4 py-3 text-hp-paper placeholder-hp-paper/30 border border-white/12 focus:border-hp-cg focus:outline-none transition-colors text-sm"
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
                className="text-xs font-bold text-hp-cg hover:underline transition-colors cursor-pointer disabled:opacity-70 disabled:no-underline disabled:cursor-default"
              >
                {resending ? "Sending…" : resent ? "✓ Confirmation email sent" : "Resend confirmation email"}
              </button>
            )}
            {resendError && <p className="text-red-400 text-xs">{resendError}</p>}
            <div className="flex justify-end">
              <Link href="/forgot-password" className="text-xs font-bold text-hp-paper/50 hover:text-hp-cg transition-colors">
                Forgot password?
              </Link>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-hp-cg text-hp-paper font-display font-black py-3.5 hover:bg-hp-cg/90 transition-colors text-sm uppercase tracking-[0.12em] cursor-pointer disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          {/* DEMO ACCOUNTS — uncomment for local testing only
          <div className="mt-6">
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

        <p className="text-center text-hp-paper/50 text-sm mt-6">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-hp-cg hover:underline font-medium">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
