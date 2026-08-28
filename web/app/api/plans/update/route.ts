import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

interface PlanInput {
  id?: string;
  slug?: string;
  name?: string;
  audience?: string;
  billingType?: string;
  billingInterval?: string | null;
  priceAud?: number;
  seatCap?: number | null;
  accessDurationMonths?: number | null;
  includedNotes?: string | null;
  waivesSessionFees?: boolean;
  platformAdminOnly?: boolean;
  platformFeePercent?: number;
  active?: boolean;
  sortOrder?: number;
  sessionsPerMonthLimit?: number | null;
  chatMessagesPerDayLimit?: number | null;
  aiReportsEnabled?: boolean;
  marketplaceEnabled?: boolean;
}

export async function POST(request: Request) {
  const input = (await request.json()) as PlanInput;

  if (
    typeof input.slug !== "string" || !input.slug.trim() ||
    typeof input.name !== "string" || !input.name.trim() ||
    (input.audience !== "individual" && input.audience !== "organization") ||
    (input.billingType !== "subscription" && input.billingType !== "one_time") ||
    typeof input.priceAud !== "number" || !(input.priceAud >= 0)
  ) {
    return NextResponse.json({ error: "Slug, name, audience, billing type, and a non-negative price are required." }, { status: 400 });
  }
  if (input.billingType === "subscription" && input.billingInterval !== "month" && input.billingInterval !== "year") {
    return NextResponse.json({ error: "Subscription plans need a billing interval of month or year." }, { status: 400 });
  }
  if (input.billingType === "one_time" && input.billingInterval) {
    return NextResponse.json({ error: "One-time plans can't have a billing interval." }, { status: 400 });
  }
  if (input.platformFeePercent !== undefined && (typeof input.platformFeePercent !== "number" || input.platformFeePercent < 0 || input.platformFeePercent > 100)) {
    return NextResponse.json({ error: "Platform fee must be a percentage between 0 and 100." }, { status: 400 });
  }
  if (input.sessionsPerMonthLimit != null && (typeof input.sessionsPerMonthLimit !== "number" || input.sessionsPerMonthLimit < 0)) {
    return NextResponse.json({ error: "Sessions/month limit must be a non-negative number, or left blank for unlimited." }, { status: 400 });
  }
  if (input.chatMessagesPerDayLimit != null && (typeof input.chatMessagesPerDayLimit !== "number" || input.chatMessagesPerDayLimit < 0)) {
    return NextResponse.json({ error: "Chat messages/day limit must be a non-negative number, or left blank for unlimited." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user: caller } } = await authClient.auth.getUser();
  if (caller?.app_metadata?.role !== "platform_admin") {
    return NextResponse.json({ error: "Only a platform admin can change the plan catalog." }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const row: Record<string, unknown> = {
    slug: input.slug.trim(),
    name: input.name.trim(),
    audience: input.audience,
    billing_type: input.billingType,
    billing_interval: input.billingType === "subscription" ? input.billingInterval : null,
    price_aud: input.priceAud,
    seat_cap: input.seatCap ?? null,
    access_duration_months: input.accessDurationMonths ?? null,
    included_notes: input.includedNotes?.trim() || null,
    waives_session_fees: input.waivesSessionFees ?? false,
    platform_admin_only: input.platformAdminOnly ?? false,
    platform_fee_percent: input.platformFeePercent ?? 10,
    active: input.active ?? true,
    sort_order: input.sortOrder ?? 0,
    sessions_per_month_limit: input.sessionsPerMonthLimit ?? null,
    chat_messages_per_day_limit: input.chatMessagesPerDayLimit ?? null,
    ai_reports_enabled: input.aiReportsEnabled ?? true,
    marketplace_enabled: input.marketplaceEnabled ?? true,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    // A locked system plan (Free/Player Pro/Coach Pro) is looked up by slug elsewhere in the
    // codebase — never let its slug/audience/billing type drift, regardless of what the client sent.
    const { data: existing } = await supabase.from("plans").select("locked, slug, audience, billing_type, billing_interval").eq("id", input.id).maybeSingle();
    if (existing?.locked) {
      row.slug = existing.slug;
      row.audience = existing.audience;
      row.billing_type = existing.billing_type;
      row.billing_interval = existing.billing_interval;
    }
    const { error } = await supabase.from("plans").update(row).eq("id", input.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, id: input.id });
  }

  const { data, error } = await supabase.from("plans").insert(row).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, id: data.id });
}
