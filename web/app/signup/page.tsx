"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";

type Role = "academy_admin" | "coach" | "player" | "parent";
type AgeGroup = "U10" | "U11" | "U12" | "U13" | "U14" | "U16" | "U19" | "Senior";

const ROLE_OPTIONS: { value: Role; label: string; desc: string }[] = [
  { value: "academy_admin", label: "Academy Admin", desc: "Manage your academy, coaches & players" },
  { value: "coach", label: "Coach", desc: "Track your players' sessions & progress" },
  { value: "player", label: "Player", desc: "View your own sessions, reports & progress" },
  { value: "parent", label: "Parent / Guardian", desc: "View your child's progress & give consent" },
];

const NEEDS_PLAYER_LOOKUP: Role[] = ["player", "parent"];
const PREFILLABLE_ROLES: Role[] = ["player", "parent"];
const AGE_GROUPS: AgeGroup[] = ["U10", "U11", "U12", "U13", "U14", "U16", "U19", "Senior"];

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
  // "I'm new here" — a player with no coach/academy at all yet, creating their own standalone
  // player record instead of linking to one a coach already added. Only offered for role ===
  // "player" (see complete-signup's own comment for why parent stays lookup-only).
  const [newPlayerMode, setNewPlayerMode] = useState(false);
  const [newPlayerAgeGroup, setNewPlayerAgeGroup] = useState<AgeGroup>("U14");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [linked, setLinked] = useState(false);
  const [autoApproved, setAutoApproved] = useState(false);
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false);
  // Set only for the player/parent path — see api/request-signup-link's own comment for why this
  // has no live equivalent of the old "✓ Found a matching player record" check: revealing that
  // live, to anyone typing any email with no signup commitment at all, was an account/PII
  // enumeration oracle. The only place the real answer becomes visible now is an email sent to
  // this address, not this response.
  const [checkEmailAddress, setCheckEmailAddress] = useState("");

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

  const isNewPlayer = role === "player" && newPlayerMode;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (NEEDS_PLAYER_LOOKUP.includes(role) && !isNewPlayer && !playerEmail.trim()) {
      setError("Enter the player's registered email so we can link your account — ask your coach if you're not sure.");
      return;
    }
    if (role === "academy_admin" && !academyName.trim()) {
      setError("Enter your academy's name.");
      return;
    }
    setLoading(true);
    setError("");
    const { error: err, linked: wasLinked, approved, needsConfirmation, checkEmail } = await signup(
      name.trim(), email.trim(), password, role,
      NEEDS_PLAYER_LOOKUP.includes(role) && !isNewPlayer ? playerEmail.trim() : undefined,
      role === "academy_admin" ? academyName.trim() : undefined,
      role === "academy_admin" ? academyLocation.trim() : undefined,
      isNewPlayer ? newPlayerAgeGroup : undefined,
    );
    if (err) {
      setError(err);
      setLoading(false);
      return;
    }
    setLinked(!!wasLinked);
    setAutoApproved(!!approved);
    setNeedsEmailConfirm(needsConfirmation);
    setCheckEmailAddress(checkEmail ?? "");
    setDone(true);
  }

  return (
    <div className="min-h-screen bg-hp-ink flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
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

        {done ? (
          <div className="border border-white/12 bg-hp-surface p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-amber/10 border border-amber/30 flex items-center justify-center mx-auto mb-5">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h2 className="font-display font-black uppercase text-xl text-hp-paper mb-2 tracking-wide">
              {checkEmailAddress ? "Check your email" : autoApproved ? "You're all set" : "Request submitted"}
            </h2>
            {checkEmailAddress ? (
              <>
                <p className="text-hp-paper/60 text-sm leading-relaxed mb-2">
                  If <span className="text-hp-paper font-semibold">{checkEmailAddress}</span> matches a player on file,
                  we&apos;ve sent instructions there to finish creating your account.
                </p>
                <p className="text-hp-paper/40 text-xs leading-relaxed mb-6">
                  Didn&apos;t get anything after a few minutes? Double check the email your coach has on file, or ask them to add the player first.
                </p>
              </>
            ) : linked ? (
              <>
                <p className="text-hp-paper/60 text-sm leading-relaxed mb-2">
                  This email already has a CRIC HQ account — your request to link a{" "}
                  <span className="text-amber font-semibold">{ROLE_OPTIONS.find((o) => o.value === role)?.label}</span>{" "}
                  identity to it is <span className="text-amber font-semibold">pending approval</span>.
                </p>
                <p className="text-hp-paper/40 text-xs leading-relaxed mb-6">
                  Once approved, sign in as usual and use the role switcher to move between your linked identities.
                </p>
              </>
            ) : autoApproved ? (
              <>
                <p className="text-hp-paper/60 text-sm leading-relaxed mb-2">
                  {needsEmailConfirm ? (
                    <>Check your email and confirm your address — <span className="text-hp-cg font-semibold">no approval wait</span>, you can sign in the moment it&apos;s confirmed.</>
                  ) : (
                    <>Your account is ready — <span className="text-hp-cg font-semibold">sign in now</span>.</>
                  )}
                </p>
                <p className="text-hp-paper/40 text-xs leading-relaxed mb-6">
                  {isNewPlayer
                    ? "Your player profile has been created — head to Find a Coach once you're signed in to get matched with one."
                    : "Your player record was already on file, so there's no admin review for this account."}
                </p>
              </>
            ) : (
              <>
                <p className="text-hp-paper/60 text-sm leading-relaxed mb-2">
                  Your account is <span className="text-amber font-semibold">pending approval</span> from a platform admin.
                </p>
                <p className="text-hp-paper/40 text-xs leading-relaxed mb-6">
                  You&apos;ll be notified once your account is approved. This usually takes less than 24 hours.
                </p>
              </>
            )}
            <Link
              href="/login"
              className="inline-block w-full border border-white/15 text-hp-paper/80 font-bold py-3.5 hover:border-white/30 transition-colors text-sm uppercase tracking-wider text-center"
            >
              Back to Sign In
            </Link>
          </div>
        ) : (
          <div className="border border-white/12 bg-hp-surface p-8">
            <h2 className="font-display font-black uppercase text-2xl text-hp-paper mb-6 text-center tracking-wide">Create your account</h2>

            {/* Role selector */}
            <div className="grid grid-cols-2 gap-2 mb-6">
              {ROLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setRole(opt.value); setNewPlayerMode(false); }}
                  className={`p-3.5 border text-left transition-all cursor-pointer ${
                    role === opt.value
                      ? "border-hp-cg bg-hp-cg/10"
                      : "border-white/12 hover:border-white/25"
                  }`}
                >
                  <div className={`text-sm font-semibold mb-0.5 ${role === opt.value ? "text-hp-cg" : "text-hp-paper"}`}>
                    {opt.label}
                  </div>
                  <div className="text-xs text-hp-paper/45 leading-snug">{opt.desc}</div>
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {role === "player" && (
                <div className="flex gap-1 mb-1">
                  {([
                    { value: false, label: "I have a coach" },
                    { value: true, label: "I'm new here" },
                  ] as const).map((opt) => (
                    <button
                      key={String(opt.value)}
                      type="button"
                      onClick={() => { setNewPlayerMode(opt.value); setError(""); }}
                      className={`flex-1 px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                        newPlayerMode === opt.value ? "bg-hp-cg text-hp-paper" : "bg-hp-ink text-hp-paper/60 hover:text-hp-paper border border-white/12"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}

              {isNewPlayer ? (
                <div>
                  <label className="block text-xs font-mono font-semibold text-hp-paper/52 uppercase tracking-widest mb-1.5">Age Group</label>
                  <select
                    value={newPlayerAgeGroup}
                    onChange={(e) => setNewPlayerAgeGroup(e.target.value as AgeGroup)}
                    className="w-full bg-hp-ink px-4 py-3 text-hp-paper border border-white/12 focus:border-hp-cg focus:outline-none transition-colors text-sm cursor-pointer"
                  >
                    {AGE_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <p className="text-hp-paper/45 text-xs mt-1.5">
                    No coach yet? That&apos;s fine — you can find one from your account once you&apos;re signed in.
                  </p>
                </div>
              ) : NEEDS_PLAYER_LOOKUP.includes(role) && (
                <div>
                  <label className="block text-xs font-mono font-semibold text-hp-paper/52 uppercase tracking-widest mb-1.5">
                    {role === "parent" ? "Your Child's Registered Email" : "Your Registered Player Email"}
                  </label>
                  <input
                    type="email"
                    value={playerEmail}
                    onChange={(e) => { setPlayerEmail(e.target.value); setError(""); }}
                    className="w-full bg-hp-ink px-4 py-3 text-hp-paper placeholder-hp-paper/30 border border-white/12 focus:border-hp-cg focus:outline-none transition-colors text-sm"
                    placeholder="The email your coach has on file"
                    required
                  />
                  {/* Deliberately no live "found"/"not found" feedback here — see
                      api/request-signup-link's own comment for why. Whether this email matches
                      anything is only ever revealed by an email sent to it, after submitting. */}
                </div>
              )}

              {role === "academy_admin" && (
                <>
                  <div>
                    <label className="block text-xs font-mono font-semibold text-hp-paper/52 uppercase tracking-widest mb-1.5">Academy Name</label>
                    <input
                      type="text"
                      value={academyName}
                      onChange={(e) => { setAcademyName(e.target.value); setError(""); }}
                      className="w-full bg-hp-ink px-4 py-3 text-hp-paper placeholder-hp-paper/30 border border-white/12 focus:border-hp-cg focus:outline-none transition-colors text-sm"
                      placeholder="e.g. Bella Vista Fast Bowling"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono font-semibold text-hp-paper/52 uppercase tracking-widest mb-1.5">Academy Location (optional)</label>
                    <input
                      type="text"
                      value={academyLocation}
                      onChange={(e) => setAcademyLocation(e.target.value)}
                      className="w-full bg-hp-ink px-4 py-3 text-hp-paper placeholder-hp-paper/30 border border-white/12 focus:border-hp-cg focus:outline-none transition-colors text-sm"
                      placeholder="e.g. Sydney, NSW"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-mono font-semibold text-hp-paper/52 uppercase tracking-widest mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setError(""); }}
                  className="w-full bg-hp-ink px-4 py-3 text-hp-paper placeholder-hp-paper/30 border border-white/12 focus:border-hp-cg focus:outline-none transition-colors text-sm"
                  placeholder={role === "coach" ? "Coach name" : "Your full name"}
                  required
                />
              </div>

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
                <label className="block text-xs font-mono font-semibold text-hp-paper/52 uppercase tracking-widest mb-1.5">Password</label>
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
                {loading ? "Creating account…" : "Create Account"}
              </button>
            </form>

            <p className="text-center text-hp-paper/50 text-sm mt-6">
              Already have an account?{" "}
              <Link href="/login" className="text-hp-cg hover:underline font-medium">
                Sign in
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
