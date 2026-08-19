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
  active?: boolean;
  sortOrder?: number;
}

export async function POST(request: Request) {
  const input = (await request.json()) as PlanInput;

  if (
    typeof input.slug !== "string" || !input.slug.trim() ||
    typeof input.name !== "string" || !input.name.trim() ||
    (input.audience !== "individual" && input.audience !== "organization") ||
    (input.billingType !== "subscription" && input.billingType !== "one_time") ||
    typeof input.priceAud !== "number" || !(input.priceAud > 0)
  ) {
    return NextResponse.json({ error: "Slug, name, audience, billing type, and a positive price are required." }, { status: 400 });
  }
  if (input.billingType === "subscription" && input.billingInterval !== "month" && input.billingInterval !== "year") {
    return NextResponse.json({ error: "Subscription plans need a billing interval of month or year." }, { status: 400 });
  }
  if (input.billingType === "one_time" && input.billingInterval) {
    return NextResponse.json({ error: "One-time plans can't have a billing interval." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user: caller } } = await authClient.auth.getUser();
  if (caller?.user_metadata?.role !== "platform_admin") {
    return NextResponse.json({ error: "Only a platform admin can change the plan catalog." }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const row = {
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
    active: input.active ?? true,
    sort_order: input.sortOrder ?? 0,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { error } = await supabase.from("plans").update(row).eq("id", input.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, id: input.id });
  }

  const { data, error } = await supabase.from("plans").insert(row).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, id: data.id });
}
