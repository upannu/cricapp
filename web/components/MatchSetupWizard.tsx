"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { fetchPlayers, fetchFixture } from "@/lib/db";
import { createMatch, recordTossAndStartMatch, linkFixtureToMatch, type NewParticipantInput } from "@/lib/matches";
import type { Player, MatchFormat, MatchSide, Fixture } from "@/lib/types";

const STEP_LABELS = ["Match Basics", "Home Roster", "Away Roster", "Toss", "Confirm & Start"] as const;

const FORMATS: MatchFormat[] = ["T20", "One Day", "Two-Day", "Limited Overs (Other)"];
const DEFAULT_OVERS: Record<MatchFormat, number | null> = {
  "T20": 20, "One Day": 50, "Two-Day": null, "Limited Overs (Other)": null,
};

type RosterRow = { displayName: string; playerId: string | null };

type Draft = {
  homeLabel: string;
  awayLabel: string;
  format: MatchFormat;
  oversPerSide: string; // kept as a string while editing; parsed to number|null on submit
  venue: string;
  scheduledDate: string;
  homeRoster: RosterRow[];
  awayRoster: RosterRow[];
  tossWonBy: MatchSide | "";
  tossDecision: "Bat" | "Bowl" | "";
};

function emptyDraft(today: string): Draft {
  return {
    homeLabel: "", awayLabel: "", format: "T20", oversPerSide: "20", venue: "", scheduledDate: today,
    homeRoster: [], awayRoster: [], tossWonBy: "", tossDecision: "",
  };
}

const inputCls = "w-full bg-hp-ink px-4 py-3 text-hp-paper placeholder-hp-paper/30 border border-white/12 focus:border-hp-cg focus:outline-none transition-colors text-sm";
const labelCls = "block text-xs font-mono font-semibold text-hp-paper/52 uppercase tracking-widest mb-1.5";

function PickerGrid<T extends string>({ options, value, onChange }: { options: T[]; value: T | ""; onChange: (v: T) => void }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onChange(o)}
          className={`px-4 py-3 text-sm font-display font-bold uppercase border transition-colors cursor-pointer ${
            value === o ? "bg-hp-cg text-hp-paper border-hp-cg" : "bg-hp-ink text-hp-paper/70 border-white/12 hover:border-white/25"
          }`}>
          {o}
        </button>
      ))}
    </div>
  );
}

/** A side's roster step. The home side searches existing CRIC HQ Players (the common case — a
 * CRIC HQ academy's own team); the away side is free-text name entry with an optional "link to an
 * existing player" search, since most opponents aren't CRIC HQ customers. Every row always gets a
 * displayName either way — ball-by-ball attribution never depends on a playerId being set. */
