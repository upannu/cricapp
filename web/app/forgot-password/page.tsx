"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();
    const origin = window.location.origin;
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${origin}/reset-password`,
    });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setDone(true);
  }

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center p-4">
      <div className="w-full max-w-md">
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

        <div className="bg-surface rounded-2xl p-8 shadow-2xl">
          {done ? (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-pace-green/10 border border-pace-green/30 flex items-center justify-center mx-auto mb-5">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00D4AA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Check your email</h2>
              <p className="text-zinc-400 text-sm leading-relaxed mb-6">
                We sent a password reset link to <span className="text-white font-medium">{email}</span>.
              </p>
              <Link href="/login" className="inline-block w-full bg-pace-green text-black font-bold py-3.5 rounded-xl hover:opacity-90 transition-opacity text-sm uppercase tracking-wider text-center">
                Back to Sign In
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-white mb-2 text-center">Reset your password</h2>
              <p className="text-zinc-400 text-sm text-center mb-6">Enter your email and we&apos;ll send you a reset link.</p>

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
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-pace-green text-black font-bold py-3.5 rounded-xl hover:opacity-90 transition-opacity text-sm uppercase tracking-wider cursor-pointer disabled:opacity-60"
                >
                  {loading ? "Sending…" : "Send Reset Link"}
                </button>
              </form>

              <p className="text-center text-zinc-400 text-sm mt-6">
                <Link href="/login" className="text-pace-green hover:underline font-medium">← Back to Sign In</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
