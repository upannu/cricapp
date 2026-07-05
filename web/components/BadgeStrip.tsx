import { computeBadges } from "@/lib/badges";
import type { Player } from "@/lib/types";

export function BadgeStrip({ player, reportCount }: { player: Player; reportCount: number }) {
  const badges = computeBadges(player, reportCount);
  const earned = badges.filter((b) => b.earned);
  const nextUp = badges
    .filter((b) => !b.earned && b.progress)
    .sort((a, b) => (a.progress!.target - a.progress!.current) - (b.progress!.target - b.progress!.current))[0];

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Badges ({earned.length})</p>
      <div className="flex flex-wrap gap-2 mb-2">
        {earned.length === 0 ? (
          <span className="text-xs text-zinc-600">No badges earned yet</span>
        ) : (
          earned.map((b) => (
            <div
              key={b.id}
              title={`${b.name} — ${b.description}`}
              className="w-10 h-10 rounded-full bg-pace-green/10 border border-pace-green/30 flex items-center justify-center text-lg"
            >
              {b.icon}
            </div>
          ))
        )}
      </div>
      {nextUp && (
        <p className="text-xs text-zinc-500">
          Next: {nextUp.icon} {nextUp.name} ({nextUp.progress!.current}/{nextUp.progress!.target})
        </p>
      )}
    </div>
  );
}
