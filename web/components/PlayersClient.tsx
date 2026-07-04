"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { fetchPlayers, fetchAcademies } from "@/lib/db";
import { formatDate, getPlayerStatus, getInitials, getCoachOrAcademyLabel } from "@/lib/utils";
import type { Academy, Player, PlayerStatus } from "@/lib/types";
import { MessageModal } from "@/components/MessageModal";
import { BulkMessageModal } from "@/components/BulkMessageModal";

const statusStyles: Record<PlayerStatus, string> = {
  Active:   "bg-pace-green/15 text-pace-green",
  Expiring: "bg-amber/15 text-amber",
  Expired:  "bg-red-500/15 text-red-400",
};

const planStyles: Record<string, string> = {
  "Coach Pro":  "border-pace-green/50 text-pace-green",
  "Player Pro": "border-blue-400/50 text-blue-400",
  Free:         "border-zinc-600/50 text-zinc-400",
};

export function PlayersClient() {
  const { user } = useAuth();
  const [players, setPlayers] = useState<Player[]>([]);
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [messagingPlayer, setMessagingPlayer] = useState<Player | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMessaging, setBulkMessaging] = useState(false);

  useEffect(() => {
    if (!user) return;
    const coachName = user.role === "coach" ? user.name : undefined;
    Promise.all([fetchPlayers(coachName), fetchAcademies()]).then(([p, a]) => {
      setPlayers(p);
      setAcademies(a);
    });
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const active    = players.filter((p) => getPlayerStatus(p.subscription.endDate) === "Active").length;
  const expiring  = players.filter((p) => getPlayerStatus(p.subscription.endDate) === "Expiring").length;
  const activeSubs = players.filter(
    (p) => p.subscription.plan !== "Free" && getPlayerStatus(p.subscription.endDate) === "Active"
  ).length;
  const totalSessions = players.reduce((s, p) => s + p.sessionsCount, 0);

  const allSelected = selectedIds.size === players.length && players.length > 0;
  const someSelected = selectedIds.size > 0 && !allSelected;

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(players.map((p) => p.id)));
    }
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  const selectedPlayers = players.filter((p) => selectedIds.has(p.id));

  return (
    <>
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Players</h1>
          <p className="text-zinc-400 text-sm mt-1">Manage your players and their subscriptions</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setSelectedIds(new Set(players.map((p) => p.id)));
            setBulkMessaging(true);
          }}
          className="flex-shrink-0 px-4 py-2 text-sm font-semibold text-blue-400 border border-blue-500/30 rounded-xl hover:bg-blue-500/10 transition-colors cursor-pointer"
        >
          ✉ Message All
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Active Players" value={active} />
        <StatCard label="Active Subscriptions" value={activeSubs} />
        <StatCard label="Expiring in 7 Days" value={expiring} highlight={expiring > 0} />
        <StatCard label="Total Sessions" value={totalSessions} />
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center gap-3 bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-3">
          <span className="text-blue-400 text-sm font-semibold">
            {selectedIds.size} player{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <button
            type="button"
            onClick={() => setBulkMessaging(true)}
            className="px-3 py-1.5 text-xs font-semibold text-black bg-pace-green rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
          >
            ✉ Message Selected
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer ml-auto"
          >
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-surface rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-700/60">
          <h2 className="text-base font-semibold text-white">
            {players.length} Player{players.length !== 1 ? "s" : ""}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-700/60">
                {["Player", "Coach", "Plan", "Status", "Start Date", "End / Renewal", "Sessions", "Last Active"].map(
                  (h) => (
                    <th
                      key={h}
                      className="text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider px-4 py-3 first:pl-6 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  )
                )}
                <th className="text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider px-4 py-3 whitespace-nowrap">
                  Actions
                </th>
                <th className="text-center text-xs font-semibold text-zinc-400 uppercase tracking-wider px-4 py-3 pr-6 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span>Msg/Sms</span>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected; }}
                      onChange={toggleAll}
                      className="w-3.5 h-3.5 accent-pace-green cursor-pointer"
                      title="Select all"
                    />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => {
                const status = getPlayerStatus(player.subscription.endDate);
                const isSelected = selectedIds.has(player.id);
                return (
                  <tr
                    key={player.id}
                    className={`border-b border-zinc-700/40 last:border-0 transition-colors ${
                      isSelected
                        ? "bg-blue-500/5"
                        : status === "Expired"
                          ? "opacity-60 hover:bg-surface/80"
                          : "hover:bg-surface/80"
                    }`}
                  >
                    <td className="px-4 py-4 pl-6">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-pace-green/20 text-pace-green flex items-center justify-center text-sm font-bold flex-shrink-0">
                          {getInitials(player.name)}
                        </div>
                        <div>
                          <p className="text-white text-sm font-medium whitespace-nowrap">{player.name}</p>
                          <p className="text-zinc-400 text-xs">{player.bowlingStyle}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-zinc-300 text-xs whitespace-nowrap">{getCoachOrAcademyLabel(player, academies)}</td>
                    <td className="px-4 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${planStyles[player.subscription.plan] ?? planStyles["Free"]}`}>
                        {player.subscription.plan}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusStyles[status]}`}>
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-zinc-300 whitespace-nowrap">{formatDate(player.subscription.startDate)}</td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`text-sm font-medium ${status === "Expiring" ? "text-amber" : status === "Expired" ? "text-red-400" : "text-zinc-300"}`}>
                        {formatDate(player.subscription.endDate)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-zinc-300 font-mono">{player.sessionsCount}</td>
                    <td className="px-4 py-4 text-sm text-zinc-400 whitespace-nowrap">{formatDate(player.lastActive)}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/players/${player.id}`}
                          className="px-3 py-1.5 text-xs font-semibold text-pace-green border border-pace-green/40 rounded-lg hover:bg-pace-green/10 transition-colors"
                        >
                          View
                        </Link>
                        <button
                          type="button"
                          onClick={() => setMessagingPlayer(player)}
                          className="px-3 py-1.5 text-xs font-semibold text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/10 transition-colors cursor-pointer"
                          title="Send message"
                        >
                          ✉
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-4 pr-6 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(player.id)}
                        className="w-4 h-4 accent-pace-green cursor-pointer"
                        title="Select for bulk message"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {players.length === 0 && (
            <div className="px-6 py-16 text-center text-zinc-400 text-sm">No players in your scope.</div>
          )}
        </div>
      </div>
    </div>

    {messagingPlayer && (
      <MessageModal
        playerId={messagingPlayer.id}
        playerName={messagingPlayer.name}
        playerEmail={messagingPlayer.email}
        playerPhone={messagingPlayer.phone}
        onClose={() => setMessagingPlayer(null)}
      />
    )}

    {bulkMessaging && (
      <BulkMessageModal
        players={selectedPlayers}
        onClose={() => {
          setBulkMessaging(false);
          setSelectedIds(new Set());
        }}
      />
    )}
    </>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="bg-surface rounded-2xl p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${highlight ? "text-fire" : "text-white"}`}>{value}</p>
    </div>
  );
}
