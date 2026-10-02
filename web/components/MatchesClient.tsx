"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { fetchMatches } from "@/lib/db";
import { matchStatusLabel } from "@/lib/matches";
import type { Match, MatchStatus } from "@/lib/types";

const STATUS_COLOR: Record<MatchStatus, string> = {
  Setup: "text-hp-paper/45", Toss: "text-hp-paper/45",
  InProgress: "text-pace-green", "Innings Break": "text-pace-green",
  Completed: "text-hp-paper/70", Abandoned: "text-red-400",
};

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export function MatchesClient() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMatches().then(setMatches).catch(() => setMatches([])).finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display font-black uppercase text-2xl text-hp-paper tracking-wide mb-1">Matches</h1>
          <p className="text-hp-paper/45 text-sm">Live ball-by-ball scoring and scorecards</p>
        </div>
        <Link href="/matches/new"
          className="px-5 py-2.5 text-sm font-bold bg-hp-cg text-hp-paper hover:bg-hp-cg/90 transition-colors cursor-pointer">
          + New Match
        </Link>
      </div>

      {loading ? (
        <div className="text-hp-paper/45 text-sm">Loading…</div>
      ) : matches.length === 0 ? (
        <div className="bg-hp-surface p-16 text-center">
          <p className="text-hp-paper/45 text-sm">No matches yet. Start one to begin live ball-by-ball scoring.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {matches.map((m) => (
            <Link key={m.id} href={`/matches/${m.id}`}
              className="flex items-center justify-between px-5 py-4 bg-hp-surface border border-white/8 hover:border-hp-cg/40 transition-colors">
              <div>
                <div className="text-hp-paper font-semibold text-sm">{m.homeLabel} v {m.awayLabel}</div>
                <div className="text-xs text-hp-paper/45 mt-0.5">{m.venue} · {formatDate(m.scheduledDate)} · {m.format}</div>
              </div>
              <div className="text-right">
                <div className={`text-xs font-mono font-semibold uppercase tracking-wider ${STATUS_COLOR[m.status]}`}>{matchStatusLabel(m.status)}</div>
                {m.result && <div className="text-xs text-hp-paper/70 mt-0.5">{m.result}</div>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
