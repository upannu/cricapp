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
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const err = await login(email.trim(), password);
    if (err) {
      setError("Invalid email or password.");
      setLoading(false);
    } else {
      router.push("/players");
    }
  }

  // async function quickLogin(email: string) {
  //   setLoading(true);
  //   setError("");
  //   const err = await login(email, "pace2024");
  //   if (err) { setError(err); setLoading(false); }
  //   else { router.push("/players"); }
  // }

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center p-4 gap-10 overflow-hidden">
      <BowlerPanel className="hidden lg:block flex-shrink-0" />

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-3 mb-3">
            <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
              <path d="M3 26 L9 17 L15 19.5 L21 9 L27 13" stroke="#00D4AA" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="27" cy="13" r="2.5" fill="#FF6B2B" />
            </svg>
            <span className="text-3xl font-bold tracking-widest text-white font-mono">CRIC HQ</span>
          </div>
          <p className="text-zinc-400 text-sm tracking-wide">Fast Bowling Performance Platform</p>
        </div>

        {/* Login card */}
        <div className="bg-surface rounded-2xl p-8 shadow-2xl mb-6">
          <h2 className="text-xl font-semibold text-white mb-6 text-center">Sign in</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
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
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                className="w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm"
                placeholder="••••••••"
                required
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex justify-end">
              <Link href="/forgot-password" className="text-xs text-zinc-500 hover:text-pace-green transition-colors">
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

      <StumpsPanel className="hidden lg:block flex-shrink-0" />
    </div>
  );
}

/** Stylized cricket ball with seam detail and a motion trail — abstract line art,
 * matching the brand icon's speed-line motif and the stumps panel's visual weight. */
function BowlerPanel({ className }: { className?: string }) {
  return (
    <div className={className}>
      <svg width="200" height="380" viewBox="0 0 200 380" fill="none">
        {/* Speed lines trailing the ball */}
        <path d="M10 220 L75 205" stroke="#00D4AA" strokeWidth="2" strokeOpacity="0.25" strokeLinecap="round" />
        <path d="M20 245 L80 232" stroke="#00D4AA" strokeWidth="2" strokeOpacity="0.4" strokeLinecap="round" />
        <path d="M15 270 L75 260" stroke="#00D4AA" strokeWidth="2" strokeOpacity="0.25" strokeLinecap="round" />

        {/* Ball */}
        <circle cx="115" cy="245" r="52" stroke="#00D4AA" strokeWidth="3" />
        <path d="M115 193 A 52 52 0 0 1 115 297" stroke="#FF6B2B" strokeWidth="2" strokeDasharray="4 5" strokeLinecap="round" />
        <path d="M115 193 A 52 52 0 0 0 115 297" stroke="#FF6B2B" strokeWidth="2" strokeDasharray="4 5" strokeLinecap="round" />

        {/* Orbiting "analysis" dots, echoing the app's biomechanics-tracking angle */}
        <circle cx="163" cy="150" r="4" fill="#FF6B2B" />
        <circle cx="185" cy="245" r="3" fill="#00D4AA" opacity="0.6" />
        <circle cx="60" cy="330" r="3" fill="#00D4AA" opacity="0.4" />
      </svg>
    </div>
  );
}

/** Stumps + incoming delivery, with a subtle angle arc referencing the app's
 * biomechanics-analysis positioning. */
function StumpsPanel({ className }: { className?: string }) {
  return (
    <div className={className}>
      <svg width="200" height="380" viewBox="0 0 200 380" fill="none">
        {/* Ball trajectory into the stumps */}
        <path d="M20 60 Q 80 140 120 260" stroke="#00D4AA" strokeWidth="2" strokeOpacity="0.35" strokeDasharray="1 10" strokeLinecap="round" />
        <circle cx="30" cy="66" r="6" fill="#FF6B2B" />
        {/* Angle arc, echoing biomechanics angle measurement */}
        <path d="M120 260 L120 220 A 40 40 0 0 0 92 236" stroke="#00D4AA" strokeWidth="1.5" strokeOpacity="0.4" fill="none" />
        {/* Stumps + bails */}
        <g stroke="#00D4AA" strokeWidth="4" strokeLinecap="round">
          <path d="M100 150 L100 280" />
          <path d="M130 150 L130 280" />
          <path d="M160 150 L160 280" />
        </g>
        <path d="M95 150 L135 146" stroke="#FF6B2B" strokeWidth="3" strokeLinecap="round" />
        <path d="M125 146 L165 150" stroke="#FF6B2B" strokeWidth="3" strokeLinecap="round" />
        <path d="M85 280 L175 280" stroke="#00D4AA" strokeWidth="3" strokeOpacity="0.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}
