"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { fetchCompetitions } from "@/lib/db";
import { createCompetition } from "@/lib/matches";
import type { Competition, MatchFormat } from "@/lib/types";

const FORMATS: MatchFormat[] = ["T20", "One Day", "Two-Day", "Limited Overs (Other)"];

const inputCls = "w-full bg-hp-ink px-4 py-3 text-hp-paper placeholder-hp-paper/30 border border-white/12 focus:border-hp-cg focus:outline-none transition-colors text-sm";
const selectCls = "w-full bg-hp-ink px-4 py-3 text-hp-paper border border-white/12 focus:border-hp-cg focus:outline-none transition-colors text-sm cursor-pointer";
const labelCls = "block text-xs font-mono font-semibold text-hp-paper/52 uppercase tracking-widest mb-1.5";

type Draft = { name: string; format: MatchFormat; season: string; pointsForWin: string; pointsForTie: string; pointsForLoss: string; pointsForNoResult: string };
const EMPTY_DRAFT: Draft = { name: "", format: "T20", season: "", pointsForWin: "4", pointsForTie: "2", pointsForLoss: "0", pointsForNoResult: "2" };

/** List + create modal, following SessionPacksClient/AttendanceClient's list+modal shape.
 * Competition creation/fixtures/ladders are Phase 2 — reusing ReportsClient's leaderboard shape
 * for the ladder itself, see CompetitionDetailClient. */
export function CompetitionsClient() {
  const { user } = useAuth();
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCompetitions().then(setCompetitions).catch(() => setCompetitions([])).finally(() => setLoading(false));
  }, []);

  const canCreate = user?.role === "platform_admin" || user?.role === "academy_admin";

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCreate() {
    if (!draft.name.trim()) { setError("Name is required."); return; }
    setError("");
    setSaving(true);
    try {
      const competition = await createCompetition({
        name: draft.name.trim(), academyId: user?.role === "academy_admin" ? (user.academyId ?? null) : null,
        format: draft.format, season: draft.season.trim(),
        pointsForWin: Number(draft.pointsForWin) || 0, pointsForTie: Number(draft.pointsForTie) || 0,
        pointsForLoss: Number(draft.pointsForLoss) || 0, pointsForNoResult: Number(draft.pointsForNoResult) || 0,
      });
      setCompetitions((prev) => [competition, ...prev]);
      setShowForm(false);
      setDraft(EMPTY_DRAFT);
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display font-black uppercase text-2xl text-hp-paper tracking-wide mb-1">Competitions</h1>
          <p className="text-hp-paper/45 text-sm">Fixtures, ladders and standings</p>
        </div>
        {canCreate && (
          <button type="button" onClick={() => setShowForm(true)}
            className="px-5 py-2.5 text-sm font-bold bg-hp-cg text-hp-paper hover:bg-hp-cg/90 transition-colors cursor-pointer">
            + New Competition
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-hp-paper/45 text-sm">Loading…</div>
      ) : competitions.length === 0 ? (
        <div className="bg-hp-surface p-16 text-center">
          <p className="text-hp-paper/45 text-sm">No competitions yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {competitions.map((c) => (
            <Link key={c.id} href={`/competitions/${c.id}`}
              className="flex items-center justify-between px-5 py-4 bg-hp-surface border border-white/8 hover:border-hp-cg/40 transition-colors">
              <div>
                <div className="text-hp-paper font-semibold text-sm">{c.name}</div>
                <div className="text-xs text-hp-paper/45 mt-0.5">{c.season} · {c.format}</div>
              </div>
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-hp-paper/45">{c.status}</span>
            </Link>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto" onClick={() => setShowForm(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-hp-surface w-full max-w-lg shadow-2xl border border-white/12 my-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/10">
              <h2 className="text-xs font-mono font-semibold uppercase tracking-widest text-hp-cg">New Competition</h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-hp-paper/45 hover:text-hp-paper transition-colors cursor-pointer text-xl leading-none p-1">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label htmlFor="comp-name" className={labelCls}>Name *</label>
                <input id="comp-name" type="text" value={draft.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g. Summer T20 League" className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="comp-format" className={labelCls}>Format</label>
                  <select id="comp-format" value={draft.format} onChange={(e) => update("format", e.target.value as MatchFormat)} className={selectCls}>
                    {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="comp-season" className={labelCls}>Season</label>
                  <input id="comp-season" type="text" value={draft.season} onChange={(e) => update("season", e.target.value)} placeholder="e.g. 2026/27" className={inputCls} />
                </div>
              </div>
              <div>
                <p className={labelCls}>Points</p>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label htmlFor="comp-pts-win" className="block text-[10px] text-hp-paper/40 mb-1">Win</label>
                    <input id="comp-pts-win" type="number" value={draft.pointsForWin} onChange={(e) => update("pointsForWin", e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="comp-pts-tie" className="block text-[10px] text-hp-paper/40 mb-1">Tie</label>
                    <input id="comp-pts-tie" type="number" value={draft.pointsForTie} onChange={(e) => update("pointsForTie", e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="comp-pts-loss" className="block text-[10px] text-hp-paper/40 mb-1">Loss</label>
                    <input id="comp-pts-loss" type="number" value={draft.pointsForLoss} onChange={(e) => update("pointsForLoss", e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="comp-pts-nr" className="block text-[10px] text-hp-paper/40 mb-1">No Result</label>
                    <input id="comp-pts-nr" type="number" value={draft.pointsForNoResult} onChange={(e) => update("pointsForNoResult", e.target.value)} className={inputCls} />
                  </div>
                </div>
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
            </div>
            <div className="flex items-center gap-3 px-6 pb-6 pt-2">
              <button type="button" onClick={handleCreate} disabled={saving}
                className="px-6 py-3 text-sm font-bold bg-hp-cg text-hp-paper hover:bg-hp-cg/90 transition-colors cursor-pointer disabled:opacity-60">
                {saving ? "Creating…" : "Create Competition"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
