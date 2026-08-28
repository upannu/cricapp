"use client";

import { useState, useEffect } from "react";
import { formatDate } from "@/lib/utils";
import { formatMoney } from "@/lib/currency";
import type { NormalizedInvoice } from "@/lib/stripe-invoices";

const STATUS_STYLES: Record<string, string> = {
  paid: "bg-pace-green/20 text-pace-green",
  open: "bg-amber/20 text-amber",
  void: "bg-zinc-700 text-zinc-400",
  uncollectible: "bg-fire/20 text-fire",
  unpaid: "bg-fire/20 text-fire",
};

export function InvoiceHistoryList({ scope, id }: { scope: "player" | "academy"; id: string }) {
  const [invoices, setInvoices] = useState<NormalizedInvoice[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setInvoices(null);
    setError("");
    fetch(`/api/stripe/invoices?${scope}Id=${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) { setError(data.error); setInvoices([]); return; }
        setInvoices(data.invoices ?? []);
      })
      .catch(() => { if (!cancelled) { setError("Could not load invoices."); setInvoices([]); } });
    return () => { cancelled = true; };
  }, [scope, id]);

  return (
    <div className="bg-surface rounded-2xl p-6 mb-6">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-5">Invoice History</h2>

      {invoices === null && <p className="text-zinc-500 text-sm">Loading invoices…</p>}

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {invoices !== null && invoices.length === 0 && !error && (
        <p className="text-zinc-500 text-sm">No invoices yet.</p>
      )}

      {invoices !== null && invoices.length > 0 && (
        <div className="space-y-1">
          {invoices.map((inv) => (
            <div key={`${inv.kind}:${inv.stripeId}`} className="flex flex-wrap items-center justify-between gap-3 py-2.5 border-b border-zinc-800 last:border-0">
              <div className="min-w-0">
                <div className="text-sm text-white font-medium truncate">{inv.description}</div>
                <div className="text-xs text-zinc-500">{formatDate(inv.date)}</div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${STATUS_STYLES[inv.status] ?? "bg-zinc-700 text-zinc-400"}`}>
                  {inv.status}
                </span>
                <span className="text-sm font-semibold text-white">{formatMoney(inv.amount, inv.currency)}</span>
                <a
                  href={`/api/stripe/invoices/download?${scope}Id=${id}&kind=${inv.kind}&stripeId=${inv.stripeId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold text-pace-green hover:underline"
                >
                  Download
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
