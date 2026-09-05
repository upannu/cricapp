"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Coach, CoachStatus, CertificationLevel, AgeGroup, Academy, Player, Plan } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { fetchCoaches, fetchAcademies, fetchPlayers, fetchActivePlans, upsertCoach, deleteCoach, reassignCoachPlayers, updateAcademyFields } from "@/lib/db";
import { canUseMarketplaceForCoach } from "@/lib/plan-features";
import { DateInput } from "@/components/DateInput";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { ConfirmModal } from "@/components/ConfirmModal";

const AGE_GROUPS: AgeGroup[] = ["U10", "U11", "U12", "U13", "U14", "U16", "U19", "Senior"];
const CERT_LEVELS: CertificationLevel[] = ["Level 1", "Level 2", "Level 3", "Elite"];

const CERT_STYLES: Record<CertificationLevel, string> = {
  "Level 1": "bg-zinc-700 text-zinc-300",
  "Level 2": "bg-blue-500/20 text-blue-400",
  "Level 3": "bg-amber/20 text-amber",
  "Elite":   "bg-pace-green/20 text-pace-green",
};

// Billing fields (subPlan/stripe*) are managed by the subscription flow and webhook, never
// through this edit form — excluded from the draft entirely rather than carried around unused.
type DraftCoach = Omit<Coach, "id" | "stripeConnectAccountId" | "stripeConnectOnboarded" | "subPlan" | "stripeCustomerId" | "stripeSubscriptionId" | "subscriptionStatus">;

const EMPTY_DRAFT: DraftCoach = {
  name: "",
  email: "",
  phone: "",
  specialization: "",
  ageGroupsFocus: [],
  location: "",
  status: "Active",
  joinedDate: new Date().toISOString().split("T")[0],
  certificationLevel: "Level 1",
  bio: "",
  academyId: "",
  marketplaceVisible: false,
  available: true,
  currency: DEFAULT_CURRENCY,
};

let _coachAcademies: Academy[] = [];
let _coachPlayers: Player[] = [];

function playerCountForCoach(coachId: string): number {
  return _coachPlayers.filter((p) => p.coachId === coachId).length;
}

function academyById(id: string) {
  return _coachAcademies.find((a) => a.id === id);
}

