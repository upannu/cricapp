"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { fetchPlayer, fetchArticles, fetchArticleReads, recordArticleRead } from "@/lib/db";
import { isArticleUnlocked, stageLockReason } from "@/lib/academy-content";
import { ArticleBody } from "@/components/ArticleBody";
import type { Player, Article, AcademyStage } from "@/lib/types";

const STAGE_STYLES: Record<AcademyStage, string> = {
  Foundation: "bg-pace-green/10 text-pace-green border-pace-green/30",
  Mechanics: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  Velocity: "bg-amber/10 text-amber border-amber/30",
  Elite: "bg-fire/10 text-fire border-fire/30",
};

export function ArticleReaderClient({ articleId }: { articleId: string }) {
  const { user } = useAuth();
  const [player, setPlayer] = useState<Player | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [xpToast, setXpToast] = useState<number | null>(null);
  const markedRef = useRef(false);

  useEffect(() => {
    if (!user?.playerId) return;
    Promise.all([fetchPlayer(user.playerId), fetchArticles(), fetchArticleReads(user.playerId)]).then(
      ([p, a, r]) => {
        setPlayer(p);
        setArticles(a);
        setReadIds(new Set(r.map((x) => x.articleId)));
        setLoading(false);
      }
    );
  }, [user]);

  const article = articles.find((a) => a.id === articleId);

  const readCountByStage: Partial<Record<AcademyStage, number>> = {};
  for (const a of articles) {
    if (readIds.has(a.id)) readCountByStage[a.stage] = (readCountByStage[a.stage] ?? 0) + 1;
  }
  const unlocked = article && player ? isArticleUnlocked(article, player.subscription.plan, readCountByStage) : false;

  useEffect(() => {
    if (!user?.playerId || !article || !unlocked || markedRef.current) return;
    markedRef.current = true;
    recordArticleRead(user.playerId, article, articles).then(({ alreadyRead, xpAwarded }) => {
      if (!alreadyRead && xpAwarded > 0) {
        setXpToast(xpAwarded);
        setReadIds((prev) => new Set(prev).add(article.id));
      }
    });
  }, [user, article, unlocked, articles]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 rounded-full border-2 border-pace-green border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user?.playerId || !player || !article) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <p className="text-white font-semibold mb-2">Article not found</p>
        <Link href="/portal/learn" className="text-pace-green text-sm font-semibold hover:opacity-80">← Back to Academy</Link>
      </div>
    );
  }

  if (!unlocked) {
    const reason = stageLockReason(article.stage, player.subscription.plan, readCountByStage);
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <div className="text-4xl mb-3">🔒</div>
        <p className="text-white font-semibold mb-2">{article.title} is locked</p>
        <p className="text-zinc-400 text-sm mb-6">{reason}</p>
        <Link href="/portal/learn" className="text-pace-green text-sm font-semibold hover:opacity-80">← Back to Academy</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="mb-6">
        <Link href="/portal/learn" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors">
          ← Back to Academy
        </Link>
      </div>

      {xpToast !== null && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-pace-green/10 border border-pace-green/30 text-pace-green text-sm font-semibold">
          ⚡ +{xpToast} XP earned
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${STAGE_STYLES[article.stage]}`}>
          {article.stage}
        </span>
        <span className="text-zinc-500 text-xs">{article.readTimeMinutes} min read</span>
        {readIds.has(article.id) && <span className="text-pace-green text-xs font-semibold">✓ Read</span>}
      </div>

      <h1 className="text-xl font-bold text-white mb-4">{article.title}</h1>

      <div className="bg-surface rounded-2xl p-5 mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Key takeaways</p>
        <ul className="space-y-1.5">
          {article.keyTakeaways.map((t, i) => (
            <li key={i} className="text-sm text-zinc-300 leading-relaxed flex gap-2">
              <span className="text-pace-green flex-shrink-0">→</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </div>

      <ArticleBody bodyMd={article.bodyMd} articles={articles} />
    </div>
  );
}
