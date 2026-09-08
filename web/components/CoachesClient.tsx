"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Coach, CoachStatus, CertificationLevel, AgeGroup, Academy, Player, Plan } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { fetchCoaches, fetchAcademies, fetchPlayers, fetchActivePlans, upsertCoach, reassignCoachPlayers, updateAcademyFields } from "@/lib/db";
import { canUseMarketplaceForCoach } from "@/lib/plan-features";
import { DateInput } from "@/components/DateInput";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { ConfirmModal } from "@/components/ConfirmModal";
import { StatsGrid } from "@/components/StatsGrid";
import { StatCard } from "@/components/StatCard";
import { SortableHeader } from "@/components/SortableHeader";
import { useSort } from "@/lib/useSort";
import { PowerIcon, PowerOffIcon, EyeIcon, EyeOffIcon, MailIcon, RepeatIcon, TrashIcon, EditIcon, CreditCardIcon } from "@/components/icons";

type CoachSortKey = "name" | "academy" | "status" | "players" | "joined";

function compareCoaches(a: Coach, b: Coach, sortKey: CoachSortKey): number {
  switch (sortKey) {
    case "name":    return a.name.localeCompare(b.name);
    case "academy": return (academyById(a.academyId)?.name ?? "").localeCompare(academyById(b.academyId)?.name ?? "");
    case "status":  return a.status.localeCompare(b.status);
    case "players": return playerCountForCoach(a.id) - playerCountForCoach(b.id);
    case "joined":  return a.joinedDate.localeCompare(b.joinedDate);
  }
}

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
// loginDisabled/disabledAt/disabledReason are managed exclusively via the ⋮ menu's Remove/
// Reinstate actions (see handleDelete/handleConfirmReinstate) — never part of the regular
// create/edit form, same as the Stripe fields already excluded here.
type DraftCoach = Omit<Coach, "id" | "stripeConnectAccountId" | "stripeConnectOnboarded" | "subPlan" | "stripeCustomerId" | "stripeSubscriptionId" | "subscriptionStatus" | "loginDisabled" | "disabledAt" | "disabledReason">;

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
  const [payoutNotice, setPayoutNotice] = useState<"return" | "refresh" | "checking" | "confirmed" | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftCoach>(EMPTY_DRAFT);
  const [formError, setFormError] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  // "All" deliberately excludes Removed — a soft-deleted coach is meant to be out of normal view
  // by default, with its own tab as the only way back to them (see the filtered/filter tabs below).
  const [filter, setFilter] = useState<"All" | "Active" | "Inactive" | "Removed">("All");
  const [search, setSearch] = useState("");
  const { sortKey, sortDir, handleSort } = useSort<CoachSortKey>("name");
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
  // Standalone reassignment — deliberately separate from reassignTarget above, which only exists
  // as a side-effect of deleting a coach (and additionally handles head-coach succession, which
  // this doesn't need to touch: it only moves players' coach_id, nothing about academy structure).
  const [reassignAllTarget, setReassignAllTarget] = useState<{ coachId: string; name: string; playerCount: number } | null>(null);
  const [reassignAllToCoachId, setReassignAllToCoachId] = useState("");
  const [reassigningAll, setReassigningAll] = useState(false);
  const [confirmResendInvite, setConfirmResendInvite] = useState<{ coachId: string; name: string } | null>(null);
  const [resendingInvite, setResendingInvite] = useState(false);
  const [resendInviteSent, setResendInviteSent] = useState<string | null>(null);
  const [confirmReinstate, setConfirmReinstate] = useState<{ coachId: string; name: string } | null>(null);
  const [reinstatingCoach, setReinstatingCoach] = useState(false);

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
  // refreshing the page doesn't keep re-showing the notice. Rather than just showing a "wait a
  // few minutes" banner and hoping stripe_connect_onboarded updates on its own, actively re-check
  // this coach's real Stripe status right now (see api/stripe/connect/check-status's own comment
  // for why the webhook this used to depend on can never fire for this account shape) — so the
  // banner and the row's own status reflect reality immediately instead of a wait that, for that
  // exact reason, never actually resolved on its own.
  useEffect(() => {
    const onboarding = searchParams.get("onboarding");
    const refresh = searchParams.get("refresh");
    const returningCoachId = searchParams.get("coachId");
    if (onboarding === "return") {
      if (returningCoachId) {
        setPayoutNotice("checking");
        fetch("/api/stripe/connect/check-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ coachId: returningCoachId }),
        })
          .then((res) => res.json())
          .then((data: { onboarded?: boolean }) => {
            if (data.onboarded) {
              setCoaches((prev) => prev.map((c) => (c.id === returningCoachId ? { ...c, stripeConnectOnboarded: true } : c)));
              setPayoutNotice("confirmed");
            } else {
              setPayoutNotice("return");
            }
          })
          .catch(() => setPayoutNotice("return"));
      } else {
        setPayoutNotice("return");
      }
    } else if (refresh) {
      setPayoutNotice("refresh");
    }
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

  // Reachable directly from the row's ⋮ menu, without a separate "find Remove Coach among the
  // form fields" step first — lands straight on the same confirm-removal prompt the Edit form
  // already has, so this doesn't invent a second removal UI to keep in sync with the first.
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

  // Only moves players' coach_id — deliberately doesn't touch academy head-coach succession
  // (unlike confirmReassignAndDelete above), since that's a different concern from "who directly
  // coaches these players" and this action doesn't remove the coach.
  async function handleConfirmReassignAll() {
    if (!reassignAllTarget) return;
    setReassigningAll(true);
    try {
      await reassignCoachPlayers(reassignAllTarget.coachId, reassignAllToCoachId || null);
      _coachPlayers = _coachPlayers.map((p) =>
        p.coachId === reassignAllTarget.coachId ? { ...p, coachId: reassignAllToCoachId } : p
      );
      setCoaches((prev) => [...prev]); // _coachPlayers is module-level, not state — force a re-render
      setReassignAllTarget(null);
    } catch (err) {
      setFormError((err as { message?: string })?.message ?? String(err));
    } finally {
      setReassigningAll(false);
    }
  }

  async function handleConfirmResendInvite() {
    if (!confirmResendInvite) return;
    setResendingInvite(true);
    try {
      const res = await fetch("/api/resend-coach-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coachId: confirmResendInvite.coachId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not resend the invite.");
      setResendInviteSent(confirmResendInvite.coachId);
      setTimeout(() => setResendInviteSent(null), 3000);
      setConfirmResendInvite(null);
    } catch (err) {
      setFormError((err as { message?: string })?.message ?? String(err));
    } finally {
      setResendingInvite(false);
    }
  }

  async function handleConfirmReinstate() {
    if (!confirmReinstate) return;
    setReinstatingCoach(true);
    try {
      const res = await fetch("/api/reactivate-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coachId: confirmReinstate.coachId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not reinstate this coach.");
      setCoaches((prev) => prev.map((c) =>
        c.id === confirmReinstate.coachId ? { ...c, loginDisabled: false, disabledAt: null, disabledReason: null } : c
      ));
      setConfirmReinstate(null);
    } catch (err) {
      setFormError((err as { message?: string })?.message ?? String(err));
    } finally {
      setReinstatingCoach(false);
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
    // Deliberately no "academy required" check here — an independent coach (Coach Pro, no
    // academy) is a fully legitimate state already relied on elsewhere (marketplaceLocked's own
    // !academyId check, the "Your plan" section on a coach's own card). An academy_admin's field
    // is always pre-filled to their own academy and disabled anyway, so this never needed
    // enforcing for that role either — it was only ever blocking platform_admin/independent-coach
    // saves that have every right to leave this blank.
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
      // Never touched by this form — preserved from whatever Remove/Reinstate last set.
      loginDisabled: existing?.loginDisabled ?? false,
      disabledAt: existing?.disabledAt ?? null,
      disabledReason: existing?.disabledReason ?? null,
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
        certification_level: coach.certificationLevel, bio: coach.bio,
        // academy_id is a nullable FK — an empty string isn't a valid value for it (every other
        // coach-creation path in this file already sends null for "no academy"; this is the one
        // save path that didn't).
        academy_id: coach.academyId || null,
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

  // Soft delete — sets login_disabled instead of actually deleting the row, so history (past
  // sessions/reports/bookings) stays intact and a mistaken removal is reversible via Reinstate.
  // Still a real state change worth a fixed, trackable reason rather than none at all.
  const REMOVED_REASON = "Removed by staff via Coaches page";

  function handleDelete(id: string) {
    // A coach who's still an academy's head coach can't be safely removed while they hold that
    // role — resolve it here first so the person gets a clear reassignment step instead of a raw
    // error the moment they try to log in and find themselves locked out mid-responsibility.
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
    const disabledAt = new Date().toISOString();
    upsertCoach({ id, login_disabled: true, disabled_at: disabledAt, disabled_reason: REMOVED_REASON });
    setCoaches((prev) => prev.map((c) => (c.id === id ? { ...c, loginDisabled: true, disabledAt, disabledReason: REMOVED_REASON } : c)));
    closeForm();
  }

  async function confirmReassignAndDelete() {
    if (!reassignTarget) return;
    if (reassignTarget.headCoachAcademy && !newHeadCoachId) {
      setFormError("Choose a new head coach before removing them.");
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
      const disabledAt = new Date().toISOString();
      await upsertCoach({ id: reassignTarget.coachId, login_disabled: true, disabled_at: disabledAt, disabled_reason: REMOVED_REASON });
      _coachPlayers = _coachPlayers.map((p) =>
        p.coachId === reassignTarget.coachId ? { ...p, coachId: reassignToCoachId } : p
      );
      setCoaches((prev) => prev.map((c) =>
        c.id === reassignTarget.coachId ? { ...c, loginDisabled: true, disabledAt, disabledReason: REMOVED_REASON } : c
      ));
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

  const removedCount = coaches.filter((c) => c.loginDisabled).length;
  const statusFiltered = filter === "Removed"
    ? coaches.filter((c) => c.loginDisabled)
    : filter === "All"
      ? coaches.filter((c) => !c.loginDisabled)
      : coaches.filter((c) => c.status === filter && !c.loginDisabled);
  const searchTerm = search.trim().toLowerCase();
  const filtered = searchTerm
    ? statusFiltered.filter((c) => c.name.toLowerCase().includes(searchTerm) || c.email.toLowerCase().includes(searchTerm))
    : statusFiltered;
  const sorted = [...filtered].sort((a, b) => {
    const cmp = compareCoaches(a, b, sortKey);
    return sortDir === "asc" ? cmp : -cmp;
  });
  const activeCount = coaches.filter((c) => c.status === "Active" && !c.loginDisabled).length;
  const inactiveCount = coaches.filter((c) => c.status === "Inactive" && !c.loginDisabled).length;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Coaches</h1>
        </div>
        {user?.role !== "coach" && (
          <button type="button" onClick={openAdd}
            className="flex-shrink-0 px-4 py-2 text-sm font-semibold text-pace-green border border-pace-green/40 rounded-xl hover:bg-pace-green/10 transition-colors cursor-pointer">
            + Add Coach
          </button>
        )}
      </div>

      {/* Returning from Stripe's hosted payout onboarding — "confirmed" is a real, actively-checked
          status (see the effect above), not just an optimistic guess, so it gets its own
          success styling rather than sharing the amber "still waiting" treatment. */}
      {payoutNotice && (
        <div className={`flex items-start justify-between gap-3 border rounded-xl px-4 py-3 mb-6 ${
          payoutNotice === "confirmed" ? "bg-pace-green/10 border-pace-green/30" : "bg-amber/10 border-amber/30"
        }`}>
          <p className={`text-sm ${payoutNotice === "confirmed" ? "text-pace-green" : "text-amber"}`}>
            {payoutNotice === "checking"
              ? "⏳ Checking payout setup status…"
              : payoutNotice === "confirmed"
                ? "✓ Payout setup complete! This coach can now receive payouts."
                : payoutNotice === "return"
                  ? "⏳ Stripe hasn't confirmed this account is fully set up yet. If any steps are still outstanding, click \"Set up payouts\" again to finish them."
                  : "Your payout setup link expired before you finished. Click \"Set up payouts\" again to continue."}
          </p>
          <button
            type="button"
            onClick={() => setPayoutNotice(null)}
            className={`transition-colors cursor-pointer text-lg leading-none flex-shrink-0 ${
              payoutNotice === "confirmed" ? "text-pace-green/70 hover:text-pace-green" : "text-amber/70 hover:text-amber"
            }`}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

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
              <label className={lbl}>Academy</label>
              <select
                value={draft.academyId}
                onChange={(e) => setDraft({ ...draft, academyId: e.target.value })}
                className={sel}
                disabled={user?.role === "academy_admin" || user?.role === "coach"}
              >
                <option value="">— None (independent coach) —</option>
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
            {editingId && user?.role !== "coach" && !(reassignTarget?.coachId === editingId) && !coaches.find((c) => c.id === editingId)?.loginDisabled && (
              confirmDeleteCoachId === editingId ? (
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-zinc-400">Remove this coach?</span>
                  <button type="button" onClick={() => { handleDelete(editingId); setConfirmDeleteCoachId(null); }}
                    className="px-3 py-1.5 text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 transition-colors cursor-pointer">
                    Confirm removal
                  </button>
                  <button type="button" onClick={() => setConfirmDeleteCoachId(null)}
                    className="px-3 py-1.5 text-xs font-semibold text-zinc-400 border border-zinc-700 rounded-lg hover:text-white transition-colors cursor-pointer">
                    Cancel
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmDeleteCoachId(editingId)}
                  className="ml-auto px-4 py-2.5 text-sm font-medium text-red-400 border border-red-500/30 rounded-xl hover:bg-red-500/10 transition-colors cursor-pointer">
                  Remove Coach
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
                    Choose where to move them before removing this coach — they can&apos;t be removed while players still point to them.
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
                  {reassigning ? "Saving…" : "Reassign & Remove Coach"}
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

      {/* Stats — the one control for status, same as Players: no separate tabs/pills row, the
          cards themselves are both the summary and the filter. Active/Inactive/Removed are the
          three mutually-exclusive sub-states that sum to Total, mirroring Players' own
          Active/Expiring/Expired-then-Total shape exactly. Clicking the already-active card again
          clears it back to "All" instead of being a no-op, same toggle Players' cards already
          have. "Players assigned" doesn't fit this status breakdown (it's not a status at all) —
          dropped from the summary row; still visible per-coach in the table's own Players column. */}
      <StatsGrid columns={4}>
        <StatCard label="Active" value={activeCount} color="text-pace-green"
          onClick={() => setFilter((prev) => (prev === "Active" ? "All" : "Active"))} active={filter === "Active"} />
        <StatCard label="Inactive" value={inactiveCount} color="text-amber"
          onClick={() => setFilter((prev) => (prev === "Inactive" ? "All" : "Inactive"))} active={filter === "Inactive"} />
        <StatCard label="Removed" value={removedCount} color="text-zinc-400"
          onClick={() => setFilter((prev) => (prev === "Removed" ? "All" : "Removed"))} active={filter === "Removed"} />
        <StatCard label="Total coaches" value={coaches.length - removedCount} />
      </StatsGrid>

      {/* Coach table — search lives in the table's own header row, same as Players, rather than
          floating above it as a separate element. Coaches has no pagination footer to relocate
          the filtered count to the way Players did (see PR #50), so the count stays here
          alongside search instead of being dropped outright. */}
      <div className="bg-surface rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-700/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="relative w-full sm:max-w-[300px]">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search coaches by name or email…" className={`${inp} pl-10`} />
          </div>
          <h2 className="text-sm text-zinc-400 whitespace-nowrap">
            {sorted.length} Coach{sorted.length !== 1 ? "es" : ""}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-700/60">
                <SortableHeader label="Coach" sortKey="name" activeKey={sortKey} direction={sortDir} onSort={handleSort} className="pl-6" />
                <SortableHeader label="Academy" sortKey="academy" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                <SortableHeader label="Status" sortKey="status" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                <SortableHeader label="Players" sortKey="players" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                <th className="text-left text-xs font-semibold text-zinc-300 uppercase tracking-wider px-4 py-3 whitespace-nowrap">Payouts</th>
                <SortableHeader label="Joined" sortKey="joined" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                <th className="text-right text-xs font-semibold text-zinc-300 uppercase tracking-wider px-4 py-3 pr-6 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((coach) => {
                const playerCount = playerCountForCoach(coach.id);
                const initials = coach.name.split(" ").map((n) => n[0]).join("");
                const canEditRow = user?.role !== "coach" || user.coachId === coach.id;
                const isStaff = user?.role !== "coach";
                const academy = coach.academyId ? academyById(coach.academyId) : undefined;

                const menuItems = coach.loginDisabled
                  ? (isStaff ? [{
                      label: "Reinstate Coach", variant: "success" as const,
                      onClick: () => setConfirmReinstate({ coachId: coach.id, name: coach.name }),
                    }] : [])
                  : [
                      // Gated the same as Edit/Payouts below (own row or staff) — a coach viewing
                      // a colleague's row has no access to that profile server-side either
                      // (canAccessCoachServer), so a visible "View" there would just be a dead
                      // link, and this same gate is what an earlier test already locked in as
                      // "no menu at all" for that case.
                      ...(canEditRow ? [{ label: "View", icon: <EyeIcon />, onClick: () => router.push(`/coaches/${coach.id}`) }] : []),
                      ...(canEditRow ? [{ label: "Edit", icon: <EditIcon />, onClick: () => openEdit(coach) }] : []),
                      ...(canEditRow ? [{
                        label: coach.stripeConnectOnboarded ? "View Payouts" : "Set Up Payouts",
                        icon: <CreditCardIcon />,
                        disabled: payoutLoading === coach.id,
                        onClick: () => (coach.stripeConnectOnboarded ? handleViewPayouts(coach.id) : handleSetupPayouts(coach.id)),
                      }] : []),
                      // Only meaningful for an independent coach — an academy-employed one has no
                      // reason to pay for this themselves.
                      ...(user?.role === "coach" && user.coachId === coach.id && !coach.academyId ? [{
                        label: coach.subPlan === "Coach Pro" ? "Manage Plan" : "Upgrade Plan",
                        onClick: () => router.push("/coach/subscription"),
                      }] : []),
                      // Everything below stays staff-only (never on a coach's own row) — same
                      // gating the confirm-removal step already had.
                      ...(isStaff ? [
                        {
                          label: coach.status === "Active" ? "Deactivate" : "Activate",
                          variant: coach.status === "Active" ? "warning" as const : "success" as const,
                          icon: coach.status === "Active" ? <PowerOffIcon /> : <PowerIcon />,
                          onClick: () => setConfirmStatusToggle({
                            coachId: coach.id, name: coach.name,
                            newStatus: coach.status === "Active" ? "Inactive" : "Active",
                          }),
                        },
                        {
                          label: coach.marketplaceVisible ? "Hide from Marketplace" : "Show in Marketplace",
                          icon: coach.marketplaceVisible ? <EyeOffIcon /> : <EyeIcon />,
                          onClick: () => setConfirmMarketplaceToggle({
                            coachId: coach.id, name: coach.name, newValue: !coach.marketplaceVisible,
                          }),
                        },
                        ...(coach.email ? [{
                          label: "Resend Invite",
                          icon: <MailIcon />,
                          onClick: () => setConfirmResendInvite({ coachId: coach.id, name: coach.name }),
                        }] : []),
                        ...(playerCount > 0 ? [{
                          label: "Reassign All Players",
                          icon: <RepeatIcon />,
                          onClick: () => { setReassignAllTarget({ coachId: coach.id, name: coach.name, playerCount }); setReassignAllToCoachId(""); },
                        }] : []),
                        { label: "Remove Coach", variant: "danger" as const, dividerBefore: true, icon: <TrashIcon />, onClick: () => openEditWithDeleteConfirm(coach) },
                      ] : []),
                    ];

                return (
                  <tr key={coach.id}
                    className={`border-b border-zinc-700/40 last:border-0 transition-colors ${
                      saved === coach.id ? "bg-pace-green/5" : "hover:bg-surface/80"
                    }`}>
                    <td className="px-4 py-4 pl-6">
                      {/* Clicking the name/avatar opens the coach's profile (view mode) — same
                          destination as the ⋮ menu's own "View", just a faster path to it.
                          Scoped to this one control rather than the whole row, so it never fights
                          the ⋮ menu's own click targets (same convention Players already uses).
                          Gated by canEditRow, same as View/Edit/Payouts below — a coach viewing a
                          colleague's row has no server-side access to that profile either
                          (canAccessCoachServer), so this renders as plain, non-clickable content
                          for that case rather than a dead link. */}
                      {(() => {
                        const identity = (
                          <>
                            <div className="w-9 h-9 rounded-full bg-pace-green flex items-center justify-center text-black font-bold text-sm flex-shrink-0">
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className={`text-white text-sm font-medium whitespace-nowrap ${canEditRow ? "group-hover:text-pace-green transition-colors" : ""}`}>{coach.name}</p>
                                {saved === coach.id && <span className="text-pace-green text-xs font-semibold">✓ Saved</span>}
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${CERT_STYLES[coach.certificationLevel]}`}>
                                  {coach.certificationLevel}
                                </span>
                                {resendInviteSent === coach.id && <span className="text-pace-green text-xs">✓ Invite sent</span>}
                              </div>
                              {coach.loginDisabled && (
                                <p className="text-zinc-500 text-xs mt-0.5">
                                  {coach.disabledReason || "Removed by staff"}
                                  {coach.disabledAt && ` · ${new Date(coach.disabledAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`}
                                </p>
                              )}
                            </div>
                          </>
                        );
                        return canEditRow ? (
                          <button
                            type="button"
                            onClick={() => router.push(`/coaches/${coach.id}`)}
                            className="flex items-center gap-3 text-left cursor-pointer group"
                          >
                            {identity}
                          </button>
                        ) : (
                          <div className="flex items-center gap-3">{identity}</div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-4 text-xs whitespace-nowrap">
                      {academy ? (
                        <span className="px-2 py-0.5 rounded-md text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          🏫 {academy.name}
                        </span>
                      ) : (
                        <span className="text-zinc-500">Independent</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {coach.loginDisabled ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/20 text-red-400">Removed</span>
                      ) : (
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          coach.status === "Active" ? "bg-pace-green/20 text-pace-green" : "bg-zinc-700 text-zinc-400"
                        }`}>
                          {coach.status}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm font-bold text-pace-green font-mono">{playerCount}</td>
                    <td className="px-4 py-4 text-xs whitespace-nowrap">
                      {canEditRow ? (
                        <>
                          <span className={coach.stripeConnectOnboarded ? "text-pace-green font-semibold" : "text-zinc-400"}>
                            {coach.stripeConnectOnboarded ? "✓ Connected" : coach.stripeConnectAccountId ? "Onboarding incomplete" : "Not set up"}
                          </span>
                          {payoutError?.coachId === coach.id && (
                            <p className="text-red-400 mt-0.5">{payoutError.message}</p>
                          )}
                        </>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm text-zinc-400 whitespace-nowrap">
                      {new Date(coach.joinedDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-4 pr-6 text-right">
                      <div className="flex justify-end">
                        <RowActionsMenu items={menuItems} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="px-6 py-16 text-center">
              <p className="text-zinc-400 text-sm mb-4">No coaches found.</p>
              <button type="button" onClick={openAdd}
                className="px-5 py-2.5 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 cursor-pointer">
                + Add First Coach
              </button>
            </div>
          )}
        </div>
      </div>

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

      {reassignAllTarget && (
        <ConfirmModal
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
          iconBg="bg-blue-500/20"
          title="Reassign All Players?"
          message={`${reassignAllTarget.playerCount} player${reassignAllTarget.playerCount !== 1 ? "s" : ""} currently assigned to "${reassignAllTarget.name}" will move to whoever you pick below — ${reassignAllTarget.name} keeps their own account, just no players.`}
          confirmLabel="Reassign"
          confirmBusyLabel="Reassigning…"
          loading={reassigningAll}
          onConfirm={handleConfirmReassignAll}
          onCancel={() => setReassignAllTarget(null)}
        >
          <select
            value={reassignAllToCoachId}
            onChange={(e) => setReassignAllToCoachId(e.target.value)}
            className="w-full bg-ink text-white text-sm rounded-xl px-3 py-2.5 border border-zinc-700 focus:border-pace-green focus:outline-none cursor-pointer"
          >
            <option value="">— Leave unassigned —</option>
            {coaches.filter((c) => c.id !== reassignAllTarget.coachId).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </ConfirmModal>
      )}

      {confirmResendInvite && (
        <ConfirmModal
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2">
              <path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7z" />
            </svg>
          }
          iconBg="bg-blue-500/20"
          title="Resend Invite?"
          message={`Sends a fresh sign-in link to "${confirmResendInvite.name}"'s email.`}
          confirmLabel="Yes, Resend"
          confirmBusyLabel="Sending…"
          loading={resendingInvite}
          onConfirm={handleConfirmResendInvite}
          onCancel={() => setConfirmResendInvite(null)}
        />
      )}

      {confirmReinstate && (
        <ConfirmModal
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          }
          iconBg="bg-pace-green/20"
          title="Reinstate Coach?"
          message={`Restores "${confirmReinstate.name}"'s login and brings them back into normal view — nothing else about their profile changes.`}
          confirmLabel="Yes, Reinstate"
          confirmBusyLabel="Reinstating…"
          confirmVariant="default"
          loading={reinstatingCoach}
          onConfirm={handleConfirmReinstate}
          onCancel={() => setConfirmReinstate(null)}
        />
      )}
    </div>
  );
}

const inp = "w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm";
const sel = "w-full bg-ink rounded-xl px-4 py-3 text-white border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm cursor-pointer";
const lbl = "block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5";
