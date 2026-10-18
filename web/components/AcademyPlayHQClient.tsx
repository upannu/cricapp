"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { fetchPlayers } from "@/lib/db";
import type { Academy, Player } from "@/lib/types";

type PlayHQGame = {
  id: string; status: string; date: string; venue?: string;
  homeTeam: { id: string; name: string }; awayTeam: { id: string; name: string }; result?: string;
};
type PlayHQAppearance = { discipline: string; playerId: string; playerName: string; teamId: string };
type PlayHQGameSummary = { id: string; appearances: PlayHQAppearance[] };

const FORMATS = ["T20", "One Day", "Two-Day", "Limited Overs (Other)"] as const;

/** Connect-an-organisation + browse-and-import-games flow for PlayHQ (see lib/playhq.ts and the
 * PlayHQ importer plan). Mirrors AcademyBillingClient's shell (own page, inline canManage check,
 * fetch() calls to dedicated API routes, plain error state) rather than Stripe Connect's redirect
 * flow, since there's no external onboarding page to bounce through here. */
export function AcademyPlayHQClient({ academy }: { academy: Academy }) {
  const { user } = useAuth();
  const canManage = user?.role === "platform_admin" || (user?.role === "academy_admin" && user.academyId === academy.id);

  const [orgId, setOrgId] = useState(academy.playhqOrgId ?? "");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [connected, setConnected] = useState(!!academy.playhqOrgId);

  const [players, setPlayers] = useState<Player[]>([]);
  const [games, setGames] = useState<PlayHQGame[] | null>(null);
  const [gamesError, setGamesError] = useState("");
  const [loadingGames, setLoadingGames] = useState(false);

  const [activeGame, setActiveGame] = useState<PlayHQGame | null>(null);
  const [summary, setSummary] = useState<PlayHQGameSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [playerLinks, setPlayerLinks] = useState<Record<string, string>>({});
  const [format, setFormat] = useState<typeof FORMATS[number]>("T20");
  const [venue, setVenue] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchPlayers(undefined, academy.id).then(setPlayers).catch(() => {});
  }, [academy.id]);

  const uniqueAppearances = useMemo(() => {
    if (!summary) return [];
    const seen = new Map<string, PlayHQAppearance>();
    for (const a of summary.appearances) if (!seen.has(a.playerId)) seen.set(a.playerId, a);
    return [...seen.values()];
  }, [summary]);

  async function handleConnect() {
    setConnectError("");
    setConnecting(true);
    try {
      const res = await fetch("/api/playhq/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ academyId: academy.id, playhqOrgId: orgId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not connect to PlayHQ.");
      setConnected(true);
    } catch (err) {
      setConnectError((err as { message?: string })?.message ?? String(err));
    } finally {
      setConnecting(false);
    }
  }

  async function loadGames() {
    setGamesError("");
    setLoadingGames(true);
    try {
      const res = await fetch(`/api/playhq/games?academyId=${encodeURIComponent(academy.id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load games.");
      setGames(data.games);
    } catch (err) {
      setGamesError((err as { message?: string })?.message ?? String(err));
    } finally {
      setLoadingGames(false);
    }
  }

  async function openGame(game: PlayHQGame) {
    setActiveGame(game);
    setSummary(null);
    setPlayerLinks({});
    setImportError("");
    setVenue(game.venue ?? "");
    setScheduledDate(game.date?.slice(0, 10) ?? "");
    setLoadingSummary(true);
    try {
      const res = await fetch(`/api/playhq/games/${encodeURIComponent(game.id)}?academyId=${encodeURIComponent(academy.id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load this game's scorecard.");
      setSummary(data.summary);
    } catch (err) {
      setImportError((err as { message?: string })?.message ?? String(err));
    } finally {
      setLoadingSummary(false);
    }
  }

  async function handleImport() {
    if (!activeGame) return;
    setImportError("");
    setImporting(true);
    try {
      const res = await fetch("/api/playhq/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          academyId: academy.id, gameId: activeGame.id, format, venue, scheduledDate,
          playerLinks: uniqueAppearances.map((a) => ({
            playhqPlayerId: a.playerId, playerId: playerLinks[a.playerId] || null,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not import this match.");
      setImportedIds((prev) => new Set(prev).add(activeGame.id));
      setActiveGame(null);
      setSummary(null);
    } catch (err) {
      setImportError((err as { message?: string })?.message ?? String(err));
    } finally {
      setImporting(false);
    }
  }

  if (!canManage) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <p className="text-hp-paper font-semibold mb-2">Not available</p>
        <p className="text-hp-paper/45 text-sm">You don&apos;t have access to this academy&apos;s PlayHQ connection.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-6">
        <Link href={`/academies/${academy.id}`} className="inline-flex items-center gap-1.5 text-sm text-hp-paper/45 hover:text-hp-paper transition-colors">
          ← Back to {academy.name}
        </Link>
      </div>

      <h1 className="font-display font-black uppercase text-2xl text-hp-paper tracking-wide mb-1">PlayHQ</h1>
      <p className="text-hp-paper/45 text-sm mb-6">Bring in completed matches already scored on PlayHQ.</p>

      <div className="bg-hp-surface border border-white/10 border-t-2 border-t-hp-cg p-6 mb-6">
        {connected ? (
          <p className="text-pace-green font-semibold text-sm">
            ✓ Connected to PlayHQ organisation {academy.playhqOrgName || orgId}
          </p>
        ) : (
          <>
            <label className="block text-xs font-mono font-semibold text-hp-paper/52 uppercase tracking-widest mb-1.5">
              PlayHQ Organisation ID
            </label>
            <div className="flex gap-2">
              <input
                value={orgId} onChange={(e) => setOrgId(e.target.value)}
                placeholder="e.g. 8f1e2a3b-..."
                className="flex-1 bg-hp-ink px-4 py-2.5 text-hp-paper placeholder-hp-paper/30 border border-white/12 focus:border-hp-cg focus:outline-none text-sm"
              />
              <button type="button" onClick={handleConnect} disabled={connecting || !orgId.trim()}
                className="px-5 py-2.5 bg-hp-cg text-hp-paper text-sm font-bold hover:bg-hp-cg/90 transition-colors disabled:opacity-50">
                {connecting ? "Connecting…" : "Connect"}
              </button>
            </div>
            {connectError && <p className="text-red-400 text-sm mt-2">{connectError}</p>}
          </>
        )}
      </div>

      {connected && !activeGame && (
        <div className="bg-hp-surface border border-white/10 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold uppercase text-sm text-hp-paper">Completed Games</h2>
            <button type="button" onClick={loadGames} disabled={loadingGames}
              className="px-4 py-1.5 text-xs font-semibold border border-white/15 text-hp-paper/70 hover:text-hp-paper hover:border-white/30 transition-colors disabled:opacity-50">
              {loadingGames ? "Loading…" : games ? "Refresh" : "Load Games"}
            </button>
          </div>
          {gamesError && <p className="text-red-400 text-sm mb-3">{gamesError}</p>}
          {games && games.length === 0 && <p className="text-hp-paper/45 text-sm">No new completed games to import.</p>}
          <div className="flex flex-col gap-2">
            {games?.map((g) => (
              <div key={g.id} className="flex items-center justify-between px-4 py-3 bg-hp-ink border border-white/10">
                <div>
                  <p className="text-hp-paper text-sm font-semibold">{g.homeTeam.name} vs {g.awayTeam.name}</p>
                  <p className="text-hp-paper/45 text-xs">{g.date?.slice(0, 10)}{g.venue ? ` · ${g.venue}` : ""}{g.result ? ` · ${g.result}` : ""}</p>
                </div>
                {importedIds.has(g.id) ? (
                  <span className="text-pace-green text-xs font-semibold">✓ Imported</span>
                ) : (
                  <button type="button" onClick={() => openGame(g)}
                    className="px-4 py-1.5 bg-hp-cg text-hp-paper text-xs font-bold hover:bg-hp-cg/90 transition-colors">
                    Review &amp; Import
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeGame && (
        <div className="bg-hp-surface border border-white/10 border-t-2 border-t-hp-cg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold uppercase text-sm text-hp-paper">
              {activeGame.homeTeam.name} vs {activeGame.awayTeam.name}
            </h2>
            <button type="button" onClick={() => { setActiveGame(null); setSummary(null); }}
              className="text-hp-paper/45 hover:text-hp-paper text-xs">Cancel</button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <div>
              <label className="block text-xs font-mono font-semibold text-hp-paper/52 uppercase tracking-widest mb-1.5">Format</label>
              <select value={format} onChange={(e) => setFormat(e.target.value as typeof FORMATS[number])}
                className="w-full bg-hp-ink px-3 py-2 text-hp-paper border border-white/12 text-sm">
                {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono font-semibold text-hp-paper/52 uppercase tracking-widest mb-1.5">Venue</label>
              <input value={venue} onChange={(e) => setVenue(e.target.value)}
                className="w-full bg-hp-ink px-3 py-2 text-hp-paper border border-white/12 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-mono font-semibold text-hp-paper/52 uppercase tracking-widest mb-1.5">Date</label>
              <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full bg-hp-ink px-3 py-2 text-hp-paper border border-white/12 text-sm" />
            </div>
          </div>

          <h3 className="text-xs font-mono font-semibold text-hp-paper/52 uppercase tracking-widest mb-2">
            Match Players — link to a real player, or leave unmatched
          </h3>
          {loadingSummary && <p className="text-hp-paper/45 text-sm">Loading scorecard…</p>}
          <div className="flex flex-col gap-2 mb-5">
            {uniqueAppearances.map((a) => (
              <div key={a.playerId} className="flex items-center justify-between gap-3 px-3 py-2 bg-hp-ink border border-white/10">
                <span className="text-hp-paper text-sm">{a.playerName}</span>
                <select
                  value={playerLinks[a.playerId] ?? ""}
                  onChange={(e) => setPlayerLinks((prev) => ({ ...prev, [a.playerId]: e.target.value }))}
                  className="bg-hp-surface px-3 py-1.5 text-hp-paper border border-white/12 text-sm min-w-[200px]"
                >
                  <option value="">No match</option>
                  {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            ))}
          </div>

          {importError && <p className="text-red-400 text-sm mb-3">{importError}</p>}
          <button type="button" onClick={handleImport} disabled={importing || !venue.trim() || !scheduledDate}
            className="px-5 py-2.5 bg-hp-cg text-hp-paper text-sm font-bold hover:bg-hp-cg/90 transition-colors disabled:opacity-50">
            {importing ? "Importing…" : "Import This Match"}
          </button>
        </div>
      )}
    </div>
  );
}
