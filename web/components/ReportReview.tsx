"use client";

import { useState } from "react";
import type { Report, ReportReviewStatus } from "@/lib/types";

const STATUS_STYLES: Record<ReportReviewStatus, string> = {
  not_reviewed: "bg-zinc-700 text-zinc-300 border-zinc-600",
  under_review: "bg-amber/10 text-amber border-amber/30",
  completed: "bg-pace-green/10 text-pace-green border-pace-green/30",
};

const STATUS_LABELS: Record<ReportReviewStatus, string> = {
  not_reviewed: "Not Reviewed",
  under_review: "Under Review",
  completed: "Completed",
};

export function ReportStatusBadge({ status }: { status: ReportReviewStatus }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

/**
 * A coach's review workspace for one report's narrative content — editable summary/highlight plus
 * the Not Reviewed → Under Review → Completed transitions, or (for a player/parent viewer, or a
 * completed report a coach isn't editing) a plain read-only rendering of the same content.
 * Self-contained: manages its own post-save display so it works equally inside a client component
 * (ReportsClient, with an optional `onUpdated` to keep a collapsed-card badge in sync) or a server
 * component page (players/[id]/reports) that has no state of its own to lift into.
 */
export function ReportReview({
  report,
  playerId,
  canReview,
  onUpdated,
}: {
  report: Report;
  playerId: string;
  canReview: boolean;
  onUpdated?: (id: string, patch: Partial<Report>) => void;
}) {
  const [status, setStatus] = useState<ReportReviewStatus>(report.reviewStatus);
  const [summary, setSummary] = useState(report.summary);
  const [highlight, setHighlight] = useState(report.highlight ?? "");
  const [summaryDraft, setSummaryDraft] = useState(report.summary);
  const [highlightDraft, setHighlightDraft] = useState(report.highlight ?? "");
  const [saving, setSaving] = useState<"under_review" | "completed" | "reopen" | null>(null);
  const [error, setError] = useState("");

  async function save(newStatus: ReportReviewStatus, key: "under_review" | "completed" | "reopen") {
    setSaving(key);
    setError("");
    try {
      const res = await fetch("/api/reports/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId: report.id,
          playerId,
          reviewStatus: newStatus,
          summary: summaryDraft,
          highlight: highlightDraft || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed to save");
      setStatus(newStatus);
      setSummary(summaryDraft);
      setHighlight(highlightDraft);
      onUpdated?.(report.id, { reviewStatus: newStatus, summary: summaryDraft, highlight: highlightDraft || undefined });
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
    } finally {
      setSaving(null);
    }
  }

  const showEditor = canReview && status !== "completed";

  return (
    <div>
      <div className="mb-2">
        <ReportStatusBadge status={status} />
      </div>

      {showEditor ? (
        <div className="space-y-2">
          <textarea
            value={summaryDraft}
            onChange={(e) => setSummaryDraft(e.target.value)}
            rows={10}
            className="w-full bg-ink rounded-xl px-3 py-2.5 text-sm leading-relaxed text-zinc-200 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors resize-y"
          />
          <input
            type="text"
            value={highlightDraft}
            onChange={(e) => setHighlightDraft(e.target.value)}
            placeholder="Highlight (optional)"
            className="w-full bg-ink rounded-xl px-3 py-2 text-xs text-zinc-200 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => save("under_review", "under_review")}
              disabled={saving !== null}
              className="px-3 py-1.5 text-xs font-semibold text-amber border border-amber/30 rounded-lg hover:bg-amber/10 transition-colors disabled:opacity-60 cursor-pointer"
            >
              {saving === "under_review" ? "Saving…" : "Save & Mark Under Review"}
            </button>
            <button
              type="button"
              onClick={() => save("completed", "completed")}
              disabled={saving !== null}
              className="px-3 py-1.5 text-xs font-semibold bg-pace-green text-black rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer"
            >
              {saving === "completed" ? "Saving…" : "Save & Complete"}
            </button>
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>
      ) : (
        <div>
          <p className="text-sm text-zinc-300 leading-relaxed">{summary}</p>
          {highlight && <p className="mt-1.5 text-xs text-amber font-semibold">★ {highlight}</p>}
          {canReview && status === "completed" && (
            <button
              type="button"
              onClick={() => save("under_review", "reopen")}
              disabled={saving !== null}
              className="mt-2 text-xs font-semibold text-zinc-500 hover:text-amber transition-colors cursor-pointer"
            >
              {saving === "reopen" ? "Reopening…" : "Reopen for Edits"}
            </button>
          )}
          {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
        </div>
      )}
    </div>
  );
}
