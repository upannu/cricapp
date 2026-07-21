import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchPlayerServer, fetchReportsServer } from "@/lib/supabase-server";
import { formatDate, formatDateTime } from "@/lib/utils";
import { ReportActions } from "@/components/ReportActions";

const TYPE_STYLES: Record<string, string> = {
  "Biomechanics":    "bg-pace-green/10 text-pace-green",
  "Session Review":  "bg-blue-500/10 text-blue-400",
  "Progress Report": "bg-amber/10 text-amber",
  "Action Plan":     "bg-fire/10 text-fire",
};

const ZONE_LABELS: Record<"approach" | "deliveryStride" | "release" | "followThrough", string> = {
  approach: "Approach",
  deliveryStride: "Delivery Stride",
  release: "Release",
  followThrough: "Follow-Through",
};

export default async function PlayerReportsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [player, reports] = await Promise.all([
    fetchPlayerServer(id),
    fetchReportsServer(id),
  ]);
  if (!player) notFound();

  const initials = player.name.split(" ").map((n: string) => n[0] ?? "").join("");
  const sortedReports = [...reports].sort((a, b) => {
    const aKey = a.sessionDate ?? a.date;
    const bKey = b.sessionDate ?? b.date;
    return bKey.localeCompare(aKey);
  });
  const speedReports = reports.filter((r) => r.speedKmh !== null);
  const peakSpeed = speedReports.length
    ? Math.max(...speedReports.map((r) => r.speedKmh ?? 0)).toFixed(1)
    : null;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Back */}
      <div className="mb-6">
        <Link
          href={`/players/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
        >
          ← Back to Profile
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-full bg-pace-green flex items-center justify-center text-black font-bold text-xl flex-shrink-0">
          {initials}
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Reports</h1>
          <p className="text-zinc-400 text-sm">{player.name}</p>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-surface rounded-2xl p-5 text-center">
          <div className="text-2xl font-bold text-pace-green mb-1">
            {player.biomechanics.ballSpeedKmh.toFixed(1)}
          </div>
          <div className="text-xs text-zinc-400">Latest km/h</div>
        </div>
        <div className="bg-surface rounded-2xl p-5 text-center">
          <div className="text-2xl font-bold text-white mb-1">{reports.length}</div>
          <div className="text-xs text-zinc-400">Total reports</div>
        </div>
        <div className="bg-surface rounded-2xl p-5 text-center">
          <div className="text-2xl font-bold text-amber mb-1">{peakSpeed ?? "—"}</div>
          <div className="text-xs text-zinc-400">Peak km/h</div>
        </div>
      </div>

      {/* Reports list */}
      {reports.length === 0 ? (
        <div className="bg-surface rounded-2xl p-16 text-center">
          <p className="text-zinc-400 text-sm">No reports yet for this player.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedReports.map((r) => (
            <div
              key={r.id}
              className="bg-surface rounded-2xl p-5"
            >
              {r.sessionDate && (
                <div className="mb-2 text-xs font-semibold text-white">
                  🏏 Session: {formatDateTime(r.sessionDate)}
                </div>
              )}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${TYPE_STYLES[r.type] ?? "bg-zinc-700 text-zinc-300"}`}>
                      {r.type}
                    </span>
                    <span className="text-zinc-400 text-xs">Report: {formatDate(r.date)}</span>
                    {r.tags.map((t) => (
                      <span
                        key={t}
                        className="px-2 py-0.5 rounded-full text-xs bg-ink text-zinc-400 border border-zinc-700"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  <p className="text-zinc-300 text-sm leading-relaxed">{r.summary}</p>
                  {r.highlight && (
                    <p className="mt-1.5 text-xs text-amber font-semibold">★ {r.highlight}</p>
                  )}
                  {r.metrics && (
                    <p className="mt-1.5 text-xs text-amber/80">
                      ⚠ AI-generated — it can make mistakes. Discuss the details with a coach before acting on it.
                    </p>
                  )}
                  {(r.actionType || r.injuryRisk) && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {r.actionType && (
                        <span className="px-2 py-0.5 rounded-md text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20">{r.actionType}</span>
                      )}
                      {r.injuryRisk && (
                        <span className={`px-2 py-0.5 rounded-md text-xs border ${
                          r.injuryRisk === "High" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                          r.injuryRisk === "Moderate" ? "bg-amber/10 text-amber border-amber/20" :
                          "bg-pace-green/10 text-pace-green border-pace-green/20"
                        }`}>
                          {r.injuryRisk} risk
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex-shrink-0 text-right">
                  {r.speedKmh !== null && (
                    <>
                      <div className="text-pace-green font-mono font-bold text-sm">{r.speedKmh} km/h</div>
                      <div className="text-xs text-zinc-500 mt-0.5">ball speed</div>
                    </>
                  )}
                  {r.overallScore !== null && r.overallScore !== undefined && (
                    <div className="text-white font-mono font-bold text-sm mt-1">{r.overallScore}<span className="text-zinc-600 text-xs">/100</span></div>
                  )}
                </div>
              </div>

              {r.metrics && (
                <div className="mt-4 pt-4 border-t border-zinc-700/40">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                    {(["approach", "deliveryStride", "release", "followThrough"] as const).map((zone) => {
                      const score = r.metrics?.zoneScores[zone] ?? null;
                      return (
                        <div key={zone} className="bg-ink rounded-lg p-2 text-center">
                          <div className={`text-sm font-bold font-mono ${score === null ? "text-zinc-600" : score >= 70 ? "text-pace-green" : score >= 40 ? "text-amber" : "text-red-400"}`}>
                            {score ?? "—"}
                          </div>
                          <div className="text-[10px] text-zinc-500 uppercase tracking-wide">{ZONE_LABELS[zone]}</div>
                        </div>
                      );
                    })}
                  </div>
                  {r.metrics.flags.length > 0 && (
                    <div className="space-y-1 mb-3">
                      {r.metrics.flags.map((flag, i) => (
                        <p key={i} className="text-xs text-zinc-400 leading-relaxed">{flag}</p>
                      ))}
                    </div>
                  )}
                  {r.skeletonImages && r.skeletonImages.length > 0 && (
                    <div className="flex flex-wrap gap-3">
                      {r.skeletonImages.map((img) => (
                        <a key={img.phase} href={img.url} target="_blank" rel="noopener noreferrer" className="block">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img.url} alt={`Skeleton overlay at ${img.phase}`} className="w-20 h-auto rounded-lg border border-zinc-700" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {r.ballTracking && (r.ballTracking.pitchMapImageUrl || r.ballTracking.bounceLengthZone) && (
                <div className="mt-4 pt-4 border-t border-zinc-700/40 flex flex-wrap items-start gap-4">
                  {r.ballTracking.pitchMapImageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={r.ballTracking.pitchMapImageUrl} alt="Pitch map" className="w-32 h-auto rounded-lg border border-zinc-700" />
                  )}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">Pitch Map</p>
                    {r.ballTracking.bounceLengthZone && (
                      <p className="text-sm text-white font-semibold">
                        {r.ballTracking.bounceLengthZone}{r.ballTracking.bounceLineApprox ? ` · ${r.ballTracking.bounceLineApprox}` : ""}
                      </p>
                    )}
                    <p className="text-xs text-zinc-500 mt-0.5">Confidence: {r.ballTracking.confidence}</p>
                  </div>
                </div>
              )}

              {r.drills && r.drills.length > 0 && (
                <div className="mt-4 pt-4 border-t border-zinc-700/40">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Recommended Drills</p>
                  <div className="space-y-2">
                    {r.drills.map((drill) => (
                      <div key={drill.id}>
                        <p className="text-sm text-white font-semibold">{drill.name}</p>
                        <p className="text-xs text-zinc-400 leading-relaxed">{drill.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-zinc-700/40">
                <ReportActions reportId={r.id} playerId={player.id} hasPdf={!!r.sessionId} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 rounded-2xl border border-purple-500/20 bg-purple-500/5 p-5 text-center">
        <span className="text-purple-300 text-xs font-semibold uppercase tracking-wider">
          ✨ Generate an AI report from any session with uploaded video — from the Sessions tab
        </span>
      </div>
    </div>
  );
}
