"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { fetchMatch, fetchMatchParticipants, fetchInningsForMatch, fetchDeliveries } from "@/lib/db";
import {
  applyBall, initialScoringState, flushDeliveries, undoFlushedDelivery, completeInnings,
  startSecondInnings, oversDecimal,
  type ScoringState, type BallInput,
} from "@/lib/matches";
import type { Match, MatchParticipant, Innings, Delivery, ExtraType, WicketType } from "@/lib/types";

const EXTRA_TYPES: { type: ExtraType; label: string }[] = [
  { type: "Wide", label: "Wide" }, { type: "No Ball", label: "No Ball" },
  { type: "Bye", label: "Bye" }, { type: "Leg Bye", label: "Leg Bye" },
];
const WICKET_TYPES: WicketType[] = ["Bowled", "Caught", "LBW", "Run Out", "Stumped", "Hit Wicket", "Retired Out", "Obstructing the Field"];
const FIELDER_WICKETS: WicketType[] = ["Caught", "Run Out", "Stumped"];

type PendingBall = { input: BallInput; stateBefore: ScoringState; sequence: number };

const AUTOSAVE_INTERVAL_MS = 60_000;

function storageKey(inningsId: string) { return `crichq-pending-balls-${inningsId}`; }

function replay(baseline: ScoringState, pending: PendingBall[]): ScoringState {
  let s = baseline;
  for (const p of pending) s = applyBall(s, p.input).nextState;
  return s;
}

/** Live ball-by-ball entry screen. Extends AttendanceClient's local-draft-then-save pattern, but
 * on three save triggers instead of one (over completion, explicit Save, a 60s autosave timer),
 * since a single end-of-match save is data-loss-risky for a whole innings — see the plan's
 * "Scoring UI" section for the full rationale. pendingBalls also mirrors to localStorage so a hard
 * refresh/crash can reconcile against whatever's already persisted and replay only what's missing. */
