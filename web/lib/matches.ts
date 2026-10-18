/**
 * Business-logic layer for matches/live scoring/competitions — scoring orchestration, career-stats
 * recompute, match-result derivation. Deliberately a single module boundary: every other part of
 * the app (Passport page, nav, homepage) should call through here rather than reaching into the
 * match-related lib/db.ts fetchers or tables directly, so this stays swappable later if live
 * scoring is ever licensed/spun out independently of full CRIC HQ academy management. See the
 * "Match / Live Scoring / Competitions" section of lib/types.ts for the schema design rationale
 * (MatchParticipant's optional playerId, PlayerCareerStats as a materialized rollup, etc.).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  insertMatch, insertMatchParticipants, updateMatch,
  insertInnings, updateInnings, insertDeliveries, deleteDelivery,
  upsertCompetition, upsertFixture, updateFixture,
  dbToMatch, dbToMatchParticipant, dbToInnings, dbToDelivery,
  type DbMatch, type DbMatchParticipant, type DbInnings, type DbDelivery,
  type DbPlayerCareerStats, type DbImportedMatchStats,
} from "@/lib/db";
import type {
  Match, MatchParticipant, MatchFormat, MatchSide, Innings, Delivery,
  ExtraType, WicketType, Competition, Fixture,
} from "@/lib/types";

// ─── ID generation ──────────────────────────────────────────────────────────
// Matches/competitions/fixtures are low-frequency inserts (Date.now() is fine, matching the rest
// of the app's convention). Participants/innings/scorers use a compound key scoped to their
// parent, matching group_session_players' gsp_${groupSessionId}_${playerId} pattern. Deliveries
// are the one genuinely high-frequency insert path in this app, so they use a per-innings
// sequence counter (ScoringState.deliverySequence below) rather than Date.now() — same-millisecond
// collisions are a real risk for rapid ball-by-ball taps.

export function newMatchId(): string { return `m_${Date.now()}`; }
export function newCompetitionId(): string { return `comp_${Date.now()}`; }
export function newFixtureId(): string { return `fx_${Date.now()}`; }
export function newParticipantId(matchId: string, slot: number): string { return `mp_${matchId}_${slot}`; }
export function newInningsId(matchId: string, inningsNumber: number): string { return `in_${matchId}_${inningsNumber}`; }
export function newScorerId(matchId: string, userId: string): string { return `ms_${matchId}_${userId}`; }
export function newDeliveryId(inningsId: string, sequence: number): string {
  return `dl_${inningsId}_${String(sequence).padStart(4, "0")}`;
}

// ─── Match creation ──────────────────────────────────────────────────────────

export interface NewParticipantInput {
  side: MatchSide;
  displayName: string;
  playerId: string | null;
  isCaptain?: boolean;
  isWicketkeeper?: boolean;
}

export interface CreateMatchInput {
  homeLabel: string;
  awayLabel: string;
  homeAcademyId: string | null;
  format: MatchFormat;
  oversPerSide: number | null;
  venue: string;
  scheduledDate: string;
  competitionId: string | null;
  fixtureId: string | null;
  scoredByCoachId: string | null;
  createdByUserId: string;
  participants: NewParticipantInput[];
}

/** Creates a Match (status 'Setup') and its MatchParticipant roster in one orchestrated call.
 * Innings aren't created yet — the batting/bowling side is only known once the toss is decided
 * (see recordTossAndStartMatch). */
export async function createMatch(input: CreateMatchInput): Promise<{ match: Match; participants: MatchParticipant[] }> {
  const id = newMatchId();
  const dbMatch: DbMatch = {
    id, home_label: input.homeLabel, away_label: input.awayLabel, home_academy_id: input.homeAcademyId,
    format: input.format, overs_per_side: input.oversPerSide, status: "Setup", source: "live",
    toss_won_by: null, toss_decision: null, venue: input.venue, scheduled_date: input.scheduledDate,
    competition_id: input.competitionId, fixture_id: input.fixtureId,
    scored_by_coach_id: input.scoredByCoachId, created_by_user_id: input.createdByUserId,
    result: null, created_at: new Date().toISOString(),
  };
  await insertMatch(dbMatch);

  const dbParticipants: DbMatchParticipant[] = input.participants.map((p, i) => ({
    id: newParticipantId(id, i), match_id: id, side: p.side, display_name: p.displayName,
    player_id: p.playerId, batting_order: null,
    is_captain: p.isCaptain ?? false, is_wicketkeeper: p.isWicketkeeper ?? false,
  }));
  await insertMatchParticipants(dbParticipants);

  return { match: dbToMatch(dbMatch), participants: dbParticipants.map(dbToMatchParticipant) };
}