export function CoachesClient() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [payoutNotice, setPayoutNotice] = useState<"return" | "refresh" | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftCoach>(EMPTY_DRAFT);
  const [formError, setFormError] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [filter, setFilter] = useState<"All" | "Active" | "Inactive">("All");
  const [sendInvite, setSendInvite] = useState(true);
  const [inviteStatus, setInviteStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [inviteError, setInviteError] = useState("");
  const [saving, setSaving] = useState(false);
  const [reassignTarget, setReassignTarget] = useState<{
    coachId: string; playerCount: number;
    headCoachAcademy?: { id: string; name: string; otherCoachIds: string[] };
  } | null>(null);
  const [reassignToCoachId, setReassignToCoachId] = useState("");
  const [newHeadCoachId, setNewHeadCoachId] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const [confirmDeleteCoachId, setConfirmDeleteCoachId] = useState<string | null>(null);
  const [payoutLoading, setPayoutLoading] = useState<string | null>(null);
  const [payoutError, setPayoutError] = useState<{ coachId: string; message: string } | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [confirmStatusToggle, setConfirmStatusToggle] = useState<{ coachId: string; name: string; newStatus: CoachStatus } | null>(null);
  const [confirmMarketplaceToggle, setConfirmMarketplaceToggle] = useState<{ coachId: string; name: string; newValue: boolean } | null>(null);
  const [togglingCoach, setTogglingCoach] = useState(false);

  const defaultAcademyId = user?.role === "academy_admin" ? (user.academyId ?? "") : "";

  useEffect(() => {
    const coachId = user?.role === "coach" ? user.coachId : undefined;
    Promise.all([
      fetchCoaches(defaultAcademyId || undefined),
      fetchAcademies(),
      fetchPlayers(coachId, defaultAcademyId || undefined),
      fetchActivePlans(),
    ]).then(([c, a, p, pl]) => {
      setCoaches(c);
      _coachAcademies = a;
      _coachPlayers = p;
      setPlans(pl);
    });
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Coming back from Stripe's hosted onboarding flow — strip the query param once read so
  // refreshing the page doesn't keep re-showing the notice.
  useEffect(() => {
    const onboarding = searchParams.get("onboarding");
    const refresh = searchParams.get("refresh");
    if (onboarding === "return") setPayoutNotice("return");
    else if (refresh) setPayoutNotice("refresh");
    if (onboarding || refresh) router.replace("/coaches");
  }, [searchParams, router]);

  async function handleSetupPayouts(coachId: string) {
    setPayoutLoading(coachId);
    setPayoutError(null);
    try {
      const res = await fetch("/api/stripe/connect/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coachId }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "Could not start payout onboarding.");
      window.location.href = data.url;
    } catch (err) {
      setPayoutError({ coachId, message: (err as { message?: string })?.message ?? String(err) });
      setPayoutLoading(null);
    }
  }

  async function handleViewPayouts(coachId: string) {
    setPayoutLoading(coachId);
    setPayoutError(null);
    try {
      const res = await fetch("/api/stripe/connect/login-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coachId }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "Could not open payouts dashboard.");
      window.open(data.url, "_blank", "noopener,noreferrer");
      setPayoutLoading(null);
    } catch (err) {
      setPayoutError({ coachId, message: (err as { message?: string })?.message ?? String(err) });
      setPayoutLoading(null);
    }
  }

  function scrollToForm() {
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function openAdd() {
    setEditingId(null);
    setDraft({ ...EMPTY_DRAFT, joinedDate: new Date().toISOString().split("T")[0], academyId: defaultAcademyId });
    setFormError("");
    setSendInvite(true);
    setInviteStatus("idle");
    setInviteError("");
    setShowForm(true);
    scrollToForm();
  }

  // Reachable directly from the row's ⋮ menu, without a separate "find Delete Coach among the
  // form fields" step first — lands straight on the same confirm-delete prompt the Edit form
  // already has, so this doesn't invent a second delete UI to keep in sync with the first.
  function openEditWithDeleteConfirm(coach: Coach) {
    openEdit(coach);
    setConfirmDeleteCoachId(coach.id);
    scrollToForm();
  }

  // Quick status toggle — same shape as Academy's, previously only reachable by opening Edit and
  // finding the status dropdown among all the other fields.
  async function handleConfirmStatusToggle() {
    if (!confirmStatusToggle) return;
    setTogglingCoach(true);
    try {
      await upsertCoach({ id: confirmStatusToggle.coachId, status: confirmStatusToggle.newStatus });
      setCoaches((prev) => prev.map((c) => (c.id === confirmStatusToggle.coachId ? { ...c, status: confirmStatusToggle.newStatus } : c)));
      setConfirmStatusToggle(null);
    } catch (err) {
      setFormError((err as { message?: string })?.message ?? String(err));
    } finally {
      setTogglingCoach(false);
    }
  }

  // Same idea for marketplace visibility — staff aren't gated by a coach's own plan eligibility
  // here (see the Edit form's marketplaceLocked comment; that lock only protects a *coach* from
  // turning on something they haven't paid for on their own profile), so this is always offered
  // to staff regardless of the coach's plan, matching how the Edit form already treats staff.
  async function handleConfirmMarketplaceToggle() {
    if (!confirmMarketplaceToggle) return;
    setTogglingCoach(true);
    try {
      await upsertCoach({ id: confirmMarketplaceToggle.coachId, marketplace_visible: confirmMarketplaceToggle.newValue });
      setCoaches((prev) => prev.map((c) => (c.id === confirmMarketplaceToggle.coachId ? { ...c, marketplaceVisible: confirmMarketplaceToggle.newValue } : c)));
      setConfirmMarketplaceToggle(null);
    } catch (err) {
      setFormError((err as { message?: string })?.message ?? String(err));
    } finally {
      setTogglingCoach(false);
    }
  }

  function openEdit(coach: Coach) {
    setEditingId(coach.id);
    setDraft({
      name: coach.name,
      email: coach.email,
      phone: coach.phone,
      specialization: coach.specialization,
      ageGroupsFocus: [...coach.ageGroupsFocus],
      location: coach.location,
      status: coach.status,
      joinedDate: coach.joinedDate,
      certificationLevel: coach.certificationLevel,
      bio: coach.bio,
      academyId: coach.academyId,
      marketplaceVisible: coach.marketplaceVisible,
      available: coach.available,
      currency: coach.currency,
    });
    setFormError("");
    setConfirmDeleteCoachId(null);
    setShowForm(true);
    scrollToForm();
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setFormError("");
    setConfirmDeleteCoachId(null);
  }

  async function handleSave() {
    if (!draft.name.trim()) { setFormError("Coach name is required."); return; }
    if (!draft.email.trim()) { setFormError("Email is required."); return; }
    if (!draft.academyId) { setFormError("Please assign this coach to an academy."); return; }
    // Nothing in the schema stops two coach rows sharing an email — and when that happens, every
    // email-based lookup elsewhere (invite approval, login linking) can only ever resolve to one
    // of them, silently orphaning whichever wasn't picked. Catch it here instead.
    const emailTaken = coaches.some((c) => c.id !== editingId && c.email.toLowerCase() === draft.email.trim().toLowerCase());
    if (emailTaken) { setFormError(`Another coach already uses ${draft.email.trim()} — each coach needs a unique email.`); return; }
    setFormError("");
    setSaving(true);

    const newId = editingId ?? `c_${Date.now()}`;
    const existing = editingId ? coaches.find((c) => c.id === editingId) : undefined;
    const coach: Coach = {
      id: newId, ...draft, name: draft.name.trim(), email: draft.email.trim(),
      stripeConnectAccountId: existing?.stripeConnectAccountId,
      stripeConnectOnboarded: existing?.stripeConnectOnboarded ?? false,
      lat: existing?.lat, lng: existing?.lng,
      // Billing fields are never touched by this form — preserved as-is from whatever the
      // subscription flow/webhook last set (defaulting to Free for a brand-new coach).
      subPlan: existing?.subPlan ?? "Free",
      stripeCustomerId: existing?.stripeCustomerId,
      stripeSubscriptionId: existing?.stripeSubscriptionId,
      subscriptionStatus: existing?.subscriptionStatus,
    };

    // Re-geocode whenever the location text changes — best-effort, never blocks the save.
    if (coach.location.trim() && coach.location !== existing?.location) {
      try {
        const geoRes = await fetch("/api/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: coach.location }),
        });
        const geoData = await geoRes.json();
        if (geoRes.ok) {
          coach.lat = geoData.lat;
          coach.lng = geoData.lng;
        }
      } catch {
        // Geocoding is a nice-to-have for the marketplace radius search — never block a coach save on it.
      }
    }

    try {
      await upsertCoach({
        id: newId, name: coach.name, email: coach.email, phone: coach.phone,
        specialization: coach.specialization, age_groups_focus: coach.ageGroupsFocus,
        location: coach.location, status: coach.status, joined_date: coach.joinedDate,
        certification_level: coach.certificationLevel, bio: coach.bio, academy_id: coach.academyId,
        marketplace_visible: coach.marketplaceVisible, available: coach.available,
        lat: coach.lat ?? null, lng: coach.lng ?? null,
      });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? String(err);
      setFormError(`Save failed: ${msg}`);
      setSaving(false);
      return;
    }

    setCoaches((prev) =>
      editingId
        ? prev.map((c) => (c.id === editingId ? coach : c))
        : [coach, ...prev]
    );
    setSaved(newId);
    setSaving(false);

    if (!editingId && sendInvite && coach.email) {
      setInviteStatus("sending");
      fetch("/api/invite-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: coach.email, name: coach.name, coachId: newId }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) { setInviteStatus("error"); setInviteError(data.error); }
          else { setInviteStatus("sent"); }
        })
        .catch(() => { setInviteStatus("error"); setInviteError("Network error sending invite."); });
    } else {
      closeForm();
    }

    setTimeout(() => setSaved(null), 2500);
  }

  function handleDelete(id: string) {
    // A coach who's still an academy's head coach can't be safely deleted — the DB blocks it too
    // (payouts for that academy would otherwise silently break), but resolve it here first so the
    // person gets a clear reassignment step instead of a raw error.
    const headCoachAcademy = _coachAcademies.find((a) => a.headCoachId === id);
    const otherCoachIds = headCoachAcademy ? headCoachAcademy.coachIds.filter((cid) => cid !== id) : [];
    if (headCoachAcademy && otherCoachIds.length === 0) {
      setFormError(`${coaches.find((c) => c.id === id)?.name ?? "This coach"} is the only coach for ${headCoachAcademy.name} — add another coach before removing them.`);
      return;
    }

    const playerCount = playerCountForCoach(id);
    if (headCoachAcademy || playerCount > 0) {
      setReassignTarget({
        coachId: id,
        playerCount,
        headCoachAcademy: headCoachAcademy ? { id: headCoachAcademy.id, name: headCoachAcademy.name, otherCoachIds } : undefined,
      });
      setReassignToCoachId("");
      setNewHeadCoachId("");
      return;
    }
    deleteCoach(id);
    setCoaches((prev) => prev.filter((c) => c.id !== id));
    closeForm();
  }

  async function confirmReassignAndDelete() {
    if (!reassignTarget) return;
    if (reassignTarget.headCoachAcademy && !newHeadCoachId) {
      setFormError("Choose a new head coach before deleting.");
      return;
    }
    setReassigning(true);
    try {
      if (reassignTarget.headCoachAcademy) {
        await updateAcademyFields(reassignTarget.headCoachAcademy.id, {
          head_coach_id: newHeadCoachId,
          coach_ids: reassignTarget.headCoachAcademy.otherCoachIds,
        });
        _coachAcademies = _coachAcademies.map((a) =>
          a.id === reassignTarget.headCoachAcademy!.id
            ? { ...a, headCoachId: newHeadCoachId, coachIds: reassignTarget.headCoachAcademy!.otherCoachIds }
            : a
        );
      }
      await reassignCoachPlayers(reassignTarget.coachId, reassignToCoachId || null);
      await deleteCoach(reassignTarget.coachId);
      _coachPlayers = _coachPlayers.map((p) =>
        p.coachId === reassignTarget.coachId ? { ...p, coachId: reassignToCoachId } : p
      );
      setCoaches((prev) => prev.filter((c) => c.id !== reassignTarget.coachId));
      setReassignTarget(null);
      closeForm();
    } catch (err) {
      setFormError((err as { message?: string })?.message ?? String(err));
    } finally {
      setReassigning(false);
    }
  }

  function toggleAgeGroup(g: AgeGroup) {
    setDraft((prev) => ({
      ...prev,
      ageGroupsFocus: prev.ageGroupsFocus.includes(g)
        ? prev.ageGroupsFocus.filter((a) => a !== g)
        : [...prev.ageGroupsFocus, g],
    }));
  }

  const filtered = filter === "All" ? coaches : coaches.filter((c) => c.status === filter);
  const activeCount = coaches.filter((c) => c.status === "Active").length;
  const totalPlayers = coaches.reduce((s, c) => s + playerCountForCoach(c.id), 0);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Coaches</h1>
          <p className="text-zinc-400 text-sm">Manage your coaching team and their player assignments</p>
        </div>
        {user?.role !== "coach" && (
          <button type="button" onClick={openAdd}
            className="px-5 py-2.5 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity cursor-pointer">
            + New Coach
          </button>
        )}
      </div>

      {/* Returning from Stripe's hosted payout onboarding */}
      {payoutNotice && (
        <div className="flex items-start justify-between gap-3 bg-amber/10 border border-amber/30 rounded-xl px-4 py-3 mb-6">
          <p className="text-sm text-amber">
            {payoutNotice === "return"
              ? "⏳ Payout setup submitted. It can take a few minutes for Stripe to confirm — refresh this page shortly if the coach still shows \"Not set up.\""
              : "Your payout setup link expired before you finished. Click \"Set up payouts\" again to continue."}
          </p>
          <button
            type="button"
            onClick={() => setPayoutNotice(null)}
            className="text-amber/70 hover:text-amber transition-colors cursor-pointer text-lg leading-none flex-shrink-0"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-surface rounded-2xl p-5 text-center">
          <div className="text-2xl font-bold text-white mb-1">{coaches.length}</div>
          <div className="text-xs text-zinc-400">Total coaches</div>
        </div>
        <div className="bg-surface rounded-2xl p-5 text-center">
          <div className="text-2xl font-bold text-pace-green mb-1">{activeCount}</div>
          <div className="text-xs text-zinc-400">Active</div>
        </div>
        <div className="bg-surface rounded-2xl p-5 text-center">
          <div className="text-2xl font-bold text-amber mb-1">{totalPlayers}</div>
          <div className="text-xs text-zinc-400">Players assigned</div>
        </div>
      </div>

      {/* Form anchor */}
      <div ref={formRef} />

      {/* Create / Edit form */}
      {showForm && (() => {
        const editingCoach = editingId ? coaches.find((c) => c.id === editingId) : undefined;
        // A coach editing their own independent profile needs marketplace access unlocked on
        // their tier to turn visibility on — staff (who can also reach this form) aren't gated,
        // since they're not the ones paying for it. Reads the admin-editable Plan Catalog
        // (marketplaceEnabled on coach-free/coach-pro) via canUseMarketplaceForCoach rather than
        // hardcoding "must be Coach Pro", so an admin toggling that flag in /admin/plans actually
        // changes this gate instead of being silently ignored.
        const marketplaceLocked =
          user?.role === "coach" && user.coachId === editingId && !editingCoach?.academyId &&
          !canUseMarketplaceForCoach((editingCoach?.subPlan ?? "Free") as "Free" | "Coach Pro", plans) &&
          !draft.marketplaceVisible;
        return (
        <div className="bg-surface rounded-2xl p-6 border border-pace-green/30 mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-pace-green mb-6">
            {editingId ? "Edit Coach" : "New Coach"}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            <div>
              <label className={lbl}>Full Name *</label>
              <input type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className={inp} placeholder="e.g. Arjun Sharma" />
            </div>
            <div>
              <label className={lbl}>Email *</label>
              <input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                className={inp} placeholder="coach@email.com" disabled={user?.role === "coach"} />
              {user?.role === "coach" && (
                <p className="text-xs text-zinc-500 mt-1">Contact your academy admin to change your email.</p>
              )}
            </div>
            <div>
              <label className={lbl}>Phone</label>
              <input type="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                className={inp} placeholder="+61 4XX XXX XXX" />
            </div>
            <div>
              <label className={lbl}>Location</label>
              <input type="text" value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                className={inp} placeholder="e.g. Brisbane, QLD" />
            </div>
            <div>
              <label className={lbl}>Specialization</label>
              <input type="text" value={draft.specialization} onChange={(e) => setDraft({ ...draft, specialization: e.target.value })}
                className={inp} placeholder="e.g. Fast Bowling Biomechanics" />
            </div>
            <div>
              <label className={lbl}>Certification Level</label>
              <select value={draft.certificationLevel} onChange={(e) => setDraft({ ...draft, certificationLevel: e.target.value as CertificationLevel })}
                className={sel}>
                {CERT_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Joined Date</label>
              <DateInput value={draft.joinedDate} onChange={(v) => setDraft({ ...draft, joinedDate: v })}
                className={inp} />
            </div>
            <div>
              <label className={lbl}>Status</label>
              <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as CoachStatus })}
                className={sel}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={lbl}>Academy *</label>
              <select
                value={draft.academyId}
                onChange={(e) => setDraft({ ...draft, academyId: e.target.value })}
                className={sel}
                disabled={user?.role === "academy_admin" || user?.role === "coach"}
              >
                <option value="">— Select academy —</option>
                {_coachAcademies.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} · {a.location}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={lbl}>Bio</label>
              <textarea value={draft.bio} onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
                className={`${inp} resize-none h-20`}
                placeholder="Background, experience, coaching philosophy…" />
            </div>
            <div className="sm:col-span-2">
              <label className={`flex items-center gap-2.5 select-none ${marketplaceLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
                <input
                  type="checkbox"
                  checked={draft.marketplaceVisible}
                  disabled={marketplaceLocked}
                  onChange={(e) => setDraft({ ...draft, marketplaceVisible: e.target.checked })}
                  className="w-4 h-4 rounded accent-pace-green cursor-pointer disabled:cursor-not-allowed"
                />
                <span className="text-sm text-white font-medium">Visible in the coach marketplace</span>
              </label>
              {marketplaceLocked ? (
                <p className="text-xs text-amber mt-1 ml-6">
                  Requires Coach Pro. <Link href="/coach/subscription" className="underline hover:opacity-80">Upgrade</Link> to become discoverable and get booked by players.
                </p>
              ) : (
                <p className="text-xs text-zinc-500 mt-1 ml-6">Players in this academy can find and request a booking with this coach from the marketplace.</p>
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={draft.available}
                  onChange={(e) => setDraft({ ...draft, available: e.target.checked })}
                  className="w-4 h-4 rounded accent-pace-green cursor-pointer"
                />
                <span className="text-sm text-white font-medium">Actively taking new players</span>
              </label>
              <p className="text-xs text-zinc-500 mt-1 ml-6">Turn off to stay listed in the marketplace but show as unavailable for new bookings.</p>
            </div>
          </div>

          {/* Age groups */}
          <div className="mb-6">
            <label className={lbl}>Age Groups Focus</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {AGE_GROUPS.map((g) => {
                const isSel = draft.ageGroupsFocus.includes(g);
                return (
                  <button key={g} type="button" onClick={() => toggleAgeGroup(g)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                      isSel
                        ? "bg-pace-green/20 border-pace-green text-pace-green"
                        : "bg-ink border-zinc-700 text-zinc-400 hover:border-zinc-500"
                    }`}>
                    {g}
                  </button>
                );
              })}
            </div>
          </div>

          {!editingId && (
            <div className="mb-5 p-4 rounded-xl bg-ink border border-zinc-700">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendInvite}
                  onChange={(e) => setSendInvite(e.target.checked)}
                  className="w-4 h-4 accent-pace-green cursor-pointer"
                />
                <div>
                  <span className="text-sm font-semibold text-white">Send login invite email</span>
                  <p className="text-xs text-zinc-500 mt-0.5">Coach receives an email with a link to set their password and access CRIC HQ</p>
                </div>
              </label>
              {inviteStatus === "sending" && (
                <p className="text-xs text-zinc-400 mt-3 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full border border-zinc-400 border-t-transparent animate-spin inline-block" />
                  Sending invite…
                </p>
              )}
              {inviteStatus === "sent" && (
                <div className="flex items-center justify-between mt-3">
                  <p className="text-xs text-pace-green font-semibold">✓ Invite sent to {draft.email}</p>
                  <button type="button" onClick={closeForm} className="text-xs text-zinc-400 hover:text-white cursor-pointer">Close</button>
                </div>
              )}
              {inviteStatus === "error" && (
                <div className="flex items-center justify-between mt-3">
                  <p className="text-xs text-red-400">{inviteError}</p>
                  <button type="button" onClick={closeForm} className="text-xs text-zinc-400 hover:text-white cursor-pointer">Close</button>
                </div>
              )}
            </div>
          )}

          {formError && <p className="text-red-400 text-sm mb-3">{formError}</p>}

          <div className="flex items-center gap-3">
            <button type="button" onClick={handleSave}
              disabled={saving || inviteStatus === "sending"}
              className="px-6 py-2.5 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 cursor-pointer disabled:opacity-60">
              {saving ? "Saving…" : editingId ? "Save Changes" : "Create Coach"}
            </button>
            <button type="button" onClick={closeForm}
              className="px-6 py-2.5 text-sm font-medium text-zinc-400 border border-zinc-700 rounded-xl hover:text-white hover:border-zinc-500 transition-colors cursor-pointer">
              Cancel
            </button>
            {editingId && user?.role !== "coach" && !(reassignTarget?.coachId === editingId) && (
              confirmDeleteCoachId === editingId ? (
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-zinc-400">Delete this coach?</span>
                  <button type="button" onClick={() => { handleDelete(editingId); setConfirmDeleteCoachId(null); }}
                    className="px-3 py-1.5 text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 transition-colors cursor-pointer">
                    Confirm delete
                  </button>
                  <button type="button" onClick={() => setConfirmDeleteCoachId(null)}
                    className="px-3 py-1.5 text-xs font-semibold text-zinc-400 border border-zinc-700 rounded-lg hover:text-white transition-colors cursor-pointer">
                    Cancel
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmDeleteCoachId(editingId)}
                  className="ml-auto px-4 py-2.5 text-sm font-medium text-red-400 border border-red-500/30 rounded-xl hover:bg-red-500/10 transition-colors cursor-pointer">
                  Delete Coach
                </button>
              )
            )}
          </div>

          {reassignTarget?.coachId === editingId && (
            <div className="mt-4 pt-4 border-t border-zinc-700/50 bg-red-500/5 border border-red-500/20 rounded-xl p-4 space-y-4">
              {reassignTarget.headCoachAcademy && (
                <div>
                  <p className="text-sm text-white font-semibold mb-1">
                    This coach is the head coach of {reassignTarget.headCoachAcademy.name}
                  </p>
                  <p className="text-xs text-zinc-400 mb-2">
                    Choose who takes over as head coach — payouts for this academy go to whoever holds this role.
                  </p>
                  <select
                    value={newHeadCoachId}
                    onChange={(e) => setNewHeadCoachId(e.target.value)}
                    className="bg-ink text-white text-sm rounded-xl px-3 py-2.5 border border-zinc-700 focus:border-pace-green focus:outline-none cursor-pointer"
                  >
                    <option value="">— Select new head coach —</option>
                    {reassignTarget.headCoachAcademy.otherCoachIds.map((cid) => {
                      const c = coaches.find((co) => co.id === cid);
                      return c ? <option key={cid} value={cid}>{c.name}</option> : null;
                    })}
                  </select>
                </div>
              )}
              {reassignTarget.playerCount > 0 && (
                <div>
                  <p className="text-sm text-white font-semibold mb-1">
                    {reassignTarget.playerCount} player{reassignTarget.playerCount !== 1 ? "s are" : " is"} still assigned to this coach
                  </p>
                  <p className="text-xs text-zinc-400 mb-2">
                    Choose where to move them before deleting — this coach can&apos;t be deleted while players still point to it.
                  </p>
                  <select
                    value={reassignToCoachId}
                    onChange={(e) => setReassignToCoachId(e.target.value)}
                    className="bg-ink text-white text-sm rounded-xl px-3 py-2.5 border border-zinc-700 focus:border-pace-green focus:outline-none cursor-pointer"
                  >
                    <option value="">— Leave unassigned —</option>
                    {coaches.filter((c) => c.id !== reassignTarget.coachId).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex items-center gap-3">
                <button type="button" onClick={confirmReassignAndDelete} disabled={reassigning}
                  className="px-4 py-2.5 text-sm font-bold bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl hover:bg-red-500/30 transition-colors disabled:opacity-60 cursor-pointer">
                  {reassigning ? "Saving…" : "Reassign & Delete Coach"}
                </button>
                <button type="button" onClick={() => { setReassignTarget(null); setFormError(""); }} disabled={reassigning}
                  className="text-xs text-zinc-500 hover:text-white cursor-pointer">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
        );
      })()}

      {/* Success banner */}
      {saved && !showForm && (
        <div className="mb-5 px-5 py-3 rounded-xl bg-pace-green/10 border border-pace-green/30 text-pace-green text-sm font-semibold">
          ✓ Coach saved successfully
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {(["All", "Active", "Inactive"] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              filter === f ? "bg-pace-green text-black" : "bg-surface text-zinc-400 hover:text-white"
            }`}>
            {f}
          </button>
        ))}
      </div>

      {/* Coach cards */}
      {filtered.length === 0 ? (
        <div className="bg-surface rounded-2xl p-16 text-center">
          <p className="text-zinc-400 text-sm mb-4">No coaches found.</p>
          <button type="button" onClick={openAdd}
            className="px-5 py-2.5 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 cursor-pointer">
            + Add First Coach
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((coach) => {
            const playerCount = playerCountForCoach(coach.id);
            const initials = coach.name.split(" ").map((n) => n[0]).join("");

            return (
              <div key={coach.id}
                className={`bg-surface rounded-2xl p-6 border transition-colors ${
                  saved === coach.id ? "border-pace-green/50" : "border-transparent"
                }`}>
                {/* Card header */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-full bg-pace-green flex items-center justify-center text-black font-bold text-base flex-shrink-0">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <h3 className="text-white font-bold text-sm">{coach.name}</h3>
                        {saved === coach.id && (
                          <span className="text-pace-green text-xs font-semibold">✓ Saved</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${CERT_STYLES[coach.certificationLevel]}`}>
                          {coach.certificationLevel}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          coach.status === "Active" ? "bg-pace-green/20 text-pace-green" : "bg-zinc-700 text-zinc-400"
                        }`}>
                          {coach.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  {(user?.role !== "coach" || user.coachId === coach.id) && (
                    <button type="button" onClick={() => openEdit(coach)}
                      className="px-3 py-1.5 text-xs font-semibold text-zinc-300 border border-zinc-600 rounded-lg hover:border-pace-green hover:text-pace-green transition-colors cursor-pointer flex-shrink-0">
                      Edit
                    </button>
                  )}
                  {/* Every action here stays staff-only (never on a coach's own card) — same
                      gating the confirm-delete already had. Each opens a confirm step rather than
                      acting immediately; Delete is visually separated as the destructive one. */}
                  {user?.role !== "coach" && (
                    <RowActionsMenu items={[
                      {
                        label: coach.status === "Active" ? "Deactivate" : "Activate",
                        variant: coach.status === "Active" ? "warning" : "success",
                        onClick: () => setConfirmStatusToggle({
                          coachId: coach.id, name: coach.name,
                          newStatus: coach.status === "Active" ? "Inactive" : "Active",
                        }),
                      },
                      {
                        label: coach.marketplaceVisible ? "Hide from Marketplace" : "Show in Marketplace",
                        onClick: () => setConfirmMarketplaceToggle({
                          coachId: coach.id, name: coach.name, newValue: !coach.marketplaceVisible,
                        }),
                      },
                      { label: "Delete Coach", variant: "danger", dividerBefore: true, onClick: () => openEditWithDeleteConfirm(coach) },
                    ]} />
                  )}
                </div>

                {/* Specialization + location */}
                <p className="text-zinc-300 text-sm font-medium mb-1">{coach.specialization || "—"}</p>
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  {coach.location && (
                    <span className="text-zinc-500 text-xs">📍 {coach.location}</span>
                  )}
                  {coach.academyId && (() => {
                    const ac = academyById(coach.academyId);
                    return ac ? (
                      <span className="px-2 py-0.5 rounded-md text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        🏫 {ac.name}
                      </span>
                    ) : null;
                  })()}
                </div>

                {/* Bio */}
                {coach.bio && (
                  <p className="text-zinc-400 text-xs leading-relaxed mb-4 line-clamp-2">{coach.bio}</p>
                )}

                {/* Meta grid */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <div className="text-xs text-zinc-500 mb-0.5">Email</div>
                    <div className="text-xs text-zinc-300 truncate">{coach.email}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 mb-0.5">Phone</div>
                    <div className="text-xs text-zinc-300">{coach.phone || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 mb-0.5">Joined</div>
                    <div className="text-xs text-zinc-300">
                      {new Date(coach.joinedDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 mb-0.5">Players</div>
                    <div className="text-sm font-bold text-pace-green">{playerCount}</div>
                  </div>
                </div>

                {/* Age groups */}
                {coach.ageGroupsFocus.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {coach.ageGroupsFocus.map((g) => (
                      <span key={g} className="px-2 py-0.5 rounded-md text-xs bg-ink text-zinc-400 border border-zinc-700">
                        {g}
                      </span>
                    ))}
                  </div>
                )}

                {/* Payouts — visible to staff, or to the coach viewing their own card */}
                {(user?.role !== "coach" || user.coachId === coach.id) && (
                  <div className="mt-4 pt-4 border-t border-zinc-700/40 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-zinc-500">Payouts</p>
                      <p className={`text-xs font-semibold ${coach.stripeConnectOnboarded ? "text-pace-green" : "text-zinc-400"}`}>
                        {coach.stripeConnectOnboarded ? "✓ Connected" : coach.stripeConnectAccountId ? "Onboarding incomplete" : "Not set up"}
                      </p>
                      {payoutError?.coachId === coach.id && (
                        <p className="text-xs text-red-400 mt-0.5">{payoutError.message}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => coach.stripeConnectOnboarded ? handleViewPayouts(coach.id) : handleSetupPayouts(coach.id)}
                      disabled={payoutLoading === coach.id}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer disabled:opacity-60 text-zinc-300 border-zinc-600 hover:border-pace-green hover:text-pace-green flex-shrink-0"
                    >
                      {payoutLoading === coach.id ? "Loading…" : coach.stripeConnectOnboarded ? "View payouts" : "Set up payouts"}
                    </button>
                  </div>
                )}

                {/* Own plan — only meaningful for an independent coach; an academy-employed one
                    has no reason to pay for this themselves. */}
                {user?.role === "coach" && user.coachId === coach.id && !coach.academyId && (
                  <div className="mt-4 pt-4 border-t border-zinc-700/40 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-zinc-500">Your plan</p>
                      <p className={`text-xs font-semibold ${coach.subPlan === "Coach Pro" ? "text-pace-green" : "text-zinc-400"}`}>
                        {coach.subPlan === "Coach Pro" ? "✓ Coach Pro" : "Free"}
                      </p>
                    </div>
                    <Link
                      href="/coach/subscription"
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer disabled:opacity-60 text-zinc-300 border-zinc-600 hover:border-pace-green hover:text-pace-green flex-shrink-0"
                    >
                      {coach.subPlan === "Coach Pro" ? "Manage plan" : "Upgrade"}
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {confirmStatusToggle && (
        <ConfirmModal
          icon={confirmStatusToggle.newStatus === "Inactive" ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          iconBg={confirmStatusToggle.newStatus === "Inactive" ? "bg-amber/20" : "bg-pace-green/20"}
          title={confirmStatusToggle.newStatus === "Inactive" ? "Deactivate Coach?" : "Activate Coach?"}
          message={confirmStatusToggle.newStatus === "Inactive"
            ? `"${confirmStatusToggle.name}" will be marked Inactive. Their players and history are preserved.`
            : `"${confirmStatusToggle.name}" will be set back to Active.`}
          confirmLabel={confirmStatusToggle.newStatus === "Inactive" ? "Yes, Deactivate" : "Yes, Activate"}
          confirmVariant={confirmStatusToggle.newStatus === "Inactive" ? "warning" : "default"}
          loading={togglingCoach}
          onConfirm={handleConfirmStatusToggle}
          onCancel={() => setConfirmStatusToggle(null)}
        />
      )}

      {confirmMarketplaceToggle && (
        <ConfirmModal
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          }
          iconBg="bg-blue-500/20"
          title={confirmMarketplaceToggle.newValue ? "Show in Marketplace?" : "Hide from Marketplace?"}
          message={confirmMarketplaceToggle.newValue
            ? `"${confirmMarketplaceToggle.name}" will become visible to parents/players browsing Find a Coach.`
            : `"${confirmMarketplaceToggle.name}" will no longer appear in Find a Coach.`}
          confirmLabel={confirmMarketplaceToggle.newValue ? "Yes, Show" : "Yes, Hide"}
          loading={togglingCoach}
          onConfirm={handleConfirmMarketplaceToggle}
          onCancel={() => setConfirmMarketplaceToggle(null)}
        />
      )}
    </div>
  );
}

const inp = "w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm";
const sel = "w-full bg-ink rounded-xl px-4 py-3 text-white border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm cursor-pointer";
const lbl = "block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5";
