import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { resolvePlanPrice } from "@/lib/currency";

export async function POST(request: Request) {
  const { playerId } = (await request.json()) as { playerId?: string };
  if (!playerId) return NextResponse.json({ error: "playerId is required." }, { status: 400 });

  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const role = user.app_metadata?.role;
  const ownPlayerId = user.app_metadata?.player_id as string | undefined;
  const isStaff = role === "platform_admin" || role === "academy_admin" || role === "coach";
  if ((role === "player" || role === "parent") && ownPlayerId !== playerId) {
    return NextResponse.json({ error: "You can only buy an assessment for your own profile." }, { status: 403 });
  }
  // The check above only rejects a *mismatched* player/parent — without this, any other role
  // falls straight through with no check and can start a real checkout for an arbitrary
  // playerId. Matches the same isStaff allow-list used across the other Stripe routes.
  if (!isStaff && role !== "player" && role !== "parent") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("id, name, email, stripe_customer_id, currency")
    .eq("id", playerId)
    .single();
  if (playerError || !player) {
    return NextResponse.json({ error: "Player not found." }, { status: 404 });
  }

  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("id, name, price_aud, prices_by_currency, active")
    .eq("slug", "individual-assessment")
    .single();
  if (planError || !plan || !plan.active) {
    return NextResponse.json({ error: "Individual assessments aren't available right now." }, { status: 500 });
  }
  const { amount: price, currency: billCurrency } = resolvePlanPrice(plan.price_aud, plan.prices_by_currency, player.currency);

  try {
    let customerId = player.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: player.email,
        name: player.name,
        metadata: { player_id: playerId },
      });
      customerId = customer.id;
      await supabase.from("players").update({ stripe_customer_id: customerId }).eq("id", playerId);
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [{
        price_data: {
          currency: billCurrency,
          unit_amount: Math.round(price * 100),
          product_data: { name: plan.name, description: "One-time AI biomechanics assessment credit" },
        },
        quantity: 1,
      }],
      metadata: { type: "assessment_payment", player_id: playerId },
      success_url: `${origin}/players/${playerId}/subscription?checkout=success`,
      cancel_url: `${origin}/players/${playerId}/subscription?checkout=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = (err as { message?: string })?.message ?? "Could not start checkout.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
