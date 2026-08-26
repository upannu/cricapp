"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { fetchAllPlans } from "@/lib/db";
import type { Plan } from "@/lib/types";

type Draft = {
  id?: string;
  slug: string;
  name: string;
  audience: "individual" | "organization";
  billingType: "subscription" | "one_time";
  billingInterval: "month" | "year";
  priceAud: string;
  seatCap: string;
  accessDurationMonths: string;
  includedNotes: string;
  waivesSessionFees: boolean;
  platformAdminOnly: boolean;
  platformFeePercent: string;
  active: boolean;
  sortOrder: string;
  sessionsPerMonthLimit: string;
  chatMessagesPerDayLimit: string;
  aiReportsEnabled: boolean;
  marketplaceEnabled: boolean;
  locked: boolean;
};

const EMPTY_DRAFT: Draft = {
  slug: "", name: "", audience: "individual", billingType: "subscription", billingInterval: "month",
  priceAud: "", seatCap: "", accessDurationMonths: "", includedNotes: "", waivesSessionFees: false, platformAdminOnly: false, platformFeePercent: "10", active: true, sortOrder: "0",
  sessionsPerMonthLimit: "", chatMessagesPerDayLimit: "", aiReportsEnabled: true, marketplaceEnabled: true, locked: false,
};

function planToDraft(p: Plan): Draft {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    audience: p.audience,
    billingType: p.billingType,
    billingInterval: p.billingInterval ?? "month",
    priceAud: String(p.priceAud),
    seatCap: p.seatCap != null ? String(p.seatCap) : "",
    accessDurationMonths: p.accessDurationMonths != null ? String(p.accessDurationMonths) : "",
    includedNotes: p.includedNotes ?? "",
    waivesSessionFees: p.waivesSessionFees,
    platformAdminOnly: p.platformAdminOnly,
    platformFeePercent: String(p.platformFeePercent),
    active: p.active,
    sortOrder: String(p.sortOrder),
    sessionsPerMonthLimit: p.sessionsPerMonthLimit != null ? String(p.sessionsPerMonthLimit) : "",
    chatMessagesPerDayLimit: p.chatMessagesPerDayLimit != null ? String(p.chatMessagesPerDayLimit) : "",
    aiReportsEnabled: p.aiReportsEnabled,
    marketplaceEnabled: p.marketplaceEnabled,
    locked: p.locked,
  };
}

