"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { fetchCoach, fetchAcademies, fetchPlayers } from "@/lib/db";
import { InfoCard, InfoRow } from "@/components/InfoCard";
import type { Academy, Coach, CertificationLevel, Player } from "@/lib/types";

const CERT_STYLES: Record<CertificationLevel, string> = {
  "Level 1": "bg-zinc-700 text-zinc-300",
  "Level 2": "bg-blue-500/20 text-blue-400",
  "Level 3": "bg-amber/20 text-amber",
  "Elite":   "bg-pace-green/20 text-pace-green",
};

// Coaches' own detail page — mirrors PlayerProfileClient's shape (header card + 2x2 info grid)
// since that's the established pattern for a "view one record" page in this app, but built from
// whatever a coach record already tracks rather than inventing new fields. No dedicated edit page
// exists for coaches (editing stays inline on the list page via CoachesClient's own form) — this
// page is read/payouts only, same split Players already has between "View" and "Edit".
export function CoachProfileClient({ coachId }: { coachId: string }) {
  const [coach, setCoach] = useState<Coach | null>(null);
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutError, setPayoutError] = useState("");

  useEffect(() => {
    Promise.all([fetchCoach(coachId), fetchAcademies(), fetchPlayers(coachId)]).then(([c, a, p]) => {
      if (!c) setNotFound(true);
      else setCoach(c);
      setAcademies(a);
      setPlayers(p);
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

      {/* Header card + quick action */}
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
      </div>
      {payoutError && <p className="text-red-400 text-xs mt-2 mb-3">{payoutError}</p>}

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
    </div>
  );
}
