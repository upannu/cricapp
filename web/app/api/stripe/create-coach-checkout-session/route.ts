import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { resolvePlanPrice } from "@/lib/currency";

/** A coach's own Coach Pro subscription — separate from a player's Free/Player Pro (lib/types.ts
 * Coach.subPlan) and from an academy's org-level plan. Priced from the same `coach-pro` Plan
 * Catalog row the player-facing checkout used to consume before Coach Pro was repurposed to be
 * coach-only (create-checkout-session). Only meaningful for an independent coach — one who
 * belongs to an academy has no reason to pay for this themselves. */
export async function POST(request: Request) {
  const { coachId } = (await request.json()) as { coachId?: string };
  if (!coachId) return NextResponse.json({ error: "coachId is required." }, { status: 400 });

  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const role = user.app_metadata?.role;
  const ownCoachId = user.app_metadata?.coach_id as string | undefined;
  if (role !== "platform_admin" && !(role === "coach" && ownCoachId === coachId)) {
    return NextResponse.json({ error: "You can only manage your own subscription." }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: coach, error: coachError } = await supabase
    .from("coaches")
    .select("id, name, email, stripe_customer_id, currency")
    .eq("id", coachId)
    .single();
  if (coachError || !coach) {
    return NextResponse.json({ error: "Coach not found." }, { status: 404 });
  }

  const { data: planRow, error: planError } = await supabase
    .from("plans")
    .select("price_aud, prices_by_currency, billing_interval")
    .eq("slug", "coach-pro")
    .single();
  if (planError || !planRow) {
    return NextResponse.json({ error: "Pricing is not configured." }, { status: 500 });
  }
  const { amount: price, currency: billCurrency } = resolvePlanPrice(
    planRow.price_aud, planRow.prices_by_currency, coach.currency,
  );
  const interval = (planRow.billing_interval as "month" | "year" | null) ?? "month";

  try {
    let customerId = coach.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: coach.email,
        name: coach.name,
        metadata: { coach_id: coachId },
      });
      customerId = customer.id;
      await supabase.from("coaches").update({ stripe_customer_id: customerId }).eq("id", coachId);
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{
        price_data: {
          currency: billCurrency,
          unit_amount: Math.round(price * 100),
          recurring: { interval },
          product_data: { name: "Coach Pro" },
        },
        quantity: 1,
      }],
      client_reference_id: coachId,
      subscription_data: { metadata: { coach_id: coachId, type: "coach_subscription" } },
      metadata: { coach_id: coachId, type: "coach_subscription" },
      success_url: `${origin}/coach/subscription?checkout=success`,
      cancel_url: `${origin}/coach/subscription?checkout=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = (err as { message?: string })?.message ?? "Could not start checkout.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
