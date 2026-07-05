"use client";

import { useState } from "react";
import { insertAssessment } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import type { Assessment, AssessmentCategory } from "@/lib/types";
import { ASSESSMENT_CATEGORIES } from "@/lib/types";

const CATEGORY_LABELS: Record<AssessmentCategory, string> = {
  approach: "Approach & Run-up",
  deliveryStride: "Delivery Stride & Balance",
  releaseFollowThrough: "Release & Follow-through",
  fitness: "Fitness & Conditioning",
  attitude: "Discipline & Attitude",
};

interface Props {
  sessionId?: string;
  playerId: string;
  onClose: () => void;
  onSaved: (assessment: Assessment) => void;
}

export function AssessmentForm({ sessionId, playerId, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const [ratings, setRatings] = useState<Partial<Record<AssessmentCategory, number>>>({});
  const [comments, setComments] = useState<Partial<Record<AssessmentCategory, string>>>({});
  const [overallRecommendation, setOverallRecommendation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const complete = ASSESSMENT_CATEGORIES.every((c) => ratings[c] !== undefined);

  async function handleSave() {
    if (!complete) { setError("Rate every category before saving."); return; }
    setSaving(true);
    setError("");
    try {
      const id = `as_${Date.now()}`;
      await insertAssessment({
        id, session_id: sessionId ?? null, player_id: playerId, coach_id: user?.coachId ?? null,
        ratings, comments, overall_recommendation: overallRecommendation,
      });
      onSaved({ id, sessionId, playerId, coachId: user?.coachId, ratings, comments, overallRecommendation });
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-white">Formal Assessment</h2>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-white text-xl leading-none cursor-pointer">×</button>
        </div>
        <p className="text-zinc-400 text-sm mb-5">Rate each category 1 (needs significant work) to 5 (excellent).</p>

        <div className="space-y-5 mb-5">
          {ASSESSMENT_CATEGORIES.map((cat) => (
            <div key={cat}>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-semibold text-white">{CATEGORY_LABELS[cat]}</label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((score) => (
                    <button
                      key={score}
                      type="button"
                      onClick={() => setRatings({ ...ratings, [cat]: score })}
                      className={`w-7 h-7 rounded-md text-xs font-bold border transition-colors cursor-pointer ${
                        ratings[cat] === score
                          ? "bg-pace-green border-pace-green text-black"
                          : "bg-ink border-zinc-700 text-zinc-400 hover:border-zinc-500"
                      }`}
                    >
                      {score}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="text"
                value={comments[cat] ?? ""}
                onChange={(e) => setComments({ ...comments, [cat]: e.target.value })}
                placeholder="Optional comment…"
                className="w-full bg-ink rounded-lg px-3 py-2 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none text-xs"
              />
            </div>
          ))}
        </div>

        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Overall Recommendation</label>
        <textarea
          value={overallRecommendation}
          onChange={(e) => setOverallRecommendation(e.target.value)}
          placeholder="Summary and next steps for this player…"
          className="w-full bg-ink rounded-xl px-4 py-2.5 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none text-sm resize-none h-20 mb-4"
        />

        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !complete}
            className="px-4 py-2.5 text-sm font-bold bg-pace-green text-black rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
          >
            {saving ? "Saving…" : "Save Assessment"}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-zinc-400 border border-zinc-700 rounded-xl hover:text-white transition-colors cursor-pointer">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