function RosterStep({
  side, roster, onChange, players, allowFreeText,
}: {
  side: MatchSide; roster: RosterRow[]; onChange: (roster: RosterRow[]) => void; players: Player[]; allowFreeText: boolean;
}) {
  const [query, setQuery] = useState("");
  const [freeTextName, setFreeTextName] = useState("");

  const matches = query.trim().length > 0
    ? players.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()) && !roster.some((r) => r.playerId === p.id)).slice(0, 8)
    : [];

  function addPlayer(p: Player) {
    onChange([...roster, { displayName: p.name, playerId: p.id }]);
    setQuery("");
  }
  function addFreeText() {
    if (!freeTextName.trim()) return;
    onChange([...roster, { displayName: freeTextName.trim(), playerId: null }]);
    setFreeTextName("");
  }
  function removeRow(i: number) {
    onChange(roster.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`roster-search-${side}`} className={labelCls}>Search CRIC HQ players</label>
        <input id={`roster-search-${side}`} type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type a player's name…" className={inputCls} />
        {matches.length > 0 && (
          <div className="mt-2 border border-white/12 divide-y divide-white/8">
            {matches.map((p) => (
              <button key={p.id} type="button" onClick={() => addPlayer(p)}
                className="w-full text-left px-4 py-2.5 text-sm text-hp-paper hover:bg-hp-surface transition-colors cursor-pointer">
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {allowFreeText && (
        <div>
          <label htmlFor={`roster-freetext-${side}`} className={labelCls}>Or add by name (opponent not on CRIC HQ)</label>
          <div className="flex gap-2">
            <input id={`roster-freetext-${side}`} type="text" value={freeTextName} onChange={(e) => setFreeTextName(e.target.value)}
              placeholder="Player name" className={inputCls}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFreeText(); } }} />
            <button type="button" onClick={addFreeText}
              className="px-4 py-3 text-sm font-bold text-hp-paper/70 border border-white/15 hover:border-hp-cg hover:text-hp-cg transition-colors cursor-pointer shrink-0">
              + Add
            </button>
          </div>
          <p className="text-xs text-hp-paper/40 mt-1.5">Every ball still gets a named scorecard entry — only a linked player feeds personal career stats.</p>
        </div>
      )}

      <div>
        <p className={labelCls}>{side === "home" ? "Home" : "Away"} roster ({roster.length})</p>
        {roster.length === 0 ? (
          <p className="text-sm text-hp-paper/40 italic">No players added yet.</p>
        ) : (
          <div className="space-y-1.5">
            {roster.map((r, i) => (
              <div key={`${r.displayName}-${i}`} className="flex items-center justify-between px-3 py-2 bg-hp-ink border border-white/10">
                <span className="text-sm text-hp-paper">{r.displayName}{r.playerId && <span className="ml-2 text-xs text-pace-green">· CRIC HQ player</span>}</span>
                <button type="button" onClick={() => removeRow(i)} className="text-xs text-hp-paper/40 hover:text-red-400 transition-colors cursor-pointer">Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** 5-step wizard, following PartnershipApplicationForm's exact shape: 1-indexed step state, one
 * flat draft object, generic update() setter, per-step validateStep(), equal-width progress bar.
 * On submit: creates the Match + both rosters, records the toss, and starts the 1st innings —
 * then hands off to the live ball-entry screen. */
export function MatchSetupWizard() {
  const router = useRouter();
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>(emptyDraft(today));
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const searchParams = useSearchParams();
  const fixtureId = searchParams.get("fixtureId");
  const [fixture, setFixture] = useState<Fixture | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchPlayers(user.role === "coach" ? user.coachId : undefined, user.role === "academy_admin" ? user.academyId : undefined)
      .then(setPlayers)
      .catch(() => setPlayers([]));
  }, [user]);

  // Pre-fill from the fixture this match fulfils, if launched via a competition's "Score This
  // Match" button — fixtureId/competitionId are threaded through to createMatch on submit, and
  // the fixture gets linked back to the created match (see handleStart).
  useEffect(() => {
    if (!fixtureId) return;
    fetchFixture(fixtureId).then((fx) => {
      if (!fx) return;
      setFixture(fx);
      setDraft((prev) => ({ ...prev, homeLabel: fx.homeLabel, awayLabel: fx.awayLabel, venue: fx.venue, scheduledDate: fx.scheduledDate || prev.scheduledDate }));
    }).catch(() => setFixture(null));
  }, [fixtureId]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function validateStep(): string {
    if (step === 1) {
      if (!draft.homeLabel.trim()) return "Home side name is required.";
      if (!draft.awayLabel.trim()) return "Away side name is required.";
      if (!draft.venue.trim()) return "Venue is required.";
    }
    if (step === 2 && draft.homeRoster.length === 0) return "Add at least one home player.";
    if (step === 3 && draft.awayRoster.length === 0) return "Add at least one away player.";
    if (step === 4) {
      if (!draft.tossWonBy) return "Select who won the toss.";
      if (!draft.tossDecision) return "Select the toss decision.";
    }
    return "";
  }

  function handleContinue() {
    const err = validateStep();
    if (err) { setError(err); return; }
    setError("");
    setStep((s) => Math.min(5, s + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleBack() {
    setError("");
    setStep((s) => Math.max(1, s - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleStart() {
    if (!user) return;
    setError("");
    setSubmitting(true);
    try {
      const participants: NewParticipantInput[] = [
        ...draft.homeRoster.map((r) => ({ side: "home" as MatchSide, displayName: r.displayName, playerId: r.playerId })),
        ...draft.awayRoster.map((r) => ({ side: "away" as MatchSide, displayName: r.displayName, playerId: r.playerId })),
      ];
      const { match } = await createMatch({
        homeLabel: draft.homeLabel.trim(), awayLabel: draft.awayLabel.trim(),
        homeAcademyId: user.role === "academy_admin" || user.role === "coach" ? (user.academyId ?? null) : null,
        format: draft.format, oversPerSide: draft.oversPerSide.trim() ? Number(draft.oversPerSide) : DEFAULT_OVERS[draft.format],
        venue: draft.venue.trim(), scheduledDate: draft.scheduledDate,
        competitionId: fixture?.competitionId ?? null, fixtureId: fixture?.id ?? null,
        scoredByCoachId: user.role === "coach" ? (user.coachId ?? null) : null,
        createdByUserId: user.id,
        participants,
      });
      if (fixture) await linkFixtureToMatch(fixture.id, match.id);
      await recordTossAndStartMatch(match.id, draft.tossWonBy as MatchSide, draft.tossDecision as "Bat" | "Bowl");
      router.push(`/matches/${match.id}/score`);
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="bg-hp-surface border border-white/10 border-t-2 border-t-hp-cg p-6 sm:p-8">
        <h1 className="font-display font-black uppercase text-xl text-hp-paper mb-1">Set Up a Match</h1>
        <p className="text-hp-paper/52 text-sm mb-6">Live ball-by-ball scoring, start to finish</p>

        <div className="mb-8">
          <p className="font-mono text-xs text-hp-paper/45 uppercase tracking-wider mb-2">Step {step} of 5 — {STEP_LABELS[step - 1]}</p>
          <div className="flex gap-1.5">
            {STEP_LABELS.map((label, i) => (
              <div key={label} className={`h-1.5 flex-1 ${i + 1 <= step ? "bg-hp-cg" : "bg-white/10"}`} />
            ))}
          </div>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="ms-home-label" className={labelCls}>Home Side *</label>
                <input id="ms-home-label" type="text" value={draft.homeLabel} onChange={(e) => update("homeLabel", e.target.value)} placeholder="e.g. CRIC HQ Academy U16s" className={inputCls} />
              </div>
              <div>
                <label htmlFor="ms-away-label" className={labelCls}>Away Side *</label>
                <input id="ms-away-label" type="text" value={draft.awayLabel} onChange={(e) => update("awayLabel", e.target.value)} placeholder="e.g. Southside CC" className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Format</label>
              <PickerGrid options={FORMATS} value={draft.format} onChange={(f) => update("format", f)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="ms-overs" className={labelCls}>Overs Per Side</label>
                <input id="ms-overs" type="number" min={1} value={draft.oversPerSide} onChange={(e) => update("oversPerSide", e.target.value)} placeholder="Leave blank for unlimited" className={inputCls} />
              </div>
              <div>
                <label htmlFor="ms-date" className={labelCls}>Scheduled Date</label>
                <input id="ms-date" type="date" value={draft.scheduledDate} onChange={(e) => update("scheduledDate", e.target.value)} className={inputCls} />
              </div>
            </div>
            <div>
              <label htmlFor="ms-venue" className={labelCls}>Venue *</label>
              <input id="ms-venue" type="text" value={draft.venue} onChange={(e) => update("venue", e.target.value)} className={inputCls} />
            </div>
          </div>
        )}

        {step === 2 && (
          <RosterStep side="home" roster={draft.homeRoster} onChange={(r) => update("homeRoster", r)} players={players} allowFreeText={false} />
        )}

        {step === 3 && (
          <RosterStep side="away" roster={draft.awayRoster} onChange={(r) => update("awayRoster", r)} players={players} allowFreeText />
        )}

        {step === 4 && (
          <div className="space-y-5">
            <div>
              <label className={labelCls}>Who Won the Toss?</label>
              <PickerGrid options={[draft.homeLabel || "Home", draft.awayLabel || "Away"] as const} value={
                draft.tossWonBy === "home" ? (draft.homeLabel || "Home") : draft.tossWonBy === "away" ? (draft.awayLabel || "Away") : ""
              } onChange={(v) => update("tossWonBy", v === (draft.homeLabel || "Home") ? "home" : "away")} />
            </div>
            <div>
              <label className={labelCls}>Toss Decision</label>
              <PickerGrid options={["Bat", "Bowl"] as const} value={draft.tossDecision} onChange={(v) => update("tossDecision", v)} />
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-3 text-sm">
            <div className="flex justify-between border-b border-white/8 pb-2"><span className="text-hp-paper/52">Match</span><span className="text-hp-paper font-semibold">{draft.homeLabel} v {draft.awayLabel}</span></div>
            <div className="flex justify-between border-b border-white/8 pb-2"><span className="text-hp-paper/52">Format</span><span className="text-hp-paper">{draft.format}{draft.oversPerSide ? ` · ${draft.oversPerSide} overs` : ""}</span></div>
            <div className="flex justify-between border-b border-white/8 pb-2"><span className="text-hp-paper/52">Venue</span><span className="text-hp-paper">{draft.venue}</span></div>
            <div className="flex justify-between border-b border-white/8 pb-2"><span className="text-hp-paper/52">Rosters</span><span className="text-hp-paper">{draft.homeRoster.length} v {draft.awayRoster.length} players</span></div>
            <div className="flex justify-between pb-2"><span className="text-hp-paper/52">Toss</span><span className="text-hp-paper">{draft.tossWonBy === "home" ? draft.homeLabel : draft.awayLabel} won, chose to {draft.tossDecision}</span></div>
          </div>
        )}

        {error && <p className="text-red-400 text-sm mt-4">{error}</p>}

        <div className="flex items-center gap-3 mt-8">
          {step > 1 && (
            <button type="button" onClick={handleBack} disabled={submitting}
              className="px-6 py-3 text-sm font-bold text-hp-paper/70 border border-white/15 hover:border-hp-cg hover:text-hp-cg transition-colors cursor-pointer disabled:opacity-50">
              Back
            </button>
          )}
          {step < 5 ? (
            <button type="button" onClick={handleContinue}
              className="px-6 py-3 text-sm font-bold bg-hp-cg text-hp-paper hover:bg-hp-cg/90 transition-colors cursor-pointer">
              Continue
            </button>
          ) : (
            <button type="button" onClick={handleStart} disabled={submitting}
              className="px-6 py-3 text-sm font-bold bg-hp-cg text-hp-paper hover:bg-hp-cg/90 transition-colors cursor-pointer disabled:opacity-60">
              {submitting ? "Starting…" : "Start Match"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
