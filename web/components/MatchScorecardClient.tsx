"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { fetchMatch, fetchMatchParticipants, fetchInningsForMatch, fetchDeliveries } from "@/lib/db";
import { extractInningsContribution, matchStatusLabel } from "@/lib/matches";
import type { Match, MatchParticipant, Innings, Delivery } from "@/lib/types";

interface InningsView {
  innings: Innings;
  deliveries: Delivery[];
}

function battingLabel(balls: number, runs: number, fours: number, sixes: number): string {
  return `${runs} (${balls}b, ${fours}x4, ${sixes}x6)`;
}

function BattingTable({ roster, deliveries }: { roster: MatchParticipant[]; deliveries: Delivery[] }) {
  const rows = roster
    .map((p) => ({ p, c: extractInningsContribution(deliveries, p.id) }))
    .filter(({ c }) => c.battedThisInnings);
  if (rows.length === 0) return null;
  return (
    <table className="w-full text-sm mb-3">
      <thead>
        <tr className="text-left text-xs font-semibold text-hp-paper/45 uppercase tracking-wider border-b border-white/8">
          <th className="pb-1.5 pr-4">Batter</th><th className="pb-1.5">R (B, 4s, 6s)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ p, c }) => (
          <tr key={p.id} className="border-b border-white/5 last:border-0">
            <td className="py-1.5 pr-4 text-hp-paper">{p.displayName}{!c.dismissed && <span className="text-pace-green">*</span>}</td>
            <td className="py-1.5 text-hp-paper/80">{battingLabel(c.ballsFaced, c.runsScored, c.fours, c.sixes)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BowlingTable({ roster, deliveries }: { roster: MatchParticipant[]; deliveries: Delivery[] }) {
  const rows = roster
    .map((p) => ({ p, c: extractInningsContribution(deliveries, p.id) }))
    .filter(({ c }) => c.bowledThisInnings);
  if (rows.length === 0) return null;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs font-semibold text-hp-paper/45 uppercase tracking-wider border-b border-white/8">
          <th className="pb-1.5 pr-4">Bowler</th><th className="pb-1.5">O-R-W</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ p, c }) => (
          <tr key={p.id} className="border-b border-white/5 last:border-0">
            <td className="py-1.5 pr-4 text-hp-paper">{p.displayName}</td>
            <td className="py-1.5 text-hp-paper/80">{Math.floor(c.ballsBowled / 6)}.{c.ballsBowled % 6}-{c.runsConceded}-{c.wicketsTaken}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function MatchScorecardClient({ matchId }: { matchId: string }) {
  const { user } = useAuth();
  const [match, setMatch] = useState<Match | null>(null);
  const [participants, setParticipants] = useState<MatchParticipant[]>([]);
  const [inningsViews, setInningsViews] = useState<InningsView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([fetchMatch(matchId), fetchMatchParticipants(matchId), fetchInningsForMatch(matchId)])
      .then(([m, parts, allInnings]) => {
        if (!m) { setError("Match not found."); return null; }
        setMatch(m);
        setParticipants(parts);
        return Promise.all(allInnings.map((innings) => fetchDeliveries(innings.id).then((deliveries) => ({ innings, deliveries }))));
      })
      .then((views) => { if (views) setInningsViews(views); })
      .catch((err) => setError((err as { message?: string })?.message ?? String(err)))
      .finally(() => setLoading(false));
  }, [matchId]);

  if (loading) return <div className="max-w-3xl mx-auto px-6 py-10 text-hp-paper/45 text-sm">Loading…</div>;
  if (error || !match) return <div className="max-w-3xl mx-auto px-6 py-10 text-red-400 text-sm">{error || "Match not found."}</div>;

  const canScore = !!user && (
    user.role === "platform_admin"
    || (user.role === "coach" && !!user.coachId && user.coachId === match.scoredByCoachId)
    || (user.role === "academy_admin" && !!user.academyId && user.academyId === match.homeAcademyId)
  );

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="bg-hp-surface border border-white/10 p-6 mb-4">
        <h1 className="font-display font-black uppercase text-xl text-hp-paper mb-1">{match.homeLabel} v {match.awayLabel}</h1>
        <p className="text-sm text-hp-paper/52">{match.venue} · {match.format}{match.oversPerSide ? ` · ${match.oversPerSide} overs` : ""}</p>
        <p className="text-xs font-mono uppercase tracking-wider text-hp-paper/45 mt-2">{matchStatusLabel(match.status)}</p>
        {match.result && <p className="text-sm text-pace-green mt-1 font-semibold">{match.result}</p>}

        {canScore && match.status !== "Completed" && match.status !== "Abandoned" && (
          <Link href={`/matches/${matchId}/score`}
            className="inline-block mt-4 px-5 py-2.5 text-sm font-bold bg-hp-cg text-hp-paper hover:bg-hp-cg/90 transition-colors cursor-pointer">
            {match.status === "Setup" ? "Start Scoring" : "Continue Scoring"}
          </Link>
        )}
      </div>

      {inningsViews.map(({ innings, deliveries }) => {
        const battingRoster = participants.filter((p) => p.side === innings.battingSide);
        const bowlingRoster = participants.filter((p) => p.side === innings.bowlingSide);
        const sideLabel = innings.battingSide === "home" ? match.homeLabel : match.awayLabel;
        return (
          <div key={innings.id} className="bg-hp-surface border border-white/10 p-5 mb-4">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-display font-black uppercase text-sm text-hp-paper">{sideLabel} — Innings {innings.inningsNumber}</h2>
              <span className="text-lg font-display font-black text-hp-paper">{innings.totalRuns}/{innings.totalWickets} <span className="text-xs text-hp-paper/45 font-normal">({innings.totalOvers} ov)</span></span>
            </div>
            <BattingTable roster={battingRoster} deliveries={deliveries} />
            <BowlingTable roster={bowlingRoster} deliveries={deliveries} />
          </div>
        );
      })}
    </div>
  );
}
