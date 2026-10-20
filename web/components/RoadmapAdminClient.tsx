"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { fetchRoadmapItems } from "@/lib/db";
import type { RoadmapItem, RoadmapItemStatus } from "@/lib/types";

const STATUSES: RoadmapItemStatus[] = ["Planned", "In Progress", "Completed"];

const STATUS_STYLES: Record<RoadmapItemStatus, string> = {
  Planned: "bg-white/10 text-hp-paper/45",
  "In Progress": "bg-amber/20 text-amber",
  Completed: "bg-pace-green/20 text-pace-green",
};

const inp = "w-full bg-hp-ink px-4 py-2.5 text-hp-paper placeholder-hp-paper/30 border border-white/12 focus:border-hp-cg focus:outline-none transition-colors text-sm";
const sel = `bg-transparent px-2.5 py-1 text-xs font-semibold border-0 focus:outline-none cursor-pointer`;

type Draft = { title: string; description: string };
const EMPTY_DRAFT: Draft = { title: "", description: "" };

/** Internal, platform_admin-only backlog/roadmap tracker — a simple list with an inline status
 * dropdown (the main ask: mark something Planned/In Progress/Completed), an add form, inline
 * title/description editing, and delete. Writes go through /api/admin/roadmap (service-role,
 * platform-wide table — see that route's own doc comment); reads are a direct client fetch since
 * platform_roadmap_items' SELECT RLS already restricts to platform_admin. */
export function RoadmapAdminClient() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<RoadmapItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY_DRAFT);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role !== "platform_admin") { router.replace("/players"); return; }
  }, [user, router]);

  useEffect(() => {
    fetchRoadmapItems()
      .then((rows) => { setItems(rows); setLoading(false); })
      .catch((err) => { setLoadError((err as { message?: string })?.message ?? String(err)); setLoading(false); });
  }, []);

  if (!user || user.role !== "platform_admin") return null;

  async function callRoadmapApi(method: "POST" | "DELETE", body: unknown) {
    const res = await fetch("/api/admin/roadmap", {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error ?? "Something went wrong.");
    return data;
  }

  async function handleAdd() {
    setFormError("");
    if (!draft.title.trim()) { setFormError("Title is required."); return; }
    setSaving(true);
    try {
      const { id } = await callRoadmapApi("POST", { title: draft.title, description: draft.description });
      const now = new Date().toISOString();
      setItems((prev) => [{ id, title: draft.title.trim(), description: draft.description.trim(), status: "Planned", createdAt: now, updatedAt: now }, ...prev]);
      setDraft(EMPTY_DRAFT);
      setShowAdd(false);
    } catch (err) {
      setFormError((err as { message?: string })?.message ?? String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(item: RoadmapItem, status: RoadmapItemStatus) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status } : i)));
    try {
      await callRoadmapApi("POST", { id: item.id, title: item.title, description: item.description, status });
    } catch (err) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: item.status } : i)));
      setLoadError((err as { message?: string })?.message ?? String(err));
    }
  }

  function openEdit(item: RoadmapItem) {
    setEditingId(item.id);
    setEditDraft({ title: item.title, description: item.description });
  }

  async function saveEdit(item: RoadmapItem) {
    if (!editDraft.title.trim()) return;
    try {
      await callRoadmapApi("POST", { id: item.id, title: editDraft.title, description: editDraft.description, status: item.status });
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, title: editDraft.title.trim(), description: editDraft.description.trim() } : i)));
      setEditingId(null);
    } catch (err) {
      setLoadError((err as { message?: string })?.message ?? String(err));
    }
  }

  async function handleDelete(id: string) {
    setConfirmDeleteId(null);
    try {
      await callRoadmapApi("DELETE", { id });
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setLoadError((err as { message?: string })?.message ?? String(err));
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display font-black uppercase text-2xl text-hp-paper tracking-wide">Roadmap</h1>
        <button type="button" onClick={() => { setShowAdd((s) => !s); setFormError(""); }}
          className="px-5 py-2.5 bg-hp-cg text-hp-paper text-sm font-bold hover:bg-hp-cg/90 transition-colors">
          {showAdd ? "Cancel" : "+ Add Feature"}
        </button>
      </div>
      <p className="text-hp-paper/45 text-sm mb-6">Internal backlog of features to build — platform admin only.</p>

      {loadError && (
        <div className="mb-4 px-5 py-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold">
          {loadError}
        </div>
      )}

      {showAdd && (
        <div className="bg-hp-surface border border-white/10 border-t-2 border-t-hp-cg p-5 mb-5 flex flex-col gap-3">
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="Feature title" className={inp} />
          <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="Description (optional)" rows={2} className={inp} />
          {formError && <p className="text-red-400 text-sm">{formError}</p>}
          <div>
            <button type="button" onClick={handleAdd} disabled={saving}
              className="px-5 py-2 bg-hp-cg text-hp-paper text-sm font-bold hover:bg-hp-cg/90 transition-colors disabled:opacity-50">
              {saving ? "Adding…" : "Add"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-hp-paper/45 text-sm">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-hp-paper/45 text-sm">Nothing on the roadmap yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <div key={item.id} className="bg-hp-surface border border-white/10 px-5 py-4">
              {editingId === item.id ? (
                <div className="flex flex-col gap-2">
                  <input value={editDraft.title} onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })} className={inp} />
                  <textarea value={editDraft.description} onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })} rows={2} className={inp} />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => saveEdit(item)}
                      className="px-4 py-1.5 bg-hp-cg text-hp-paper text-xs font-bold hover:bg-hp-cg/90 transition-colors">Save</button>
                    <button type="button" onClick={() => setEditingId(null)}
                      className="px-4 py-1.5 text-hp-paper/45 hover:text-hp-paper text-xs">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-hp-paper font-semibold text-sm">{item.title}</p>
                    {item.description && <p className="text-hp-paper/45 text-sm mt-0.5">{item.description}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <select
                      value={item.status}
                      onChange={(e) => handleStatusChange(item, e.target.value as RoadmapItemStatus)}
                      className={`${sel} ${STATUS_STYLES[item.status]} rounded-full`}
                    >
                      {STATUSES.map((s) => <option key={s} value={s} className="bg-hp-surface text-hp-paper">{s}</option>)}
                    </select>
                    <button type="button" onClick={() => openEdit(item)} className="text-hp-paper/45 hover:text-hp-paper text-xs">Edit</button>
                    {confirmDeleteId === item.id ? (
                      <>
                        <button type="button" onClick={() => handleDelete(item.id)} className="text-red-400 hover:text-red-300 text-xs font-semibold">Confirm</button>
                        <button type="button" onClick={() => setConfirmDeleteId(null)} className="text-hp-paper/45 hover:text-hp-paper text-xs">Cancel</button>
                      </>
                    ) : (
                      <button type="button" onClick={() => setConfirmDeleteId(item.id)} className="text-hp-paper/45 hover:text-red-400 text-xs">Delete</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
