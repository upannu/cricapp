"use client";

import { Fragment, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/currency";

interface CurrencyTotals {
  currency: string;
  grossAud: number;
  stripeFeeAud: number;
  cashPendingAud: number;
  cashCollectedAud: number;
}

interface AcademyRow {
  academyId: string;
  academyName: string;
  totals: CurrencyTotals[];
}

interface MonthRow {
  month: string;
  totals: CurrencyTotals[];
}

interface FinanceSummary {
  overall: CurrencyTotals[];
  byAcademy: AcademyRow[];
  recentMonths: MonthRow[];
}

const EMPTY_SUMMARY: FinanceSummary = { overall: [], byAcademy: [], recentMonths: [] };

function formatMonth(month: string): string {
  // "2026-09" -> "Sep 2026" — avoids a timezone-sensitive Date parse of a bare year-month string.
  const [year, m] = month.split("-");
  const date = new Date(Number(year), Number(m) - 1, 1);
  return date.toLocaleDateString("en-AU", { month: "short", year: "numeric" });
}

export function FinanceClient() {
  const { user } = useAuth();
  const router = useRouter();
  const [summary, setSummary] = useState<FinanceSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (user && user.role !== "platform_admin") { router.replace("/players"); return; }
  }, [user, router]);

  useEffect(() => {
    fetch("/api/admin/finance-summary")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setSummary({ overall: data.overall ?? [], byAcademy: data.byAcademy ?? [], recentMonths: data.recentMonths ?? [] });
      })
      .catch((err) => setLoadError((err as { message?: string })?.message ?? String(err)))
      .finally(() => setLoading(false));
  }, []);

  if (!user || user.role !== "platform_admin") return null;

  const sortedAcademies = [...summary.byAcademy].sort((a, b) => {
    const aGross = a.totals.reduce((s, t) => s + t.grossAud, 0);
    const bGross = b.totals.reduce((s, t) => s + t.grossAud, 0);
    return bGross - aGross;
  });

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="font-display font-black uppercase text-2xl text-hp-paper tracking-wide mb-1">Finance</h1>
        <p className="text-hp-paper/45 text-sm">Marketplace revenue and platform fees, across every academy</p>
      </div>

      {loading ? (
        <div className="text-hp-paper/45 text-sm">Loading…</div>
      ) : loadError ? (
        <div className="text-red-400 text-sm">{loadError}</div>
      ) : summary.overall.length === 0 ? (
        <div className="bg-hp-surface p-16 text-center">
          <p className="text-hp-paper/45 text-sm">No marketplace payments or platform fees recorded yet.</p>
        </div>
      ) : (
        <>
          {/* One row of stat cards per currency the platform has actually seen — almost always
              just one, but never silently mixes two currencies into one meaningless sum. */}
          {summary.overall.map((t) => (
            <div key={t.currency} className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-hp-surface p-5">
                <div className="text-2xl font-bold text-hp-paper mb-1">{formatMoney(t.grossAud, t.currency)}</div>
                <div className="text-xs text-hp-paper/45">Marketplace revenue ({t.currency.toUpperCase()})</div>
              </div>
              <div className="bg-hp-surface p-5">
                <div className="text-2xl font-bold text-pace-green mb-1">
                  {formatMoney(t.stripeFeeAud + t.cashCollectedAud, t.currency)}
                </div>
                <div className="text-xs text-hp-paper/45">
                  Platform fee collected — {formatMoney(t.stripeFeeAud, t.currency)} via Stripe · {formatMoney(t.cashCollectedAud, t.currency)} cash
                </div>
              </div>
              <div className="bg-hp-surface p-5">
                <div className={`text-2xl font-bold mb-1 ${t.cashPendingAud > 0 ? "text-fire" : "text-hp-paper"}`}>
                  {formatMoney(t.cashPendingAud, t.currency)}
                </div>
                <div className="text-xs text-hp-paper/45">Outstanding (cash, not yet collected)</div>
              </div>
            </div>
          ))}

          {/* Recent months */}
          <div className="bg-hp-surface p-5 mb-6">
            <h2 className="text-xs font-mono font-semibold uppercase tracking-widest text-hp-paper/45 mb-4">Last 6 months</h2>
            {summary.recentMonths.length === 0 ? (
              <p className="text-hp-paper/45 text-sm">No activity yet.</p>
            ) : (
              <div className="space-y-2">
                {summary.recentMonths.map((row) => (
                  <div key={row.month} className="flex items-center justify-between text-sm">
                    <span className="text-hp-paper/70">{formatMonth(row.month)}</span>
                    <span className="text-hp-paper">
                      {row.totals.map((t) => (
                        <span key={t.currency} className="ml-4">
                          {formatMoney(t.grossAud, t.currency)}
                          <span className="text-hp-paper/45"> · {formatMoney(t.stripeFeeAud, t.currency)} fee</span>
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* By academy */}
          <div className="bg-hp-surface p-5">
            <h2 className="text-xs font-mono font-semibold uppercase tracking-widest text-hp-paper/45 mb-4">By academy</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-hp-paper/45 uppercase tracking-wider border-b border-white/8">
                    <th className="pb-2 pr-4">Academy</th>
                    <th className="pb-2 pr-4">Revenue</th>
                    <th className="pb-2 pr-4">Fee (Stripe)</th>
                    <th className="pb-2 pr-4">Fee (cash, collected)</th>
                    <th className="pb-2">Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAcademies.map((row) => (
                    <tr key={row.academyId} className="border-b border-white/8 last:border-0">
                      <td className="py-3 pr-4 text-hp-paper font-medium">{row.academyName}</td>
                      {row.totals.map((t) => (
                        <Fragment key={t.currency}>
                          <td className="py-3 pr-4 text-hp-paper">{formatMoney(t.grossAud, t.currency)}</td>
                          <td className="py-3 pr-4 text-hp-paper/70">{formatMoney(t.stripeFeeAud, t.currency)}</td>
                          <td className="py-3 pr-4 text-hp-paper/70">{formatMoney(t.cashCollectedAud, t.currency)}</td>
                          <td className={`py-3 ${t.cashPendingAud > 0 ? "text-fire" : "text-hp-paper/45"}`}>
                            {formatMoney(t.cashPendingAud, t.currency)}
                          </td>
                        </Fragment>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