export function LiveScoringClient({ matchId }: { matchId: string }) {
  const router = useRouter();
  const { user } = useAuth();

  const [match, setMatch] = useState<Match | null>(null);
  const [participants, setParticipants] = useState<MatchParticipant[]>([]);
  const [innings, setInnings] = useState<Innings | null>(null);
  const [flushedDeliveries, setFlushedDeliveries] = useState<Delivery[]>([]);
  const [baseline, setBaseline] = useState<ScoringState | null>(null);
  const [pendingBalls, setPendingBalls] = useState<PendingBall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Opening/bowler-change selections — only asked when genuinely needed.
  const [openerStriker, setOpenerStriker] = useState("");
  const [openerNonStriker, setOpenerNonStriker] = useState("");
  const [openerBowler, setOpenerBowler] = useState("");
  const [awaitingBowlerChange, setAwaitingBowlerChange] = useState(false);
  const [nextBowlerChoice, setNextBowlerChoice] = useState("");

  // Extra/wicket mini-forms.
  const [activeExtra, setActiveExtra] = useState<ExtraType | null>(null);
  const [extraRuns, setExtraRuns] = useState("1");
  const [wicketForm, setWicketForm] = useState<{ wicketType: WicketType; fielderId: string; dismissedEnd: "striker" | "non-striker"; runsBeforeWicket: string } | null>(null);

  const seqCounter = useRef(0);

  // A Promise.all().then() chain, not a separately-invoked async function — setState calls live
  // inside the .then()/.catch()/.finally() callbacks, matching this codebase's established
  // lint-clean pattern for on-mount data fetching (see SessionsClient.tsx's own effects) rather
  // than calling an async helper bodily inside the effect.
  useEffect(() => {
    let currentInnings: Innings | null = null;

    Promise.all([fetchMatch(matchId), fetchMatchParticipants(matchId), fetchInningsForMatch(matchId)])
      .then(([m, parts, allInnings]) => {
        if (!m) { setError("Match not found."); return null; }
        const current = allInnings.find((i) => i.status === "InProgress") ?? allInnings[allInnings.length - 1] ?? null;
        currentInnings = current;
        setMatch(m);
        setParticipants(parts);
        setInnings(current);
        return current ? fetchDeliveries(current.id) : null;
      })
      .then((deliveries) => {
        if (!currentInnings || !deliveries) return;
        setFlushedDeliveries(deliveries);
        seqCounter.current = deliveries.length;
        if (deliveries.length > 0) {
          // Reconstructed from the LAST delivery's own recorded participants (each Delivery row
          // already records exactly who was striker/non-striker/bowler for that ball — replaying
          // every ball from scratch would lose any mid-innings bowler change, since applyBall
          // never changes bowlerParticipantId on its own, that's a UI-driven decision) plus the
          // Innings row's authoritative running totals (updated in the same batched write as
          // every flush — see flushDeliveries), rather than re-summed by replay.
          const last = deliveries[deliveries.length - 1];
          const preBallState = initialScoringState(last.strikerParticipantId, last.nonStrikerParticipantId, last.bowlerParticipantId);
          const { nextState: postBall, overCompleted } = applyBall(preBallState, {
            runsBat: last.runsBat, runsExtra: last.runsExtra, extraType: last.extraType, wicketType: last.wicketType,
            dismissedEnd: last.dismissedParticipantId === last.nonStrikerParticipantId ? "non-striker" : "striker",
            fielderParticipantId: last.fielderParticipantId, commentary: last.commentary,
          });
          const overNumber = Math.floor(currentInnings.totalOvers);
          const ballInOver = Math.round((currentInnings.totalOvers - overNumber) * 10);
          setBaseline({
            overNumber, ballInOver, deliverySequence: deliveries.length,
            strikerParticipantId: postBall.strikerParticipantId,
            nonStrikerParticipantId: postBall.nonStrikerParticipantId,
            bowlerParticipantId: last.bowlerParticipantId,
            totalRuns: currentInnings.totalRuns, totalWickets: currentInnings.totalWickets,
          });
          if (overCompleted) setAwaitingBowlerChange(true); // reloaded right after an over — still need a bowler pick
        }

        // Recover any unflushed balls from localStorage (crash/refresh recovery).
        try {
          const raw = localStorage.getItem(storageKey(currentInnings.id));
          if (raw) {
            const saved = JSON.parse(raw) as PendingBall[];
            if (Array.isArray(saved) && saved.length > 0) setPendingBalls(saved);
          }
        } catch { /* localStorage unavailable/corrupt — proceed without recovery */ }
      })
      .catch((err) => setError((err as { message?: string })?.message ?? String(err)))
      .finally(() => setLoading(false));
  }, [matchId]);

  // Client-side mirror of callerCanScoreMatch's coach/academy_admin branches, for UX only — the
  // real gate is server-side (RLS on every write, and the match-scorers delegation check only
  // the API/RLS layer can verify). Redirects to the read-only scorecard rather than leaving an
  // unauthorized viewer stuck on a scoring screen none of their taps can actually save.
  useEffect(() => {
    if (!match || !user) return;
    const allowed = user.role === "platform_admin"
      || (user.role === "coach" && !!user.coachId && user.coachId === match.scoredByCoachId)
      || (user.role === "academy_admin" && !!user.academyId && user.academyId === match.homeAcademyId);
    if (!allowed) router.replace(`/matches/${matchId}`);
  }, [match, user, router, matchId]);

  // Mirror pendingBalls to localStorage on every change — the crash-safety net for anything
  // between autosaves.
  useEffect(() => {
    if (!innings) return;
    try {
      if (pendingBalls.length === 0) localStorage.removeItem(storageKey(innings.id));
      else localStorage.setItem(storageKey(innings.id), JSON.stringify(pendingBalls));
    } catch { /* best-effort only */ }
  }, [pendingBalls, innings]);

  const scoringState = useMemo(() => (baseline ? replay(baseline, pendingBalls) : null), [baseline, pendingBalls]);

  const effectiveState = useMemo(() => {
    if (!scoringState) return null;
    if (awaitingBowlerChange) return null; // block ball entry until a new bowler is chosen
    return scoringState;
  }, [scoringState, awaitingBowlerChange]);

  const doFlush = useCallback(async (toFlush: PendingBall[], resultingState: ScoringState) => {
    if (!innings || toFlush.length === 0) return;
    setSaving(true);
    try {
      await flushDeliveries(innings.id, toFlush.map((p) => ({ delivery: applyBall(p.stateBefore, p.input).delivery, sequence: p.sequence })), resultingState);
      const refreshed = await fetchDeliveries(innings.id);
      setFlushedDeliveries(refreshed);
      setBaseline(resultingState);
      setPendingBalls([]);
      // Keep the Innings row's own totals in local state synchronized too — undoLastBall reads
      // innings.totalRuns/totalWickets/totalOvers as its authoritative "before" figures, so a
      // stale copy here would make an undo after a second flush roll back to the wrong totals.
      setInnings((prev) => prev && {
        ...prev, totalRuns: resultingState.totalRuns, totalWickets: resultingState.totalWickets,
        totalOvers: oversDecimal(resultingState.overNumber, resultingState.ballInOver),
      });
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
    } finally {
      setSaving(false);
    }
  }, [innings]);

  // Autosave timer — flushes whatever's unflushed every 60s, the true crash-safety net on top of
  // the localStorage mirror and the over-completion/explicit-Save triggers.
  useEffect(() => {
    const timer = setInterval(() => {
      setPendingBalls((current) => {
        if (current.length > 0 && baseline) {
          const resultingState = replay(baseline, current);
          doFlush(current, resultingState);
        }
        return current;
      });
    }, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [baseline, doFlush]);

  function startInnings() {
    if (!openerStriker || !openerNonStriker || !openerBowler) return;
    setBaseline(initialScoringState(openerStriker, openerNonStriker, openerBowler));
  }

  function recordBall(input: BallInput) {
    if (!effectiveState) return;
    const stateBefore = awaitingBowlerChange && nextBowlerChoice
      ? { ...effectiveState, bowlerParticipantId: nextBowlerChoice }
      : effectiveState;
    const result = applyBall(stateBefore, input);
    const pending: PendingBall = { input, stateBefore, sequence: ++seqCounter.current };
    const next = [...pendingBalls, pending];
    setPendingBalls(next);
    setActiveExtra(null);
    setWicketForm(null);
    if (result.overCompleted) {
      setAwaitingBowlerChange(true);
      setNextBowlerChoice("");
      doFlush(next, result.nextState); // flush at the natural over-completion checkpoint
    }
  }

  function confirmBowlerChange() {
    if (!nextBowlerChoice) return;
    setAwaitingBowlerChange(false);
  }

  async function undoLastBall() {
    if (pendingBalls.length > 0) {
      setPendingBalls(pendingBalls.slice(0, -1));
      return;
    }
    if (!innings || flushedDeliveries.length === 0) return;
    // Undoing the last persisted ball doesn't need to replay anything either — it directly
    // restores that ball's own pre-ball striker/non-striker/bowler (recorded on the delivery
    // itself) and subtracts its own contribution from the Innings row's authoritative totals.
    const last = flushedDeliveries[flushedDeliveries.length - 1];
    const wasLegal = last.extraType !== "Wide" && last.extraType !== "No Ball";
    const currentOver = Math.floor(innings.totalOvers);
    const currentBall = Math.round((innings.totalOvers - currentOver) * 10);
    let overNumber = currentOver, ballInOver = currentBall;
    if (wasLegal) {
      ballInOver -= 1;
      if (ballInOver < 0) { overNumber = Math.max(0, overNumber - 1); ballInOver = 5; }
    }
    const rolledBack: ScoringState = {
      overNumber, ballInOver, deliverySequence: flushedDeliveries.length - 1,
      strikerParticipantId: last.strikerParticipantId,
      nonStrikerParticipantId: last.nonStrikerParticipantId,
      bowlerParticipantId: last.bowlerParticipantId,
      totalRuns: innings.totalRuns - (last.runsBat + last.runsExtra),
      totalWickets: innings.totalWickets - (last.wicketType ? 1 : 0),
    };
    await undoFlushedDelivery(innings.id, last.id, rolledBack);
    const refreshed = await fetchDeliveries(innings.id);
    setFlushedDeliveries(refreshed);
    setBaseline(rolledBack);
    setInnings((prev) => prev && { ...prev, totalRuns: rolledBack.totalRuns, totalWickets: rolledBack.totalWickets, totalOvers: oversDecimal(rolledBack.overNumber, rolledBack.ballInOver) });
    setAwaitingBowlerChange(false);
  }

  async function handleManualSave() {
    if (!baseline || pendingBalls.length === 0) return;
    await doFlush(pendingBalls, replay(baseline, pendingBalls));
  }

  async function handleEndInnings() {
    if (!innings || !match) return;
    if (pendingBalls.length > 0 && baseline) await doFlush(pendingBalls, replay(baseline, pendingBalls));
    await completeInnings(innings.id);
    if (innings.inningsNumber === 1) {
      const fresh = await fetchInningsForMatch(matchId);
      const first = fresh.find((i) => i.id === innings.id)!;
      const second = await startSecondInnings(matchId, first);
      setInnings(second);
      setFlushedDeliveries([]);
      setBaseline(null);
      setPendingBalls([]);
      setOpenerStriker(""); setOpenerNonStriker(""); setOpenerBowler("");
      // If innings 1's very last ball also completed an over (a whole-overs match ends exactly
      // on an over boundary), awaitingBowlerChange would otherwise carry over into the fresh
      // innings and block ball entry on a spurious "select the next bowler" prompt before a
      // single ball of innings 2 has even been bowled.
      setAwaitingBowlerChange(false);
      setNextBowlerChoice("");
      seqCounter.current = 0;
    } else {
      const res = await fetch(`/api/matches/${matchId}/complete`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Could not complete the match."); return; }
      router.push(`/matches/${matchId}`);
    }
  }

  if (loading) return <div className="max-w-3xl mx-auto px-6 py-10 text-hp-paper/45 text-sm">Loading…</div>;
  if (error && !match) return <div className="max-w-3xl mx-auto px-6 py-10 text-red-400 text-sm">{error}</div>;
  if (!match || !innings) return <div className="max-w-3xl mx-auto px-6 py-10 text-hp-paper/45 text-sm">No innings in progress.</div>;

  const battingRoster = participants.filter((p) => p.side === innings.battingSide);
  const bowlingRoster = participants.filter((p) => p.side === innings.bowlingSide);
  const nameFor = (id: string) => participants.find((p) => p.id === id)?.displayName ?? "—";

  if (!baseline) {
    return (
      <div className="max-w-xl mx-auto px-6 py-10">
        <div className="bg-hp-surface border border-white/10 p-6">
          <h1 className="font-display font-black uppercase text-lg text-hp-paper mb-4">
            {match.homeLabel} v {match.awayLabel} — Innings {innings.inningsNumber}
          </h1>
          <p className="text-xs font-mono uppercase tracking-widest text-hp-paper/52 mb-4">Select opening batters and bowler</p>
          {battingRoster.length < 2 || bowlingRoster.length < 1 ? (
            <p className="text-red-400 text-sm">
              {battingRoster.length < 2
                ? "The batting side needs at least 2 players (a striker and a non-striker) before this innings can start."
                : "The bowling side needs at least 1 player before this innings can start."}
              {" "}Add more players to the match roster first.
            </p>
          ) : (
          <div className="space-y-4">
            <PlayerSelect label="Striker" roster={battingRoster} value={openerStriker} exclude={openerNonStriker} onChange={setOpenerStriker} />
            <PlayerSelect label="Non-Striker" roster={battingRoster} value={openerNonStriker} exclude={openerStriker} onChange={setOpenerNonStriker} />
            <PlayerSelect label="Opening Bowler" roster={bowlingRoster} value={openerBowler} onChange={setOpenerBowler} />
            <button type="button" onClick={startInnings} disabled={!openerStriker || !openerNonStriker || !openerBowler}
              className="px-6 py-3 text-sm font-bold bg-hp-cg text-hp-paper hover:bg-hp-cg/90 transition-colors cursor-pointer disabled:opacity-50">
              Start Innings
            </button>
          </div>
          )}
        </div>
      </div>
    );
  }

  const live = scoringState!;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="bg-hp-surface border border-white/10 p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="font-display font-black uppercase text-lg text-hp-paper">{match.homeLabel} v {match.awayLabel}</h1>
          <span className="text-xs font-mono text-hp-paper/45">{saving ? "Saving…" : pendingBalls.length > 0 ? `${pendingBalls.length} unsaved` : "All saved"}</span>
        </div>
        <div className="flex items-baseline gap-4">
          <span className="text-3xl font-display font-black text-hp-paper">{live.totalRuns}/{live.totalWickets}</span>
          <span className="text-sm font-mono text-hp-paper/52">{oversDecimal(live.overNumber, live.ballInOver)} overs</span>
          {innings.targetRuns && <span className="text-sm text-pace-green">Target {innings.targetRuns}</span>}
        </div>
        <div className="mt-2 text-sm text-hp-paper/70">
          {nameFor(live.strikerParticipantId)}* &amp; {nameFor(live.nonStrikerParticipantId)} · {nameFor(live.bowlerParticipantId)} bowling
        </div>
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {awaitingBowlerChange ? (
        <div className="bg-hp-surface border border-white/10 p-5 mb-4">
          <p className="text-xs font-mono uppercase tracking-widest text-hp-paper/52 mb-3">Over complete — select the next bowler</p>
          <PlayerSelect label="Bowler" roster={bowlingRoster} value={nextBowlerChoice} exclude={live.bowlerParticipantId} onChange={setNextBowlerChoice} />
          <button type="button" onClick={confirmBowlerChange} disabled={!nextBowlerChoice}
            className="mt-3 px-6 py-3 text-sm font-bold bg-hp-cg text-hp-paper hover:bg-hp-cg/90 transition-colors cursor-pointer disabled:opacity-50">
            Confirm Bowler
          </button>
        </div>
      ) : (
        <div className="bg-hp-surface border border-white/10 p-5 mb-4 space-y-4">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {[0, 1, 2, 3, 4, 6].map((r) => (
              <button key={r} type="button" onClick={() => recordBall({ runsBat: r, runsExtra: 0, extraType: null, wicketType: null, dismissedEnd: null, fielderParticipantId: null, commentary: null })}
                className="py-4 text-lg font-display font-black bg-hp-ink text-hp-paper border border-white/12 hover:border-hp-cg hover:text-hp-cg transition-colors cursor-pointer">
                {r}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {EXTRA_TYPES.map(({ type, label }) => (
              <button key={type} type="button" onClick={() => { setActiveExtra(type); setExtraRuns("1"); }}
                className="py-3 text-sm font-bold text-hp-paper/70 border border-white/15 hover:border-hp-cg hover:text-hp-cg transition-colors cursor-pointer">
                {label}
              </button>
            ))}
            <button type="button" onClick={() => setWicketForm({ wicketType: "Bowled", fielderId: "", dismissedEnd: "striker", runsBeforeWicket: "0" })}
              className="py-3 text-sm font-bold text-red-400 border border-red-400/40 hover:bg-red-400/10 transition-colors cursor-pointer">
              Wicket
            </button>
          </div>

          {activeExtra && (
            <div className="flex items-center gap-3 p-3 bg-hp-ink border border-white/10">
              <span className="text-sm text-hp-paper/70">{activeExtra} — runs:</span>
              <input type="number" min={activeExtra === "Wide" || activeExtra === "No Ball" ? 1 : 0} value={extraRuns} onChange={(e) => setExtraRuns(e.target.value)} className="w-20 bg-hp-surface px-2 py-1.5 text-hp-paper border border-white/12 text-sm" />
              <button type="button" onClick={() => {
                const runs = Math.max(0, Number(extraRuns) || 0);
                const isNoBallOrWide = activeExtra === "Wide" || activeExtra === "No Ball";
                recordBall({
                  runsBat: 0, runsExtra: isNoBallOrWide ? Math.max(1, runs) : runs, extraType: activeExtra,
                  wicketType: null, dismissedEnd: null, fielderParticipantId: null, commentary: null,
                });
              }} className="px-4 py-1.5 text-sm font-bold bg-hp-cg text-hp-paper hover:bg-hp-cg/90 transition-colors cursor-pointer">
                Confirm
              </button>
              <button type="button" onClick={() => setActiveExtra(null)} className="text-xs text-hp-paper/40 hover:text-hp-paper transition-colors cursor-pointer">Cancel</button>
            </div>
          )}

          {wicketForm && (
            <div className="p-3 bg-hp-ink border border-white/10 space-y-2.5">
              <div>
                <label className={inlineLabelCls}>Wicket Type</label>
                <select value={wicketForm.wicketType} onChange={(e) => setWicketForm({ ...wicketForm, wicketType: e.target.value as WicketType })} className={inlineSelectCls}>
                  {WICKET_TYPES.map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              {FIELDER_WICKETS.includes(wicketForm.wicketType) && (
                <div>
                  <label className={inlineLabelCls}>Fielder</label>
                  <PlayerSelect label="" roster={bowlingRoster} value={wicketForm.fielderId} onChange={(v) => setWicketForm({ ...wicketForm, fielderId: v })} />
                </div>
              )}
              {wicketForm.wicketType === "Run Out" && (
                <div>
                  <label className={inlineLabelCls}>Batter Out</label>
                  <select value={wicketForm.dismissedEnd} onChange={(e) => setWicketForm({ ...wicketForm, dismissedEnd: e.target.value as "striker" | "non-striker" })} className={inlineSelectCls}>
                    <option value="striker">{nameFor(live.strikerParticipantId)} (striker)</option>
                    <option value="non-striker">{nameFor(live.nonStrikerParticipantId)} (non-striker)</option>
                  </select>
                </div>
              )}
              <div>
                <label className={inlineLabelCls}>Runs Completed Before Dismissal</label>
                <input type="number" min={0} value={wicketForm.runsBeforeWicket} onChange={(e) => setWicketForm({ ...wicketForm, runsBeforeWicket: e.target.value })} className={inlineSelectCls} />
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => recordBall({
                  runsBat: Math.max(0, Number(wicketForm.runsBeforeWicket) || 0), runsExtra: 0, extraType: null,
                  wicketType: wicketForm.wicketType, dismissedEnd: wicketForm.dismissedEnd,
                  fielderParticipantId: wicketForm.fielderId || null, commentary: null,
                })} className="px-4 py-1.5 text-sm font-bold bg-red-400/90 text-hp-ink hover:bg-red-400 transition-colors cursor-pointer">
                  Confirm Wicket
                </button>
                <button type="button" onClick={() => setWicketForm(null)} className="text-xs text-hp-paper/40 hover:text-hp-paper transition-colors cursor-pointer">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="button" onClick={undoLastBall} disabled={pendingBalls.length === 0 && flushedDeliveries.length === 0}
          className="px-5 py-2.5 text-sm font-bold text-hp-paper/70 border border-white/15 hover:border-hp-cg hover:text-hp-cg transition-colors cursor-pointer disabled:opacity-40">
          Undo Last Ball
        </button>
        <button type="button" onClick={handleManualSave} disabled={pendingBalls.length === 0 || saving}
          className="px-5 py-2.5 text-sm font-bold text-hp-paper/70 border border-white/15 hover:border-hp-cg hover:text-hp-cg transition-colors cursor-pointer disabled:opacity-40">
          Save Now
        </button>
        <button type="button" onClick={handleEndInnings}
          className="ml-auto px-5 py-2.5 text-sm font-bold bg-hp-cg text-hp-paper hover:bg-hp-cg/90 transition-colors cursor-pointer">
          {innings.inningsNumber === 1 ? "End Innings" : "Complete Match"}
        </button>
      </div>
    </div>
  );
}

const inlineLabelCls = "block text-xs text-hp-paper/52 mb-1";
const inlineSelectCls = "w-full bg-hp-surface px-3 py-2 text-hp-paper border border-white/12 text-sm";

function PlayerSelect({ label, roster, value, exclude, onChange }: {
  label: string; roster: MatchParticipant[]; value: string; exclude?: string; onChange: (id: string) => void;
}) {
  return (
    <div>
      {label && <label className={inlineLabelCls}>{label}</label>}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inlineSelectCls}>
        <option value="">Select…</option>
        {roster.filter((p) => p.id !== exclude).map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
      </select>
    </div>
  );
}