export function PlansAdminClient() {
  const { user } = useAuth();
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (user && user.role !== "platform_admin") { router.replace("/players"); return; }
  }, [user, router]);

  useEffect(() => {
    fetchAllPlans().then((p) => { setPlans(p); setLoading(false); });
  }, []);

  if (!user || user.role !== "platform_admin") return null;

  function openAdd() {
    setDraft(EMPTY_DRAFT);
    setFormError("");
    setShowModal(true);
  }

  function openEdit(p: Plan) {
    setDraft(planToDraft(p));
    setFormError("");
    setShowModal(true);
  }

  async function save(overrides?: Partial<Draft>) {
    const d = { ...draft, ...overrides };
    setFormError("");
    const priceAud = parseFloat(d.priceAud);
    if (!d.slug.trim() || !d.name.trim() || !(priceAud >= 0)) {
      setFormError("Slug, name, and a non-negative price are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/plans/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: d.id,
          slug: d.slug.trim(),
          name: d.name.trim(),
          audience: d.audience,
          billingType: d.billingType,
          billingInterval: d.billingType === "subscription" ? d.billingInterval : null,
          priceAud,
          seatCap: d.seatCap.trim() ? parseInt(d.seatCap, 10) : null,
          accessDurationMonths: d.accessDurationMonths.trim() ? parseInt(d.accessDurationMonths, 10) : null,
          includedNotes: d.includedNotes.trim() || null,
          waivesSessionFees: d.waivesSessionFees,
          platformAdminOnly: d.platformAdminOnly,
          platformFeePercent: d.platformFeePercent.trim() ? parseFloat(d.platformFeePercent) : 10,
          active: d.active,
          sortOrder: d.sortOrder.trim() ? parseInt(d.sortOrder, 10) : 0,
          sessionsPerMonthLimit: d.sessionsPerMonthLimit.trim() ? parseInt(d.sessionsPerMonthLimit, 10) : null,
          chatMessagesPerDayLimit: d.chatMessagesPerDayLimit.trim() ? parseInt(d.chatMessagesPerDayLimit, 10) : null,
          aiReportsEnabled: d.aiReportsEnabled,
          marketplaceEnabled: d.marketplaceEnabled,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Could not save plan.");

      const saved: Plan = {
        id: data.id, slug: d.slug.trim(), name: d.name.trim(), audience: d.audience,
        billingType: d.billingType, billingInterval: d.billingType === "subscription" ? d.billingInterval : null,
        priceAud, seatCap: d.seatCap.trim() ? parseInt(d.seatCap, 10) : null,
        accessDurationMonths: d.accessDurationMonths.trim() ? parseInt(d.accessDurationMonths, 10) : null,
        includedNotes: d.includedNotes.trim() || null, waivesSessionFees: d.waivesSessionFees, platformAdminOnly: d.platformAdminOnly,
        platformFeePercent: d.platformFeePercent.trim() ? parseFloat(d.platformFeePercent) : 10, active: d.active,
        sortOrder: d.sortOrder.trim() ? parseInt(d.sortOrder, 10) : 0,
        sessionsPerMonthLimit: d.sessionsPerMonthLimit.trim() ? parseInt(d.sessionsPerMonthLimit, 10) : null,
        chatMessagesPerDayLimit: d.chatMessagesPerDayLimit.trim() ? parseInt(d.chatMessagesPerDayLimit, 10) : null,
        aiReportsEnabled: d.aiReportsEnabled,
        marketplaceEnabled: d.marketplaceEnabled,
        locked: d.locked,
      };
      setPlans((prev) => {
        const exists = prev.some((p) => p.id === saved.id);
        const next = exists ? prev.map((p) => (p.id === saved.id ? saved : p)) : [...prev, saved];
        return next.sort((a, b) => a.sortOrder - b.sortOrder);
      });
      setShowModal(false);
    } catch (err) {
      setFormError((err as { message?: string })?.message ?? String(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(p: Plan) {
    const d = planToDraft(p);
    d.active = !p.active;
    await save(d);
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/players" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors">
          ← Back
        </Link>
        <button
          type="button"
          onClick={openAdd}
          className="px-4 py-2 rounded-xl text-sm font-bold bg-pace-green text-black hover:opacity-90 transition-opacity cursor-pointer"
        >
          + New Plan
        </button>
      </div>

      <h1 className="text-xl font-bold text-white mb-1">Plan Catalog</h1>
      <p className="text-zinc-400 text-sm mb-6">
        B2C and B2B pricing tiers beyond Player Pro / Coach Pro — Library access, one-time
        assessments, and Academy/Club/Board licenses. Add, edit, or deactivate tiers here without
        touching code.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 rounded-full border-2 border-pace-green border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((p) => (
            <div
              key={p.id}
              className={`bg-surface rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 ${!p.active ? "opacity-50" : ""}`}
            >
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-white font-semibold">{p.name}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300">
                    {p.audience}
                  </span>
                  {!p.active && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">
                      Inactive
                    </span>
                  )}
                  {p.waivesSessionFees && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-pace-green/20 text-pace-green">
                      Fees Waived
                    </span>
                  )}
                  {p.platformAdminOnly && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber/20 text-amber">
                      Platform Admin Only
                    </span>
                  )}
                  {p.platformFeePercent !== 10 && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                      {p.platformFeePercent}% Platform Fee
                    </span>
                  )}
                  {p.locked && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300">
                      System Plan
                    </span>
                  )}
                </div>
                <div className="text-xs text-zinc-400">
                  ${p.priceAud.toFixed(2)} AUD
                  {p.billingType === "subscription" ? ` / ${p.billingInterval}` : " one-time"}
                  {p.seatCap != null && ` · capped at ${p.seatCap} bowlers`}
                  {p.accessDurationMonths != null && ` · access for ${p.accessDurationMonths} month${p.accessDurationMonths === 1 ? "" : "s"}`}
                </div>
                {p.includedNotes && <div className="text-xs text-zinc-500 mt-1">{p.includedNotes}</div>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => openEdit(p)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 border border-zinc-700 hover:text-white hover:border-zinc-500 transition-colors cursor-pointer"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => toggleActive(p)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 border border-zinc-700 hover:text-white hover:border-zinc-500 transition-colors cursor-pointer"
                >
                  {p.active ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          ))}
          {plans.length === 0 && <p className="text-zinc-500 text-sm">No plans yet.</p>}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => setShowModal(false)}>
          <div
            className="bg-surface rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-white">{draft.id ? "Edit Plan" : "New Plan"}</h2>
            {draft.locked && (
              <p className="text-xs text-amber bg-amber/10 border border-amber/30 rounded-lg px-3 py-2">
                This is a system plan (Free / Player Pro / Coach Pro) — its slug, audience, and billing type are
                locked because code looks it up by slug. Price, limits, and everything else are still editable.
              </p>
            )}

            <div>
              <label className={lbl}>Name</label>
              <input className={inp} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>

            <div>
              <label className={lbl}>Slug (stable identifier, used in code)</label>
              <input className={inp} value={draft.slug} disabled={draft.locked} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Audience</label>
                <select
                  className={sel}
                  value={draft.audience}
                  disabled={draft.locked}
                  onChange={(e) => setDraft({ ...draft, audience: e.target.value as Draft["audience"] })}
                >
                  <option value="individual">Individual</option>
                  <option value="organization">Organization</option>
                </select>
              </div>
              <div>
                <label className={lbl}>Billing Type</label>
                <select
                  className={sel}
                  value={draft.billingType}
                  disabled={draft.locked}
                  onChange={(e) => setDraft({ ...draft, billingType: e.target.value as Draft["billingType"] })}
                >
                  <option value="subscription">Subscription</option>
                  <option value="one_time">One-time</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Price ($ AUD)</label>
                <input
                  type="number" min={0} step="0.01" className={inp}
                  value={draft.priceAud} onChange={(e) => setDraft({ ...draft, priceAud: e.target.value })}
                />
              </div>
              {draft.billingType === "subscription" && (
                <div>
                  <label className={lbl}>Billing Interval</label>
                  <select
                    className={sel}
                    value={draft.billingInterval}
                    onChange={(e) => setDraft({ ...draft, billingInterval: e.target.value as Draft["billingInterval"] })}
                  >
                    <option value="month">Monthly</option>
                    <option value="year">Yearly</option>
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Seat Cap (bowlers, optional)</label>
                <input
                  type="number" min={0} className={inp}
                  value={draft.seatCap} onChange={(e) => setDraft({ ...draft, seatCap: e.target.value })}
                  placeholder="Uncapped"
                />
              </div>
              <div>
                <label className={lbl}>Access Duration (months, optional)</label>
                <input
                  type="number" min={0} className={inp}
                  value={draft.accessDurationMonths} onChange={(e) => setDraft({ ...draft, accessDurationMonths: e.target.value })}
                  placeholder="Full billing period"
                />
              </div>
            </div>

            <div>
              <label className={lbl}>Inclusions (shown on the pricing card and in the welcome email, optional)</label>
              <textarea
                className={`${inp} min-h-[70px]`}
                value={draft.includedNotes} onChange={(e) => setDraft({ ...draft, includedNotes: e.target.value })}
                placeholder="e.g. Includes one 10-day in-person coaching visit per year"
              />
            </div>

            <div>
              <label className="flex items-start gap-2.5 text-sm text-zinc-300 cursor-pointer select-none">
                <input
                  type="checkbox" checked={draft.waivesSessionFees}
                  onChange={(e) => setDraft({ ...draft, waivesSessionFees: e.target.checked })}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-white font-medium">Waives player session fees</span>
                  <span className="block text-xs text-zinc-500">Players never pay for bookings or packs — the academy's own subscription covers it. Existing academies on this plan pick this up automatically.</span>
                </span>
              </label>
            </div>

            <div>
              <label className="flex items-start gap-2.5 text-sm text-zinc-300 cursor-pointer select-none">
                <input
                  type="checkbox" checked={draft.platformAdminOnly}
                  onChange={(e) => setDraft({ ...draft, platformAdminOnly: e.target.checked })}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-white font-medium">Platform admin only</span>
                  <span className="block text-xs text-zinc-500">Hidden from the academy/player-facing plan pickers — only you see and can assign it. For internal or test tiers, not something to offer real customers.</span>
                </span>
              </label>
            </div>

            <div>
              <label className={lbl}>Platform Fee (%)</label>
              <input
                type="number" min={0} max={100} step={0.5}
                className={inp}
                value={draft.platformFeePercent}
                onChange={(e) => setDraft({ ...draft, platformFeePercent: e.target.value })}
                placeholder="10"
              />
              <p className="text-xs text-zinc-500 mt-1">Share of session-pack/booking revenue the platform takes via Stripe for academies on this plan. Defaults to 10% — lower it for an academy paying well upfront.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Sessions / month limit (individual tiers only)</label>
                <input
                  type="number" min={0} className={inp}
                  value={draft.sessionsPerMonthLimit} onChange={(e) => setDraft({ ...draft, sessionsPerMonthLimit: e.target.value })}
                  placeholder="Unlimited"
                />
              </div>
              <div>
                <label className={lbl}>Coach AI messages / day limit</label>
                <input
                  type="number" min={0} className={inp}
                  value={draft.chatMessagesPerDayLimit} onChange={(e) => setDraft({ ...draft, chatMessagesPerDayLimit: e.target.value })}
                  placeholder="Unlimited"
                />
              </div>
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer select-none">
                <input
                  type="checkbox" checked={draft.aiReportsEnabled}
                  onChange={(e) => setDraft({ ...draft, aiReportsEnabled: e.target.checked })}
                />
                AI biomechanics reports
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer select-none">
                <input
                  type="checkbox" checked={draft.marketplaceEnabled}
                  onChange={(e) => setDraft({ ...draft, marketplaceEnabled: e.target.checked })}
                />
                Coach marketplace access
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Sort Order</label>
                <input
                  type="number" className={inp}
                  value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })}
                />
              </div>
              <div className="flex items-end pb-3">
                <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox" checked={draft.active}
                    onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                  />
                  Active
                </label>
              </div>
            </div>

            {formError && <p className="text-red-400 text-sm">{formError}</p>}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => save()}
                disabled={saving}
                className="px-6 py-3 rounded-xl text-sm font-bold bg-pace-green text-black hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-6 py-3 rounded-xl text-sm font-medium text-zinc-400 border border-zinc-700 hover:text-white hover:border-zinc-500 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inp =
  "w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm";
const sel = inp;
const lbl = "block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5";
