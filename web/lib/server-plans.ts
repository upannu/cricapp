import type { SupabaseClient } from "@supabase/supabase-js";

/** The Free plan's monthly session cap (admin-editable at /admin/plans) — looked up fresh so
 * every server-side place that creates or resets a Free-tier player gets whatever cap is
 * currently set, not a stale hardcoded number. Shared by the Stripe webhook's downgrade/cancel
 * paths and the public registration route; client-side creation flows (Academy, independent-
 * coach "+ Add Player") use the equivalent `sessionsLimitForPlan("Free", plans)` from
 * lib/plan-features.ts instead, since they already have the Plan Catalog fetched client-side. */
export async function freeSessionsLimit(supabase: SupabaseClient): Promise<number | null> {
  const { data } = await supabase.from("plans").select("sessions_per_month_limit").eq("slug", "free").maybeSingle();
  return data ? (data.sessions_per_month_limit as number | null) : 4;
}
