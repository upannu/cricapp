"use client";

import { useState, useEffect } from "react";
import { fetchCompetitions } from "@/lib/db";
import type { Competition } from "@/lib/types";

/** Phase 1 ships just the route + a read of whatever competitions exist — competition creation,
 * fixtures and ladders are Phase 2 (they depend on matches.ts's scoring having produced real
 * completed matches to rank first). Deliberately honest in the meantime rather than a placeholder
 * claiming more than this phase actually builds. */
export function CompetitionsClient() {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCompetitions().then(setCompetitions).catch(() => setCompetitions([])).finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="font-display font-black uppercase text-2xl text-hp-paper tracking-wide mb-1">Competitions</h1>
        <p className="text-hp-paper/45 text-sm">Fixtures, ladders and standings</p>
      </div>

      {loading ? (
        <div className="text-hp-paper/45 text-sm">Loading…</div>
      ) : competitions.length === 0 ? (
        <div className="bg-hp-surface p-16 text-center">
          <p className="text-hp-paper/45 text-sm">No competitions yet — competition creation, fixtures and ladders are coming soon.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {competitions.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-5 py-4 bg-hp-surface border border-white/8">
              <div>
                <div className="text-hp-paper font-semibold text-sm">{c.name}</div>
                <div className="text-xs text-hp-paper/45 mt-0.5">{c.season} · {c.format}</div>
              </div>
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-hp-paper/45">{c.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
