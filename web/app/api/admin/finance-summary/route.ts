import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCaller } from "@/lib/server-auth";
import { DEFAULT_CURRENCY, isSupportedCurrency } from "@/lib/currency";

/** One currency's worth of totals — kept as raw numbers, never pre-formatted, so the page layer
 * (phase 3) does its own formatMoney()/sumMoneyByCurrency() work rather than parsing a string
 * back apart. Most academies will only ever produce one currency bucket; the array shape exists
 * so a platform spanning more than one doesn't silently mix them into a meaningless single sum. */
interface CurrencyTotals {
  currency: string;
  grossAud: number;
  stripeFeeAud: number;
  cashPendingAud: number;
  cashCollectedAud: number;
}

function emptyTotals(currency: string): CurrencyTotals {
  return { currency, grossAud: 0, stripeFeeAud: 0, cashPendingAud: 0, cashCollectedAud: 0 };
}

function bump(
  map: Map<string, CurrencyTotals>,
  currency: string,
  field: Exclude<keyof CurrencyTotals, "currency">,
  amount: number,
) {
  const totals = map.get(currency) ?? emptyTotals(currency);
  totals[field] += amount;
  map.set(currency, totals);
}

/** GET-only, platform_admin-only summary combining the two revenue sources: the
 * platform_revenue_events ledger (Stripe-auto-collected marketplace fees — see the webhook's
 * recordRevenueEvent) and the cash/bank-transfer pack_fee_dues/booking_fee_dues tables (pending vs
 * manually-collected). Neither source alone tells the whole story — this is the one place that
 * combines them. Subscription revenue (coach/academy/library) is deliberately out of scope; the
 * ledger's `type` column already supports it for whenever that's added. */
export async function GET() {
  const caller = await getCaller();
  if (caller?.role !== "platform_admin") {
    return NextResponse.json({ error: "Only a platform admin can view this." }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const [{ data: revenueEvents }, { data: packFeeDues }, { data: bookingFeeDues }, { data: academies }] = await Promise.all([
    supabase.from("platform_revenue_events")
      .select("academy_id, amount_aud, platform_fee_aud, currency, created_at")
      .in("type", ["pack_payment", "booking_payment"]),
    supabase.from("pack_fee_dues").select("academy_id, amount_aud, status"),
    supabase.from("booking_fee_dues").select("academy_id, amount_aud, status"),
    supabase.from("academies").select("id, name, currency"),
  ]);

  // pack_fee_dues/booking_fee_dues don't store their own currency — only platform_revenue_events
  // does (captured at payment time, so it can never drift from an academy's currency changing
  // later). For the older cash-ledger tables, resolve currency from the academy the same way
  // SessionPacksClient's own stat cards already do.
  const academyCurrency = new Map<string, string>();
  const academyName = new Map<string, string>();
  for (const a of academies ?? []) {
    academyCurrency.set(a.id, isSupportedCurrency(a.currency) ? a.currency : DEFAULT_CURRENCY);
    academyName.set(a.id, a.name);
  }
  function currencyForAcademy(academyId: string | null): string {
    return (academyId && academyCurrency.get(academyId)) || DEFAULT_CURRENCY;
  }

  const overall = new Map<string, CurrencyTotals>();
  const byAcademy = new Map<string, Map<string, CurrencyTotals>>();
  const byMonth = new Map<string, Map<string, CurrencyTotals>>();

  function academyBucket(academyId: string): Map<string, CurrencyTotals> {
    let bucket = byAcademy.get(academyId);
    if (!bucket) { bucket = new Map(); byAcademy.set(academyId, bucket); }
    return bucket;
  }
  function monthBucket(month: string): Map<string, CurrencyTotals> {
    let bucket = byMonth.get(month);
    if (!bucket) { bucket = new Map(); byMonth.set(month, bucket); }
    return bucket;
  }

  for (const event of revenueEvents ?? []) {
    const currency = isSupportedCurrency(event.currency) ? event.currency : DEFAULT_CURRENCY;
    bump(overall, currency, "grossAud", event.amount_aud);
    bump(overall, currency, "stripeFeeAud", event.platform_fee_aud ?? 0);
    if (event.academy_id) {
      bump(academyBucket(event.academy_id), currency, "grossAud", event.amount_aud);
      bump(academyBucket(event.academy_id), currency, "stripeFeeAud", event.platform_fee_aud ?? 0);
    }
    const month = (event.created_at ?? "").slice(0, 7);
    if (month) {
      bump(monthBucket(month), currency, "grossAud", event.amount_aud);
      bump(monthBucket(month), currency, "stripeFeeAud", event.platform_fee_aud ?? 0);
    }
  }

  for (const due of [...(packFeeDues ?? []), ...(bookingFeeDues ?? [])]) {
    const currency = currencyForAcademy(due.academy_id);
    const field = due.status === "collected" ? "cashCollectedAud" : "cashPendingAud";
    bump(overall, currency, field, due.amount_aud);
    if (due.academy_id) bump(academyBucket(due.academy_id), currency, field, due.amount_aud);
  }

  return NextResponse.json({
    overall: Array.from(overall.values()),
    byAcademy: Array.from(byAcademy.entries()).map(([academyId, totalsByCurrency]) => ({
      academyId,
      academyName: academyName.get(academyId) ?? "Unknown academy",
      totals: Array.from(totalsByCurrency.values()),
    })),
    recentMonths: Array.from(byMonth.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 6)
      .map(([month, totalsByCurrency]) => ({ month, totals: Array.from(totalsByCurrency.values()) })),
  });
}