/** Records the toss and starts the match: sets Match.status to 'InProgress' and creates the 1st
 * innings. The side that bats first is derived from who won the toss and what they chose. */
export async function recordTossAndStartMatch(
  matchId: string, tossWonBy: MatchSide, tossDecision: "Bat" | "Bowl",
): Promise<Innings> {
  const battingSide: MatchSide = tossDecision === "Bat" ? tossWonBy : (tossWonBy === "home" ? "away" : "home");
  const bowlingSide: MatchSide = battingSide === "home" ? "away" : "home";

  await updateMatch(matchId, { toss_won_by: tossWonBy, toss_decision: tossDecision, status: "InProgress" });

  const inningsId = newInningsId(matchId, 1);
  const dbInnings: DbInnings = {
    id: inningsId, match_id: matchId, innings_number: 1,
    batting_side: battingSide, bowling_side: bowlingSide, status: "InProgress",
    total_runs: 0, total_wickets: 0, total_overs: 0, target_runs: null,
  };
  await insertInnings(dbInnings);
  return dbToInnings(dbInnings);
}

/** Starts the 2nd innings once the 1st is complete — created lazily (not both innings upfront)
 * so a half-populated 2nd innings never sits around before it's actually needed. */
export async function startSecondInnings(matchId: string, firstInnings: Innings): Promise<Innings> {
  const inningsId = newInningsId(matchId, 2);
  const dbInnings: DbInnings = {
    id: inningsId, match_id: matchId, innings_number: 2,
    batting_side: firstInnings.bowlingSide, bowling_side: firstInnings.battingSide, status: "InProgress",
    total_runs: 0, total_wickets: 0, total_overs: 0, target_runs: firstInnings.totalRuns + 1,
  };
  await insertInnings(dbInnings);
  return dbToInnings(dbInnings);
}

// ─── Ball-by-ball scoring state machine (pure — no IO) ─────────────────────
// The LiveScoringClient component holds a ScoringState in memory and calls applyBall() on every
// tap; nothing here touches the network. Batched persistence (insertDeliveries + updateInnings)
// happens at the call site on its own triggers (over completion / explicit save / autosave timer)
// — see the component for that part of the design.

const BALLS_PER_OVER = 6;

export interface ScoringState {
  /** 0-indexed. */
  overNumber: number;
  /** Legal balls completed so far in the current over (0-5). */
  ballInOver: number;
  /** Every delivery recorded so far this innings, legal or not — used only to generate a
   * collision-safe delivery id (see newDeliveryId), never persisted itself. */
  deliverySequence: number;
  strikerParticipantId: string;
  nonStrikerParticipantId: string;
  bowlerParticipantId: string;
  totalRuns: number;
  totalWickets: number;
}

export function initialScoringState(
  strikerParticipantId: string, nonStrikerParticipantId: string, bowlerParticipantId: string,
): ScoringState {
  return {
    overNumber: 0, ballInOver: 0, deliverySequence: 0,
    strikerParticipantId, nonStrikerParticipantId, bowlerParticipantId,
    totalRuns: 0, totalWickets: 0,
  };
}

export interface BallInput {
  /** Runs scored off the bat — 0 for a Wide/Bye/Leg Bye by definition. */
  runsBat: number;
  /** Extra runs, including the mandatory 1 for a Wide/No Ball plus any additionally run. */
  runsExtra: number;
  extraType: ExtraType | null;
  wicketType: WicketType | null;
  /** Which batter is out — defaults to the striker; only a Run Out can reasonably dismiss the
   * non-striker instead. Ignored when wicketType is null. */
  dismissedEnd: "striker" | "non-striker" | null;
  fielderParticipantId: string | null;
  commentary: string | null;
}

export interface BallResult {
  /** Everything needed to compose a DbDelivery row, except the id/innings id/timestamp — the
   * caller (which owns the innings id and the batch-save timing) fills those in. */
  delivery: Omit<Delivery, "id" | "inningsId" | "recordedAt">;
  nextState: ScoringState;
  /** True when this ball completed an over — the caller should prompt for a bowler change
   * before the next ball, since applyBall doesn't change bowlerParticipantId itself. */
  overCompleted: boolean;
  isLegalDelivery: boolean;
}

function isLegalDelivery(extraType: ExtraType | null): boolean {
  return extraType !== "Wide" && extraType !== "No Ball";
}

