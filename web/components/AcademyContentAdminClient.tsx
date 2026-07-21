"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import {
  fetchAllArticlesForAdmin, upsertArticle, deleteArticle,
  fetchTipArchive, upsertDailyTip, deleteDailyTip,
} from "@/lib/db";
import { STAGE_ORDER } from "@/lib/academy-content";
import type { Article, DailyTip, AcademyStage, ArticleCategory } from "@/lib/types";

const CATEGORIES: ArticleCategory[] = ["Biomechanical", "Technical", "Physical", "Mental", "Data Insight"];

type ArticleDraft = Omit<Article, "id"> & { id?: string };
const EMPTY_ARTICLE: ArticleDraft = {
  stage: "Foundation", orderInStage: 1, title: "", readTimeMinutes: 5,
  relatedMetric: "", keyTakeaways: [""], bodyMd: "", published: true, videoUrl: "",
};

type TipDraft = Omit<DailyTip, "id"> & { id?: string };
const EMPTY_TIP: TipDraft = {
  publishDate: new Date().toISOString().split("T")[0],
  category: "Technical", body: "", relatedArticleId: "",
};

type PageTab = "Articles" | "Daily Tips";

export function AcademyContentAdminClient() {
  const { user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<PageTab>("Articles");
  const [articles, setArticles] = useState<Article[]>([]);
  const [tips, setTips] = useState<DailyTip[]>([]);
  const [loading, setLoading] = useState(true);

  const [articleDraft, setArticleDraft] = useState<ArticleDraft | null>(null);
  const [tipDraft, setTipDraft] = useState<TipDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{ kind: "article" | "tip"; id: string; label: string } | null>(null);

  useEffect(() => {
    if (user && user.role !== "platform_admin") { router.replace("/players"); return; }
  }, [user, router]);

  useEffect(() => {
    Promise.all([fetchAllArticlesForAdmin(), fetchTipArchive(200)]).then(([a, t]) => {
      setArticles(a);
      setTips(t);
      setLoading(false);
    });
  }, []);

  if (!user || user.role !== "platform_admin") return null;

  async function handleSaveArticle() {
    if (!articleDraft) return;
    if (!articleDraft.title.trim()) { setError("Title is required."); return; }
    if (!articleDraft.bodyMd.trim()) { setError("Article body is required."); return; }
    setError("");
    setSaving(true);
    const id = articleDraft.id ?? `art-${Date.now()}`;
    // Was this article already published before this save? Drives whether we notify players —
    // only a genuine publish moment (new or newly-flipped) should email, not every subsequent edit.
    const wasPublished = articles.find((a) => a.id === id)?.published ?? false;
    try {
      await upsertArticle({
        id, stage: articleDraft.stage, order_in_stage: articleDraft.orderInStage,
        title: articleDraft.title.trim(), read_time_minutes: articleDraft.readTimeMinutes,
        related_metric: articleDraft.relatedMetric?.trim() || null,
        key_takeaways: articleDraft.keyTakeaways.filter((t) => t.trim()),
        body_md: articleDraft.bodyMd, published: articleDraft.published,
        video_url: articleDraft.videoUrl?.trim() || null,
      });
      const updated: Article = { ...articleDraft, id, keyTakeaways: articleDraft.keyTakeaways.filter((t) => t.trim()) };
      setArticles((prev) => {
        const exists = prev.some((a) => a.id === id);
        const next = exists ? prev.map((a) => (a.id === id ? updated : a)) : [...prev, updated];
        return next.sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || a.orderInStage - b.orderInStage);
      });
      setArticleDraft(null);
      if (articleDraft.published && !wasPublished) {
        // Fire-and-forget — don't block the publish flow on email delivery.
        fetch("/api/notify-new-article", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ articleId: id }),
        }).catch(() => {});
      }
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveTip() {
    if (!tipDraft) return;
    if (!tipDraft.body.trim()) { setError("Tip body is required."); return; }
    setError("");
    setSaving(true);
    const id = tipDraft.id ?? `tip-${tipDraft.publishDate}`;
    try {
      await upsertDailyTip({
        id, publish_date: tipDraft.publishDate, category: tipDraft.category,
        body: tipDraft.body.trim(), related_article_id: tipDraft.relatedArticleId || null,
      });
      const updated: DailyTip = { ...tipDraft, id };
      setTips((prev) => {
        const exists = prev.some((t) => t.id === id);
        const next = exists ? prev.map((t) => (t.id === id ? updated : t)) : [updated, ...prev];
        return next.sort((a, b) => b.publishDate.localeCompare(a.publishDate));
      });
      setTipDraft(null);
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteConfirmed() {
    if (!confirmDelete) return;
    try {
      if (confirmDelete.kind === "article") {
        await deleteArticle(confirmDelete.id);
        setArticles((prev) => prev.filter((a) => a.id !== confirmDelete.id));
      } else {
        await deleteDailyTip(confirmDelete.id);
        setTips((prev) => prev.filter((t) => t.id !== confirmDelete.id));
      }
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
    }
    setConfirmDelete(null);
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Academy Content</h1>
        <p className="text-zinc-400 text-sm">Manage curriculum articles and daily tips.</p>
      </div>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-red-400 text-sm">{error}</p>
          <button type="button" onClick={() => setError("")} className="text-red-400/60 hover:text-red-400 text-lg leading-none cursor-pointer">×</button>
        </div>
      )}

      <div className="flex gap-2 mb-6">
        {(["Articles", "Daily Tips"] as PageTab[]).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
              tab === t ? "bg-pace-green text-black" : "bg-surface text-zinc-400 hover:text-white"
            }`}>
            {t}
          </button>
        ))}
        <div className="flex-1" />
        {tab === "Articles" ? (
          <button type="button" onClick={() => setArticleDraft({ ...EMPTY_ARTICLE, orderInStage: (articles.filter((a) => a.stage === "Foundation").length || 0) + 1 })}
            className="px-4 py-2 rounded-xl text-sm font-bold bg-pace-green text-black hover:opacity-90 transition-opacity cursor-pointer">
            + New Article
          </button>
        ) : (
          <button type="button" onClick={() => setTipDraft({ ...EMPTY_TIP })}
            className="px-4 py-2 rounded-xl text-sm font-bold bg-pace-green text-black hover:opacity-90 transition-opacity cursor-pointer">
            + New Tip
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 rounded-full border-2 border-pace-green border-t-transparent animate-spin" />
        </div>
      ) : tab === "Articles" ? (
        <div className="space-y-4">
          {STAGE_ORDER.map((stage) => {
            const stageArticles = articles.filter((a) => a.stage === stage);
            return (
              <div key={stage} className="bg-surface rounded-2xl p-5">
                <h2 className="text-sm font-bold text-white mb-3">{stage} <span className="text-zinc-500 font-normal">({stageArticles.length})</span></h2>
                <div className="space-y-1.5">
                  {stageArticles.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-ink">
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">
                          {!a.published && <span className="text-zinc-500">(unpublished) </span>}
                          {a.title}
                        </p>
                        <p className="text-xs text-zinc-500">#{a.orderInStage} · {a.readTimeMinutes} min{a.videoUrl && " · 🎬 video"}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button type="button" onClick={() => setArticleDraft({ ...a, relatedMetric: a.relatedMetric ?? "", videoUrl: a.videoUrl ?? "" })}
                          className="px-3 py-1.5 text-xs font-semibold text-zinc-300 border border-zinc-600 rounded-lg hover:border-pace-green hover:text-pace-green transition-colors cursor-pointer">
                          Edit
                        </button>
                        <button type="button" onClick={() => setConfirmDelete({ kind: "article", id: a.id, label: a.title })}
                          className="px-3 py-1.5 text-xs font-semibold text-zinc-400 border border-zinc-700 rounded-lg hover:border-red-500/40 hover:text-red-400 transition-colors cursor-pointer">
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                  {stageArticles.length === 0 && <p className="text-xs text-zinc-600 py-2">No articles yet.</p>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {tips.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-surface">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs text-zinc-500">{t.publishDate}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-ink text-zinc-400 border border-zinc-700">{t.category}</span>
                </div>
                <p className="text-sm text-zinc-300 truncate">{t.body}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button type="button" onClick={() => setTipDraft({ ...t, relatedArticleId: t.relatedArticleId ?? "" })}
                  className="px-3 py-1.5 text-xs font-semibold text-zinc-300 border border-zinc-600 rounded-lg hover:border-pace-green hover:text-pace-green transition-colors cursor-pointer">
                  Edit
                </button>
                <button type="button" onClick={() => setConfirmDelete({ kind: "tip", id: t.id, label: t.publishDate })}
                  className="px-3 py-1.5 text-xs font-semibold text-zinc-400 border border-zinc-700 rounded-lg hover:border-red-500/40 hover:text-red-400 transition-colors cursor-pointer">
                  Delete
                </button>
              </div>
            </div>
          ))}
          {tips.length === 0 && <p className="text-sm text-zinc-500 text-center py-10">No daily tips yet.</p>}
        </div>
      )}

      {/* Article form modal */}
      {articleDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setArticleDraft(null)} />
          <div className="relative bg-surface rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl border border-zinc-700/50 p-6">
            <h3 className="text-white font-bold mb-4">{articleDraft.id ? "Edit Article" : "New Article"}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className={lbl}>Stage</label>
                <select value={articleDraft.stage} onChange={(e) => setArticleDraft({ ...articleDraft, stage: e.target.value as AcademyStage })} className={sel}>
                  {STAGE_ORDER.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Order in Stage</label>
                <input type="number" min={1} value={articleDraft.orderInStage}
                  onChange={(e) => setArticleDraft({ ...articleDraft, orderInStage: parseInt(e.target.value) || 1 })} className={inp} />
              </div>
              <div className="sm:col-span-2">
                <label className={lbl}>Title</label>
                <input type="text" value={articleDraft.title} onChange={(e) => setArticleDraft({ ...articleDraft, title: e.target.value })} className={inp} />
              </div>
              <div>
                <label className={lbl}>Read Time (minutes)</label>
                <input type="number" min={1} value={articleDraft.readTimeMinutes}
                  onChange={(e) => setArticleDraft({ ...articleDraft, readTimeMinutes: parseInt(e.target.value) || 1 })} className={inp} />
              </div>
              <div>
                <label className={lbl}>Related Metric <span className="normal-case text-zinc-600">(optional)</span></label>
                <input type="text" value={articleDraft.relatedMetric} placeholder="e.g. impact_zone.front_knee_angle_at_contact_deg"
                  onChange={(e) => setArticleDraft({ ...articleDraft, relatedMetric: e.target.value })} className={inp} />
              </div>
              <div className="sm:col-span-2">
                <label className={lbl}>Video URL <span className="normal-case text-zinc-600">(optional — YouTube, Vimeo, or direct file link)</span></label>
                <input type="text" value={articleDraft.videoUrl} onChange={(e) => setArticleDraft({ ...articleDraft, videoUrl: e.target.value })} className={inp} />
              </div>
            </div>

            <div className="mb-4">
              <label className={lbl}>Key Takeaways</label>
              <div className="space-y-2">
                {articleDraft.keyTakeaways.map((t, i) => (
                  <div key={i} className="flex gap-2">
                    <input type="text" value={t}
                      onChange={(e) => {
                        const next = [...articleDraft.keyTakeaways];
                        next[i] = e.target.value;
                        setArticleDraft({ ...articleDraft, keyTakeaways: next });
                      }} className={inp} />
                    <button type="button"
                      onClick={() => setArticleDraft({ ...articleDraft, keyTakeaways: articleDraft.keyTakeaways.filter((_, idx) => idx !== i) })}
                      className="px-3 text-zinc-500 hover:text-red-400 transition-colors cursor-pointer">✕</button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setArticleDraft({ ...articleDraft, keyTakeaways: [...articleDraft.keyTakeaways, ""] })}
                className="mt-2 text-xs font-semibold text-pace-green hover:opacity-80 cursor-pointer">+ Add takeaway</button>
            </div>

            <div className="mb-4">
              <label className={lbl}>Body (Markdown)</label>
              <textarea value={articleDraft.bodyMd} onChange={(e) => setArticleDraft({ ...articleDraft, bodyMd: e.target.value })}
                className={`${inp} h-64 resize-y font-mono text-xs`} />
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer select-none mb-6">
              <input type="checkbox" checked={articleDraft.published}
                onChange={(e) => setArticleDraft({ ...articleDraft, published: e.target.checked })}
                className="w-4 h-4 rounded accent-pace-green cursor-pointer" />
              <span className="text-sm text-white font-medium">Published (visible to players)</span>
            </label>

            <div className="flex gap-3">
              <button type="button" onClick={() => setArticleDraft(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-zinc-400 border border-zinc-700 rounded-xl hover:text-white hover:border-zinc-500 transition-colors cursor-pointer">
                Cancel
              </button>
              <button type="button" onClick={handleSaveArticle} disabled={saving}
                className="flex-1 px-4 py-2.5 text-sm font-bold bg-pace-green text-black rounded-xl hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60">
                {saving ? "Saving…" : "Save Article"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tip form modal */}
      {tipDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setTipDraft(null)} />
          <div className="relative bg-surface rounded-2xl w-full max-w-md shadow-2xl border border-zinc-700/50 p-6">
            <h3 className="text-white font-bold mb-4">{tipDraft.id ? "Edit Tip" : "New Tip"}</h3>
            <div className="space-y-4 mb-6">
              <div>
                <label className={lbl}>Publish Date</label>
                <input type="date" value={tipDraft.publishDate} onChange={(e) => setTipDraft({ ...tipDraft, publishDate: e.target.value })} className={inp} />
              </div>
              <div>
                <label className={lbl}>Category</label>
                <select value={tipDraft.category} onChange={(e) => setTipDraft({ ...tipDraft, category: e.target.value as ArticleCategory })} className={sel}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Body <span className="normal-case text-zinc-600">(80–120 words)</span></label>
                <textarea value={tipDraft.body} onChange={(e) => setTipDraft({ ...tipDraft, body: e.target.value })} className={`${inp} h-28 resize-none`} />
              </div>
              <div>
                <label className={lbl}>Related Article <span className="normal-case text-zinc-600">(optional)</span></label>
                <select value={tipDraft.relatedArticleId} onChange={(e) => setTipDraft({ ...tipDraft, relatedArticleId: e.target.value })} className={sel}>
                  <option value="">— None —</option>
                  {articles.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setTipDraft(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-zinc-400 border border-zinc-700 rounded-xl hover:text-white hover:border-zinc-500 transition-colors cursor-pointer">
                Cancel
              </button>
              <button type="button" onClick={handleSaveTip} disabled={saving}
                className="flex-1 px-4 py-2.5 text-sm font-bold bg-pace-green text-black rounded-xl hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60">
                {saving ? "Saving…" : "Save Tip"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setConfirmDelete(null)} />
          <div className="relative bg-surface rounded-2xl w-full max-w-sm shadow-2xl border border-red-500/20 p-6 text-center">
            <h3 className="text-white font-bold mb-1">Delete this {confirmDelete.kind}?</h3>
            <p className="text-zinc-400 text-sm mb-6">{confirmDelete.label}</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-zinc-400 border border-zinc-700 rounded-xl hover:text-white hover:border-zinc-500 transition-colors cursor-pointer">
                Cancel
              </button>
              <button type="button" onClick={handleDeleteConfirmed}
                className="flex-1 px-4 py-2.5 text-sm font-bold text-red-400 border border-red-500/40 rounded-xl hover:bg-red-500/10 transition-colors cursor-pointer">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inp = "w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm";
const sel = "w-full bg-ink rounded-xl px-4 py-3 text-white border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm cursor-pointer";
const lbl = "block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5";
