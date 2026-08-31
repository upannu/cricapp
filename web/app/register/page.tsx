"use client";

import { useState, useEffect } from "react";

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
  const [registered, setRegistered] = useState<{ name: string; ageGroup: string }[] | null>(null);
  const [pending, setPending] = useState<{ id: string; name: string }[] | null>(null);
  // null = still choosing; a string = completing that pre-entered player; "" = registering fresh
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null | "">(null);

  useEffect(() => {
    // Only visible once a valid code has been entered, and scoped to that same code — someone
    // with the "marsden" code shouldn't see who registered under "silverwater"/"oran".
    if (!unlocked) { setRegistered(null); setPending(null); return; }
    fetch(`/api/public-register-player?code=${encodeURIComponent(code.trim())}`)
      .then((r) => r.json())
      .then((d) => { setRegistered(d.players ?? []); setPending(d.pending ?? []); })
      .catch(() => { setRegistered([]); setPending([]); });
  }, [unlocked, done, code]); // re-fetch right after a new registration so the list updates immediately

  function pickPending(p: { id: string; name: string }) {
    setSelectedPlayerId(p.id);
    setForm({ ...EMPTY_FORM, name: p.name });
    setError("");
  }

  function registerFresh() {
    setSelectedPlayerId("");
    setForm(EMPTY_FORM);
    setError("");
  }

  useEffect(() => {
    // No pre-entered roster for this code (marsden/silverwater today) — skip the selection step
    // entirely so behaviour is unchanged for codes nobody pre-seeded names for.
    if (pending && pending.length === 0 && selectedPlayerId === null) {
      setSelectedPlayerId("");
    }
  }, [pending, selectedPlayerId]);

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
    if (!form.email.trim()) { setError("Email is required."); return; }
    if (!form.phone.trim()) { setError("Phone is required."); return; }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/public-register-player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, playerId: selectedPlayerId || undefined, ...form }),
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
    // Back to the selection screen (if this code has a pre-entered roster) rather than assuming
    // another fresh registration — most parents here are completing a second sibling by name.
    setSelectedPlayerId(pending && pending.length > 0 ? null : "");
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
        ) : selectedPlayerId === null ? (
          <div className="bg-surface rounded-2xl p-8 shadow-2xl space-y-4">
            <h2 className="text-lg font-semibold text-white text-center mb-2">Find your child</h2>
            <p className="text-zinc-400 text-sm text-center mb-2">
              Your coach already added these names — pick yours below to finish registering.
            </p>
            {pending === null ? (
              <p className="text-zinc-500 text-sm text-center py-4">Loading…</p>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                {pending.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pickPending(p)}
                    className="w-full text-left px-4 py-3 rounded-xl bg-ink border border-zinc-700 hover:border-pace-green text-white text-sm transition-colors cursor-pointer"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={registerFresh}
              className="w-full text-center text-zinc-400 hover:text-white text-sm py-2 transition-colors cursor-pointer underline"
            >
              My child isn&apos;t listed — register them
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-surface rounded-2xl p-8 shadow-2xl space-y-4">
            {selectedPlayerId && pending && pending.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedPlayerId(null)}
                className="text-xs text-zinc-500 hover:text-white transition-colors cursor-pointer -mt-1 -mb-2"
              >
                ← Back to the list
              </button>
            )}
            <h2 className="text-lg font-semibold text-white text-center mb-2">
              {selectedPlayerId ? "Finish Registration" : "Player Details"}
            </h2>
            {selectedPlayerId && (
              <p className="text-zinc-400 text-sm text-center -mt-2 mb-2">
                Just fill in the rest for <span className="text-white font-semibold">{form.name}</span>.
              </p>
            )}

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
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Parent/Player Email *</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => { setForm({ ...form, email: e.target.value }); setError(""); }}
                className="w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm"
                placeholder="you@email.com"
                required
              />
              <p className="text-zinc-500 text-xs mt-1.5">Lets you sign in later to see progress — use this same email at /signup.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Phone *</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => { setForm({ ...form, phone: e.target.value }); setError(""); }}
                className="w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm"
                placeholder="e.g. 0412 345 678"
                required
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

        {registered && registered.length > 0 && (
          <div className="mt-8">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 text-center">
              {registered.length} player{registered.length === 1 ? "" : "s"} registered so far
            </p>
            <div className="bg-surface rounded-2xl p-4 max-h-64 overflow-y-auto">
              <ul className="space-y-2">
                {registered.map((p, i) => (
                  <li key={i} className="flex items-center justify-between text-sm px-2 py-1.5">
                    <span className="text-zinc-200">{p.name}</span>
                    <span className="text-zinc-500 text-xs">{p.ageGroup}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