/** Runs actually run between the wickets for this ball — determines strike rotation. For a
 * Wide/Bye/Leg Bye, runsBat is always 0 by definition, so the extra runs are what was run; for a
 * normal ball or No Ball, it's the bat runs (a No Ball's mandatory penalty run is excluded from
 * the parity check, matching standard scoring convention). */
function runsRunForRotation(input: BallInput): number {
  if (input.extraType === "Wide" || input.extraType === "Bye" || input.extraType === "Leg Bye") return input.runsExtra;
  return input.runsBat;
}

/** Applies one ball to the current scoring state, returning the delivery to persist and the
 * resulting state. Pure — the caller decides when (and whether) to actually persist the result. */
export function applyBall(state: ScoringState, input: BallInput): BallResult {
  const legal = isLegalDelivery(input.extraType);
  const wicketFell = input.wicketType !== null;

  let overNumber = state.overNumber;
  let ballInOver = state.ballInOver;
  let overCompleted = false;
  if (legal) {
    ballInOver += 1;
    if (ballInOver >= BALLS_PER_OVER) {
      overCompleted = true;
      overNumber += 1;
      ballInOver = 0;
    }
  }

  // Two rotations cancel out — a boundary-ending over doesn't actually swap ends.
  const rotateForRuns = runsRunForRotation(input) % 2 === 1;
  const strikeSwaps = overCompleted ? !rotateForRuns : rotateForRuns;

  const isFour = (input.extraType === null || input.extraType === "No Ball") && input.runsBat === 4;
  const isSix = (input.extraType === null || input.extraType === "No Ball") && input.runsBat === 6;

  const dismissedParticipantId = wicketFell
    ? (input.dismissedEnd === "non-striker" ? state.nonStrikerParticipantId : state.strikerParticipantId)
    : null;

  const delivery: Omit<Delivery, "id" | "inningsId" | "recordedAt"> = {
    overNumber: state.overNumber,
    ballInOver: legal ? ballInOver || BALLS_PER_OVER : state.ballInOver,
    strikerParticipantId: state.strikerParticipantId,
    nonStrikerParticipantId: state.nonStrikerParticipantId,
    bowlerParticipantId: state.bowlerParticipantId,
    runsBat: input.runsBat, runsExtra: input.runsExtra, extraType: input.extraType,
    wicketType: input.wicketType, dismissedParticipantId, fielderParticipantId: input.fielderParticipantId,
    isFour, isSix, commentary: input.commentary,
  };

  const nextState: ScoringState = {
    overNumber, ballInOver, deliverySequence: state.deliverySequence + 1,
    strikerParticipantId: strikeSwaps ? state.nonStrikerParticipantId : state.strikerParticipantId,
    nonStrikerParticipantId: strikeSwaps ? state.strikerParticipantId : state.nonStrikerParticipantId,
    bowlerParticipantId: state.bowlerParticipantId,
    totalRuns: state.totalRuns + input.runsBat + input.runsExtra,
    totalWickets: state.totalWickets + (wicketFell ? 1 : 0),
  };

  return { delivery, nextState, overCompleted, isLegalDelivery: legal };
}

/** Total overs in "X.Y" decimal form (e.g. 14.3) from a ball-count state — the shape
 * Innings.totalOvers is stored in. */
export function oversDecimal(overNumber: number, ballInOver: number): number {
  return overNumber + ballInOver / 10;
}

// ─── Batched persistence ────────────────────────────────────────────────────

/** Flushes a batch of pending deliveries plus the innings' resulting running totals in one
 * logical save — called by LiveScoringClient on each of its three triggers (over completion,
 * explicit Save, autosave timer), never per ball. */
export async function flushDeliveries(
  inningsId: string, pending: { delivery: Omit<Delivery, "id" | "inningsId" | "recordedAt">; sequence: number }[],
  resultingState: ScoringState,
): Promise<void> {
  if (pending.length === 0) return;
  const rows: DbDelivery[] = pending.map(({ delivery, sequence }) => ({
    id: newDeliveryId(inningsId, sequence), innings_id: inningsId,
    over_number: delivery.overNumber, ball_in_over: delivery.ballInOver,
    striker_participant_id: delivery.strikerParticipantId,
    non_striker_participant_id: delivery.nonStrikerParticipantId,
    bowler_participant_id: delivery.bowlerParticipantId,
    runs_bat: delivery.runsBat, runs_extra: delivery.runsExtra, extra_type: delivery.extraType,
    wicket_type: delivery.wicketType, dismissed_participant_id: delivery.dismissedParticipantId,
    fielder_participant_id: delivery.fielderParticipantId,
    is_four: delivery.isFour, is_six: delivery.isSix, commentary: delivery.commentary,
    recorded_at: new Date().toISOString(),
  }));
  await insertDeliveries(rows);
  await updateInnings(inningsId, {
    total_runs: resultingState.totalRuns, total_wickets: resultingState.totalWickets,
    total_overs: oversDecimal(resultingState.overNumber, resultingState.ballInOver),
  });
}

