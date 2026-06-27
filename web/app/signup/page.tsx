"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";

type Role = "academy_admin" | "coach";

const ROLE_OPTIONS: { value: Role; label: string; desc: string }[] = [
  { value: "academy_admin", label: "Academy Admin", desc: "Manage your academy, coaches & players" },
  { value: "coach", label: "Coach", desc: "Track your players' sessions & progress" },
];

export default function SignUpPage() {
  const router = useRouter();
  const { signup } = useAuth();
  const [role, setRole] = useState<Role>("academy_admin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setLoading(true);
    setError("");
    const { error: err, needsConfirmation } = await signup(name.trim(), email.trim(), password, role);
    if (err) {
      setError(err);
      setLoading(false);
      return;
    }
    if (needsConfirmation) {
      setDone(true);
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

        {done ? (
          /* Success — email confirmation required */
          <div className="bg-surface rounded-2xl p-8 shadow-2xl text-center">
            <div className="w-14 h-14 rounded-full bg-pace-green/10 border border-pace-green/30 flex items-center justify-center mx-auto mb-5">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00D4AA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Check your email</h2>
            <p className="text-zinc-400 text-sm leading-relaxed mb-6">
              We sent a confirmation link to <span className="text-white font-medium">{email}</span>. Click it to activate your account, then sign in.
            </p>
            <Link
              href="/login"
              className="inline-block w-full bg-pace-green text-black font-bold py-3.5 rounded-xl hover:opacity-90 transition-opacity text-sm uppercase tracking-wider text-center"
            >
              Go to Sign In
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
