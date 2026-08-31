"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { fetchActivePlans } from "@/lib/db";
import type { Academy, Plan } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { InvoiceHistoryList } from "@/components/InvoiceHistoryList";
import { resolvePlanPrice, formatMoney } from "@/lib/currency";

export function AcademyBillingClient({ academy }: { academy: Academy }) {
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(academy.planId ?? null);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchActivePlans().then((p) => setPlans(p.filter((x) => x.audience === "organization"))).catch(() => {});
  }, []);

  // Hidden from the picker grid unless viewing as platform_admin — but the academy's *current*
  // plan (looked up from the unfiltered `plans` above) still needs to resolve correctly even if
  // it happens to be a platform-admin-only tier, so this filter is applied at render time only.
  const selectablePlans = plans.filter((p) => !p.platformAdminOnly || user?.role === "platform_admin");

  const canManage = user?.role === "platform_admin" || (user?.role === "academy_admin" && user.academyId === academy.id);

  const currentPlan = useMemo(() => plans.find((p) => p.id === academy.planId) ?? null, [plans, academy.planId]);
  const hasActiveSub = academy.subscriptionStatus === "active" || academy.subscriptionStatus === "trialing";
  const seatCount = academy.playerIds.length;

  async function handleCheckout() {
    if (!selectedPlanId) return;
    setError("");
    setRedirecting(true);
    try {
      const res = await fetch("/api/stripe/create-academy-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ academyId: academy.id, planId: selectedPlanId }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "Could not start checkout.");
      window.location.href = data.url;
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
      setRedirecting(false);
    }
  }

  async function handleManageBilling() {
    setError("");
    setRedirecting(true);
    try {
      const res = await fetch("/api/stripe/create-academy-portal-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ academyId: academy.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "Could not open billing portal.");
      window.location.href = data.url;
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
      setRedirecting(false);
    }
  }

  if (!canManage) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <p className="text-white font-semibold mb-2">Not available</p>
        <p className="text-zinc-400 text-sm">You don&apos;t have access to this academy&apos;s billing.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-6">
        <Link href="/academy" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors">
          ← Back to Academy
        </Link>
      </div>

      <h1 className="text-xl font-bold text-white mb-1">Academy Billing</h1>
      <p className="text-zinc-400 text-sm mb-6">{academy.name}</p>

      {/* Current plan status */}
      <div className={`rounded-2xl p-6 mb-6 border ${hasActiveSub ? "bg-pace-green/10 border-pace-green/30" : "bg-surface border-zinc-700"}`}>
        {currentPlan ? (
          <>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${hasActiveSub ? "bg-pace-green/20 text-pace-green" : "bg-zinc-700 text-zinc-300"}`}>
                {academy.subscriptionStatus ?? "inactive"}
              </span>
              <span className="text-white font-semibold">{currentPlan.name}</span>
            </div>
            <div className="text-sm text-zinc-400">
              {seatCount} / {currentPlan.seatCap ?? "∞"} bowlers assigned
            </div>
            {currentPlan.accessDurationMonths != null && (
              <div className="text-sm mt-2">
                {academy.accessExpiresAt ? (
                  new Date(academy.accessExpiresAt) > new Date() ? (
                    <span className="text-pace-green">AI monitoring active until {formatDate(academy.accessExpiresAt)}</span>
                  ) : (
                    <span className="text-amber">AI monitoring window ended {formatDate(academy.accessExpiresAt)} — contact us to renew.</span>
                  )
                ) : null}
              </div>
            )}
            {currentPlan.includedNotes && <p className="text-xs text-zinc-500 mt-2">{currentPlan.includedNotes}</p>}
            <div className="mt-3">
              <EmailPlanDetailsButton academyId={academy.id} />
            </div>
          </>
        ) : (
          <p className="text-zinc-400 text-sm">No active license — choose a plan below.</p>
        )}
      </div>

      {/* Plan selection */}
      <div className="bg-surface rounded-2xl p-6 mb-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-5">Available Licenses</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {selectablePlans.map((p) => {
            const isActive = selectedPlanId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPlanId(p.id)}
                className={`text-left p-5 rounded-xl border-2 transition-all cursor-pointer ${
                  isActive ? "border-pace-green bg-pace-green/10" : "border-zinc-700 hover:border-zinc-500 bg-ink"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className={`text-sm font-bold ${isActive ? "text-pace-green" : "text-white"}`}>{p.name}</span>
                  {isActive && <span className="text-pace-green text-sm font-bold flex-shrink-0">✓</span>}
                </div>
                <div className="text-lg font-bold text-white mb-2">
                  {(() => {
                    const { amount, currency } = resolvePlanPrice(p.priceAud, p.pricesByCurrency, academy.currency);
                    return `${formatMoney(amount, currency)} / ${p.billingInterval}`;
                  })()}
                </div>
                <div className="text-xs text-zinc-400 mb-2">Up to {p.seatCap} bowlers</div>
                {p.accessDurationMonths != null && (
                  <div className="text-xs text-amber mb-2">{p.accessDurationMonths}-month monitoring window per cycle</div>
                )}
                {p.includedNotes && <div className="text-xs text-zinc-500">{p.includedNotes}</div>}
              </button>
            );
          })}
        </div>
        {selectablePlans.length === 0 && <p className="text-zinc-500 text-sm">No organization plans configured yet.</p>}
      </div>

      <InvoiceHistoryList scope="academy" id={academy.id} />

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {hasActiveSub ? (
          <button
            type="button"
            onClick={handleManageBilling}
            disabled={redirecting}
            className="px-6 py-3 rounded-xl text-sm font-bold bg-pace-green text-black hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60"
          >
            {redirecting ? "Redirecting…" : "Manage Billing"}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleCheckout}
            disabled={redirecting || !selectedPlanId}
            className="px-6 py-3 rounded-xl text-sm font-bold bg-pace-green text-black hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60"
          >
            {redirecting ? "Redirecting…" : "Subscribe"}
          </button>
        )}
      </div>
    </div>
  );
}

function EmailPlanDetailsButton({ academyId }: { academyId: string }) {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<"sent" | "error" | null>(null);
  const [error, setError] = useState("");

  async function handleClick() {
    setSending(true);
    setResult(null);
    setError("");
    try {
      const res = await fetch("/api/send-plan-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ academyId }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed to send.");
      setResult("sent");
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
      setResult("error");
    } finally {
      setSending(false);
      setTimeout(() => setResult(null), 4000);
    }
  }

  if (result === "sent") {
    return <span className="text-xs font-semibold text-pace-green">✓ Plan details emailed</span>;
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={sending}
        className="px-3 py-1.5 text-xs font-semibold text-pace-green border border-pace-green/30 rounded-lg hover:bg-pace-green/10 transition-colors cursor-pointer disabled:opacity-60"
        title="Send an email summarising this plan's inclusions — useful if someone asks again after signup"
      >
        {sending ? "Sending…" : "📧 Email Plan Details"}
      </button>
      {result === "error" && <p className="text-[10px] text-red-400 mt-1">{error}</p>}
    </div>
  );
}