/** Undo-last-ball once a delivery is already flushed — no UI precedent for this anywhere else in
 * the app (mis-taps are a real, frequent occurrence in live scoring). Rolls back the innings
 * totals to the state the ball had added; the caller is responsible for rolling back its own
 * in-memory ScoringState to match. */
export async function undoFlushedDelivery(inningsId: string, deliveryId: string, rolledBackState: ScoringState): Promise<void> {
  await deleteDelivery(deliveryId);
  await updateInnings(inningsId, {
    total_runs: rolledBackState.totalRuns, total_wickets: rolledBackState.totalWickets,
    total_overs: oversDecimal(rolledBackState.overNumber, rolledBackState.ballInOver),
  });
}

export async function completeInnings(inningsId: string): Promise<void> {
  await updateInnings(inningsId, { status: "Completed" });
}

/** "InProgress" -> "In Progress" for display — every other MatchStatus/InningsStatus value is
 * already space-separated, so a blind uppercase() alone collapses this one into "INPROGRESS". */
export function matchStatusLabel(status: string): string {
  return status.replace(/([a-z])([A-Z])/g, "$1 $2");
}

// ─── Match result ────────────────────────────────────────────────────────────

function runsForSide(innings: Innings[], side: MatchSide): number {
  return innings.filter((i) => i.battingSide === side).reduce((sum, i) => sum + i.totalRuns, 0);
}

/** Who won, from each side's total runs across however many innings exist — 'tie' if level,
 * null if there's no innings data at all (nothing bowled, or an abandonment before a result). */
export function determineWinner(innings: Innings[]): MatchSide | "tie" | null {
  if (innings.length === 0) return null;
  const homeRuns = runsForSide(innings, "home");
  const awayRuns = runsForSide(innings, "away");
  if (homeRuns === awayRuns) return "tie";
  return homeRuns > awayRuns ? "home" : "away";
}

/** Human-readable result summary, computed once at match completion — not derived live. The side
 * batting in the final innings, if they won, wins "by N wickets" (a successful chase); the side
 * that bowled last always wins "by N runs" — matches standard cricket result phrasing. */
export function computeMatchResult(
  innings: Innings[], homeLabel: string, awayLabel: string, playersPerSide = 11,
): string {
  const winner = determineWinner(innings);
  if (winner === null || winner === "tie") return "Match tied";

  const winnerLabel = winner === "home" ? homeLabel : awayLabel;
  const lastInnings = innings[innings.length - 1];

  if (lastInnings && lastInnings.battingSide === winner) {
    const wicketsRemaining = Math.max(0, playersPerSide - 1 - lastInnings.totalWickets);
    return `${winnerLabel} won by ${wicketsRemaining} wicket${wicketsRemaining === 1 ? "" : "s"}`;
  }
  const margin = Math.abs(runsForSide(innings, "home") - runsForSide(innings, "away"));
  return `${winnerLabel} won by ${margin} run${margin === 1 ? "" : "s"}`;
}

// ─── Competitions / fixtures / ladders ──────────────────────────────────────
// Standings are always live-computed (fetch a competition's completed matches + their innings and
// reduce), never materialized — a competition's match count is modest even for a busy academy's
// full season, so there's no scale reason to pre-aggregate the way player_career_stats needs to.

/** Converts cricket's "X.Y" overs notation (Y = balls 0-5, e.g. 14.3 = 14 overs + 3 balls) — the
 * form Innings.totalOvers is stored in (see oversDecimal above) — into true decimal overs (14.5)
 * for arithmetic like Net Run Rate. These are NOT the same number: naively using the stored
 * notation value directly in a rate calculation silently understates it. */
export function trueOversFromNotation(notationOvers: number): number {
  const overNumber = Math.floor(notationOvers);
  const ballInOver = Math.round((notationOvers - overNumber) * 10);
  return overNumber + ballInOver / BALLS_PER_OVER;
}

