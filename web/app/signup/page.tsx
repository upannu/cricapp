"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
const PREFILLABLE_ROLES: Role[] = ["player", "parent"];

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpForm />
    </Suspense>
  );
}

function SignUpForm() {
  const router = useRouter();
  const { signup } = useAuth();
  const searchParams = useSearchParams();
  // A "you've been added" email links here with ?role=player&email=...&name=... so the player
  // just has to pick a password — see api/players/notify-added/route.ts.
  const roleParam = searchParams.get("role");
  const initialRole: Role = PREFILLABLE_ROLES.includes(roleParam as Role) ? (roleParam as Role) : "academy_admin";
  const prefillEmail = searchParams.get("email") ?? "";
  const prefillName = searchParams.get("name") ?? "";

  const [role, setRole] = useState<Role>(initialRole);
  const [name, setName] = useState(prefillName);
  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [academyName, setAcademyName] = useState("");
  const [academyLocation, setAcademyLocation] = useState("");
  const [playerEmail, setPlayerEmail] = useState(prefillEmail);
  const [playerLookup, setPlayerLookup] = useState<{ email: string; status: "checking" | "found" | "not-found"; additionalCount?: number } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [linked, setLinked] = useState(false);
  const [autoApproved, setAutoApproved] = useState(false);
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false);

  // Only trust playerLookup if it was computed for the email currently in the field
  const lookupForCurrentEmail = playerLookup?.email === playerEmail.trim() ? playerLookup : null;

  // Live "does this email already have an account" check on the account-email field itself —
  // catches the case that actually caused real damage: someone submitting a second signup for
  // an email that already has a pending/approved account, before they even hit submit, rather
  // than finding out only after something went wrong (or, before this existed, silently
  // overwriting the first account's role entirely).
  const [emailCheck, setEmailCheck] = useState<{ email: string; status: "checking" | "exists" | "clear" } | null>(null);
  const emailCheckForCurrent = emailCheck?.email === email.trim() ? emailCheck : null;

  useEffect(() => {
    if (!email.trim()) { setEmailCheck(null); return; }
    const e = email.trim();
    let cancelled = false;
    const handle = setTimeout(async () => {
      if (cancelled) return;
      setEmailCheck({ email: e, status: "checking" });
      try {
        const res = await fetch("/api/check-existing-account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: e }),
        });
        const data = await res.json();
        if (!cancelled) setEmailCheck({ email: e, status: data.exists ? "exists" : "clear" });
      } catch {
        if (!cancelled) setEmailCheck(null);
      }
    }, 500);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [email]);

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
        if (!cancelled) setPlayerLookup(data.found ? { email, status: "found", additionalCount: data.additionalCount ?? 0 } : { email, status: "not-found" });
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
    if (role === "academy_admin" && !academyName.trim()) {
      setError("Enter your academy's name.");
      return;
    }
    setLoading(true);
    setError("");
    const { error: err, linked: wasLinked, approved, needsConfirmation } = await signup(
      name.trim(), email.trim(), password, role,
      NEEDS_PLAYER_LOOKUP.includes(role) ? playerEmail.trim() : undefined,
      role === "academy_admin" ? academyName.trim() : undefined,
      role === "academy_admin" ? academyLocation.trim() : undefined,
    );
    if (err) {
      setError(err);
      setLoading(false);
      return;
    }
    setLinked(!!wasLinked);
    setAutoApproved(!!approved);
    setNeedsEmailConfirm(needsConfirmation);
    setDone(true);
  }

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-3 mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- small static badge, next/image is overkill */}
            <img src="/crichq_logo.jpeg" alt="CRIC HQ" width={48} height={48}
              className="w-12 h-12 rounded-full bg-white p-1 object-contain flex-shrink-0" />
            <span className="text-3xl font-bold tracking-widest text-white font-mono">CRIC HQ</span>
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
            <h2 className="text-xl font-bold text-white mb-2">{autoApproved ? "You're all set" : "Request submitted"}</h2>
            {linked ? (
              <>
                <p className="text-zinc-400 text-sm leading-relaxed mb-2">
                  This email already has a CRIC HQ account — your request to link a{" "}
                  <span className="text-amber font-semibold">{ROLE_OPTIONS.find((o) => o.value === role)?.label}</span>{" "}
                  identity to it is <span className="text-amber font-semibold">pending approval</span>.
                </p>
                <p className="text-zinc-500 text-xs leading-relaxed mb-6">
                  Once approved, sign in as usual and use the role switcher to move between your linked identities.
                </p>
              </>
            ) : autoApproved ? (
              <>
                <p className="text-zinc-400 text-sm leading-relaxed mb-2">
                  {needsEmailConfirm ? (
                    <>Check your email and confirm your address — <span className="text-pace-green font-semibold">no approval wait</span>, you can sign in the moment it&apos;s confirmed.</>
                  ) : (
                    <>Your account is ready — <span className="text-pace-green font-semibold">sign in now</span>.</>
                  )}
                </p>
                <p className="text-zinc-500 text-xs leading-relaxed mb-6">
                  Your player record was already on file, so there&apos;s no admin review for this account.
                </p>
              </>
            ) : (
              <>
                <p className="text-zinc-400 text-sm leading-relaxed mb-2">
                  Your account is <span className="text-amber font-semibold">pending approval</span> from a platform admin.
                </p>
                <p className="text-zinc-500 text-xs leading-relaxed mb-6">
                  You&apos;ll be notified once your account is approved. This usually takes less than 24 hours.
                </p>
              </>
            )}
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
                    <p className="text-pace-green text-xs mt-1.5">
                      {lookupForCurrentEmail.additionalCount
                        ? `✓ Found ${lookupForCurrentEmail.additionalCount + 1} player records at this email — you'll get access to all of them.`
                        : "✓ Found a matching player record — you'll get access to it."}
                    </p>
                  )}
                  {lookupForCurrentEmail?.status === "not-found" && (
                    <p className="text-red-400 text-xs mt-1.5">No player found with this email — ask your coach to add the player first.</p>
                  )}
                </div>
              )}

              {role === "academy_admin" && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Academy Name</label>
                    <input
                      type="text"
                      value={academyName}
                      onChange={(e) => { setAcademyName(e.target.value); setError(""); }}
                      className="w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm"
                      placeholder="e.g. Bella Vista Fast Bowling"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Academy Location (optional)</label>
                    <input
                      type="text"
                      value={academyLocation}
                      onChange={(e) => setAcademyLocation(e.target.value)}
                      className="w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm"
                      placeholder="e.g. Sydney, NSW"
                    />
                  </div>
                </>
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
                {emailCheckForCurrent?.status === "exists" && (
                  <p className="text-amber text-xs mt-1.5">
                    This email already has a CRIC HQ account. If it&apos;s yours,{" "}
                    <Link href="/login" className="underline hover:opacity-80">sign in</Link> instead —
                    submitting this form will queue a request to link a {ROLE_OPTIONS.find((o) => o.value === role)?.label.toLowerCase()} role
                    to it rather than create a new account.
                  </p>
                )}
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
