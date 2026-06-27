"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import type { Report, ReportType, Player } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { fetchReports, fetchPlayers } from "@/lib/db";
import { formatDate } from "@/lib/utils";

const REPORT_TYPES: ReportType[] = ["Biomechanics", "Session Review", "Progress Report", "Action Plan"];

const TYPE_STYLES: Record<ReportType, string> = {
  "Biomechanics":    "bg-pace-green/10 text-pace-green border-pace-green/20",
  "Session Review":  "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "Progress Report": "bg-amber/10 text-amber border-amber/20",
  "Action Plan":     "bg-fire/10 text-fire border-fire/20",
};

const TYPE_DOT: Record<ReportType, string> = {
  "Biomechanics":    "bg-pace-green",
  "Session Review":  "bg-blue-400",
  "Progress Report": "bg-amber",
  "Action Plan":     "bg-fire",
};

let _reportPlayers: Player[] = [];

function playerById(id: string) {
  return _reportPlayers.find((p) => p.id === id);
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("");
}

export function ReportsClient() {
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<ReportType | "All">("All");
  const [playerFilter, setPlayerFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const coachName = user?.role === "coach" ? user.name : undefined;
    Promise.all([fetchReports(), fetchPlayers(coachName)]).then(([r, p]) => {
      setReports(r);
      _reportPlayers = p;
    });
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const players = useMemo(() => _reportPlayers, [reports]);

  // ── Derived stats ─────────────────────────────────────────────────────────
  const thisMonth = new Date().toISOString().slice(0, 7);
  const reportsThisMonth = reports.filter((r) => r.date.startsWith(thisMonth)).length;
  const playersWithReports = new Set(reports.map((r) => r.playerId)).size;
  const speedReports = reports.filter((r) => r.speedKmh !== null);
  const maxSpeed = speedReports.length
    ? Math.max(...speedReports.map((r) => r.speedKmh ?? 0)).toFixed(1)
    : "—";

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return [...reports]
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter((r) => {
        if (typeFilter !== "All" && r.type !== typeFilter) return false;
        if (playerFilter !== "all" && r.playerId !== playerFilter) return false;
        if (q) {
          const player = playerById(r.playerId);
          const searchable = [r.summary, r.type, player?.name ?? "", ...r.tags].join(" ").toLowerCase();
          if (!searchable.includes(q)) return false;
        }
        return true;
      });
  }, [search, typeFilter, playerFilter, reports]);

  // ── Group by month ────────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<string, Report[]>();
    for (const r of filtered) {
      const key = r.date.slice(0, 7);
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  function monthLabel(ym: string) {
    const [y, m] = ym.split("-");
    return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Reports</h1>
          <p className="text-zinc-400 text-sm">Performance analysis and session reviews across your squad</p>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total reports" value={String(reports.length)} color="text-white" />
        <StatCard label="This month" value={String(reportsThisMonth)} color="text-pace-green" />
        <StatCard label="Players covered" value={String(playersWithReports)} color="text-blue-400" />
        <StatCard label="Peak speed" value={`${maxSpeed} km/h`} color="text-amber" />
      </div>

      {/* Player quick-filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          type="button"
          onClick={() => setPlayerFilter("all")}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
            playerFilter === "all"
              ? "bg-pace-green text-black"
              : "bg-surface text-zinc-400 hover:text-white"
          }`}
        >
          All players
        </button>
        {players.map((p) => {
          const count = reports.filter((r) => r.playerId === p.id).length;
          if (count === 0) return null;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlayerFilter(playerFilter === p.id ? "all" : p.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                playerFilter === p.id
                  ? "bg-pace-green text-black"
                  : "bg-surface text-zinc-400 hover:text-white"
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${
                playerFilter === p.id ? "bg-black/20 text-black" : "bg-zinc-700 text-zinc-300"
              }`}>
                {initials(p.name)}
              </span>
              {p.name.split(" ")[0]}
              <span className={`text-[10px] ${playerFilter === p.id ? "text-black/60" : "text-zinc-600"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          placeholder="Search reports…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 bg-surface rounded-xl px-4 py-2.5 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none text-sm"
        />
        <div className="flex gap-2 flex-wrap">
          {(["All", ...REPORT_TYPES] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                typeFilter === t
                  ? t === "All"
                    ? "bg-pace-green text-black border-pace-green"
                    : `${TYPE_STYLES[t as ReportType]} border-current`
                  : "bg-surface text-zinc-400 border-zinc-700 hover:text-white hover:border-zinc-500"
              }`}
            >
              {t !== "All" && (
                <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${TYPE_DOT[t as ReportType]}`} />
              )}
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      <p className="text-xs text-zinc-500 mb-5">
        {filtered.length} report{filtered.length !== 1 ? "s" : ""}
        {typeFilter !== "All" ? ` · ${typeFilter}` : ""}
        {playerFilter !== "all" ? ` · ${playerById(playerFilter)?.name}` : ""}
      </p>

      {/* Report list */}
      {filtered.length === 0 ? (
        <div className="bg-surface rounded-2xl p-16 text-center">
          <p className="text-zinc-400 text-sm">No reports match your filters.</p>
          <button type="button" onClick={() => { setSearch(""); setTypeFilter("All"); setPlayerFilter("all"); }}
            className="mt-4 px-4 py-2 text-xs font-semibold text-zinc-300 border border-zinc-600 rounded-xl hover:border-zinc-400 transition-colors cursor-pointer">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(([ym, rpts]) => (
            <div key={ym}>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">{monthLabel(ym)}</span>
                <div className="flex-1 h-px bg-zinc-800" />
                <span className="text-xs text-zinc-600">{rpts.length}</span>
              </div>

              <div className="space-y-3">
                {rpts.map((r) => {
                  const player = playerById(r.playerId);
                  const isOpen = expandedId === r.id;

                  return (
                    <div
                      key={r.id}
                      className={`bg-surface rounded-2xl border transition-colors ${
                        isOpen ? "border-zinc-600" : "border-transparent hover:border-zinc-800"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedId(isOpen ? null : r.id)}
                        className="w-full text-left p-5 cursor-pointer"
                      >
                        <div className="flex items-start gap-4">
                          <div className="w-9 h-9 rounded-full bg-pace-green/15 flex items-center justify-center text-pace-green text-xs font-bold flex-shrink-0 mt-0.5">
                            {player ? initials(player.name) : "?"}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="text-white font-semibold text-sm">
                                {player?.name ?? "Unknown"}
                              </span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${TYPE_STYLES[r.type]}`}>
                                <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${TYPE_DOT[r.type]}`} />
                                {r.type}
                              </span>
                              <span className="text-zinc-500 text-xs">{formatDate(r.date)}</span>
                            </div>

                            <p className="text-zinc-300 text-sm leading-relaxed line-clamp-2 mb-2">
                              {r.summary}
                            </p>

                            <div className="flex flex-wrap gap-1.5">
                              {r.tags.map((t) => (
                                <span key={t} className="px-2 py-0.5 rounded-md text-xs bg-ink text-zinc-500 border border-zinc-700/50">
                                  {t}
                                </span>
                              ))}
                            </div>

                            {r.highlight && (
                              <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-amber font-semibold">
                                <span className="w-1 h-1 rounded-full bg-amber" />
                                {r.highlight}
                              </div>
                            )}
                          </div>

                          <div className="flex-shrink-0 text-right ml-2">
                            {r.speedKmh !== null ? (
                              <>
                                <div className="text-pace-green font-mono font-bold text-sm">{r.speedKmh}</div>
                                <div className="text-zinc-600 text-xs">km/h</div>
                              </>
                            ) : (
                              <div className="text-zinc-600 text-xs mt-1">—</div>
                            )}
                            <span className={`text-zinc-400 text-sm transition-transform duration-200 inline-block mt-2 ${isOpen ? "rotate-180" : ""}`}>▾</span>
                          </div>
                        </div>
                      </button>

                      {isOpen && (
                        <div className="px-5 pb-5 border-t border-zinc-700/40 pt-4">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                            <div className="sm:col-span-2 bg-ink rounded-xl p-4">
                              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Full Analysis</p>
                              <p className="text-sm text-zinc-300 leading-relaxed">{r.summary}</p>
                            </div>

                            <div className="bg-ink rounded-xl p-4 space-y-3">
                              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Metrics</p>
                              <div>
                                <div className="text-xs text-zinc-500 mb-0.5">Ball Speed</div>
                                <div className={`text-lg font-bold font-mono ${r.speedKmh !== null ? "text-pace-green" : "text-zinc-600"}`}>
                                  {r.speedKmh !== null ? `${r.speedKmh} km/h` : "—"}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-zinc-500 mb-0.5">Front Knee Angle</div>
                                <div className={`text-lg font-bold font-mono ${r.frontKneeAngleDeg !== null ? "text-blue-400" : "text-zinc-600"}`}>
                                  {r.frontKneeAngleDeg !== null ? `${r.frontKneeAngleDeg}°` : "—"}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-zinc-500 mb-0.5">Player</div>
                                <div className="text-sm text-white font-medium">{player?.name ?? "—"}</div>
                                <div className="text-xs text-zinc-500">{player?.ageGroup} · {player?.club}</div>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-3">
                            {player && (
                              <Link href={`/players/${player.id}`}
                                className="px-4 py-2 text-xs font-semibold text-zinc-300 border border-zinc-600 rounded-lg hover:border-pace-green hover:text-pace-green transition-colors">
                                View Player
                              </Link>
                            )}
                            {player && (
                              <Link href={`/players/${player.id}/reports`}
                                className="px-4 py-2 text-xs font-semibold text-zinc-300 border border-zinc-600 rounded-lg hover:border-pace-green hover:text-pace-green transition-colors">
                                All Reports for {player.name.split(" ")[0]}
                              </Link>
                            )}
                            {player && (
                              <Link href={`/players/${player.id}/action-plans`}
                                className="px-4 py-2 text-xs font-semibold bg-pace-green/10 text-pace-green border border-pace-green/30 rounded-lg hover:bg-pace-green/20 transition-colors">
                                Action Plans
                              </Link>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Speed leaderboard */}
      <div className="mt-10">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Speed Leaderboard</span>
          <div className="flex-1 h-px bg-zinc-800" />
        </div>
        <div className="bg-surface rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700/50">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">#</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">Player</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">Age Group</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-500">Peak Speed</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-500">Reports</th>
              </tr>
            </thead>
            <tbody>
              {players
                .map((p) => {
                  const playerReports = reports.filter((r) => r.playerId === p.id && r.speedKmh !== null);
                  const peak = playerReports.length ? Math.max(...playerReports.map((r) => r.speedKmh ?? 0)) : null;
                  const totalReports = reports.filter((r) => r.playerId === p.id).length;
                  return { player: p, peak, totalReports };
                })
                .filter((row) => row.peak !== null)
                .sort((a, b) => (b.peak ?? 0) - (a.peak ?? 0))
                .map((row, i) => (
                  <tr key={row.player.id} className="border-b border-zinc-700/30 hover:bg-ink transition-colors">
                    <td className="px-5 py-3.5 text-zinc-500 text-sm font-mono">{i + 1}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-pace-green/15 flex items-center justify-center text-pace-green text-[10px] font-bold flex-shrink-0">
                          {initials(row.player.name)}
                        </div>
                        <Link href={`/players/${row.player.id}`} className="text-white font-medium hover:text-pace-green transition-colors text-sm">
                          {row.player.name}
                        </Link>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-zinc-400 text-xs">{row.player.ageGroup}</td>
                    <td className="px-5 py-3.5 text-right">
                      <span className={`font-mono font-bold text-sm ${i === 0 ? "text-amber" : "text-pace-green"}`}>
                        {row.peak} km/h
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right text-zinc-400 text-sm">{row.totalReports}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI teaser */}
      <div className="mt-8 rounded-2xl border border-pace-green/20 bg-pace-green/5 p-5 text-center">
        <span className="w-1.5 h-1.5 rounded-full bg-pace-green inline-block mr-2 animate-pulse" />
        <span className="text-pace-green text-xs font-semibold uppercase tracking-wider">
          AI-generated PDF reports &amp; email delivery — coming soon
        </span>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-surface rounded-2xl p-5 text-center">
      <div className={`text-2xl font-bold mb-1 ${color}`}>{value}</div>
      <div className="text-xs text-zinc-400">{label}</div>
    </div>
  );
}
