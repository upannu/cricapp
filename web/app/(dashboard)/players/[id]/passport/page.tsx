import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchPlayerServer, fetchPlayerAffiliationsServer, canAccessPlayerPassportServer } from "@/lib/supabase-server";
import { fetchAcademies, fetchCoaches } from "@/lib/db";
import { InfoCard, InfoRow } from "@/components/InfoCard";
import type { PlayerAffiliation } from "@/lib/types";

function formatMonthYear(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export default async function PlayerPassportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [player, affiliations, academies, coaches, allowed] = await Promise.all([
    fetchPlayerServer(id),
    fetchPlayerAffiliationsServer(id),
    fetchAcademies(),
    fetchCoaches(),
    canAccessPlayerPassportServer(id),
  ]);
  if (!player || !allowed) notFound();

  // Fallback for a player who's never been through Reassign Coach since the backfill (e.g.
  // created after this feature shipped) — synthesise their current period from the live
  // coach_id rather than showing an empty timeline for someone who clearly is affiliated today.
  let timeline = affiliations;
  if (timeline.length === 0 && player.coachId) {
    const coach = coaches.find((c) => c.id === player.coachId);
    if (coach) {
      const academy = coach.academyId ? academies.find((a) => a.id === coach.academyId) : undefined;
      const synthetic: PlayerAffiliation = {
        id: `synthetic_${player.id}`,
        playerId: player.id,
        academyId: academy?.id ?? null,
        coachId: coach.id,
        orgLabel: academy?.name ?? `${coach.name} (Independent)`,
        startDate: player.addedDate || new Date().toISOString(),
        endDate: null,
        createdAt: player.addedDate || new Date().toISOString(),
      };
      timeline = [synthetic];
    }
  }

  const initials = player.name.split(" ").map((n) => n[0] ?? "").join("");

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6">
        <Link href={`/players/${id}`} className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors">
          ← Back to Profile
        </Link>
      </div>

      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-full bg-pace-green/10 border border-pace-green/30 flex items-center justify-center text-pace-green font-bold text-lg flex-shrink-0">
          {initials}
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Cricket Passport</h1>
          <p className="text-zinc-400 text-sm">{player.name}</p>
        </div>
      </div>

      {/* Identity — real, existing player fields, not fabricated */}
      <div className="mb-4">
        <InfoCard title="Identity">
          <InfoRow label="Age group" value={player.ageGroup} />
          <InfoRow label="Playing level" value={player.playingLevel} />
          <InfoRow label="Batting hand" value={player.battingHand} />
          <InfoRow label="Bowling style" value={player.bowlingStyle} />
          {player.club && <InfoRow label="Club" value={player.club} />}
        </InfoCard>
      </div>

      {/* Affiliation timeline — the actual "passport" concept: which organisation(s) this player
          has been connected to over time, not just their current one. */}
      <div className="mb-4">
        <InfoCard title="Organisation Timeline">
          {timeline.length === 0 ? (
            <p className="text-zinc-500 text-sm">No organisation history recorded yet.</p>
          ) : (
            <div className="space-y-4">
              {timeline.map((period) => (
                <div key={period.id} className="flex items-start gap-3">
                  <div
                    className={`mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      period.endDate ? "bg-zinc-600" : "bg-pace-green"
                    }`}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm font-semibold">{period.orgLabel}</span>
                      {!period.endDate && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-pace-green bg-pace-green/10 border border-pace-green/30 rounded-full px-2 py-0.5">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-zinc-500 text-xs mt-0.5">
                      {formatMonthYear(period.startDate)} — {period.endDate ? formatMonthYear(period.endDate) : "Present"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </InfoCard>
      </div>

      {/* Development snapshot — real data already tracked elsewhere on the player record,
          surfaced here as part of the passport rather than duplicated with new fields. */}
      <div className="mb-4">
        <InfoCard title="Development Snapshot">
          <InfoRow label="Academy stage" value={player.academy.stage} />
          <InfoRow label="Academy progress" value={`${player.academy.completionPercent}%`} />
          <InfoRow label="Total sessions" value={player.sessionsCount} />
          {player.biomechanics.lastSession && (
            <>
              <InfoRow label="Last biomechanics report" value={player.biomechanics.lastSession} />
              <InfoRow label="Ball speed" value={`${player.biomechanics.ballSpeedKmh} km/h`} />
              <InfoRow label="Injury risk" value={player.biomechanics.injuryRisk} />
            </>
          )}
        </InfoCard>
      </div>

      {/* Honest about what isn't here yet — no fabricated batting/bowling/fielding career stats.
          Those depend on ball-by-ball match scoring, which doesn't exist in the product yet. */}
      <div className="rounded-2xl border border-dashed border-zinc-700 p-5 text-center">
        <p className="text-zinc-500 text-sm">
          Batting, bowling and fielding career stats will appear here once match scoring is live.
        </p>
      </div>
    </div>
  );
}
