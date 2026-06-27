"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

type Stage = "waiting" | "ready" | "done" | "error";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("waiting");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const supabase = useRef(createClient()).current;

  useEffect(() => {
    // Supabase browser client automatically picks up the token from the URL hash
    // and fires onAuthStateChange with PASSWORD_RECOVERY (reset) or SIGNED_IN (invite)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setStage("ready");
      }
    });

    // Also handle the case where the session is already active when the page mounts
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setStage("ready");
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (password.length < 8) { setError("Minimum 8 characters."); return; }
    setLoading(true);
    setError("");
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) { setError(err.message); setLoading(false); return; }
    setStage("done");
    setTimeout(() => router.push("/players"), 1500);
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
          {stage === "waiting" && (
            <div className="text-center py-6">
              <div className="w-6 h-6 rounded-full border-2 border-pace-green border-t-transparent animate-spin mx-auto mb-4" />
              <p className="text-zinc-400 text-sm">Verifying your link…</p>
            </div>
          )}

          {stage === "done" && (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-pace-green/10 border border-pace-green/30 flex items-center justify-center mx-auto mb-5">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00D4AA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Password set!</h2>
              <p className="text-zinc-400 text-sm">Taking you to the dashboard…</p>
            </div>
          )}

          {stage === "ready" && (
            <>
              <h2 className="text-xl font-semibold text-white mb-2 text-center">Set your password</h2>
              <p className="text-zinc-400 text-sm text-center mb-6">Choose a password to secure your PACE HQ account.</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">New Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(""); }}
                    className="w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm"
                    placeholder="Min. 8 characters"
                    minLength={8}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Confirm Password</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => { setConfirm(e.target.value); setError(""); }}
                    className={`w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border focus:outline-none transition-colors text-sm ${
                      error ? "border-red-500" : "border-zinc-700 focus:border-pace-green"
                    }`}
                    placeholder="Re-enter password"
                    required
                  />
                  {error && <p className="text-red-400 text-xs mt-1.5">{error}</p>}
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-pace-green text-black font-bold py-3.5 rounded-xl hover:opacity-90 transition-opacity text-sm uppercase tracking-wider cursor-pointer disabled:opacity-60 mt-2"
                >
                  {loading ? "Saving…" : "Set Password & Sign In"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
