"use client";

import { useState } from "react";

const AGE_GROUPS = ["U10", "U11", "U12", "U13", "U14", "U16", "U19", "Senior"] as const;
const BOWLING_STYLES = [
  "Right Arm Fast", "Left Arm Fast", "Right Arm Fast-Medium",
  "Left Arm Fast-Medium", "Right Arm Medium", "Left Arm Medium",
] as const;

const EMPTY_FORM = {
  name: "", email: "", phone: "", ageGroup: "U10" as string, bowlingStyle: "Right Arm Fast" as string, club: "",
};

export default function RegisterPage() {
  const [code, setCode] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [codeError, setCodeError] = useState("");
  const [checkingCode, setCheckingCode] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) { setCodeError("Enter your registration code."); return; }
    setCodeError("");
    setCheckingCode(true);
    try {
      const res = await fetch("/api/public-register-player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, validateOnly: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCodeError(data.error ?? "Invalid registration code.");
        return;
      }
      setUnlocked(true);
    } catch {
      setCodeError("Could not verify the code — check your connection and try again.");
    } finally {
      setCheckingCode(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Player name is required."); return; }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/public-register-player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, ...form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not submit registration.");
      setDone(true);
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
    } finally {
      setSubmitting(false);
    }
  }

  function registerAnother() {
    setForm(EMPTY_FORM);
    setDone(false);
    setError("");
  }

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- small static badge, next/image is overkill */}
            <img src="/crichq_logo.jpeg" alt="CRIC HQ" width={48} height={48}
              className="w-12 h-12 rounded-full bg-white p-1 object-contain flex-shrink-0" />
            <span className="text-2xl font-bold tracking-widest text-white font-mono">CRIC HQ</span>
          </div>
          <p className="text-zinc-400 text-sm tracking-wide">Player Registration</p>
        </div>

        {!unlocked ? (
          <form onSubmit={handleUnlock} className="bg-surface rounded-2xl p-8 shadow-2xl space-y-4">
            <h2 className="text-lg font-semibold text-white text-center mb-2">Enter your registration code</h2>
            <p className="text-zinc-400 text-sm text-center mb-4">Ask your coach for the code if you don&apos;t have one.</p>
            <input
              type="text"
              value={code}
              onChange={(e) => { setCode(e.target.value); setCodeError(""); }}
              className={`w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border focus:outline-none transition-colors text-sm text-center tracking-wide ${
                codeError ? "border-red-500" : "border-zinc-700 focus:border-pace-green"
              }`}
              placeholder="Registration code"
              autoFocus
            />
            {codeError && <p className="text-red-400 text-xs text-center">{codeError}</p>}
            <button
              type="submit"
              disabled={checkingCode}
              className="w-full bg-pace-green text-black font-bold py-3.5 rounded-xl hover:opacity-90 transition-opacity text-sm uppercase tracking-wider cursor-pointer disabled:opacity-60"
            >
              {checkingCode ? "Checking…" : "Continue"}
            </button>
          </form>
        ) : done ? (
          <div className="bg-surface rounded-2xl p-8 shadow-2xl text-center">
            <div className="w-16 h-16 rounded-full bg-pace-green/10 border border-pace-green/30 flex items-center justify-center mx-auto mb-5">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#00D4AA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Registered!</h2>
            <p className="text-zinc-400 text-sm leading-relaxed mb-6">
              {form.name || "Your player"}&apos;s details have been received. Your coach will be in touch to finish setting things up.
            </p>
            <button
              type="button"
              onClick={registerAnother}
              className="w-full bg-surface border border-zinc-700 text-zinc-300 font-bold py-3.5 rounded-xl hover:border-zinc-500 transition-colors text-sm uppercase tracking-wider cursor-pointer"
            >
              Register Another Player
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-surface rounded-2xl p-8 shadow-2xl space-y-4">
            <h2 className="text-lg font-semibold text-white text-center mb-2">Player Details</h2>

            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Full Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => { setForm({ ...form, name: e.target.value }); setError(""); }}
                className="w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm"
                placeholder="Player's full name"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Parent/Player Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm"
                placeholder="you@email.com"
              />
              <p className="text-zinc-500 text-xs mt-1.5">Optional, but lets you sign in later to see progress — use this same email at /signup.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm"
                placeholder="e.g. 0412 345 678"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Age Group</label>
                <select
                  value={form.ageGroup}
                  onChange={(e) => setForm({ ...form, ageGroup: e.target.value })}
                  className="w-full bg-ink rounded-xl px-4 py-3 text-white border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm"
                >
                  {AGE_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Bowling Style</label>
                <select
                  value={form.bowlingStyle}
                  onChange={(e) => setForm({ ...form, bowlingStyle: e.target.value })}
                  className="w-full bg-ink rounded-xl px-4 py-3 text-white border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm"
                >
                  {BOWLING_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Club (optional)</label>
              <input
                type="text"
                value={form.club}
                onChange={(e) => setForm({ ...form, club: e.target.value })}
                className="w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm"
                placeholder="Club name"
              />
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-pace-green text-black font-bold py-3.5 rounded-xl hover:opacity-90 transition-opacity text-sm uppercase tracking-wider cursor-pointer disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Register Player"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
