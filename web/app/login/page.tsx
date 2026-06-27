"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

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

      </div>
    </div>
  );
}
