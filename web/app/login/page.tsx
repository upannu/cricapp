"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, DEMO_ACCOUNTS } from "@/lib/auth";
import type { UserRole } from "@/lib/types";

const ROLE_LABELS: Record<UserRole, string> = {
  platform_admin: "Platform Admin",
  academy_admin: "Academy Admin",
  coach: "Coach",
};

const ROLE_DESC: Record<UserRole, string> = {
  platform_admin: "Full access across all academies",
  academy_admin: "Manages their academy's coaches & players",
  coach: "Views only their own players & sessions",
};

const ROLE_STYLES: Record<UserRole, { badge: string; card: string }> = {
  platform_admin: {
    badge: "bg-amber/20 text-amber border-amber/30",
    card: "border-amber/20 hover:border-amber/50",
  },
  academy_admin: {
    badge: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    card: "border-blue-500/20 hover:border-blue-500/50",
  },
  coach: {
    badge: "bg-pace-green/20 text-pace-green border-pace-green/30",
    card: "border-pace-green/20 hover:border-pace-green/50",
  },
};

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

  async function quickLogin(email: string) {
    setLoading(true);
    setError("");
    const err = await login(email, "pace2024");
    if (err) {
      setError(err);
      setLoading(false);
    } else {
      router.push("/players");
    }
  }

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-3 mb-3">
            <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
              <path d="M3 26 L9 17 L15 19.5 L21 9 L27 13" stroke="#00D4AA" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="27" cy="13" r="2.5" fill="#FF6B2B" />
            </svg>
            <span className="text-3xl font-bold tracking-widest text-white font-mono">PACE HQ</span>
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
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-pace-green text-black font-bold py-3.5 rounded-xl hover:opacity-90 transition-opacity text-sm uppercase tracking-wider cursor-pointer disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
        </div>

        {/* Demo accounts */}
        <div>
          <p className="text-xs text-zinc-500 text-center uppercase tracking-wider mb-4">Demo accounts — click to sign in</p>
          <div className="space-y-2">
            {DEMO_ACCOUNTS.map((u) => {
              const styles = ROLE_STYLES[u.role];
              const initials = u.name.split(" ").map((n) => n[0]).join("");
              return (
                <button
                  key={u.id}
                  type="button"
                  disabled={loading}
                  onClick={() => quickLogin(u.email)}
                  className={`w-full flex items-center gap-4 bg-surface rounded-xl px-5 py-3.5 border transition-colors cursor-pointer group disabled:opacity-50 ${styles.card}`}
                >
                  <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {initials}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-white text-sm font-semibold">{u.name}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${styles.badge}`}>
                        {ROLE_LABELS[u.role]}
                      </span>
                    </div>
                    <p className="text-zinc-500 text-xs">{ROLE_DESC[u.role]}</p>
                  </div>
                  <span className="text-zinc-600 group-hover:text-white transition-colors text-sm">→</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