/** The overs figure NRR actually uses for one innings — real cricket convention: a team bowled
 * out before using its full allotment is credited with the FULL allotted overs (not the fewer
 * overs it actually took), so getting bowled out cheaply doesn't inflate your own NRR. A team that
 * simply ran out of overs (not all out) uses the overs it actually faced. */
function effectiveOversForNrr(innings: Innings, oversAllotted: number | null, playersPerSide = 11): number {
  const allOut = innings.totalWickets >= playersPerSide - 1;
  if (allOut && oversAllotted !== null) return oversAllotted;
  return trueOversFromNotation(innings.totalOvers);
}

export interface StandingsRow {
  sideLabel: string;
  played: number;
  won: number;
  lost: number;
  tied: number;
  noResult: number;
  points: number;
  netRunRate: number;
}

/** Fetch-then-reduce standings computation (Map-bucketing, same style as finance-summary's own
 * route) over a competition's completed/abandoned matches. `playersPerSide` only affects the
 * NRR all-out threshold, not points — pass it if a competition ever isn't 11-a-side. */
export function computeStandings(
  entries: { match: Match; innings: Innings[] }[],
  competition: Pick<Competition, "pointsForWin" | "pointsForTie" | "pointsForLoss" | "pointsForNoResult">,
  playersPerSide = 11,
): StandingsRow[] {
  interface Bucket {
    played: number; won: number; lost: number; tied: number; noResult: number; points: number;
    runsFor: number; oversFor: number; runsAgainst: number; oversAgainst: number;
  }
  const bySide = new Map<string, Bucket>();
  function bucket(label: string): Bucket {
    let b = bySide.get(label);
    if (!b) { b = { played: 0, won: 0, lost: 0, tied: 0, noResult: 0, points: 0, runsFor: 0, oversFor: 0, runsAgainst: 0, oversAgainst: 0 }; bySide.set(label, b); }
    return b;
  }

  for (const { match, innings } of entries) {
    const home = bucket(match.homeLabel);
    const away = bucket(match.awayLabel);
    home.played += 1;
    away.played += 1;

    const homeInnings = innings.filter((i) => i.battingSide === "home");
    const awayInnings = innings.filter((i) => i.battingSide === "away");
    const homeRuns = homeInnings.reduce((s, i) => s + i.totalRuns, 0);
    const awayRuns = awayInnings.reduce((s, i) => s + i.totalRuns, 0);
    const homeOvers = homeInnings.reduce((s, i) => s + effectiveOversForNrr(i, match.oversPerSide, playersPerSide), 0);
    const awayOvers = awayInnings.reduce((s, i) => s + effectiveOversForNrr(i, match.oversPerSide, playersPerSide), 0);

    home.runsFor += homeRuns; home.oversFor += homeOvers;
    home.runsAgainst += awayRuns; home.oversAgainst += awayOvers;
    away.runsFor += awayRuns; away.oversFor += awayOvers;
    away.runsAgainst += homeRuns; away.oversAgainst += homeOvers;

    const winner = match.status === "Abandoned" ? null : determineWinner(innings);
    if (winner === "tie") {
      home.tied += 1; away.tied += 1;
      home.points += competition.pointsForTie; away.points += competition.pointsForTie;
    } else if (winner === "home" || winner === "away") {
      const [winSide, loseSide] = winner === "home" ? [home, away] : [away, home];
      winSide.won += 1; loseSide.lost += 1;
      winSide.points += competition.pointsForWin; loseSide.points += competition.pointsForLoss;
    } else {
      home.noResult += 1; away.noResult += 1;
      home.points += competition.pointsForNoResult; away.points += competition.pointsForNoResult;
    }
  }

  const rows: StandingsRow[] = Array.from(bySide.entries()).map(([sideLabel, b]) => ({
    sideLabel, played: b.played, won: b.won, lost: b.lost, tied: b.tied, noResult: b.noResult,
    points: b.points,
    netRunRate: b.oversFor > 0 && b.oversAgainst > 0 ? (b.runsFor / b.oversFor) - (b.runsAgainst / b.oversAgainst) : 0,
  }));

  rows.sort((a, b) => b.points - a.points || b.netRunRate - a.netRunRate);
  return rows;
}

export interface CreateCompetitionInput {
  name: string;
  academyId: string | null;
  format: MatchFormat;
  season: string;
  pointsForWin: number;
  pointsForTie: number;
  pointsForLoss: number;
  pointsForNoResult: number;
}

