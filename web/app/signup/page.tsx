"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";

type Role = "academy_admin" | "coach" | "player" | "parent";

const ROLE_OPTIONS: { value: Role; label: string; desc: string }[] = [
  { value: "academy_admin", label: "Academy Admin", desc: "Manage your academy, coaches & players" },
  { value: "coach", label: "Coach", desc: "Track your players' sessions & progress" },
  { value: "player", label: "Player", desc: "View your own sessions, reports & progress" },
  { value: "parent", label: "Parent / Guardian", desc: "View your child's progress & give consent" },
];

const NEEDS_PLAYER_LOOKUP: Role[] = ["player", "parent"];

export default function SignUpPage() {
  const router = useRouter();
  const { signup } = useAuth();
  const [role, setRole] = useState<Role>("academy_admin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [playerEmail, setPlayerEmail] = useState("");
  const [playerLookup, setPlayerLookup] = useState<{ email: string; status: "checking" | "found" | "not-found"; name?: string } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // Only trust playerLookup if it was computed for the email currently in the field
  const lookupForCurrentEmail = playerLookup?.email === playerEmail.trim() ? playerLookup : null;

  useEffect(() => {
    if (!NEEDS_PLAYER_LOOKUP.includes(role) || !playerEmail.trim()) return;
    const email = playerEmail.trim();
    let cancelled = false;
    const handle = setTimeout(async () => {
      if (cancelled) return;
      setPlayerLookup({ email, status: "checking" });
      try {
        const res = await fetch(`/api/lookup-player?email=${encodeURIComponent(email)}`);
        const data = await res.json();
        if (!cancelled) setPlayerLookup(data.found ? { email, status: "found", name: data.playerName } : { email, status: "not-found" });
      } catch {
        if (!cancelled) setPlayerLookup({ email, status: "not-found" });
      }
    }, 500);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [playerEmail, role]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (NEEDS_PLAYER_LOOKUP.includes(role) && lookupForCurrentEmail?.status !== "found") {
      setError("Enter the player's registered email so we can link your account — ask your coach if you're not sure.");
      return;
    }
    setLoading(true);
    setError("");
    const { error: err } = await signup(
      name.trim(), email.trim(), password, role,
      NEEDS_PLAYER_LOOKUP.includes(role) ? playerEmail.trim() : undefined,
    );
    if (err) {
      setError(err);
      setLoading(false);
      return;
    }
    // Always show pending screen — even if no email confirmation,
    // the account still needs platform admin approval before accessing the dashboard
    setDone(true);
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

        {done ? (
          <div className="bg-surface rounded-2xl p-8 shadow-2xl text-center">
            <div className="w-16 h-16 rounded-full bg-amber/10 border border-amber/30 flex items-center justify-center mx-auto mb-5">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Request submitted</h2>
            <p className="text-zinc-400 text-sm leading-relaxed mb-2">
              Your account is <span className="text-amber font-semibold">pending approval</span> from a platform admin.
            </p>
            <p className="text-zinc-500 text-xs leading-relaxed mb-6">
              You&apos;ll be notified once your account is approved. This usually takes less than 24 hours.
            </p>
            <Link
              href="/login"
              className="inline-block w-full bg-surface border border-zinc-700 text-zinc-300 font-bold py-3.5 rounded-xl hover:border-zinc-500 transition-colors text-sm uppercase tracking-wider text-center"
            >
              Back to Sign In
            </Link>
          </div>
        ) : (
          <div className="bg-surface rounded-2xl p-8 shadow-2xl">
            <h2 className="text-xl font-semibold text-white mb-6 text-center">Create your account</h2>

            {/* Role selector */}
            <div className="grid grid-cols-2 gap-2 mb-6">
              {ROLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRole(opt.value)}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    role === opt.value
                      ? "border-pace-green bg-pace-green/10"
                      : "border-zinc-700 hover:border-zinc-500"
                  }`}
                >
                  <div className={`text-sm font-semibold mb-0.5 ${role === opt.value ? "text-pace-green" : "text-white"}`}>
                    {opt.label}
                  </div>
                  <div className="text-xs text-zinc-500 leading-snug">{opt.desc}</div>
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {NEEDS_PLAYER_LOOKUP.includes(role) && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                    {role === "parent" ? "Your Child's Registered Email" : "Your Registered Player Email"}
                  </label>
                  <input
                    type="email"
                    value={playerEmail}
                    onChange={(e) => { setPlayerEmail(e.target.value); setError(""); }}
                    className="w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm"
                    placeholder="The email your coach has on file"
                    required
                  />
                  {lookupForCurrentEmail?.status === "checking" && (
                    <p className="text-zinc-500 text-xs mt-1.5">Checking…</p>
                  )}
                  {lookupForCurrentEmail?.status === "found" && (
                    <p className="text-pace-green text-xs mt-1.5">✓ Found: {lookupForCurrentEmail.name}</p>
                  )}
                  {lookupForCurrentEmail?.status === "not-found" && (
                    <p className="text-red-400 text-xs mt-1.5">No player found with this email — ask your coach to add the player first.</p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setError(""); }}
                  className="w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm"
                  placeholder={role === "coach" ? "Coach name" : "Your full name"}
                  required
                />
              </div>

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
                {loading ? "Creating account…" : "Create Account"}
              </button>
            </form>

            <p className="text-center text-zinc-400 text-sm mt-6">
              Already have an account?{" "}
              <Link href="/login" className="text-pace-green hover:underline font-medium">
                Sign in
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
