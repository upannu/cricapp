"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { fetchReferrals, fetchReferralPayouts, fetchPlayers, fetchCoaches, fetchAcademies } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { DateInput } from "@/components/DateInput";
import type { Referral, ReferralPayout, ReferredType, ReferralCommissionType, ReferralRevenueSource, Player, Coach, Academy } from "@/lib/types";

const REFERRED_TYPE_LABELS: Record<ReferredType, string> = {
  academy: "Academy", coach: "Coach", player: "Player", other: "Other",
};

const today = new Date().toISOString().split("T")[0];

type Draft = {
  referrerName: string; referrerEmail: string; referrerPhone: string; referrerPaymentDetails: string;
  referredType: ReferredType; referredId: string; referredName: string;
  commissionType: ReferralCommissionType;
  oneOffAmountAud: string;
  ongoingRatePercent: string;
  ongoingRevenueSource: ReferralRevenueSource;
  ongoingEndDate: string;
  notes: string;
};

const EMPTY_DRAFT: Draft = {
  referrerName: "", referrerEmail: "", referrerPhone: "", referrerPaymentDetails: "",
  referredType: "academy", referredId: "", referredName: "",
  commissionType: "one_off",
  oneOffAmountAud: "", ongoingRatePercent: "", ongoingRevenueSource: "both", ongoingEndDate: "",
  notes: "",
};

