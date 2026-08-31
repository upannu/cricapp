import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePlanPrice, formatMoney } from "@/lib/currency";

/** Looks up an academy's assigned org-level plan (the `plans` catalog — name, price, and its
 * free-text `included_notes`) and formats it the same way for every email that shows "what's
 * included" — the approval welcome email and the on-demand resend both call this, so the two can
 * never drift apart. */
export async function fetchAcademyPlanInfo(
  supabase: SupabaseClient,
  academyId: string,
): Promise<{ planName?: string; planLines: string[] }> {
  const { data: academyRow } = await supabase.from("academies").select("plan_id, currency").eq("id", academyId).maybeSingle();
  if (!academyRow?.plan_id) return { planLines: [] };

  const { data: planRow } = await supabase
    .from("plans")
    .select("name, price_aud, prices_by_currency, billing_interval, included_notes")
    .eq("id", academyRow.plan_id)
    .maybeSingle();
  if (!planRow) return { planLines: [] };

  const planLines: string[] = [];
  if (planRow.price_aud != null) {
    const { amount, currency } = resolvePlanPrice(planRow.price_aud, planRow.prices_by_currency, academyRow.currency);
    planLines.push(`${formatMoney(amount, currency)}${planRow.billing_interval ? ` / ${planRow.billing_interval}` : ""}`);
  }
  if (planRow.included_notes) planLines.push(planRow.included_notes);

  return { planName: planRow.name, planLines };
}
