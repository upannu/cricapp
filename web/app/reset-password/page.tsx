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
          {stage === "waiting" && (
            <div className="text-center py-6">
              <div className="w-6 h-6 rounded-full border-2 border-hp-cg border-t-transparent animate-spin mx-auto mb-4" />
              <p className="text-hp-paper/60 text-sm">Verifying your link…</p>
            </div>
          )}

          {stage === "error" && (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-5">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <h2 className="font-display font-black uppercase text-xl text-hp-paper mb-2 tracking-wide">This link isn&apos;t working</h2>
              <p className="text-hp-paper/60 text-sm leading-relaxed mb-6">
                It may have expired, already been used, or been opened in a different browser than the one you requested it from.
                Request a fresh link and open it in the same browser right away.
              </p>
              <a href="/forgot-password" className="inline-block w-full bg-hp-cg text-hp-paper font-display font-black py-3.5 hover:bg-hp-cg/90 transition-colors text-sm uppercase tracking-[0.12em] text-center">
                Request a New Link
              </a>
            </div>
          )}

          {stage === "done" && (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-hp-cg/10 border border-hp-cg/30 flex items-center justify-center mx-auto mb-5">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#E8362A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <h2 className="font-display font-black uppercase text-xl text-hp-paper mb-2 tracking-wide">Password set!</h2>
              <p className="text-hp-paper/60 text-sm">Taking you to the dashboard…</p>
            </div>
          )}

          {stage === "ready" && (
            <>
              <h2 className="font-display font-black uppercase text-2xl text-hp-paper mb-2 text-center tracking-wide">Set your password</h2>
              <p className="text-hp-paper/60 text-sm text-center mb-6">Choose a password to secure your CRIC HQ account.</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono font-semibold text-hp-paper/52 uppercase tracking-widest mb-1.5">New Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(""); }}
                    className="w-full bg-hp-ink px-4 py-3 text-hp-paper placeholder-hp-paper/30 border border-white/12 focus:border-hp-cg focus:outline-none transition-colors text-sm"
                    placeholder="Min. 8 characters"
                    minLength={8}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono font-semibold text-hp-paper/52 uppercase tracking-widest mb-1.5">Confirm Password</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => { setConfirm(e.target.value); setError(""); }}
                    className={`w-full bg-hp-ink px-4 py-3 text-hp-paper placeholder-hp-paper/30 border focus:outline-none transition-colors text-sm ${
                      error ? "border-red-500" : "border-white/12 focus:border-hp-cg"
                    }`}
                    placeholder="Re-enter password"
                    required
                  />
                  {error && <p className="text-red-400 text-xs mt-1.5">{error}</p>}
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-hp-cg text-hp-paper font-display font-black py-3.5 hover:bg-hp-cg/90 transition-colors text-sm uppercase tracking-[0.12em] cursor-pointer disabled:opacity-60 mt-2"
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
