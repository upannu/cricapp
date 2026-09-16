"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import {
  fetchSessionPack, fetchPlayer, fetchAcademies, fetchCoaches, fetchActivePlans,
  fetchGroupSessions, upsertSessionPack, setGroupSessionRoster,
} from "@/lib/db";
import { getPlatformFeePercent } from "@/lib/utils";
import { DEFAULT_CURRENCY, formatMoney } from "@/lib/currency";
import { DAY_TOKENS } from "@/lib/cron-time";
import { DateInput } from "@/components/DateInput";
import type { SessionPack, Player, Academy, Coach, Plan, GroupSession } from "@/lib/types";

type Draft = {
  academyId: string;
  coachId: string;
  purchaseDate: string;
  totalSessions: number;
  feePerSession: number;
  groupSessionIds: string[];
};

const inp = "w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm";
const sel = "w-full bg-ink rounded-xl px-4 py-3 text-white border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm cursor-pointer";
const lbl = "block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5";

/** Step 3 of the Memberships redesign — the New/Edit Membership form's fields (the player and
 * session type stay fixed; you wouldn't reassign an existing membership to a different player),
 * standing alone on its own route rather than as a modal inside SessionPacksClient. See
 * MembershipProfileClient's own doc comment for why this fetches independently. */
export function MembershipEditClient({ packId }: { packId: string }) {
  const { user } = useAuth();
  const router = useRouter();

  const [pack, setPack] = useState<SessionPack | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [groupSessions, setGroupSessions] = useState<GroupSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFoundState, setNotFoundState] = useState(false);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const coachId = user?.role === "coach" ? user.coachId : undefined;
    const academyId = user?.role === "academy_admin" ? user.academyId : undefined;
    fetchSessionPack(packId).then(async (pk) => {
      if (!pk) { setNotFoundState(true); setLoading(false); return; }
      setPack(pk);
      const [p, ac, co, pl, gs] = await Promise.all([
        fetchPlayer(pk.playerId), fetchAcademies(), fetchCoaches(academyId), fetchActivePlans(),
        fetchGroupSessions(academyId, coachId),
      ]);
      setPlayer(p);
      setAcademies(ac);
      setCoaches(co);
      setPlans(pl);
      setGroupSessions(gs);
      setDraft({
        academyId: pk.academyId, coachId: pk.coachId ?? "", purchaseDate: pk.purchaseDate,
        totalSessions: pk.totalSessions, feePerSession: pk.feePerSession,
        groupSessionIds: gs.filter((g) => g.academyId === pk.academyId && g.playerIds.includes(pk.playerId)).map((g) => g.id),
      });
      setLoading(false);
    });
  }, [packId, user]);

  function academyWaivesFees(academyId: string): boolean {
    const academy = academies.find((a) => a.id === academyId);
    const plan = academy?.planId ? plans.find((p) => p.id === academy.planId) : undefined;
    return !!plan?.waivesSessionFees;
  }

  function relevantGroupSessions(academyId: string): GroupSession[] {
    return groupSessions.filter((g) => g.academyId === academyId && g.active && g.sessionType === "Net Session");
  }

  function deriveAgreedDays(groupSessionIds: string[]): string[] {
    const days = groupSessionIds
      .map((id) => groupSessions.find((g) => g.id === id))
      .filter((g): g is GroupSession => !!g)
      .map((g) => DAY_TOKENS[g.dayOfWeek]);
    return Array.from(new Set(days));
  }

  function toggleGroupSession(groupSessionId: string) {
    if (!draft) return;
    const groupSessionIds = draft.groupSessionIds.includes(groupSessionId)
      ? draft.groupSessionIds.filter((id) => id !== groupSessionId)
      : [...draft.groupSessionIds, groupSessionId];
    setDraft({ ...draft, groupSessionIds });
  }

  async function handleSave() {
    if (!pack || !draft) return;
    if (!draft.academyId) { setFormError("Please select an academy."); return; }
    if (draft.feePerSession <= 0 && !academyWaivesFees(draft.academyId)) {
      setFormError("Session fee must be greater than $0.");
      return;
    }
    if (draft.groupSessionIds.length === 0) {
      setFormError("Please select at least one squad training session.");
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      await upsertSessionPack({
        id: pack.id, player_id: pack.playerId, academy_id: draft.academyId,
        coach_id: draft.coachId || null, session_type: "Net Session",
        purchase_date: draft.purchaseDate, total_sessions: draft.totalSessions,
        fee_per_session: draft.feePerSession, agreed_days: deriveAgreedDays(draft.groupSessionIds),
      });

      // Roster diff — add the player to newly selected sessions, remove from deselected ones.
      // (Sequential, not Promise.all — SessionPacksClient's own roster-sync calls follow the
      // same convention, and there's no risk of a real race here since each write targets a
      // different group session's roster.)
      for (const g of relevantGroupSessions(draft.academyId)) {
        const shouldBeOn = draft.groupSessionIds.includes(g.id);
        const isOn = g.playerIds.includes(pack.playerId);
        if (shouldBeOn === isOn) continue;
        const updatedRoster = shouldBeOn ? [...g.playerIds, pack.playerId] : g.playerIds.filter((id) => id !== pack.playerId);
        await setGroupSessionRoster(g.id, updatedRoster);
      }

      router.push(`/session-packs/${pack.id}`);
    } catch (err) {
      setFormError((err as { message?: string })?.message ?? String(err));
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 rounded-full border-2 border-pace-green border-t-transparent animate-spin" />
      </div>
    );
  }

  if (notFoundState || !pack || !player || !draft) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <p className="text-white font-semibold mb-2">Membership not found</p>
        <Link href="/session-packs" className="text-pace-green text-sm font-semibold hover:underline">← Back to Memberships</Link>
      </div>
    );
  }

  const sessions = relevantGroupSessions(draft.academyId);
  const feePct = getPlatformFeePercent(draft.academyId, academies, plans);
  const packCurrency = academies.find((a) => a.id === draft.academyId)?.currency ?? DEFAULT_CURRENCY;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <Link href={`/session-packs/${pack.id}`} className="text-xs text-zinc-400 hover:text-white transition-colors mb-4 inline-block">
        ← Back to Membership
      </Link>

      <div className="bg-surface rounded-2xl p-6 border border-pace-green/30">
        <h1 className="text-white font-bold text-lg mb-1">Edit Membership</h1>
        <p className="text-zinc-400 text-xs mb-6">{player.name} · {player.ageGroup}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <div>
            <label className={lbl}>Academy *</label>
            <select
              value={draft.academyId}
              onChange={(e) => setDraft({ ...draft, academyId: e.target.value, groupSessionIds: [] })}
              className={sel}
              disabled={user?.role === "academy_admin"}
            >
              <option value="">— Select academy —</option>
              {academies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          <div>
            <label className={lbl}>Coach</label>
            <select value={draft.coachId} onChange={(e) => setDraft({ ...draft, coachId: e.target.value })} className={sel}>
              <option value="">— Unassigned —</option>
              {coaches.filter((c) => !draft.academyId || c.academyId === draft.academyId).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={lbl}>Purchase Date</label>
            <DateInput value={draft.purchaseDate} onChange={(v) => setDraft({ ...draft, purchaseDate: v })} className={inp} />
          </div>

          <div>
            <label className={lbl}>Sessions in Membership</label>
            <select value={draft.totalSessions} onChange={(e) => setDraft({ ...draft, totalSessions: parseInt(e.target.value) })} className={sel}>
              {[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n} sessions</option>)}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className={lbl}>Squad Training Session(s) *</label>
            {!draft.academyId ? (
              <p className="text-xs text-zinc-500">Select an academy first.</p>
            ) : sessions.length === 0 ? (
              <div className="bg-ink rounded-xl p-4">
                <p className="text-xs text-zinc-400 mb-1">This academy has no active squad training sessions yet.</p>
                <Link href="/attendance" className="text-xs text-pace-green font-semibold hover:underline">Create one in Attendance →</Link>
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.map((g) => {
                  const checked = draft.groupSessionIds.includes(g.id);
                  return (
                    <label key={g.id} className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 cursor-pointer transition-colors ${
                      checked ? "border-pace-green bg-pace-green/5" : "border-zinc-700 hover:border-zinc-500"
                    }`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleGroupSession(g.id)} className="accent-pace-green" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white truncate">{g.name}</p>
                        <p className="text-xs text-zinc-500">
                          {DAY_TOKENS[g.dayOfWeek]} · {g.time} · {coaches.find((c) => c.id === g.coachId)?.name ?? "Unassigned"}
                          {g.location ? ` · ${g.location}` : ""}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className={lbl}>Fee per Session ({packCurrency.toUpperCase()})</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 text-sm font-semibold">$</span>
              <input
                type="number" min={0} step={5}
                value={draft.feePerSession === 0 ? "" : draft.feePerSession}
                onChange={(e) => setDraft({ ...draft, feePerSession: parseFloat(e.target.value) || 0 })}
                className={`${inp} pl-8`} placeholder="0.00"
                disabled={!!draft.academyId && academyWaivesFees(draft.academyId)}
              />
            </div>
            {draft.academyId && academyWaivesFees(draft.academyId) && (
              <p className="text-xs text-pace-green mt-1.5">✓ Covered by the academy&apos;s plan — no session fee</p>
            )}
          </div>
        </div>

        {draft.feePerSession > 0 && draft.totalSessions > 0 && (
          <div className="mb-5 bg-ink rounded-xl p-4 grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-lg font-bold text-white">{formatMoney(draft.feePerSession * draft.totalSessions, packCurrency)}</div>
              <div className="text-xs text-zinc-500 mt-0.5">Total collected</div>
            </div>
            <div>
              <div className="text-lg font-bold text-amber">{formatMoney(draft.feePerSession * draft.totalSessions * (feePct / 100), packCurrency)}</div>
              <div className="text-xs text-zinc-500 mt-0.5">Platform fee ({feePct}%)</div>
            </div>
            <div>
              <div className="text-lg font-bold text-pace-green">{formatMoney(draft.feePerSession * draft.totalSessions * (1 - feePct / 100), packCurrency)}</div>
              <div className="text-xs text-zinc-500 mt-0.5">Academy receives ({100 - feePct}%)</div>
            </div>
          </div>
        )}

        {formError && <p className="text-red-400 text-sm mb-3">{formError}</p>}

        <div className="flex items-center gap-3">
          <button type="button" onClick={handleSave} disabled={saving}
            className="px-6 py-2.5 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 cursor-pointer disabled:opacity-60">
            {saving ? "Saving…" : "Save Changes"}
          </button>
          <Link href={`/session-packs/${pack.id}`}
            className="px-6 py-2.5 text-sm font-medium text-zinc-400 border border-zinc-700 rounded-xl hover:text-white hover:border-zinc-500 transition-colors cursor-pointer">
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}
