"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Academy, MembershipPlanTemplate } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { fetchAcademies, fetchCurrentMembershipPlanTemplates, createMembershipPlanTemplateVersion, archiveMembershipPlanTemplate } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { formatMoney } from "@/lib/currency";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { ConfirmModal } from "@/components/ConfirmModal";
import { EditIcon, TrashIcon } from "@/components/icons";

type Draft = { planKey: string | null; academyId: string; name: string; totalSessions: number; feePerSession: number };
const EMPTY_DRAFT: Draft = { planKey: null, academyId: "", name: "", totalSessions: 10, feePerSession: 0 };

/**
 * Reusable membership packages ("10 Session Package", "Term Membership") an admin picks from
 * instead of retyping totalSessions/feePerSession on every new membership. Append-only/versioned
 * — see lib/types.ts's MembershipPlanTemplate doc comment: editing never mutates a row, it inserts
 * a new one sharing the same planKey, so a membership created last month keeps whatever price was
 * actually in effect then.
 */
export function MembershipPlanTemplatesClient() {
  const { user } = useAuth();
  const router = useRouter();

  const [templates, setTemplates] = useState<MembershipPlanTemplate[]>([]);
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<MembershipPlanTemplate | null>(null);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    if (user && user.role !== "platform_admin" && user.role !== "academy_admin") {
      router.replace("/session-packs");
      return;
    }
    if (!user) return;
    const academyId = user.role === "academy_admin" ? user.academyId : undefined;
    Promise.all([fetchAcademies(), fetchCurrentMembershipPlanTemplates(academyId)]).then(([ac, tpl]) => {
      setAcademies(ac);
      setTemplates(tpl);
      setLoaded(true);
    });
  }, [user, router]);

  if (!user || (user.role !== "platform_admin" && user.role !== "academy_admin")) return null;

  const defaultAcademyId = user.role === "academy_admin" ? (user.academyId ?? "") : "";

  function academyName(id: string) {
    return academies.find((a) => a.id === id)?.name ?? id;
  }
  function academyCurrency(id: string) {
    return academies.find((a) => a.id === id)?.currency;
  }

  function openNew() {
    setSaveError("");
    setDraft({ ...EMPTY_DRAFT, academyId: defaultAcademyId });
  }
  function openEdit(t: MembershipPlanTemplate) {
    setSaveError("");
    setDraft({ planKey: t.planKey, academyId: t.academyId, name: t.name, totalSessions: t.totalSessions, feePerSession: t.feePerSession });
  }

  async function handleSave() {
    if (!draft) return;
    if (!draft.academyId || !draft.name.trim() || draft.totalSessions <= 0) {
      setSaveError("Academy, name, and a positive session count are required.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const id = `mpt_${Date.now()}`;
      await createMembershipPlanTemplateVersion({
        id,
        planKey: draft.planKey ?? id,
        academyId: draft.academyId,
        name: draft.name.trim(),
        sessionType: "Net Session",
        totalSessions: draft.totalSessions,
        feePerSession: draft.feePerSession,
      });
      const academyId = user!.role === "academy_admin" ? user!.academyId : undefined;
      setTemplates(await fetchCurrentMembershipPlanTemplates(academyId));
      setDraft(null);
    } catch (err) {
      setSaveError((err as { message?: string })?.message ?? "Could not save the plan.");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      await archiveMembershipPlanTemplate(archiveTarget, `mpt_${Date.now()}`);
      const academyId = user!.role === "academy_admin" ? user!.academyId : undefined;
      setTemplates(await fetchCurrentMembershipPlanTemplates(academyId));
      setArchiveTarget(null);
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Membership Plan Templates</h1>
          <p className="text-sm text-zinc-500">Reusable packages to pick from when creating a new membership.</p>
        </div>
        <button type="button" onClick={openNew}
          className="px-5 py-2.5 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity cursor-pointer">
          + New Plan
        </button>
      </div>

      {!loaded ? (
        <p className="text-zinc-500 text-sm">Loading…</p>
      ) : templates.length === 0 ? (
        <div className="bg-surface rounded-2xl p-10 text-center">
          <p className="text-zinc-400 text-sm">No plan templates yet.</p>
        </div>
      ) : (
        <div className="bg-surface rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">
                <th className="px-5 py-3">Plan</th>
                {user.role === "platform_admin" && <th className="px-5 py-3">Academy</th>}
                <th className="px-5 py-3">Sessions</th>
                <th className="px-5 py-3">Fee / Session</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Effective From</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-b border-zinc-800/60 last:border-0">
                  <td className="px-5 py-4 text-white font-semibold">{t.name}</td>
                  {user.role === "platform_admin" && <td className="px-5 py-4 text-zinc-300">{academyName(t.academyId)}</td>}
                  <td className="px-5 py-4 text-zinc-300">{t.totalSessions}</td>
                  <td className="px-5 py-4 text-zinc-300">{formatMoney(t.feePerSession, academyCurrency(t.academyId))}</td>
                  <td className="px-5 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${t.status === "active" ? "bg-pace-green/15 text-pace-green" : "bg-zinc-700 text-zinc-400"}`}>
                      {t.status === "active" ? "Active" : "Archived"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-zinc-500">{formatDate(t.effectiveFrom)}</td>
                  <td className="px-5 py-4">
                    <RowActionsMenu items={[
                      { label: "Edit (new version)", icon: <EditIcon />, onClick: () => openEdit(t) },
                      ...(t.status === "active" ? [{
                        label: "Archive", icon: <TrashIcon />, onClick: () => setArchiveTarget(t),
                      }] : []),
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {draft && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-surface rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-white font-bold text-sm mb-4">{draft.planKey ? "Edit Plan (creates a new version)" : "New Plan Template"}</h2>
            <div className="space-y-4">
              {user.role === "platform_admin" && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Academy</label>
                  <select value={draft.academyId} onChange={(e) => setDraft({ ...draft, academyId: e.target.value })}
                    className="w-full bg-ink rounded-xl px-4 py-2.5 text-white border border-zinc-700 focus:border-pace-green focus:outline-none text-sm">
                    <option value="">— Select academy —</option>
                    {academies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Name</label>
                <input type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="10 Session Package"
                  className="w-full bg-ink rounded-xl px-4 py-2.5 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Total Sessions</label>
                  <input type="number" min={1} value={draft.totalSessions}
                    onChange={(e) => setDraft({ ...draft, totalSessions: Number(e.target.value) })}
                    className="w-full bg-ink rounded-xl px-4 py-2.5 text-white border border-zinc-700 focus:border-pace-green focus:outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Fee / Session</label>
                  <input type="number" min={0} step={0.01} value={draft.feePerSession}
                    onChange={(e) => setDraft({ ...draft, feePerSession: Number(e.target.value) })}
                    className="w-full bg-ink rounded-xl px-4 py-2.5 text-white border border-zinc-700 focus:border-pace-green focus:outline-none text-sm" />
                </div>
              </div>
              {saveError && <p className="text-red-400 text-sm">{saveError}</p>}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setDraft(null)}
                  className="px-5 py-2.5 text-sm font-medium text-zinc-400 hover:text-white transition-colors cursor-pointer">
                  Cancel
                </button>
                <button type="button" onClick={handleSave} disabled={saving}
                  className="px-5 py-2.5 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60">
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {archiveTarget && (
        <ConfirmModal
          icon={<TrashIcon />} iconBg="bg-red-500/15 text-red-400"
          title="Archive this plan?"
          message={`"${archiveTarget.name}" will no longer be offered when creating new memberships. Existing memberships using it are unaffected.`}
          confirmLabel="Archive" confirmBusyLabel="Archiving…" confirmVariant="danger"
          loading={archiving}
          onConfirm={handleArchive}
          onCancel={() => setArchiveTarget(null)}
        />
      )}
    </div>
  );
}
