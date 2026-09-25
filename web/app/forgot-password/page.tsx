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
          {done ? (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-hp-cg/10 border border-hp-cg/30 flex items-center justify-center mx-auto mb-5">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#E8362A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <h2 className="font-display font-black uppercase text-xl text-hp-paper mb-2 tracking-wide">Check your email</h2>
              <p className="text-hp-paper/60 text-sm leading-relaxed mb-6">
                We sent a password reset link to <span className="text-hp-paper font-medium">{email}</span>.
              </p>
              <Link href="/login" className="inline-block w-full bg-hp-cg text-hp-paper font-display font-black py-3.5 hover:bg-hp-cg/90 transition-colors text-sm uppercase tracking-[0.12em] text-center">
                Back to Sign In
              </Link>
            </div>
          ) : (
            <>
              <h2 className="font-display font-black uppercase text-2xl text-hp-paper mb-2 text-center tracking-wide">Reset your password</h2>
              <p className="text-hp-paper/60 text-sm text-center mb-6">Enter your email and we&apos;ll send you a reset link.</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono font-semibold text-hp-paper/52 uppercase tracking-widest mb-1.5">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(""); }}
                    className="w-full bg-hp-ink px-4 py-3 text-hp-paper placeholder-hp-paper/30 border border-white/12 focus:border-hp-cg focus:outline-none transition-colors text-sm"
                    placeholder="your@email.com"
                    required
                  />
                </div>
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-hp-cg text-hp-paper font-display font-black py-3.5 hover:bg-hp-cg/90 transition-colors text-sm uppercase tracking-[0.12em] cursor-pointer disabled:opacity-60"
                >
                  {loading ? "Sending…" : "Send Reset Link"}
                </button>
              </form>

              <p className="text-center text-hp-paper/50 text-sm mt-6">
                <Link href="/login" className="text-hp-cg hover:underline font-medium">← Back to Sign In</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
