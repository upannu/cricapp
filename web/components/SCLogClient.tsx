"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import type { Player, SCWorkout, SCWorkoutType } from "@/lib/types";
import { fetchSCWorkouts, upsertSCWorkout, deleteSCWorkout } from "@/lib/db";
import { computeSCLoadSummary } from "@/lib/performance-trends";
import { Sparkline } from "@/components/Sparkline";
import { DateInput } from "@/components/DateInput";

const WORKOUT_TYPES: SCWorkoutType[] = ["Strength", "Conditioning", "Speed & Agility", "Mobility", "Recovery"];

const TYPE_STYLES: Record<SCWorkoutType, string> = {
  Strength: "bg-blue-500/20 text-blue-400",
  Conditioning: "bg-fire/20 text-fire",
  "Speed & Agility": "bg-amber/20 text-amber",
  Mobility: "bg-pace-green/20 text-pace-green",
  Recovery: "bg-zinc-700 text-zinc-300",
};

export function SCLogClient({ player }: { player: Player }) {
  const [workouts, setWorkouts] = useState<SCWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SCWorkout | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchSCWorkouts(player.id).then((w) => {
      setWorkouts(w);
      setLoading(false);
    });
  }, [player.id]);

  const loadSummary = useMemo(() => computeSCLoadSummary(workouts), [workouts]);

  const initials = player.name
    .split(" ")
    .map((n) => n[0] ?? "")
    .join("");

  function startAdd() {
    const newWorkout: SCWorkout = {
      id: `sc_${Date.now()}`,
      playerId: player.id,
      date: new Date().toISOString().split("T")[0],
      workoutType: "Strength",
      durationMins: 45,
      rpe: 5,
      notes: "",
    };
    setDraft(newWorkout);
    setAdding(true);
    setEditingId(null);
    setError("");
  }

  function cancelAdd() {
    setDraft(null);
    setAdding(false);
  }

  async function saveNew() {
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      await upsertSCWorkout({
        id: draft.id, player_id: player.id, date: draft.date,
        workout_type: draft.workoutType, duration_mins: draft.durationMins,
        rpe: draft.rpe, notes: draft.notes,
      });
      setWorkouts((prev) => [draft, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
      setDraft(null);
      setAdding(false);
      setSaved(draft.id);
      setTimeout(() => setSaved(null), 2000);
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
    } finally {
      setSaving(false);
    }
  }

  function startEdit(w: SCWorkout) {
    setEditingId(w.id);
    setDraft({ ...w });
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
      await upsertSCWorkout({
        id: draft.id, player_id: player.id, date: draft.date,
        workout_type: draft.workoutType, duration_mins: draft.durationMins,
        rpe: draft.rpe, notes: draft.notes,
      });
      setWorkouts((prev) => prev.map((w) => (w.id === draft.id ? draft : w)).sort((a, b) => b.date.localeCompare(a.date)));
      setSaved(draft.id);
      setEditingId(null);
      setDraft(null);
      setTimeout(() => setSaved(null), 2000);
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
    } finally {
      setSaving(false);
    }
  }

  async function removeWorkout(id: string) {
    setSaving(true);
    setError("");
    try {
      await deleteSCWorkout(id);
      setWorkouts((prev) => prev.filter((w) => w.id !== id));
      if (editingId === id) cancelEdit();
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Back */}
      <div className="mb-6">
        <Link
          href={`/players/${player.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-hp-paper/50 hover:text-hp-paper transition-colors"
        >
          ← Back to Profile
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-hp-cg flex items-center justify-center text-hp-paper font-bold text-xl flex-shrink-0">
            {initials}
          </div>
          <div>
            <h1 className="font-display font-black uppercase text-xl text-hp-paper tracking-wide">S&C Log</h1>
            <p className="text-hp-paper/60 text-sm">{player.name}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={startAdd}
          disabled={adding}
          className="px-4 py-2 bg-hp-cg text-hp-paper text-sm font-bold hover:bg-hp-cg/90 transition-colors cursor-pointer disabled:opacity-50"
        >
          + Log Workout
        </button>
      </div>

      {/* Weekly load summary */}
      {loadSummary.history.length > 0 && (
        <div className="bg-hp-surface border border-white/8 p-5 mb-6">
          <p className="text-xs font-mono font-semibold uppercase tracking-widest text-hp-paper/45 mb-4">Weekly Training Load</p>

          {loadSummary.alert && (
            <div className="bg-red-500/5 border border-red-500/30 px-4 py-3 mb-4">
              <p className="text-red-400 text-sm font-semibold">⚠ {loadSummary.alertReason}</p>
            </div>
          )}

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-2xl font-bold text-hp-paper font-mono">
                {loadSummary.currentWeekLoad.toLocaleString()} <span className="text-sm font-normal text-hp-paper/60">AU</span>
              </div>
              <div className="text-xs text-hp-paper/60 mt-1">
                This week (mins × RPE)
                {loadSummary.changePercent !== null && (
                  <span className={loadSummary.changePercent > 0 ? "text-fire ml-1.5" : loadSummary.changePercent < 0 ? "text-pace-green ml-1.5" : "ml-1.5"}>
                    {loadSummary.changePercent > 0 ? "▲" : loadSummary.changePercent < 0 ? "▼" : "→"} {Math.abs(loadSummary.changePercent)}% vs last week
                  </span>
                )}
              </div>
            </div>
            <Sparkline
              values={loadSummary.history.map((h) => h.totalLoad)}
              color={loadSummary.alert ? "#FF4D4D" : "#00D4AA"}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 px-4 py-3 text-red-400 text-sm mb-4">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 rounded-full border-2 border-hp-cg border-t-transparent animate-spin" />
        </div>
      ) : (
        <>
          {adding && draft && (
            <WorkoutForm
              draft={draft}
              setDraft={setDraft}
              onSave={saveNew}
              onCancel={cancelAdd}
              saving={saving}
              isNew
            />
          )}

          <div className="space-y-3">
            {workouts.map((w) => {
              const isEditing = editingId === w.id;
              const wasSaved = saved === w.id;

              if (isEditing && draft) {
                return (
                  <WorkoutForm
                    key={w.id}
                    draft={draft}
                    setDraft={setDraft}
                    onSave={saveEdit}
                    onCancel={cancelEdit}
                    onDelete={() => removeWorkout(w.id)}
                    saving={saving}
                  />
                );
              }

              return (
                <div key={w.id} className="bg-hp-surface border border-white/8 p-5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${TYPE_STYLES[w.workoutType]}`}>
                        {w.workoutType}
                      </span>
                      <span className="text-hp-paper/50 text-xs">
                        {new Date(w.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                      </span>
                      {wasSaved && <span className="text-pace-green text-xs font-semibold">✓ Saved</span>}
                    </div>
                    {w.notes && <p className="text-hp-paper/70 text-sm truncate">{w.notes}</p>}
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-right">
                      <div className="text-sm font-mono font-semibold text-hp-paper">{w.durationMins}m · RPE {w.rpe}</div>
                      <div className="text-xs text-hp-paper/45">{(w.durationMins * w.rpe).toLocaleString()} AU</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => startEdit(w)}
                      className="px-3 py-1.5 text-xs font-semibold text-hp-paper/70 border border-white/15 hover:border-hp-cg hover:text-hp-cg transition-colors cursor-pointer"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {workouts.length === 0 && !adding && (
            <div className="bg-hp-surface border border-white/8 p-12 text-center">
              <p className="text-hp-paper/60 text-sm mb-4">No S&C workouts logged yet.</p>
              <button
                type="button"
                onClick={startAdd}
                className="px-5 py-2.5 bg-hp-cg text-hp-paper text-sm font-bold hover:bg-hp-cg/90 transition-colors cursor-pointer"
              >
                + Log First Workout
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Workout form ───────────────────────────────────────────────────────────────

function WorkoutForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  onDelete,
  saving,
  isNew,
}: {
  draft: SCWorkout;
  setDraft: (w: SCWorkout) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  saving: boolean;
  isNew?: boolean;
}) {
  return (
    <div className="bg-hp-surface border border-hp-cg/30 p-6 mb-4">
      <h3 className="text-xs font-mono font-semibold uppercase tracking-widest text-hp-cg mb-5">
        {isNew ? "New Workout" : "Edit Workout"}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className={labelCls}>Date</label>
          <DateInput
            value={draft.date}
            onChange={(v) => setDraft({ ...draft, date: v })}
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls}>Workout Type</label>
          <select
            value={draft.workoutType}
            onChange={(e) => setDraft({ ...draft, workoutType: e.target.value as SCWorkoutType })}
            className={selectCls}
          >
            {WORKOUT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Duration (mins)</label>
          <input
            type="number"
            value={draft.durationMins}
            onChange={(e) => setDraft({ ...draft, durationMins: parseInt(e.target.value) || 0 })}
            className={inputCls}
            min={0}
          />
        </div>

        <div>
          <label className={labelCls}>RPE (1–10)</label>
          <input
            type="number"
            value={draft.rpe}
            onChange={(e) => setDraft({ ...draft, rpe: Math.min(10, Math.max(1, parseInt(e.target.value) || 1)) })}
            className={inputCls}
            min={1}
            max={10}
          />
        </div>
      </div>

      <div className="mb-6">
        <label className={labelCls}>Notes</label>
        <textarea
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          className={`${inputCls} resize-none h-20`}
          placeholder="Exercises, sets/reps, focus areas…"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="px-5 py-2.5 bg-hp-cg text-hp-paper text-sm font-bold hover:bg-hp-cg/90 transition-colors cursor-pointer disabled:opacity-40"
        >
          {saving ? "Saving…" : isNew ? "Log Workout" : "Save Changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-5 py-2.5 text-sm font-medium text-hp-paper/60 border border-white/15 hover:text-hp-paper hover:border-white/30 transition-colors cursor-pointer disabled:opacity-40"
        >
          Cancel
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={saving}
            className="ml-auto px-4 py-2.5 text-sm font-medium text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-40"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

const inputCls =
  "w-full bg-hp-ink px-4 py-3 text-hp-paper placeholder-hp-paper/30 border border-white/12 focus:border-hp-cg focus:outline-none transition-colors text-sm";

const selectCls =
  "w-full bg-hp-ink px-4 py-3 text-hp-paper border border-white/12 focus:border-hp-cg focus:outline-none transition-colors text-sm cursor-pointer";

const labelCls = "block text-xs font-mono font-semibold text-hp-paper/52 uppercase tracking-widest mb-1.5";
