"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { fetchCoach, fetchCoaches, fetchAcademies, fetchPlayers, updateCoachFields, reassignCoachPlayers, updateAcademyFields } from "@/lib/db";
import { InfoCard, InfoRow } from "@/components/InfoCard";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { ConfirmModal } from "@/components/ConfirmModal";
import { PowerIcon, PowerOffIcon, EyeIcon, EyeOffIcon, MailIcon, RepeatIcon, TrashIcon } from "@/components/icons";
import type { Academy, Coach, CertificationLevel, Player } from "@/lib/types";

const CERT_STYLES: Record<CertificationLevel, string> = {
  "Level 1": "bg-zinc-700 text-zinc-300",
  "Level 2": "bg-blue-500/20 text-blue-400",
  "Level 3": "bg-amber/20 text-amber",
  "Elite":   "bg-pace-green/20 text-pace-green",
};

const REMOVED_REASON = "Removed by staff via Coaches page";

// Coaches' own detail page — mirrors PlayerProfileClient's shape (header card + 2x2 info grid).
// Now carries the same ⋮ actions the list row's own menu offers (Deactivate/Activate,
// Marketplace, Resend Invite, Reassign All Players, Remove/Reinstate) plus an "Edit Coach" button
// pointing at the dedicated /coaches/[id]/edit page, so staff never has to bounce back to the list
// to act on the coach they're already looking at.
export function CoachProfileClient({ coachId }: { coachId: string }) {
  const [coach, setCoach] = useState<Coach | null>(null);
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [otherCoaches, setOtherCoaches] = useState<Coach[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutError, setPayoutError] = useState("");
  const [formError, setFormError] = useState("");

  const [confirmStatusToggle, setConfirmStatusToggle] = useState<{ newStatus: "Active" | "Inactive" } | null>(null);
  const [togglingCoach, setTogglingCoach] = useState(false);
  const [confirmMarketplaceToggle, setConfirmMarketplaceToggle] = useState<{ newValue: boolean } | null>(null);
  const [confirmResendInvite, setConfirmResendInvite] = useState(false);
  const [resendingInvite, setResendingInvite] = useState(false);
  const [resendInviteSent, setResendInviteSent] = useState(false);
  const [confirmReinstate, setConfirmReinstate] = useState(false);
  const [reinstatingCoach, setReinstatingCoach] = useState(false);
  const [reassignAllTarget, setReassignAllTarget] = useState<{ playerCount: number } | null>(null);
  const [reassignAllToCoachId, setReassignAllToCoachId] = useState("");
  const [reassigningAll, setReassigningAll] = useState(false);
  const [confirmRemoveCoach, setConfirmRemoveCoach] = useState(false);
  const [removingCoach, setRemovingCoach] = useState(false);
  const [reassignTarget, setReassignTarget] = useState<{
    playerCount: number;
    headCoachAcademy?: { id: string; name: string; otherCoachIds: string[] };
  } | null>(null);
  const [reassignToCoachId, setReassignToCoachId] = useState("");
  const [newHeadCoachId, setNewHeadCoachId] = useState("");
  const [reassigning, setReassigning] = useState(false);

  useEffect(() => {
    Promise.all([fetchCoach(coachId), fetchAcademies(), fetchPlayers(coachId), fetchCoaches()]).then(([c, a, p, allCoaches]) => {
      if (!c) setNotFound(true);
      else setCoach(c);
      setAcademies(a);
      setPlayers(p);
      setOtherCoaches(allCoaches.filter((co) => co.id !== coachId));
    });
  }, [coachId]);

  if (notFound) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-16 text-center text-zinc-400">
        Coach not found.{" "}
        <Link href="/coaches" className="text-pace-green hover:underline">
          Back to Coaches
        </Link>
      </div>
    );
  }

  if (!coach) return null;

  const academy = coach.academyId ? academies.find((a) => a.id === coach.academyId) : undefined;
  const initials = coach.name.split(" ").map((n) => n[0] ?? "").join("");
  const playerCount = players.length;

  async function handleSetupPayouts() {
    setPayoutLoading(true);
    setPayoutError("");
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
      setPayoutError((err as { message?: string })?.message ?? String(err));
      setPayoutLoading(false);
    }
  }

  async function handleViewPayouts() {
    setPayoutLoading(true);
    setPayoutError("");
    try {
      const res = await fetch("/api/stripe/connect/login-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coachId }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "Could not open payouts dashboard.");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setPayoutError((err as { message?: string })?.message ?? String(err));
    } finally {
      setPayoutLoading(false);
    }
  }

  async function handleConfirmStatusToggle() {
    if (!confirmStatusToggle || !coach) return;
    setTogglingCoach(true);
    try {
      await updateCoachFields(coach.id, { status: confirmStatusToggle.newStatus });
      setCoach({ ...coach, status: confirmStatusToggle.newStatus });
      setConfirmStatusToggle(null);
    } catch (err) {
      setFormError((err as { message?: string })?.message ?? String(err));
    } finally {
      setTogglingCoach(false);
    }
  }

  async function handleConfirmMarketplaceToggle() {
    if (!confirmMarketplaceToggle || !coach) return;
    setTogglingCoach(true);
    try {
      await updateCoachFields(coach.id, { marketplace_visible: confirmMarketplaceToggle.newValue });
      setCoach({ ...coach, marketplaceVisible: confirmMarketplaceToggle.newValue });
      setConfirmMarketplaceToggle(null);
    } catch (err) {
      setFormError((err as { message?: string })?.message ?? String(err));
    } finally {
      setTogglingCoach(false);
    }
  }

  async function handleConfirmResendInvite() {
    if (!coach) return;
    setResendingInvite(true);
    try {
      const res = await fetch("/api/invite-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: coach.email, name: coach.name, coachId: coach.id }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResendInviteSent(true);
      setTimeout(() => setResendInviteSent(false), 3000);
      setConfirmResendInvite(false);
    } catch (err) {
      setFormError((err as { message?: string })?.message ?? String(err));
    } finally {
      setResendingInvite(false);
    }
  }

  async function handleConfirmReinstate() {
    if (!coach) return;
    setReinstatingCoach(true);
    try {
      const res = await fetch("/api/reactivate-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coachId: coach.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not reinstate this coach.");
      setCoach({ ...coach, loginDisabled: false, disabledAt: null, disabledReason: null });
      setConfirmReinstate(false);
    } catch (err) {
      setFormError((err as { message?: string })?.message ?? String(err));
    } finally {
      setReinstatingCoach(false);
    }
  }

  async function handleConfirmReassignAll() {
    if (!reassignAllTarget || !coach) return;
    setReassigningAll(true);
    try {
      await reassignCoachPlayers(coach.id, reassignAllToCoachId || null);
      setPlayers([]);
      setReassignAllTarget(null);
      setReassignAllToCoachId("");
    } catch (err) {
      setFormError((err as { message?: string })?.message ?? String(err));
    } finally {
      setReassigningAll(false);
    }
  }

  // Routes to whichever confirm the situation calls for — same logic as the list page's own
  // handleRemoveCoachClick, just scoped to the one coach already on screen.
  function handleRemoveCoachClick() {
    if (!coach) return;
    setFormError("");
    const headCoachAcademy = academies.find((a) => a.headCoachId === coach.id);
    const otherCoachIds = headCoachAcademy ? headCoachAcademy.coachIds.filter((cid) => cid !== coach.id) : [];
    if (headCoachAcademy && otherCoachIds.length === 0) {
      setFormError(`${coach.name} is the only coach for ${headCoachAcademy.name} — add another coach before removing them.`);
      return;
    }
    if (headCoachAcademy || playerCount > 0) {
      setReassignTarget({
        playerCount,
        headCoachAcademy: headCoachAcademy ? { id: headCoachAcademy.id, name: headCoachAcademy.name, otherCoachIds } : undefined,
      });
      setReassignToCoachId("");
      setNewHeadCoachId("");
    } else {
      setConfirmRemoveCoach(true);
    }
  }

  async function handleConfirmRemoveCoach() {
    if (!coach) return;
    setRemovingCoach(true);
    const disabledAt = new Date().toISOString();
    try {
      await updateCoachFields(coach.id, { login_disabled: true, disabled_at: disabledAt, disabled_reason: REMOVED_REASON });
      setCoach({ ...coach, loginDisabled: true, disabledAt, disabledReason: REMOVED_REASON });
      setConfirmRemoveCoach(false);
    } catch (err) {
      setFormError((err as { message?: string })?.message ?? String(err));
    } finally {
      setRemovingCoach(false);
    }
  }

  async function confirmReassignAndDelete() {
    if (!reassignTarget || !coach) return;
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
      }
      await reassignCoachPlayers(coach.id, reassignToCoachId || null);
      const disabledAt = new Date().toISOString();
      await updateCoachFields(coach.id, { login_disabled: true, disabled_at: disabledAt, disabled_reason: REMOVED_REASON });
      setPlayers([]);
      setCoach({ ...coach, loginDisabled: true, disabledAt, disabledReason: REMOVED_REASON });
      setReassignTarget(null);
    } catch (err) {
      setFormError((err as { message?: string })?.message ?? String(err));
    } finally {
      setReassigning(false);
    }
  }

  const menuItems = coach.loginDisabled
    ? [{
        label: "Reinstate Coach", variant: "success" as const,
        onClick: () => { setFormError(""); setConfirmReinstate(true); },
      }]
    : [
        {
          label: coach.status === "Active" ? "Deactivate" : "Activate",
          variant: coach.status === "Active" ? "warning" as const : "success" as const,
          icon: coach.status === "Active" ? <PowerOffIcon /> : <PowerIcon />,
          onClick: () => { setFormError(""); setConfirmStatusToggle({ newStatus: coach.status === "Active" ? "Inactive" : "Active" }); },
        },
        {
          label: coach.marketplaceVisible ? "Hide from Marketplace" : "Show in Marketplace",
          icon: coach.marketplaceVisible ? <EyeOffIcon /> : <EyeIcon />,
          onClick: () => { setFormError(""); setConfirmMarketplaceToggle({ newValue: !coach.marketplaceVisible }); },
        },
        ...(coach.email ? [{
          label: "Resend Invite",
          icon: <MailIcon />,
          onClick: () => { setFormError(""); setConfirmResendInvite(true); },
        }] : []),
        ...(playerCount > 0 ? [{
          label: "Reassign All Players",
          icon: <RepeatIcon />,
          onClick: () => { setFormError(""); setReassignAllTarget({ playerCount }); setReassignAllToCoachId(""); },
        }] : []),
        { label: "Remove Coach", variant: "danger" as const, dividerBefore: true, icon: <TrashIcon />, onClick: handleRemoveCoachClick },
      ];

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Back */}
      <div className="mb-6">
        <Link
          href="/coaches"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
        >
          ← Back to Coaches
        </Link>
      </div>

      {/* Header card + actions */}
      <div className="bg-surface rounded-2xl p-6 mb-1 flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-start gap-5">
          <div className="w-20 h-20 rounded-full bg-pace-green flex items-center justify-center text-black font-bold text-2xl flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
              <h1 className="text-2xl font-bold text-white">{coach.name}</h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${CERT_STYLES[coach.certificationLevel]}`}>
                {coach.certificationLevel}
              </span>
              {coach.loginDisabled ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/20 text-red-400">Removed</span>
              ) : (
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    coach.status === "Active" ? "bg-pace-green/20 text-pace-green" : "bg-zinc-700 text-zinc-400"
                  }`}
                >
                  {coach.status}
                </span>
              )}
            </div>
            <p className="text-zinc-400 text-sm">
              {academy ? academy.name : "Independent"} · Joined{" "}
              {new Date(coach.joinedDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
            </p>
            {coach.loginDisabled && (
              <p className="text-zinc-500 text-xs mt-1">
                {coach.disabledReason || "Removed by staff"}
                {coach.disabledAt && ` · ${new Date(coach.disabledAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href={`/coaches/${coach.id}/edit`}
            className="px-5 py-2.5 text-sm font-semibold text-pace-green border border-pace-green/40 rounded-xl hover:bg-pace-green/10 transition-colors"
          >
            Edit Coach
          </Link>
          {!coach.loginDisabled && (
            <button
              type="button"
              disabled={payoutLoading}
              onClick={coach.stripeConnectOnboarded ? handleViewPayouts : handleSetupPayouts}
              className="px-5 py-2.5 bg-pace-green text-black rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer"
            >
              {payoutLoading ? "Loading…" : coach.stripeConnectOnboarded ? "View Payouts" : "Set Up Payouts"}
            </button>
          )}
          <RowActionsMenu items={menuItems} />
        </div>
      </div>
      {payoutError && <p className="text-red-400 text-xs mt-2 mb-3">{payoutError}</p>}
      {/* Page-level error banner — mirrors the list page's own for the one validation that isn't
          a confirm (a sole academy coach can't be removed at all), since no modal is open to
          attach it to. Every other formError here is set right before opening a ConfirmModal
          below, which shows it via that modal's own `error` slot instead. */}
      {formError && !confirmStatusToggle && !confirmMarketplaceToggle && !confirmResendInvite &&
        !confirmReinstate && !reassignAllTarget && !confirmRemoveCoach && !reassignTarget && (
        <div className="mt-3 mb-3 px-5 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold">
          {formError}
        </div>
      )}
      {resendInviteSent && (
        <div className="mt-3 mb-3 px-5 py-3 rounded-xl bg-pace-green/10 border border-pace-green/30 text-pace-green text-sm font-semibold">
          ✓ Invite resent to {coach.email}
        </div>
      )}

      {/* 2×2 info grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <InfoCard title="Payouts">
          <InfoRow
            label="Status"
            value={
              <span className={coach.stripeConnectOnboarded ? "text-pace-green font-semibold" : "text-zinc-400"}>
                {coach.stripeConnectOnboarded ? "✓ Connected" : coach.stripeConnectAccountId ? "Onboarding incomplete" : "Not set up"}
              </span>
            }
          />
          {/* Only meaningful for an independent coach — an academy-employed one pays nothing
              directly, same gate CoachesClient's own "Upgrade Plan" menu item uses. */}
          {!coach.academyId && <InfoRow label="Plan" value={coach.subPlan} />}
        </InfoCard>

        <InfoCard title="Academy & Marketplace">
          <InfoRow label="Academy" value={academy ? academy.name : <span className="text-zinc-500">Independent</span>} />
          <InfoRow label="Marketplace visible" value={coach.marketplaceVisible ? "Yes" : "No"} />
          <InfoRow label="Available for new players" value={coach.available ? "Yes" : "No"} />
        </InfoCard>

        <InfoCard title="Assigned Players">
          <InfoRow label="Total" value={<span className="font-mono font-semibold text-pace-green">{players.length}</span>} />
          {players.length > 0 ? (
            <div className="space-y-2 pt-1">
              {players.slice(0, 8).map((p) => (
                <Link
                  key={p.id}
                  href={`/players/${p.id}`}
                  className="block text-sm text-zinc-300 hover:text-pace-green transition-colors"
                >
                  {p.name}
                </Link>
              ))}
              {players.length > 8 && <p className="text-xs text-zinc-500">+{players.length - 8} more</p>}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No players assigned yet.</p>
          )}
        </InfoCard>

        <InfoCard title="Contact & Profile">
          <InfoRow label="Email" value={<span className="text-zinc-300 text-sm break-all">{coach.email}</span>} />
          <InfoRow label="Phone" value={coach.phone || <span className="text-zinc-600">Not set</span>} />
          <InfoRow label="Specialization" value={coach.specialization || <span className="text-zinc-600">Not set</span>} />
          <InfoRow
            label="Age groups"
            value={coach.ageGroupsFocus.length > 0 ? coach.ageGroupsFocus.join(", ") : <span className="text-zinc-600">Not set</span>}
          />
          <InfoRow label="Location" value={coach.location || <span className="text-zinc-600">Not set</span>} />
          {coach.bio && <InfoRow label="Bio" value={<span className="text-zinc-300 text-sm">{coach.bio}</span>} />}
        </InfoCard>
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
            ? `"${coach.name}" will be marked Inactive. Their players and history are preserved.`
            : `"${coach.name}" will be set back to Active.`}
          confirmLabel={confirmStatusToggle.newStatus === "Inactive" ? "Yes, Deactivate" : "Yes, Activate"}
          confirmVariant={confirmStatusToggle.newStatus === "Inactive" ? "warning" : "default"}
          loading={togglingCoach}
          error={formError}
          onConfirm={handleConfirmStatusToggle}
          onCancel={() => { setConfirmStatusToggle(null); setFormError(""); }}
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
            ? `"${coach.name}" will become visible to parents/players browsing Find a Coach.`
            : `"${coach.name}" will no longer appear in Find a Coach.`}
          confirmLabel={confirmMarketplaceToggle.newValue ? "Yes, Show" : "Yes, Hide"}
          loading={togglingCoach}
          error={formError}
          onConfirm={handleConfirmMarketplaceToggle}
          onCancel={() => { setConfirmMarketplaceToggle(null); setFormError(""); }}
        />
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
          message={`Sends a fresh login-setup email to ${coach.email}.`}
          confirmLabel="Resend"
          confirmBusyLabel="Sending…"
          loading={resendingInvite}
          error={formError}
          onConfirm={handleConfirmResendInvite}
          onCancel={() => { setConfirmResendInvite(false); setFormError(""); }}
        />
      )}

      {confirmReinstate && (
        <ConfirmModal
          icon={<PowerIcon width={22} height={22} className="text-pace-green" />}
          iconBg="bg-pace-green/20"
          title="Reinstate Coach?"
          message={`Restores "${coach.name}"'s login and brings them back into normal view — nothing else about their profile changes.`}
          confirmLabel="Yes, Reinstate"
          confirmBusyLabel="Reinstating…"
          loading={reinstatingCoach}
          error={formError}
          onConfirm={handleConfirmReinstate}
          onCancel={() => { setConfirmReinstate(false); setFormError(""); }}
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
          message={`${reassignAllTarget.playerCount} player${reassignAllTarget.playerCount !== 1 ? "s" : ""} currently assigned to "${coach.name}" will move to whoever you pick below — ${coach.name} keeps their own account, just no players.`}
          confirmLabel="Reassign"
          confirmBusyLabel="Reassigning…"
          loading={reassigningAll}
          error={formError}
          onConfirm={handleConfirmReassignAll}
          onCancel={() => { setReassignAllTarget(null); setFormError(""); }}
        >
          <select
            value={reassignAllToCoachId}
            onChange={(e) => setReassignAllToCoachId(e.target.value)}
            className="w-full bg-ink text-white text-sm rounded-xl px-3 py-2.5 border border-zinc-700 focus:border-pace-green focus:outline-none cursor-pointer"
          >
            <option value="">— Leave unassigned —</option>
            {otherCoaches.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </ConfirmModal>
      )}

      {confirmRemoveCoach && (
        <ConfirmModal
          icon={<TrashIcon width={22} height={22} className="text-red-400" />}
          iconBg="bg-red-500/20"
          title="Remove Coach?"
          message={`"${coach.name}" will be locked out and hidden from active use — their history is preserved, and this can be undone any time with Reinstate.`}
          confirmLabel="Yes, Remove"
          confirmBusyLabel="Removing…"
          confirmVariant="danger"
          loading={removingCoach}
          error={formError}
          onConfirm={handleConfirmRemoveCoach}
          onCancel={() => { setConfirmRemoveCoach(false); setFormError(""); }}
        />
      )}

      {reassignTarget && (
        <ConfirmModal
          icon={<TrashIcon width={22} height={22} className="text-red-400" />}
          iconBg="bg-red-500/20"
          title="Reassign & Remove Coach?"
          message={
            reassignTarget.headCoachAcademy
              ? `This coach is the head coach of ${reassignTarget.headCoachAcademy.name} — choose a successor below${reassignTarget.playerCount > 0 ? ", and where their players go" : ""} before removing them.`
              : `${reassignTarget.playerCount} player${reassignTarget.playerCount !== 1 ? "s are" : " is"} still assigned to this coach — choose where to move them below before removing them.`
          }
          confirmLabel="Reassign & Remove"
          confirmBusyLabel="Saving…"
          confirmVariant="danger"
          loading={reassigning}
          error={formError}
          onConfirm={confirmReassignAndDelete}
          onCancel={() => { setReassignTarget(null); setFormError(""); }}
        >
          <div className="space-y-4">
            {reassignTarget.headCoachAcademy && (
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">New head coach</label>
                <select
                  value={newHeadCoachId}
                  onChange={(e) => setNewHeadCoachId(e.target.value)}
                  className="w-full bg-ink text-white text-sm rounded-xl px-3 py-2.5 border border-zinc-700 focus:border-pace-green focus:outline-none cursor-pointer"
                >
                  <option value="">— Select new head coach —</option>
                  {reassignTarget.headCoachAcademy.otherCoachIds.map((cid) => {
                    const c = otherCoaches.find((co) => co.id === cid);
                    return c ? <option key={cid} value={cid}>{c.name}</option> : null;
                  })}
                </select>
              </div>
            )}
            {reassignTarget.playerCount > 0 && (
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Move their players to</label>
                <select
                  value={reassignToCoachId}
                  onChange={(e) => setReassignToCoachId(e.target.value)}
                  className="w-full bg-ink text-white text-sm rounded-xl px-3 py-2.5 border border-zinc-700 focus:border-pace-green focus:outline-none cursor-pointer"
                >
                  <option value="">— Leave unassigned —</option>
                  {otherCoaches.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </ConfirmModal>
      )}
    </div>
  );
}
