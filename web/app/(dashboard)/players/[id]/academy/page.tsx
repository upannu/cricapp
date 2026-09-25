import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchPlayerServer, fetchArticlesServer, fetchArticleReadsServer, canAccessPlayerServer } from "@/lib/supabase-server";
import { STAGE_ORDER, isStageUnlocked, ACADEMY_TOTAL_ARTICLES } from "@/lib/academy-content";
import type { AcademyStage } from "@/lib/types";

const STAGE_STYLES: Record<AcademyStage, string> = {
  Foundation: "bg-pace-green/10 text-pace-green border-pace-green/30",
  Mechanics: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  Velocity: "bg-amber/10 text-amber border-amber/30",
  Elite: "bg-fire/10 text-fire border-fire/30",
};

export default async function PlayerAcademyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [player, articles, reads, allowed] = await Promise.all([
    fetchPlayerServer(id),
    fetchArticlesServer(),
    fetchArticleReadsServer(id),
    canAccessPlayerServer(id),
  ]);
  if (!player || !allowed) notFound();

  const readIds = new Set(reads.map((r) => r.articleId));
  const readCountByStage: Partial<Record<AcademyStage, number>> = {};
  for (const a of articles) {
    if (readIds.has(a.id)) readCountByStage[a.stage] = (readCountByStage[a.stage] ?? 0) + 1;
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6">
        <Link href={`/players/${id}`} className="inline-flex items-center gap-1.5 text-sm text-hp-paper/50 hover:text-hp-paper transition-colors">
          ← Back to Profile
        </Link>
      </div>

      <div className="flex items-center gap-4 mb-8">
        <div>
          <h1 className="font-display font-black uppercase text-xl text-hp-paper tracking-wide">Academy Curriculum</h1>
          <p className="text-hp-paper/60 text-sm">{player.name}</p>
        </div>
      </div>

      <div className="bg-hp-surface border border-white/8 p-5 grid grid-cols-3 gap-4 text-center mb-6">
        <div>
          <div className="text-lg font-bold text-pace-green">{player.academy.articlesRead}/{ACADEMY_TOTAL_ARTICLES}</div>
          <div className="text-xs text-hp-paper/45">Articles read</div>
        </div>
        <div>
          <div className="text-lg font-bold text-hp-paper font-mono">⚡ {player.academy.xp.toLocaleString()}</div>
          <div className="text-xs text-hp-paper/45">Academy XP</div>
        </div>
        <div>
          <div className="text-lg font-bold text-hp-paper">{player.academy.stage}</div>
          <div className="text-xs text-hp-paper/45">Current stage</div>
        </div>
      </div>

      <div className="space-y-4">
        {STAGE_ORDER.map((stage) => {
          const stageArticles = articles.filter((a) => a.stage === stage);
          const hasLibraryAccess = player.librarySubscriptionStatus === "active" || player.librarySubscriptionStatus === "trialing";
          const unlocked = isStageUnlocked(stage, player.subscription.plan, readCountByStage, hasLibraryAccess);
          const readInStage = readCountByStage[stage] ?? 0;

          return (
            <div key={stage} className="bg-hp-surface border border-white/8 p-5">
              <div className="flex items-center justify-between mb-3">
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${STAGE_STYLES[stage]}`}>
                  {unlocked ? "" : "🔒 "}{stage}
                </span>
                <span className="text-xs text-hp-paper/45">{readInStage}/{stageArticles.length} read</span>
              </div>
              <div className="space-y-1.5">
                {stageArticles.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 px-3 py-2 bg-hp-ink">
                    <p className="text-sm text-hp-paper/70 truncate">{a.title}</p>
                    <span className={`text-xs flex-shrink-0 ${readIds.has(a.id) ? "text-pace-green font-semibold" : "text-hp-paper/35"}`}>
                      {readIds.has(a.id) ? "✓ Read" : "Unread"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
