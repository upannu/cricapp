"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { fetchPlayer, fetchArticles, fetchArticleReads, fetchTodaysTip, recordTipView } from "@/lib/db";
import { STAGE_ORDER, isStageUnlocked, stageLockReason, ACADEMY_TOTAL_ARTICLES, TIP_STREAK_TARGET_DAYS } from "@/lib/academy-content";
import type { Player, Article, ArticleRead, DailyTip, AcademyStage } from "@/lib/types";

const CATEGORY_STYLES: Record<string, string> = {
  Biomechanical: "bg-pace-green/10 text-pace-green border-pace-green/30",
  Technical: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  Physical: "bg-amber/10 text-amber border-amber/30",
  Mental: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  "Data Insight": "bg-fire/10 text-fire border-fire/30",
};

export function AcademyLearnClient() {
  const { user } = useAuth();
  const [player, setPlayer] = useState<Player | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [reads, setReads] = useState<ArticleRead[]>([]);
  const [tip, setTip] = useState<DailyTip | null>(null);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.playerId) return;
    Promise.all([
      fetchPlayer(user.playerId),
      fetchArticles(),
      fetchArticleReads(user.playerId),
      fetchTodaysTip(),
    ]).then(([p, a, r, t]) => {
      setPlayer(p);
      setArticles(a);
      setReads(r);
      setTip(t);
      setLoading(false);
      recordTipView(user.playerId!).then(({ streak }) => setStreak(streak));
    });
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 rounded-full border-2 border-pace-green border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user?.playerId || !player) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <p className="text-white font-semibold mb-2">No player linked to this account</p>
        <p className="text-zinc-400 text-sm">Contact your coach or academy admin to get this fixed.</p>
      </div>
    );
  }

  const readIds = new Set(reads.map((r) => r.articleId));
  const readCountByStage: Partial<Record<AcademyStage, number>> = {};
  for (const a of articles) {
    if (readIds.has(a.id)) readCountByStage[a.stage] = (readCountByStage[a.stage] ?? 0) + 1;
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Academy</h1>
        <p className="text-zinc-400 text-sm">Foundation → Mechanics → Velocity → Elite</p>
      </div>

      {/* Progress summary */}
      <div className="bg-surface rounded-2xl p-5 grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-lg font-bold text-pace-green">{player.academy.articlesRead}/{ACADEMY_TOTAL_ARTICLES}</div>
          <div className="text-xs text-zinc-500">Articles read</div>
        </div>
        <div>
          <div className="text-lg font-bold text-white font-mono">⚡ {player.academy.xp.toLocaleString()}</div>
          <div className="text-xs text-zinc-500">Academy XP</div>
        </div>
        <div>
          <div className="text-lg font-bold text-fire">🔥 {streak || player.tipStreakCount}</div>
          <div className="text-xs text-zinc-500">Day tip streak</div>
        </div>
      </div>

      {/* Daily tip */}
      {tip && (
        <div className="bg-surface rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Today&apos;s Tip</p>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${CATEGORY_STYLES[tip.category] ?? ""}`}>
              {tip.category}
            </span>
          </div>
          <p className="text-zinc-300 text-sm leading-relaxed">{tip.body}</p>
          {tip.relatedArticleId && (
            <Link href={`/portal/learn/${tip.relatedArticleId}`} className="inline-block mt-3 text-xs font-semibold text-pace-green hover:opacity-80">
              Read the related article →
            </Link>
          )}
          {streak >= TIP_STREAK_TARGET_DAYS && streak % TIP_STREAK_TARGET_DAYS === 0 && (
            <p className="mt-2 text-xs text-amber font-semibold">🔥 {streak}-day streak — +200 XP</p>
          )}
        </div>
      )}

      {/* Stages */}
      <div className="space-y-4">
        {STAGE_ORDER.map((stage) => {
          const stageArticles = articles.filter((a) => a.stage === stage);
          const unlocked = isStageUnlocked(stage, player.subscription.plan, readCountByStage);
          const lockReason = stageLockReason(stage, player.subscription.plan, readCountByStage);
          const readInStage = readCountByStage[stage] ?? 0;

          return (
            <div key={stage} className="bg-surface rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-white">
                  {unlocked ? "" : "🔒 "}{stage}
                </h2>
                <span className="text-xs text-zinc-500">{readInStage}/{stageArticles.length} read</span>
              </div>
              {!unlocked && lockReason && (
                <p className="text-xs text-amber mb-3">{lockReason}</p>
              )}
              <div className="space-y-1.5">
                {stageArticles.map((a) => {
                  const isRead = readIds.has(a.id);
                  const content = (
                    <div
                      className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl ${
                        unlocked ? "bg-ink hover:bg-zinc-800/60 transition-colors" : "bg-ink/50 opacity-50"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className={`text-sm font-medium truncate ${unlocked ? "text-white" : "text-zinc-500"}`}>
                          {isRead && "✓ "}{a.title}
                        </p>
                        <p className="text-xs text-zinc-500">{a.readTimeMinutes} min read</p>
                      </div>
                      {!unlocked && <span className="text-zinc-600 flex-shrink-0">🔒</span>}
                    </div>
                  );
                  return unlocked ? (
                    <Link key={a.id} href={`/portal/learn/${a.id}`} className="block">
                      {content}
                    </Link>
                  ) : (
                    <div key={a.id}>{content}</div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
