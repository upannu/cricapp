import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchPlayerServer, fetchArticlesServer, fetchArticleReadsServer } from "@/lib/supabase-server";
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
  const [player, articles, reads] = await Promise.all([
    fetchPlayerServer(id),
    fetchArticlesServer(),
    fetchArticleReadsServer(id),
  ]);
  if (!player) notFound();

  const readIds = new Set(reads.map((r) => r.articleId));
  const readCountByStage: Partial<Record<AcademyStage, number>> = {};
  for (const a of articles) {
    if (readIds.has(a.id)) readCountByStage[a.stage] = (readCountByStage[a.stage] ?? 0) + 1;
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6">
        <Link href={`/players/${id}`} className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors">
          ← Back to Profile
        </Link>
      </div>

      <div className="flex items-center gap-4 mb-8">
        <div>
          <h1 className="text-xl font-bold text-white">Academy Curriculum</h1>
          <p className="text-zinc-400 text-sm">{player.name}</p>
        </div>
      </div>

      <div className="bg-surface rounded-2xl p-5 grid grid-cols-3 gap-4 text-center mb-6">
        <div>
          <div className="text-lg font-bold text-pace-green">{player.academy.articlesRead}/{ACADEMY_TOTAL_ARTICLES}</div>
          <div className="text-xs text-zinc-500">Articles read</div>
        </div>
        <div>
          <div className="text-lg font-bold text-white font-mono">⚡ {player.academy.xp.toLocaleString()}</div>
          <div className="text-xs text-zinc-500">Academy XP</div>
        </div>
        <div>
          <div className="text-lg font-bold text-white">{player.academy.stage}</div>
          <div className="text-xs text-zinc-500">Current stage</div>
        </div>
      </div>

      <div className="space-y-4">
        {STAGE_ORDER.map((stage) => {
          const stageArticles = articles.filter((a) => a.stage === stage);
          const unlocked = isStageUnlocked(stage, player.subscription.plan, readCountByStage);
          const readInStage = readCountByStage[stage] ?? 0;

          return (
            <div key={stage} className="bg-surface rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${STAGE_STYLES[stage]}`}>
                  {unlocked ? "" : "🔒 "}{stage}
                </span>
                <span className="text-xs text-zinc-500">{readInStage}/{stageArticles.length} read</span>
              </div>
              <div className="space-y-1.5">
                {stageArticles.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-ink">
                    <p className="text-sm text-zinc-300 truncate">{a.title}</p>
                    <span className={`text-xs flex-shrink-0 ${readIds.has(a.id) ? "text-pace-green font-semibold" : "text-zinc-600"}`}>
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