export function ReferralsClient() {
  const { user } = useAuth();
  const router = useRouter();

  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [payouts, setPayouts] = useState<ReferralPayout[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role !== "platform_admin") { router.replace("/players"); return; }
  }, [user, router]);

  useEffect(() => {
    Promise.all([fetchReferrals(), fetchReferralPayouts(), fetchPlayers(), fetchCoaches(), fetchAcademies()])
      .then(([r, p, pl, co, ac]) => {
        setReferrals(r); setPayouts(p); setPlayers(pl); setCoaches(co); setAcademies(ac);
      })
      .catch((err) => setLoadError((err as { message?: string })?.message ?? String(err)))
      .finally(() => setLoading(false));
  }, []);

  if (!user || user.role !== "platform_admin") return null;

  const payoutsByReferral = useMemo(() => {
    const map: Record<string, ReferralPayout[]> = {};
    for (const p of payouts) (map[p.referralId] ??= []).push(p);
    return map;
  }, [payouts]);

  function openAdd() {
    setDraft(EMPTY_DRAFT);
    setFormError("");
    setShowForm(true);
  }

  function pickerOptions(): { id: string; name: string }[] {
    if (draft.referredType === "academy") return academies.map((a) => ({ id: a.id, name: a.name }));
    if (draft.referredType === "coach") return coaches.map((c) => ({ id: c.id, name: c.name }));
    if (draft.referredType === "player") return players.map((p) => ({ id: p.id, name: p.name }));
    return [];
  }

  function handlePickReferred(id: string) {
    const opt = pickerOptions().find((o) => o.id === id);
    setDraft((prev) => ({ ...prev, referredId: id, referredName: opt?.name ?? prev.referredName }));
  }

  async function handleSubmit() {
    setFormError("");
    if (!draft.referrerName.trim()) { setFormError("Referrer name is required."); return; }
    if (!draft.referredName.trim()) { setFormError("Referred name is required."); return; }
    if (draft.referredType !== "other" && !draft.referredId) {
      setFormError(`Please select which ${REFERRED_TYPE_LABELS[draft.referredType].toLowerCase()} was referred.`);
      return;
    }
    if (draft.commissionType === "ongoing" && draft.referredType === "other") {
      setFormError("Ongoing commissions need a real academy, coach, or player linked — pick one of those types, or switch to One-off.");
      return;
    }
    if (draft.commissionType === "one_off" && (!draft.oneOffAmountAud || Number(draft.oneOffAmountAud) <= 0)) {
      setFormError("Enter a one-off amount greater than $0.");
      return;
    }
    if (draft.commissionType === "ongoing" && (!draft.ongoingRatePercent || Number(draft.ongoingRatePercent) <= 0)) {
      setFormError("Enter an ongoing rate greater than 0%.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/referrals/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referrerName: draft.referrerName, referrerEmail: draft.referrerEmail, referrerPhone: draft.referrerPhone,
          referrerPaymentDetails: draft.referrerPaymentDetails,
          referredType: draft.referredType,
          referredAcademyId: draft.referredType === "academy" ? draft.referredId : undefined,
          referredCoachId: draft.referredType === "coach" ? draft.referredId : undefined,
          referredPlayerId: draft.referredType === "player" ? draft.referredId : undefined,
          referredName: draft.referredName,
          commissionType: draft.commissionType,
          oneOffAmountAud: draft.commissionType === "one_off" ? Number(draft.oneOffAmountAud) : undefined,
          ongoingRatePercent: draft.commissionType === "ongoing" ? Number(draft.ongoingRatePercent) : undefined,
          ongoingRevenueSource: draft.commissionType === "ongoing" ? draft.ongoingRevenueSource : undefined,
          ongoingEndDate: draft.commissionType === "ongoing" ? (draft.ongoingEndDate || undefined) : undefined,
          notes: draft.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed to create referral.");

      const [r, p] = await Promise.all([fetchReferrals(), fetchReferralPayouts()]);
      setReferrals(r); setPayouts(p);
      setShowForm(false);
    } catch (err) {
      setFormError((err as { message?: string })?.message ?? String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleEnd(referralId: string) {
    await fetch("/api/referrals/end", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ referralId }),
    });
    setReferrals((prev) => prev.map((r) => (r.id === referralId ? { ...r, status: "ended" } : r)));
  }

  function handlePayoutPaid(payoutId: string, paidDate: string) {
    setPayouts((prev) => prev.map((p) => (p.id === payoutId ? { ...p, status: "paid", paidDate } : p)));
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <Link href="/players" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors mb-6">
        ← Back
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-white mb-1">Referrals</h1>
          <p className="text-zinc-400 text-sm">
            One-off bonuses or ongoing commissions for whoever brings new academies, coaches, or
            players onto the platform. Payouts happen off-platform — mark each one paid once sent.
          </p>
        </div>
        <button type="button" onClick={openAdd}
          className="px-5 py-2.5 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity cursor-pointer flex-shrink-0">
          + New Referral
        </button>
      </div>

      {showForm && (
        <ReferralForm
          draft={draft} setDraft={setDraft}
          pickerOptions={pickerOptions()} onPick={handlePickReferred}
          formError={formError} saving={saving}
          onSubmit={handleSubmit} onCancel={() => setShowForm(false)}
        />
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 rounded-full border-2 border-pace-green border-t-transparent animate-spin" />
        </div>
      ) : loadError ? (
        <p className="text-red-400 text-sm">{loadError}</p>
      ) : referrals.length === 0 ? (
        <div className="bg-surface rounded-2xl p-16 text-center">
          <p className="text-zinc-400 text-sm">No referrals recorded yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {referrals.map((r) => (
            <ReferralRow
              key={r.id} referral={r} payoutList={payoutsByReferral[r.id] ?? []}
              isOpen={expandedId === r.id} onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
              onEnd={() => handleEnd(r.id)} onPayoutPaid={handlePayoutPaid}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReferralForm({
  draft, setDraft, pickerOptions, onPick, formError, saving, onSubmit, onCancel,
}: {
  draft: Draft; setDraft: (d: Draft) => void;
  pickerOptions: { id: string; name: string }[]; onPick: (id: string) => void;
  formError: string; saving: boolean; onSubmit: () => void; onCancel: () => void;
}) {
  return (
    <div className="bg-surface rounded-2xl p-6 border border-pace-green/30 mb-6 space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-pace-green">New Referral</h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className={lbl}>Referrer Name *</label>
          <input value={draft.referrerName} onChange={(e) => setDraft({ ...draft, referrerName: e.target.value })} className={inp} placeholder="Who gets paid" />
        </div>
        <div>
          <label className={lbl}>Referrer Email</label>
          <input value={draft.referrerEmail} onChange={(e) => setDraft({ ...draft, referrerEmail: e.target.value })} className={inp} placeholder="Optional" />
        </div>
        <div>
          <label className={lbl}>Referrer Phone</label>
          <input value={draft.referrerPhone} onChange={(e) => setDraft({ ...draft, referrerPhone: e.target.value })} className={inp} placeholder="Optional" />
        </div>
      </div>

      <div>
        <label className={lbl}>Payment Details (bank account, PayID, etc.)</label>
        <input value={draft.referrerPaymentDetails} onChange={(e) => setDraft({ ...draft, referrerPaymentDetails: e.target.value })} className={inp} placeholder="Optional — how you'll actually pay them" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Who Was Referred</label>
          <select value={draft.referredType}
            onChange={(e) => setDraft({ ...draft, referredType: e.target.value as ReferredType, referredId: "", referredName: "" })}
            className={sel}>
            {(Object.keys(REFERRED_TYPE_LABELS) as ReferredType[]).map((t) => <option key={t} value={t}>{REFERRED_TYPE_LABELS[t]}</option>)}
          </select>
        </div>
        {draft.referredType !== "other" ? (
          <div>
            <label className={lbl}>Select {REFERRED_TYPE_LABELS[draft.referredType]} *</label>
            <select value={draft.referredId} onChange={(e) => onPick(e.target.value)} className={sel}>
              <option value="">— Select —</option>
              {pickerOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <label className={lbl}>Referred Name *</label>
            <input value={draft.referredName} onChange={(e) => setDraft({ ...draft, referredName: e.target.value })} className={inp} placeholder="Name of person/business" />
          </div>
        )}
      </div>

      <div>
        <label className={lbl}>Commission Type</label>
        <div className="flex gap-2">
          <button type="button" onClick={() => setDraft({ ...draft, commissionType: "one_off" })}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${draft.commissionType === "one_off" ? "bg-pace-green text-black" : "bg-ink text-zinc-400 border border-zinc-700"}`}>
            One-off
          </button>
          <button type="button" disabled={draft.referredType === "other"}
            onClick={() => setDraft({ ...draft, commissionType: "ongoing" })}
            title={draft.referredType === "other" ? "Ongoing commissions need a real academy, coach, or player linked" : undefined}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${draft.commissionType === "ongoing" ? "bg-pace-green text-black" : "bg-ink text-zinc-400 border border-zinc-700"}`}>
            Ongoing
          </button>
        </div>
        {draft.referredType === "other" && (
          <p className="text-xs text-zinc-500 mt-1.5">Ongoing needs a linked academy/coach/player to calculate revenue from — pick one of those types above to unlock it.</p>
        )}
      </div>

      {draft.commissionType === "one_off" ? (
        <div className="max-w-xs">
          <label className={lbl}>One-off Amount (AUD) *</label>
          <input type="number" min={0} step={0.01} value={draft.oneOffAmountAud}
            onChange={(e) => setDraft({ ...draft, oneOffAmountAud: e.target.value })} className={inp} placeholder="e.g. 100" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={lbl}>Rate (%) *</label>
            <input type="number" min={0} max={100} step={0.1} value={draft.ongoingRatePercent}
              onChange={(e) => setDraft({ ...draft, ongoingRatePercent: e.target.value })} className={inp} placeholder="e.g. 5" />
          </div>
          <div>
            <label className={lbl}>Revenue Source</label>
            <select value={draft.ongoingRevenueSource} onChange={(e) => setDraft({ ...draft, ongoingRevenueSource: e.target.value as ReferralRevenueSource })} className={sel}>
              <option value="both">Packs + Bookings</option>
              <option value="session_packs">Session Packs only</option>
              <option value="bookings">Bookings only</option>
            </select>
          </div>
          <div>
            <label className={lbl}>Ends (optional)</label>
            <DateInput value={draft.ongoingEndDate} onChange={(v) => setDraft({ ...draft, ongoingEndDate: v })} className={inp} min={today} />
          </div>
        </div>
      )}

      <div>
        <label className={lbl}>Notes</label>
        <input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className={inp} placeholder="Optional" />
      </div>

      {formError && <p className="text-red-400 text-sm">{formError}</p>}

      <div className="flex items-center gap-3">
        <button type="button" onClick={onSubmit} disabled={saving}
          className="px-6 py-3 rounded-xl text-sm font-bold bg-pace-green text-black hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60">
          {saving ? "Saving…" : "Create Referral"}
        </button>
        <button type="button" onClick={onCancel}
          className="px-6 py-3 rounded-xl text-sm font-medium text-zinc-400 border border-zinc-700 hover:text-white hover:border-zinc-500 transition-colors cursor-pointer">
          Cancel
        </button>
      </div>
    </div>
  );
}

function ReferralRow({
  referral: r, payoutList, isOpen, onToggle, onEnd, onPayoutPaid,
}: {
  referral: Referral; payoutList: ReferralPayout[]; isOpen: boolean; onToggle: () => void;
  onEnd: () => void; onPayoutPaid: (payoutId: string, paidDate: string) => void;
}) {
  const totalPaid = payoutList.filter((p) => p.status === "paid").reduce((s, p) => s + p.amountAud, 0);
  const totalPending = payoutList.filter((p) => p.status === "pending").reduce((s, p) => s + p.amountAud, 0);

  return (
    <div className={`bg-surface rounded-2xl border transition-colors ${isOpen ? "border-zinc-600" : "border-transparent hover:border-zinc-800"}`}>
      <button type="button" onClick={onToggle} className="w-full text-left p-5 cursor-pointer">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-white font-semibold text-sm">{r.referrerName}</span>
              <span className="text-zinc-500 text-xs">→</span>
              <span className="text-zinc-300 text-sm">{r.referredName}</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-zinc-700 text-zinc-300">
                {REFERRED_TYPE_LABELS[r.referredType]}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${r.commissionType === "ongoing" ? "bg-blue-500/15 text-blue-400" : "bg-amber/15 text-amber"}`}>
                {r.commissionType === "ongoing" ? `Ongoing ${r.ongoingRatePercent}%` : "One-off"}
              </span>
              {r.status === "ended" && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-500/15 text-red-400">Ended</span>}
            </div>
            <div className="text-xs text-zinc-500">
              {[r.referrerEmail, r.referrerPhone].filter(Boolean).join(" · ") || "No contact details"}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-sm font-bold font-mono text-pace-green">${totalPaid.toFixed(2)} paid</div>
            {totalPending > 0 && <div className="text-xs font-mono text-amber">${totalPending.toFixed(2)} pending</div>}
          </div>
        </div>
      </button>

      {isOpen && (
        <div className="px-5 pb-5 border-t border-zinc-700/40 pt-4 space-y-3">
          {r.notes && <p className="text-xs text-zinc-400">{r.notes}</p>}
          {r.referrerPaymentDetails && (
            <p className="text-xs text-zinc-400">
              <span className="text-zinc-500 uppercase tracking-wider font-semibold">Payment details: </span>
              {r.referrerPaymentDetails}
            </p>
          )}
          {payoutList.length === 0 ? (
            <p className="text-xs text-zinc-500">No payouts yet.</p>
          ) : (
            <div className="space-y-2">
              {payoutList.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 bg-ink rounded-xl px-4 py-2.5">
                  <div className="text-sm text-white">
                    {p.periodLabel ? `${p.periodLabel} · ` : ""}${p.amountAud.toFixed(2)}
                    {p.status === "paid" && p.paidDate && <span className="text-zinc-500 text-xs ml-2">paid {formatDate(p.paidDate)}</span>}
                  </div>
                  {p.status === "paid" ? (
                    <span className="text-xs font-semibold text-pace-green">✓ Paid</span>
                  ) : (
                    <PayoutMarkPaidButton payoutId={p.id} onPaid={(date) => onPayoutPaid(p.id, date)} />
                  )}
                </div>
              ))}
            </div>
          )}
          {r.commissionType === "ongoing" && r.status === "active" && (
            <button type="button" onClick={onEnd}
              className="text-xs font-semibold text-zinc-500 hover:text-red-400 transition-colors cursor-pointer">
              End this referral (stops future ongoing accrual)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PayoutMarkPaidButton({ payoutId, onPaid }: { payoutId: string; onPaid: (paidDate: string) => void }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [paidDate, setPaidDate] = useState(today);
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    setSaving(true);
    try {
      await fetch("/api/referrals/mark-payout-paid", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payoutId, paidDate }),
      });
      onPaid(paidDate);
    } finally {
      setSaving(false);
    }
  }

  if (showConfirm) {
    return (
      <div className="flex items-center gap-2 flex-shrink-0">
        <DateInput value={paidDate} onChange={setPaidDate} className="w-32 bg-surface rounded-lg px-3 py-1.5 text-xs border border-zinc-700 focus:border-pace-green focus:outline-none" />
        <button type="button" onClick={handleConfirm} disabled={saving}
          className="px-3 py-1.5 text-xs font-bold bg-pace-green text-black rounded-lg hover:opacity-90 cursor-pointer transition-opacity disabled:opacity-60">
          {saving ? "…" : "Confirm"}
        </button>
        <button type="button" onClick={() => setShowConfirm(false)} className="text-xs text-zinc-500 hover:text-white cursor-pointer">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button type="button" onClick={() => setShowConfirm(true)}
      className="px-3 py-1.5 text-xs font-bold text-amber border border-amber/30 rounded-lg hover:bg-amber/10 cursor-pointer transition-colors flex-shrink-0">
      Mark Paid
    </button>
  );
}

const inp = "w-full bg-ink rounded-xl px-4 py-2.5 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm";
const sel = "w-full bg-ink rounded-xl px-4 py-2.5 text-white border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm cursor-pointer";
const lbl = "block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5";
