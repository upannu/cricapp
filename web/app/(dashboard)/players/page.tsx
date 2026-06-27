import Link from "next/link";
import { mockPlayers } from "@/lib/mock-data";
import { formatDate, getPlayerStatus, getInitials } from "@/lib/utils";
import type { PlayerStatus } from "@/lib/types";

function computeStats() {
  const active = mockPlayers.filter(
    (p) => getPlayerStatus(p.subscription.endDate) === "Active"
  ).length;
  const expiring = mockPlayers.filter(
    (p) => getPlayerStatus(p.subscription.endDate) === "Expiring"
  ).length;
  const activeSubs = mockPlayers.filter(
    (p) =>
      p.subscription.plan !== "Free" &&
      getPlayerStatus(p.subscription.endDate) === "Active"
  ).length;
  return { active, expiring, activeSubs, sessionsThisMonth: 24 };
}

const statusStyles: Record<PlayerStatus, string> = {
  Active: "bg-pace-green/15 text-pace-green",
  Expiring: "bg-amber/15 text-amber",
  Expired: "bg-red-500/15 text-red-400",
};

const planStyles: Record<string, string> = {
  "Coach Pro": "border-pace-green/50 text-pace-green",
  "Player Pro": "border-blue-400/50 text-blue-400",
  Free: "border-zinc-600/50 text-zinc-400",
};

export default function PlayersPage() {
  const stats = computeStats();

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Players</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Manage your players and their subscriptions
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Active Players" value={stats.active} />
        <StatCard label="Active Subscriptions" value={stats.activeSubs} />
        <StatCard
          label="Expiring in 7 Days"
          value={stats.expiring}
          highlight={stats.expiring > 0}
        />
        <StatCard label="Sessions This Month" value={stats.sessionsThisMonth} />
      </div>

      {/* Players table */}
      <div className="bg-surface rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-700/60">
          <h2 className="text-base font-semibold text-white">All Players</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-700/60">
                {[
                  "Player",
                  "Plan",
                  "Status",
                  "Start Date",
                  "End / Renewal",
                  "Sessions",
                  "Last Active",
                  "Actions",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider px-4 py-3 first:pl-6 last:pr-6 whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mockPlayers.map((player) => {
                const status = getPlayerStatus(player.subscription.endDate);
                return (
                  <tr
                    key={player.id}
                    className={`border-b border-zinc-700/40 last:border-0 hover:bg-surface-hover transition-colors ${
                      status === "Expired" ? "opacity-60" : ""
                    }`}
                  >
                    {/* Player */}
                    <td className="px-4 py-4 pl-6">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-pace-green/20 text-pace-green flex items-center justify-center text-sm font-bold flex-shrink-0">
                          {getInitials(player.name)}
                        </div>
                        <div>
                          <p className="text-white text-sm font-medium whitespace-nowrap">
                            {player.name}
                          </p>
                          <p className="text-zinc-400 text-xs">
                            {player.bowlingStyle}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Plan */}
                    <td className="px-4 py-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${
                          planStyles[player.subscription.plan] ??
                          planStyles["Free"]
                        }`}
                      >
                        {player.subscription.plan}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusStyles[status]}`}
                      >
                        {status}
                      </span>
                    </td>

                    {/* Start date */}
                    <td className="px-4 py-4 text-sm text-zinc-300 whitespace-nowrap">
                      {formatDate(player.subscription.startDate)}
                    </td>

                    {/* End / renewal date */}
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span
                        className={`text-sm font-medium ${
                          status === "Expiring"
                            ? "text-amber"
                            : status === "Expired"
                              ? "text-red-400"
                              : "text-zinc-300"
                        }`}
                      >
                        {formatDate(player.subscription.endDate)}
                      </span>
                    </td>

                    {/* Sessions */}
                    <td className="px-4 py-4 text-sm text-zinc-300 font-mono">
                      {player.sessionsCount}
                    </td>

                    {/* Last active */}
                    <td className="px-4 py-4 text-sm text-zinc-400 whitespace-nowrap">
                      {formatDate(player.lastActive)}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-4 pr-6">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/players/${player.id}`}
                          className="px-3 py-1.5 text-xs font-semibold text-pace-green border border-pace-green/40 rounded-lg hover:bg-pace-green/10 transition-colors"
                        >
                          View
                        </Link>
                        <button
                          type="button"
                          className="px-3 py-1.5 text-xs font-semibold text-zinc-400 border border-zinc-600 rounded-lg hover:bg-zinc-700/50 transition-colors cursor-pointer"
                        >
                          Message
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="bg-surface rounded-2xl p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
        {label}
      </p>
      <p className={`text-3xl font-bold ${highlight ? "text-fire" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}