export async function createCompetition(input: CreateCompetitionInput): Promise<Competition> {
  const id = newCompetitionId();
  const row = {
    id, name: input.name, academy_id: input.academyId, format: input.format, season: input.season,
    points_for_win: input.pointsForWin, points_for_tie: input.pointsForTie,
    points_for_loss: input.pointsForLoss, points_for_no_result: input.pointsForNoResult,
    status: "Active", created_at: new Date().toISOString(),
  };
  await upsertCompetition(row);
  return {
    id, name: input.name, academyId: input.academyId, format: input.format, season: input.season,
    pointsForWin: input.pointsForWin, pointsForTie: input.pointsForTie,
    pointsForLoss: input.pointsForLoss, pointsForNoResult: input.pointsForNoResult,
    status: "Active", createdAt: row.created_at,
  };
}

export interface CreateFixtureInput {
  competitionId: string;
  homeLabel: string;
  awayLabel: string;
  scheduledDate: string;
  venue: string;
}

export async function createFixture(input: CreateFixtureInput): Promise<Fixture> {
  const id = newFixtureId();
  await upsertFixture({
    id, competition_id: input.competitionId, home_label: input.homeLabel, away_label: input.awayLabel,
    scheduled_date: input.scheduledDate, venue: input.venue, status: "Scheduled", match_id: null,
  });
  return {
    id, competitionId: input.competitionId, homeLabel: input.homeLabel, awayLabel: input.awayLabel,
    scheduledDate: input.scheduledDate, venue: input.venue, status: "Scheduled", matchId: null,
  };
}

/** Links a fixture to the match that fulfils it, once scoring starts — called right after
 * createMatch in the "Score this match" flow. Deliberately separate from createMatch itself since
 * a standalone friendly match has no fixture to link at all. */
export async function linkFixtureToMatch(fixtureId: string, matchId: string): Promise<void> {
  await updateFixture(fixtureId, { match_id: matchId, status: "Played" });
}

// ─── Career-stats recompute (pure aggregation + service-role write) ────────
// Only deliveries whose participant role resolves to a match_participants row with a non-null
// playerId ever reach this aggregation — a natural consequence of querying match_participants by
// player_id first and only ever looking up deliveries for THOSE participant ids, not a special
// case to maintain separately.

export interface InningsContribution {
  battedThisInnings: boolean;
  runsScored: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  /** True if this player themself was out in this innings (vs. not out / didn't bat). */
  dismissed: boolean;
  bowledThisInnings: boolean;
  ballsBowled: number;
  runsConceded: number;
  wicketsTaken: number;
  catches: number;
  runOuts: number;
  stumpings: number;
}

const BOWLER_CREDITED_WICKET: WicketType[] = ["Bowled", "Caught", "LBW", "Stumped", "Hit Wicket"];

/** One player's (one participant id's) involvement across a single innings' deliveries. */
export function extractInningsContribution(deliveries: Delivery[], participantId: string): InningsContribution {
  let battedThisInnings = false, runsScored = 0, ballsFaced = 0, fours = 0, sixes = 0, dismissed = false;
  let bowledThisInnings = false, ballsBowled = 0, runsConceded = 0, wicketsTaken = 0;
  let catches = 0, runOuts = 0, stumpings = 0;

  for (const d of deliveries) {
    const legal = d.extraType !== "Wide" && d.extraType !== "No Ball";

    if (d.strikerParticipantId === participantId) {
      battedThisInnings = true;
      runsScored += d.runsBat;
      if (d.extraType !== "Wide") ballsFaced += 1; // a no-ball counts as faced; a wide doesn't
      if (d.isFour) fours += 1;
      if (d.isSix) sixes += 1;
      if (d.dismissedParticipantId === participantId) dismissed = true;
    }

    if (d.bowlerParticipantId === participantId) {
      bowledThisInnings = true;
      if (legal) ballsBowled += 1;
      const extrasChargedToBowler = (d.extraType === "Wide" || d.extraType === "No Ball") ? d.runsExtra : 0;
      runsConceded += d.runsBat + extrasChargedToBowler;
      if (d.wicketType && BOWLER_CREDITED_WICKET.includes(d.wicketType)) wicketsTaken += 1;
    }

    if (d.fielderParticipantId === participantId) {
      if (d.wicketType === "Caught") catches += 1;
      if (d.wicketType === "Run Out") runOuts += 1;
      if (d.wicketType === "Stumped") stumpings += 1;
    }
  }

  return { battedThisInnings, runsScored, ballsFaced, fours, sixes, dismissed, bowledThisInnings, ballsBowled, runsConceded, wicketsTaken, catches, runOuts, stumpings };
}

