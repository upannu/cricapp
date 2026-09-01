"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase";

type Stage = "waiting" | "ready" | "done" | "error";

// How long to wait for a session before assuming the link is invalid/expired/already used and
// telling the visitor rather than leaving them on an infinite spinner forever — see
// app/auth/confirm/route.ts (the actual link target) for why a session should normally already
// exist by the time this page even mounts; this is a defensive fallback, not the primary path.
const LINK_VERIFY_TIMEOUT_MS = 10_000;

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // app/auth/confirm/route.ts redirects here with this when the link's own token was
  // missing/invalid/expired/already used — no session was ever established, so there's nothing
  // to wait for. Read once at mount via a lazy initializer rather than an effect + setState.
  const linkInvalid = useState(() => searchParams.get("error") === "invalid_link")[0];
  const [stage, setStage] = useState<Stage>(linkInvalid ? "error" : "waiting");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // createBrowserClient (@supabase/ssr) already caches a singleton internally — no need to wrap
  // it in useRef ourselves, and doing so tripped the react-hooks/refs lint rule anyway.
  const supabase = createClient();

  useEffect(() => {
    if (linkInvalid) return;

    // By the time this page loads, /auth/confirm has already verified the link server-side and
    // set a real session cookie — getSession() below should find it immediately. The
    // onAuthStateChange listener is a fallback for any other flow that still lands here with a
    // token to process client-side (e.g. an already-active session on mount).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setStage("ready");
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setStage("ready");
    });

    // Never leave the visitor on an infinite spinner — if nothing above resolved this within a
    // reasonable window, say so instead of hanging silently forever.
    const timeout = setTimeout(() => {
      setStage((current) => (current === "waiting" ? "error" : current));
    }, LINK_VERIFY_TIMEOUT_MS);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [supabase, linkInvalid]);

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
            {/* eslint-disable-next-line @next/next/no-img-element -- small static badge, next/image is overkill */}
            <img src="/crichq_logo.jpeg" alt="CRIC HQ" width={48} height={48}
              className="w-12 h-12 rounded-full bg-white p-1 object-contain flex-shrink-0" />
            <span className="text-3xl font-bold tracking-widest text-white font-mono">CRIC HQ</span>
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

          {stage === "error" && (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-5">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white mb-2">This link isn&apos;t working</h2>
              <p className="text-zinc-400 text-sm leading-relaxed mb-6">
                It may have expired, already been used, or been opened in a different browser than the one you requested it from.
                Request a fresh link and open it in the same browser right away.
              </p>
              <a href="/forgot-password" className="inline-block w-full bg-pace-green text-black font-bold py-3.5 rounded-xl hover:opacity-90 transition-opacity text-sm uppercase tracking-wider text-center">
                Request a New Link
              </a>
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
              <p className="text-zinc-400 text-sm text-center mb-6">Choose a password to secure your CRIC HQ account.</p>

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
