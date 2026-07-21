"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Player } from "@/lib/types";
import { updatePlayer } from "@/lib/db";

const BOWLING_STYLES = [
  "Right Arm Fast",
  "Left Arm Fast",
  "Right Arm Fast-Medium",
  "Left Arm Fast-Medium",
  "Right Arm Medium",
  "Left Arm Medium",
] as const;

const AGE_GROUPS = ["U10", "U11", "U12", "U13", "U14", "U16", "U19", "Senior"] as const;
const PLANS = ["Free", "Player Pro", "Coach Pro"] as const;
const CONSENT_OPTIONS = ["N/A", "Confirmed", "Pending"] as const;
const PLAYING_LEVELS = ["Beginner", "Club", "Representative", "State", "National"] as const;
const BATTING_HANDS = ["Right Hand", "Left Hand"] as const;

export function EditPlayerForm({ player }: { player: Player }) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);

  // Profile fields
  const [name, setName] = useState(player.name);
  const [email, setEmail] = useState(player.email);
  const [phone, setPhone] = useState(player.phone);
  const [bowlingStyle, setBowlingStyle] = useState(player.bowlingStyle);
  const [battingHand, setBattingHand] = useState(player.battingHand);
  const [playingLevel, setPlayingLevel] = useState(player.playingLevel);
  const [heightCm, setHeightCm] = useState(player.heightCm?.toString() ?? "");
  const [weightKg, setWeightKg] = useState(player.weightKg?.toString() ?? "");
  const [ageGroup, setAgeGroup] = useState(player.ageGroup);
  const [club, setClub] = useState(player.club);
  const [guardianConsent, setGuardianConsent] = useState(
    player.guardianConsentStatus
  );

  // Subscription fields
  const [plan, setPlan] = useState(player.subscription.plan);
  const [startDate, setStartDate] = useState(player.subscription.startDate);
  const [endDate, setEndDate] = useState(player.subscription.endDate);
  const [sessionsLimit, setSessionsLimit] = useState(
    player.subscription.sessionsLimit?.toString() ?? ""
  );
  const [weeklySessionsPerWeek, setWeeklySessionsPerWeek] = useState<number | "">(
    ""
  );

  // Recalculate end date whenever start date, total sessions, or weekly frequency changes
  useEffect(() => {
    const total = parseInt(sessionsLimit);
    const weekly = typeof weeklySessionsPerWeek === "number" ? weeklySessionsPerWeek : 0;
    if (!startDate || !total || !weekly) return;
    const weeksNeeded = Math.ceil(total / weekly);
    const start = new Date(startDate);
    start.setDate(start.getDate() + weeksNeeded * 7);
    setEndDate(start.toISOString().split("T")[0]);
  }, [startDate, sessionsLimit, weeklySessionsPerWeek]);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    updatePlayer(player.id, {
      name, email, phone,
      bowling_style: bowlingStyle,
      batting_hand: battingHand,
      playing_level: playingLevel,
      height_cm: heightCm ? parseFloat(heightCm) : null,
      weight_kg: weightKg ? parseFloat(weightKg) : null,
      age_group: ageGroup,
      club,
      guardian_consent_status: guardianConsent,
      sub_plan: plan,
      sub_start_date: startDate,
      sub_end_date: endDate,
      sub_sessions_limit: sessionsLimit ? parseInt(sessionsLimit) : null,
    }).then(() => {
      setSaved(true);
      setTimeout(() => router.push(`/players/${player.id}`), 1200);
    });
  }

  const initials = player.name
    .split(" ")
    .map((n) => n[0] ?? "")
    .join("");

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href={`/players/${player.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
        >
          ← Back to Profile
        </Link>
      </div>

      {/* Player identity */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-full bg-pace-green flex items-center justify-center text-black font-bold text-xl flex-shrink-0">
          {initials}
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Edit Player</h1>
          <p className="text-zinc-400 text-sm">{player.name}</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* Profile section */}
        <Section title="Profile">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Full Name">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputCls}
                required
              />
            </Field>

            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
                required
              />
            </Field>

            <Field label="Mobile Number">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputCls}
                placeholder="+61 4xx xxx xxx"
              />
            </Field>

            <Field label="Bowling Style">
              <select
                value={bowlingStyle}
                onChange={(e) => setBowlingStyle(e.target.value as typeof bowlingStyle)}
                className={selectCls}
              >
                {BOWLING_STYLES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Age Group">
              <select
                value={ageGroup}
                onChange={(e) => setAgeGroup(e.target.value as typeof ageGroup)}
                className={selectCls}
              >
                {AGE_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Club">
              <input
                type="text"
                value={club}
                onChange={(e) => setClub(e.target.value)}
                className={inputCls}
              />
            </Field>

            <Field label="Batting Hand">
              <select
                value={battingHand}
                onChange={(e) => setBattingHand(e.target.value as typeof battingHand)}
                className={selectCls}
              >
                {BATTING_HANDS.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Playing Level">
              <select
                value={playingLevel}
                onChange={(e) => setPlayingLevel(e.target.value as typeof playingLevel)}
                className={selectCls}
              >
                {PLAYING_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Height (cm)">
              <input
                type="number"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                className={inputCls}
                placeholder="e.g. 165"
                min={0}
                step="0.1"
              />
            </Field>

            <Field label="Weight (kg)">
              <input
                type="number"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                className={inputCls}
                placeholder="e.g. 58"
                min={0}
                step="0.1"
              />
            </Field>

            <Field label="Guardian Consent">
              <select
                value={guardianConsent}
                onChange={(e) =>
                  setGuardianConsent(e.target.value as typeof guardianConsent)
                }
                className={selectCls}
              >
                {CONSENT_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Section>

        {/* Subscription section */}
        <Section title="Subscription">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Plan">
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value as typeof plan)}
                className={selectCls}
              >
                {PLANS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Total Sessions">
              <input
                type="number"
                value={sessionsLimit}
                onChange={(e) => setSessionsLimit(e.target.value)}
                className={inputCls}
                placeholder="Leave blank for unlimited"
                min={0}
              />
            </Field>

            <Field label="Weekly Sessions">
              <select
                value={weeklySessionsPerWeek}
                onChange={(e) =>
                  setWeeklySessionsPerWeek(
                    e.target.value === "" ? "" : parseInt(e.target.value)
                  )
                }
                className={selectCls}
              >
                <option value="">— Select frequency —</option>
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {n} session{n > 1 ? "s" : ""} / week
                  </option>
                ))}
              </select>
              {weeklySessionsPerWeek && sessionsLimit && (
                <p className="text-xs text-pace-green mt-1.5">
                  ≈{" "}
                  {Math.ceil(parseInt(sessionsLimit) / (weeklySessionsPerWeek as number))}{" "}
                  weeks total
                </p>
              )}
            </Field>

            <Field label="Start Date">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputCls}
                required
              />
            </Field>

            <Field label="End / Renewal Date">
              <div className="relative">
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={`${inputCls} ${
                    weeklySessionsPerWeek && sessionsLimit
                      ? "border-pace-green/50 text-pace-green"
                      : ""
                  }`}
                  required
                />
                {weeklySessionsPerWeek && sessionsLimit && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-pace-green font-semibold pointer-events-none">
                    Auto
                  </span>
                )}
              </div>
            </Field>
          </div>
        </Section>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saved}
            className={`px-6 py-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${
              saved
                ? "bg-pace-green/60 text-black"
                : "bg-pace-green text-black hover:opacity-90"
            }`}
          >
            {saved ? "✓ Saved" : "Save Changes"}
          </button>
          <Link
            href={`/players/${player.id}`}
            className="px-6 py-3 rounded-xl text-sm font-medium text-zinc-400 border border-zinc-700 hover:text-white hover:border-zinc-500 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface rounded-2xl p-6">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-5">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm";

const selectCls =
  "w-full bg-ink rounded-xl px-4 py-3 text-white border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm cursor-pointer";