export interface CareerStatsAggregation {
  matchesPlayed: number;
  inningsBatted: number;
  runsScored: number;
  ballsFaced: number;
  notOuts: number;
  fours: number;
  sixes: number;
  highestScore: number;
  inningsBowled: number;
  ballsBowled: number;
  runsConceded: number;
  wickets: number;
  /** -1 sentinel (no bowling at all) is normalized away by callers — see deriveRateStats. */
  bestBowlingWickets: number;
  bestBowlingRuns: number;
  catches: number;
  runOuts: number;
  stumpings: number;
}

export function aggregateCareerStats(perInnings: InningsContribution[], matchesPlayed: number): CareerStatsAggregation {
  let inningsBatted = 0, runsScored = 0, ballsFaced = 0, notOuts = 0, fours = 0, sixes = 0, highestScore = 0;
  let inningsBowled = 0, ballsBowled = 0, runsConceded = 0, wickets = 0;
  let bestBowlingWickets = -1, bestBowlingRuns = 0;
  let catches = 0, runOuts = 0, stumpings = 0;

  for (const c of perInnings) {
    if (c.battedThisInnings) {
      inningsBatted += 1;
      runsScored += c.runsScored;
      ballsFaced += c.ballsFaced;
      fours += c.fours;
      sixes += c.sixes;
      if (!c.dismissed) notOuts += 1;
      if (c.runsScored > highestScore) highestScore = c.runsScored;
    }
    if (c.bowledThisInnings) {
      inningsBowled += 1;
      ballsBowled += c.ballsBowled;
      runsConceded += c.runsConceded;
      wickets += c.wicketsTaken;
      if (c.wicketsTaken > bestBowlingWickets || (c.wicketsTaken === bestBowlingWickets && c.runsConceded < bestBowlingRuns)) {
        bestBowlingWickets = c.wicketsTaken;
        bestBowlingRuns = c.runsConceded;
      }
    }
    catches += c.catches;
    runOuts += c.runOuts;
    stumpings += c.stumpings;
  }

  return { matchesPlayed, inningsBatted, runsScored, ballsFaced, notOuts, fours, sixes, highestScore, inningsBowled, ballsBowled, runsConceded, wickets, bestBowlingWickets, bestBowlingRuns, catches, runOuts, stumpings };
}

/** Folds in imported (PlayHQ) matches' summary-level stats — see lib/types.ts's ImportedMatchStats
 * doc comment for why these are summary-only (no ball-by-ball, so no fours/sixes breakdown). A
 * match is always either live-scored or imported, never both, so no double-counting risk. */
export function combineWithImported(live: CareerStatsAggregation, imported: DbImportedMatchStats[]): CareerStatsAggregation {
  const combined = { ...live };
  for (const row of imported) {
    combined.matchesPlayed += 1;
    const batted = row.balls_faced > 0 || row.runs_scored > 0 || !row.not_out;
    if (batted) {
      combined.inningsBatted += 1;
      combined.runsScored += row.runs_scored;
      combined.ballsFaced += row.balls_faced;
      if (row.not_out) combined.notOuts += 1;
      if (row.runs_scored > combined.highestScore) combined.highestScore = row.runs_scored;
    }
    if (row.balls_bowled > 0) {
      combined.inningsBowled += 1;
      combined.ballsBowled += row.balls_bowled;
      combined.runsConceded += row.runs_conceded;
      combined.wickets += row.wickets;
      if (row.wickets > combined.bestBowlingWickets || (row.wickets === combined.bestBowlingWickets && row.runs_conceded < combined.bestBowlingRuns)) {
        combined.bestBowlingWickets = row.wickets;
        combined.bestBowlingRuns = row.runs_conceded;
      }
    }
    combined.catches += row.catches;
    combined.runOuts += row.run_outs;
    combined.stumpings += row.stumpings;
  }
  return combined;
}

export interface CareerRateStats {
  battingAverage: number | null;
  strikeRate: number | null;
  bowlingAverage: number | null;
  economyRate: number | null;
  bestBowling: string | null;
}

