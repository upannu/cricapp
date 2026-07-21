// Cross-session trend analysis for the Performance Dashboard + S&C log.
//
// injuryRisk was previously only a static snapshot on the player record,
// overwritten by whichever report ran most recently — there was no sense of
// direction (is this player getting worse or better?) and no alerting.
// Reports already carry a per-delivery injuryRisk/overallScore (computed by
// the biomechanics engine), so this trends that existing history rather than
// inventing a parallel data source.

import type { Report, Session, InjuryRisk, SCWorkout } from "./types";

const RISK_RANK: Record<InjuryRisk, number> = { Low: 0, Moderate: 1, High: 2 };

export interface InjuryRiskHistoryPoint {
  date: string;
  risk: InjuryRisk;
  overallScore: number | null;
}

export interface InjuryRiskTrend {
  current: InjuryRisk | null;
  currentDate: string | null;
  direction: "worsening" | "improving" | "stable" | "unknown";
  alert: boolean;
  alertReason: string | null;
  history: InjuryRiskHistoryPoint[];
}

/** Looks at up to the last 3 risk-bearing reports to judge direction and decide whether to alert. */
export function computeInjuryRiskTrend(reports: Report[]): InjuryRiskTrend {
  const withRisk: InjuryRiskHistoryPoint[] = reports
    .filter((r): r is Report & { injuryRisk: InjuryRisk } => !!r.injuryRisk)
    .map((r) => ({ date: r.sessionDate ?? r.date, risk: r.injuryRisk, overallScore: r.overallScore ?? null }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (withRisk.length === 0) {
    return { current: null, currentDate: null, direction: "unknown", alert: false, alertReason: null, history: [] };
  }

  const last = withRisk[withRisk.length - 1];
  const recentWindow = withRisk.slice(-3);

  let direction: InjuryRiskTrend["direction"] = "unknown";
  if (recentWindow.length >= 2) {
    const first = recentWindow[0];
    if (RISK_RANK[last.risk] > RISK_RANK[first.risk]) direction = "worsening";
    else if (RISK_RANK[last.risk] < RISK_RANK[first.risk]) direction = "improving";
    else direction = "stable";
  }

  const elevatedCount = recentWindow.filter((r) => r.risk !== "Low").length;

  let alert = false;
  let alertReason: string | null = null;
  if (last.risk === "High") {
    alert = true;
    alertReason = "Most recent delivery flagged High injury risk.";
  } else if (direction === "worsening") {
    alert = true;
    alertReason = `Injury risk has worsened over the last ${recentWindow.length} reports.`;
  } else if (elevatedCount >= 2 && recentWindow.length >= 2) {
    alert = true;
    alertReason = `${elevatedCount} of the last ${recentWindow.length} reports flagged elevated risk.`;
  }

  return { current: last.risk, currentDate: last.date, direction, alert, alertReason, history: withRisk };
}

export interface RpeHistoryPoint { date: string; rpe: number }

export interface RpeSummary {
  /** Simple sum of RPE over the last 7 days — a rough training-load proxy, not a validated ACWR. */
  weeklyLoad: number;
  recentAvg: number | null;
  history: RpeHistoryPoint[];
}

export function computeRpeSummary(sessions: Session[]): RpeSummary {
  const withRpe: RpeHistoryPoint[] = sessions
    .filter((s): s is Session & { rpe: number } => s.rpe != null)
    .map((s) => ({ date: s.date, rpe: s.rpe }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weeklyLoad = withRpe.filter((s) => new Date(s.date).getTime() >= weekAgo).reduce((sum, s) => sum + s.rpe, 0);

  const recent = withRpe.slice(-5);
  const recentAvg = recent.length ? Math.round((recent.reduce((sum, s) => sum + s.rpe, 0) / recent.length) * 10) / 10 : null;

  return { weeklyLoad, recentAvg, history: withRpe };
}

// ─── S&C weekly training load ──────────────────────────────────────────────────
//
// Uses the session-RPE method (Foster et al.) — load = duration (mins) × RPE,
// summed per calendar week (Monday start). This is a distinct load stream from
// cricket-session RPE above: S&C workouts always carry a duration, so they can
// be combined into a proper load unit rather than the bare RPE sum used there.

export interface WeeklyLoadPoint { weekStart: string; totalLoad: number; workoutCount: number }

export interface SCLoadSummary {
  currentWeekLoad: number;
  previousWeekLoad: number;
  changePercent: number | null;
  /** Simplified acute:chronic ratio — chronic is the average of the last 3 completed weeks, not a rolling EWMA. */
  acwr: number | null;
  alert: boolean;
  alertReason: string | null;
  history: WeeklyLoadPoint[];
}

function startOfWeek(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getUTCDay();
  const diff = (day + 6) % 7; // days since Monday
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().split("T")[0];
}

export function computeSCLoadSummary(workouts: SCWorkout[]): SCLoadSummary {
  const byWeek = new Map<string, WeeklyLoadPoint>();
  for (const w of workouts) {
    const weekStart = startOfWeek(w.date);
    const entry = byWeek.get(weekStart) ?? { weekStart, totalLoad: 0, workoutCount: 0 };
    entry.totalLoad += w.durationMins * w.rpe;
    entry.workoutCount += 1;
    byWeek.set(weekStart, entry);
  }

  const history = Array.from(byWeek.values()).sort((a, b) => a.weekStart.localeCompare(b.weekStart)).slice(-6);

  if (history.length === 0) {
    return { currentWeekLoad: 0, previousWeekLoad: 0, changePercent: null, acwr: null, alert: false, alertReason: null, history: [] };
  }

  const currentWeekLoad = history[history.length - 1].totalLoad;
  const previousWeekLoad = history.length >= 2 ? history[history.length - 2].totalLoad : 0;
  const changePercent = previousWeekLoad > 0 ? Math.round(((currentWeekLoad - previousWeekLoad) / previousWeekLoad) * 100) : null;

  const priorWeeks = history.slice(0, -1).slice(-3);
  const chronicAvg = priorWeeks.length ? priorWeeks.reduce((sum, w) => sum + w.totalLoad, 0) / priorWeeks.length : null;
  const acwr = chronicAvg ? Math.round((currentWeekLoad / chronicAvg) * 100) / 100 : null;

  let alert = false;
  let alertReason: string | null = null;
  if (acwr !== null && acwr >= 1.5 && priorWeeks.length >= 2) {
    alert = true;
    alertReason = `This week's S&C load is ${acwr}x the recent 3-week average — a rapid spike linked to higher injury risk.`;
  }

  return { currentWeekLoad, previousWeekLoad, changePercent, acwr, alert, alertReason, history };
}
