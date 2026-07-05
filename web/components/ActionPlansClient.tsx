"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { Player, ActionPlan, ActionPlanPriority, ActionPlanStatus } from "@/lib/types";
import { fetchActionPlans, upsertActionPlan, deleteActionPlan } from "@/lib/db";

const PRIORITY_STYLES: Record<ActionPlanPriority, string> = {
  High: "bg-fire/20 text-fire",
  Medium: "bg-amber/20 text-amber",
  Low: "bg-zinc-700 text-zinc-300",
};

const STATUS_STYLES: Record<ActionPlanStatus, string> = {
  "In Progress": "bg-pace-green/20 text-pace-green",
  Pending: "bg-zinc-700 text-zinc-400",
  Completed: "bg-blue-500/20 text-blue-400",
};

export function ActionPlansClient({ player }: { player: Player }) {
  const [plans, setPlans] = useState<ActionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ActionPlan | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchActionPlans(player.id).then((p) => {
      setPlans(p);
      setLoading(false);
    });
  }, [player.id]);

  const initials = player.name
    .split(" ")
    .map((n) => n[0] ?? "")
    .join("");

  function startEdit(plan: ActionPlan) {
    setEditingId(plan.id);
    setDraft({ ...plan, drills: [...plan.drills] });
    setSaved(null);
    setError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  async function saveEdit() {
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      await upsertActionPlan({
        id: draft.id, player_id: player.id, title: draft.title.trim(),
        priority: draft.priority, status: draft.status, due_date: draft.dueDate || null,
        drills: draft.drills.filter((d) => d.trim()), notes: draft.notes,
      });
      const cleaned = { ...draft, drills: draft.drills.filter((d) => d.trim()) };
      setPlans((prev) => prev.map((p) => (p.id === cleaned.id ? cleaned : p)));
      setSaved(cleaned.id);
      setEditingId(null);
      setDraft(null);
      setTimeout(() => setSaved(null), 2000);
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
    } finally {
      setSaving(false);
    }
  }

  async function deletePlan(id: string) {
    setSaving(true);
    setError("");
    try {
      await deleteActionPlan(id);
      setPlans((prev) => prev.filter((p) => p.id !== id));
      if (editingId === id) cancelEdit();
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
    } finally {
      setSaving(false);
    }
  }

  function startAdd() {
    const newPlan: ActionPlan = {
      id: `ap_${Date.now()}`,
      playerId: player.id,
      title: "",
      priority: "Medium",
      status: "Pending",
      dueDate: "",
      drills: [""],
      notes: "",
    };
    setDraft(newPlan);
    setAdding(true);
    setEditingId(null);
    setError("");
  }

  async function saveNew() {
    if (!draft || !draft.title.trim()) return;
    setSaving(true);
    setError("");
    const cleaned = { ...draft, title: draft.title.trim(), drills: draft.drills.filter((d) => d.trim()) };
    try {
      await upsertActionPlan({
        id: cleaned.id, player_id: player.id, title: cleaned.title,
        priority: cleaned.priority, status: cleaned.status, due_date: cleaned.dueDate || null,
        drills: cleaned.drills, notes: cleaned.notes,
      });
      setPlans((prev) => [cleaned, ...prev]);
      setDraft(null);
      setAdding(false);
      setSaved(cleaned.id);
      setTimeout(() => setSaved(null), 2000);
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
    } finally {
      setSaving(false);
    }
  }

  function cancelAdd() {
    setDraft(null);
    setAdding(false);
  }

  function updateDrillAt(index: number, value: string) {
    if (!draft) return;
    const drills = [...draft.drills];
    drills[index] = value;
    setDraft({ ...draft, drills });
  }

  function addDrill() {
    if (!draft) return;
    setDraft({ ...draft, drills: [...draft.drills, ""] });
  }

  function removeDrill(index: number) {
    if (!draft) return;
    setDraft({ ...draft, drills: draft.drills.filter((_, i) => i !== index) });
  }

  const inProgress = plans.filter((p) => p.status === "In Progress").length;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Back */}
      <div className="mb-6">
        <Link
          href={`/players/${player.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
        >
          ← Back to Profile
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-pace-green flex items-center justify-center text-black font-bold text-xl flex-shrink-0">
            {initials}
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Action Plans</h1>
            <p className="text-zinc-400 text-sm">{player.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-2xl font-bold text-pace-green">{inProgress}</div>
            <div className="text-xs text-zinc-400">active plans</div>
          </div>
          <button
            type="button"
            onClick={startAdd}
            disabled={adding}
            className="px-4 py-2 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
          >
            + Add Plan
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 rounded-full border-2 border-pace-green border-t-transparent animate-spin" />
        </div>
      ) : (
        <>
          {/* Add new plan form */}
          {adding && draft && (
            <PlanForm
              draft={draft}
              setDraft={setDraft}
              onSave={saveNew}
              onCancel={cancelAdd}
              updateDrillAt={updateDrillAt}
              addDrill={addDrill}
              removeDrill={removeDrill}
              saving={saving}
              isNew
            />
          )}

          {/* Plans list */}
          <div className="space-y-4">
            {plans.map((plan) => {
              const isEditing = editingId === plan.id;
              const wasSaved = saved === plan.id;

              if (isEditing && draft) {
                return (
                  <PlanForm
                    key={plan.id}
                    draft={draft}
                    setDraft={setDraft}
                    onSave={saveEdit}
                    onCancel={cancelEdit}
                    onDelete={() => deletePlan(plan.id)}
                    updateDrillAt={updateDrillAt}
                    addDrill={addDrill}
                    removeDrill={removeDrill}
                    saving={saving}
                  />
                );
              }

              return (
                <div key={plan.id} className="bg-surface rounded-2xl p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <h2 className="text-white font-bold text-base">{plan.title}</h2>
                        {wasSaved && (
                          <span className="text-pace-green text-xs font-semibold">✓ Saved</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${PRIORITY_STYLES[plan.priority]}`}>
                          {plan.priority} Priority
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[plan.status]}`}>
                          {plan.status}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <div className="text-xs text-zinc-400 mb-0.5">Target date</div>
                        <div className="text-sm font-semibold text-white">
                          {plan.dueDate
                            ? new Date(plan.dueDate).toLocaleDateString("en-GB", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })
                            : "—"}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => startEdit(plan)}
                        className="px-3 py-1.5 text-xs font-semibold text-zinc-300 border border-zinc-600 rounded-lg hover:border-pace-green hover:text-pace-green transition-colors cursor-pointer"
                      >
                        Edit
                      </button>
                    </div>
                  </div>

                  {/* Drills */}
                  <div className="mb-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2.5">
                      Drills
                    </p>
                    <ul className="space-y-2">
                      {plan.drills.map((d, i) => (
                        <li key={i} className="flex items-start gap-2.5">
                          <span className="text-pace-green mt-0.5 text-sm flex-shrink-0">→</span>
                          <span className="text-zinc-300 text-sm">{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Notes */}
                  <div className="rounded-xl bg-ink px-4 py-3">
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                      Coach notes
                    </p>
                    <p className="text-sm text-zinc-300 leading-relaxed">{plan.notes}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {plans.length === 0 && !adding && (
            <div className="bg-surface rounded-2xl p-12 text-center">
              <p className="text-zinc-400 text-sm mb-4">No action plans yet.</p>
              <button
                type="button"
                onClick={startAdd}
                className="px-5 py-2.5 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 cursor-pointer"
              >
                + Add First Plan
              </button>
            </div>
          )}
        </>
      )}

      {/* Coming soon note */}
      <div className="mt-8 rounded-2xl border border-pace-green/20 bg-pace-green/5 p-5 text-center">
        <span className="w-1.5 h-1.5 rounded-full bg-pace-green inline-block mr-2 animate-pulse" />
        <span className="text-pace-green text-xs font-semibold uppercase tracking-wider">
          AI-generated action plans from biomechanics data — coming soon
        </span>
      </div>
    </div>
  );
}

// ─── Plan edit form ────────────────────────────────────────────────────────────

function PlanForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  onDelete,
  updateDrillAt,
  addDrill,
  removeDrill,
  saving,
  isNew,
}: {
  draft: ActionPlan;
  setDraft: (p: ActionPlan) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  updateDrillAt: (i: number, v: string) => void;
  addDrill: () => void;
  removeDrill: (i: number) => void;
  saving: boolean;
  isNew?: boolean;
}) {
  return (
    <div className="bg-surface rounded-2xl p-6 border border-pace-green/30 mb-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-pace-green mb-5">
        {isNew ? "New Action Plan" : "Edit Action Plan"}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div className="sm:col-span-2">
          <label className={labelCls}>Plan Title</label>
          <input
            type="text"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            className={inputCls}
            placeholder="e.g. Front Knee Stability"
          />
        </div>

        <div>
          <label className={labelCls}>Priority</label>
          <select
            value={draft.priority}
            onChange={(e) => setDraft({ ...draft, priority: e.target.value as ActionPlanPriority })}
            className={selectCls}
          >
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>

        <div>
          <label className={labelCls}>Status</label>
          <select
            value={draft.status}
            onChange={(e) => setDraft({ ...draft, status: e.target.value as ActionPlanStatus })}
            className={selectCls}
          >
            <option value="Pending">Pending</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
          </select>
        </div>

        <div>
          <label className={labelCls}>Target Date</label>
          <input
            type="date"
            value={draft.dueDate}
            onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
            className={inputCls}
          />
        </div>
      </div>

      {/* Drills */}
      <div className="mb-4">
        <label className={labelCls}>Drills</label>
        <div className="space-y-2">
          {draft.drills.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={d}
                onChange={(e) => updateDrillAt(i, e.target.value)}
                className={`${inputCls} flex-1`}
                placeholder={`Drill ${i + 1}`}
              />
              {draft.drills.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeDrill(i)}
                  className="text-zinc-500 hover:text-red-400 transition-colors text-lg leading-none cursor-pointer flex-shrink-0"
                  title="Remove drill"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addDrill}
          className="mt-2 text-xs text-pace-green hover:opacity-80 transition-opacity cursor-pointer font-semibold"
        >
          + Add drill
        </button>
      </div>

      {/* Notes */}
      <div className="mb-6">
        <label className={labelCls}>Coach Notes</label>
        <textarea
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          className={`${inputCls} resize-none h-20`}
          placeholder="Key observations, focus areas…"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={!draft.title.trim() || saving}
          className="px-5 py-2.5 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-40"
        >
          {saving ? "Saving…" : isNew ? "Create Plan" : "Save Changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-5 py-2.5 text-sm font-medium text-zinc-400 border border-zinc-700 rounded-xl hover:text-white hover:border-zinc-500 transition-colors cursor-pointer disabled:opacity-40"
        >
          Cancel
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={saving}
            className="ml-auto px-4 py-2.5 text-sm font-medium text-red-400 border border-red-500/30 rounded-xl hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-40"
          >
            Delete Plan
          </button>
        )}
      </div>
    </div>
  );
}

const inputCls =
  "w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm";

const selectCls =
  "w-full bg-ink rounded-xl px-4 py-3 text-white border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm cursor-pointer";

const labelCls = "block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5";
