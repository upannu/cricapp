"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { fetchCompetition, fetchFixtures, fetchMatches, fetchInningsForMatch } from "@/lib/db";
import { computeStandings, createFixture, type StandingsRow } from "@/lib/matches";
import type { Competition, Fixture, Match, Innings } from "@/lib/types";

const inputCls = "w-full bg-hp-ink px-4 py-3 text-hp-paper placeholder-hp-paper/30 border border-white/12 focus:border-hp-cg focus:outline-none transition-colors text-sm";
const labelCls = "block text-xs font-mono font-semibold text-hp-paper/52 uppercase tracking-widest mb-1.5";

type FixtureDraft = { homeLabel: string; awayLabel: string; scheduledDate: string; venue: string };
function emptyFixtureDraft(today: string): FixtureDraft {
  return { homeLabel: "", awayLabel: "", scheduledDate: today, venue: "" };
}

function Ladder({ rows }: { rows: StandingsRow[] }) {
  if (rows.length === 0) {
    return <p className="text-hp-paper/45 text-sm">No completed matches yet — the ladder fills in once matches are scored.</p>;
  }
  return (
    <div className="bg-hp-surface overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10">
            <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-hp-paper/45">#</th>
            <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-hp-paper/45">Team</th>
            <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-hp-paper/45">P</th>
            <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-hp-paper/45">W</th>
            <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-hp-paper/45">L</th>
            <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-hp-paper/45">T</th>
            <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-hp-paper/45">NR</th>
            <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-hp-paper/45">Pts</th>
            <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-hp-paper/45">NRR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.sideLabel} className="border-b border-white/8 hover:bg-hp-ink transition-colors">
              <td className="px-5 py-3.5 text-hp-paper/45 text-sm font-mono">{i + 1}</td>
              <td className="px-5 py-3.5 text-hp-paper font-medium">{row.sideLabel}</td>
              <td className="px-5 py-3.5 text-right text-hp-paper/70">{row.played}</td>
              <td className="px-5 py-3.5 text-right text-hp-paper/70">{row.won}</td>
              <td className="px-5 py-3.5 text-right text-hp-paper/70">{row.lost}</td>
              <td className="px-5 py-3.5 text-right text-hp-paper/70">{row.tied}</td>
              <td className="px-5 py-3.5 text-right text-hp-paper/70">{row.noResult}</td>
              <td className="px-5 py-3.5 text-right">
                <span className={`font-mono font-bold text-sm ${i === 0 ? "text-amber" : "text-pace-green"}`}>{row.points}</span>
              </td>
              <td className="px-5 py-3.5 text-right text-hp-paper/52 font-mono text-xs">{row.netRunRate >= 0 ? "+" : ""}{row.netRunRate.toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CompetitionDetailClient({ competitionId }: { competitionId: string }) {
  const { user } = useAuth();
  const [competition, setCompetition] = useState<Competition | null>(null);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [standings, setStandings] = useState<StandingsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showFixtureForm, setShowFixtureForm] = useState(false);
  const [fixtureDraft, setFixtureDraft] = useState<FixtureDraft>(emptyFixtureDraft(new Date().toISOString().slice(0, 10)));
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    Promise.all([fetchCompetition(competitionId), fetchFixtures(competitionId), fetchMatches({ competitionId })])
      .then(([comp, fx, matches]) => {
        if (!comp) { setError("Competition not found."); return null; }
        setCompetition(comp);
        setFixtures(fx);
        const rankable = matches.filter((m) => m.status === "Completed" || m.status === "Abandoned");
        if (rankable.length === 0) { setStandings([]); return null; }
        return Promise.all(rankable.map((m) => fetchInningsForMatch(m.id).then((innings) => ({ match: m, innings }))))
          .then((entries: { match: Match; innings: Innings[] }[]) => {
            setStandings(computeStandings(entries, comp));
          });
      })
      .catch((err) => setError((err as { message?: string })?.message ?? String(err)))
      .finally(() => setLoading(false));
  }, [competitionId]);

  useEffect(() => { load(); }, [load]);

  const canManage = user?.role === "platform_admin" || (user?.role === "academy_admin" && !!competition && user.academyId === competition.academyId);

  async function handleAddFixture() {
    if (!fixtureDraft.homeLabel.trim() || !fixtureDraft.awayLabel.trim()) { setError("Both side names are required."); return; }
    setError("");
    setSaving(true);
    try {
      const fixture = await createFixture({
        competitionId, homeLabel: fixtureDraft.homeLabel.trim(), awayLabel: fixtureDraft.awayLabel.trim(),
        scheduledDate: fixtureDraft.scheduledDate, venue: fixtureDraft.venue.trim(),
      });
      setFixtures((prev) => [...prev, fixture].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)));
      setShowFixtureForm(false);
      setFixtureDraft(emptyFixtureDraft(new Date().toISOString().slice(0, 10)));
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="max-w-4xl mx-auto px-6 py-10 text-hp-paper/45 text-sm">Loading…</div>;
  if (error && !competition) return <div className="max-w-4xl mx-auto px-6 py-10 text-red-400 text-sm">{error}</div>;
  if (!competition) return null;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="font-display font-black uppercase text-2xl text-hp-paper tracking-wide mb-1">{competition.name}</h1>
        <p className="text-hp-paper/45 text-sm">{competition.season} · {competition.format} · Win {competition.pointsForWin} / Tie {competition.pointsForTie} / Loss {competition.pointsForLoss} / NR {competition.pointsForNoResult} pts</p>
      </div>

      <div className="mb-10">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-hp-paper/45">Ladder</span>
          <div className="flex-1 h-px bg-white/5" />
        </div>
        <Ladder rows={standings} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 flex-1">
            <span className="text-xs font-bold uppercase tracking-wider text-hp-paper/45">Fixtures</span>
            <div className="flex-1 h-px bg-white/5" />
          </div>
          {canManage && (
            <button type="button" onClick={() => setShowFixtureForm(true)}
              className="ml-4 px-4 py-2 text-xs font-bold text-hp-paper/70 border border-white/15 hover:border-hp-cg hover:text-hp-cg transition-colors cursor-pointer">
              + Add Fixture
            </button>
          )}
        </div>

        {fixtures.length === 0 ? (
          <p className="text-hp-paper/45 text-sm">No fixtures scheduled yet.</p>
        ) : (
          <div className="space-y-2">
            {fixtures.map((f) => (
              <div key={f.id} className="flex items-center justify-between px-5 py-4 bg-hp-surface border border-white/8">
                <div>
                  <div className="text-hp-paper font-semibold text-sm">{f.homeLabel} v {f.awayLabel}</div>
                  <div className="text-xs text-hp-paper/45 mt-0.5">{f.venue} · {f.scheduledDate}</div>
                </div>
                {f.matchId ? (
                  <Link href={`/matches/${f.matchId}`} className="text-xs font-bold text-pace-green hover:opacity-80 transition-opacity">View Match</Link>
                ) : canManage && f.status === "Scheduled" ? (
                  <Link href={`/matches/new?fixtureId=${f.id}`}
                    className="px-4 py-2 text-xs font-bold bg-hp-cg text-hp-paper hover:bg-hp-cg/90 transition-colors cursor-pointer">
                    Score This Match
                  </Link>
                ) : (
                  <span className="text-xs font-mono uppercase tracking-wider text-hp-paper/45">{f.status}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showFixtureForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto" onClick={() => setShowFixtureForm(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-hp-surface w-full max-w-lg shadow-2xl border border-white/12 my-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/10">
              <h2 className="text-xs font-mono font-semibold uppercase tracking-widest text-hp-cg">Add Fixture</h2>
              <button type="button" onClick={() => setShowFixtureForm(false)} className="text-hp-paper/45 hover:text-hp-paper transition-colors cursor-pointer text-xl leading-none p-1">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="fx-home" className={labelCls}>Home Side *</label>
                  <input id="fx-home" type="text" value={fixtureDraft.homeLabel} onChange={(e) => setFixtureDraft({ ...fixtureDraft, homeLabel: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label htmlFor="fx-away" className={labelCls}>Away Side *</label>
                  <input id="fx-away" type="text" value={fixtureDraft.awayLabel} onChange={(e) => setFixtureDraft({ ...fixtureDraft, awayLabel: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="fx-date" className={labelCls}>Date</label>
                  <input id="fx-date" type="date" value={fixtureDraft.scheduledDate} onChange={(e) => setFixtureDraft({ ...fixtureDraft, scheduledDate: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label htmlFor="fx-venue" className={labelCls}>Venue</label>
                  <input id="fx-venue" type="text" value={fixtureDraft.venue} onChange={(e) => setFixtureDraft({ ...fixtureDraft, venue: e.target.value })} className={inputCls} />
                </div>
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
            </div>
            <div className="flex items-center gap-3 px-6 pb-6 pt-2">
              <button type="button" onClick={handleAddFixture} disabled={saving}
                className="px-6 py-3 text-sm font-bold bg-hp-cg text-hp-paper hover:bg-hp-cg/90 transition-colors cursor-pointer disabled:opacity-60">
                {saving ? "Adding…" : "Add Fixture"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