export function deriveRateStats(agg: CareerStatsAggregation): CareerRateStats {
  const dismissals = agg.inningsBatted - agg.notOuts;
  return {
    battingAverage: dismissals > 0 ? agg.runsScored / dismissals : null,
    strikeRate: agg.ballsFaced > 0 ? (agg.runsScored / agg.ballsFaced) * 100 : null,
    bowlingAverage: agg.wickets > 0 ? agg.runsConceded / agg.wickets : null,
    economyRate: agg.ballsBowled > 0 ? (agg.runsConceded / agg.ballsBowled) * 6 : null,
    bestBowling: agg.inningsBowled > 0 ? `${Math.max(agg.bestBowlingWickets, 0)}/${agg.bestBowlingRuns}` : null,
  };
}

/** Recomputes and upserts one player's career rollup from scratch — the only place
 * player_career_stats is ever written, always via a service-role client (never client-direct),
 * same treatment as platform_revenue_events. Called once per linked player when their match
 * completes (recomputeCareerStatsForMatch), not on every Passport page view. */
export async function recomputePlayerCareerStats(supabase: SupabaseClient, playerId: string): Promise<void> {
  const { data: participantRows, error: pErr } = await supabase
    .from("match_participants").select("id, match_id").eq("player_id", playerId);
  if (pErr) throw pErr;
  const participants = (participantRows ?? []) as { id: string; match_id: string }[];
  const participantIds = participants.map((p) => p.id);
  const matchIds = [...new Set(participants.map((p) => p.match_id))];

  const perInnings: InningsContribution[] = [];
  if (participantIds.length > 0 && matchIds.length > 0) {
    const { data: inningsRows, error: iErr } = await supabase.from("innings").select("id").in("match_id", matchIds);
    if (iErr) throw iErr;
    const inningsIds = ((inningsRows ?? []) as { id: string }[]).map((r) => r.id);

    if (inningsIds.length > 0) {
      const { data: deliveryRows, error: dErr } = await supabase.from("deliveries").select("*").in("innings_id", inningsIds);
      if (dErr) throw dErr;
      const deliveries = ((deliveryRows ?? []) as DbDelivery[]).map(dbToDelivery);

      const byInnings = new Map<string, Delivery[]>();
      for (const d of deliveries) {
        const list = byInnings.get(d.inningsId);
        if (list) list.push(d); else byInnings.set(d.inningsId, [d]);
      }
      for (const [, dels] of byInnings) {
        for (const pid of participantIds) {
          const c = extractInningsContribution(dels, pid);
          if (c.battedThisInnings || c.bowledThisInnings || c.catches > 0 || c.runOuts > 0 || c.stumpings > 0) {
            perInnings.push(c);
          }
        }
      }
    }
  }

  const liveAgg = aggregateCareerStats(perInnings, matchIds.length);

  const { data: importedRows, error: impErr } = await supabase.from("imported_match_stats").select("*").eq("player_id", playerId);
  if (impErr) throw impErr;
  const combined = combineWithImported(liveAgg, (importedRows ?? []) as DbImportedMatchStats[]);
  const rates = deriveRateStats(combined);

  const row: DbPlayerCareerStats = {
    player_id: playerId,
    matches_played: combined.matchesPlayed, innings_batted: combined.inningsBatted,
    runs_scored: combined.runsScored, balls_faced: combined.ballsFaced, not_outs: combined.notOuts,
    fours: combined.fours, sixes: combined.sixes, highest_score: combined.highestScore,
    batting_average: rates.battingAverage, strike_rate: rates.strikeRate,
    innings_bowled: combined.inningsBowled, balls_bowled: combined.ballsBowled,
    runs_conceded: combined.runsConceded, wickets: combined.wickets,
    best_bowling: rates.bestBowling, bowling_average: rates.bowlingAverage, economy_rate: rates.economyRate,
    catches: combined.catches, run_outs: combined.runOuts, stumpings: combined.stumpings,
    updated_at: new Date().toISOString(),
  };
  const { error: upsertErr } = await supabase.from("player_career_stats").upsert(row);
  if (upsertErr) throw upsertErr;
}

/** Batches recomputePlayerCareerStats across every linked participant of a completed match —
 * called once at match completion rather than N separate client calls. */
export async function recomputeCareerStatsForMatch(supabase: SupabaseClient, matchId: string): Promise<void> {
  const { data: rows, error } = await supabase.from("match_participants").select("player_id").eq("match_id", matchId).not("player_id", "is", null);
  if (error) throw error;
  const playerIds = [...new Set(((rows ?? []) as { player_id: string | null }[]).map((r) => r.player_id).filter((id): id is string => !!id))];
  for (const playerId of playerIds) {
    await recomputePlayerCareerStats(supabase, playerId);
  }
}
