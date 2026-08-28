import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

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
  if ((role === "player" || role === "parent") && ownPlayerId !== playerId) {
    return NextResponse.json({ error: "You can only manage your own subscription." }, { status: 403 });
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
    .select("id, name, email, stripe_customer_id")
    .eq("id", playerId)
    .single();
  if (playerError || !player) {
    return NextResponse.json({ error: "Player not found." }, { status: 404 });
  }

  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("id, name, price_aud, billing_interval, active")
    .eq("slug", "library")
    .single();
  if (planError || !plan || !plan.active) {
    return NextResponse.json({ error: "Library access isn't available right now." }, { status: 500 });
  }

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
      mode: "subscription",
      customer: customerId,
      line_items: [{
        price_data: {
          currency: "aud",
          unit_amount: Math.round(plan.price_aud * 100),
          recurring: { interval: (plan.billing_interval as "month" | "year") ?? "month" },
          product_data: { name: plan.name },
        },
        quantity: 1,
      }],
      client_reference_id: playerId,
      subscription_data: { metadata: { type: "library_subscription", player_id: playerId } },
      metadata: { type: "library_subscription", player_id: playerId },
      success_url: `${origin}/players/${playerId}/subscription?checkout=success`,
      cancel_url: `${origin}/players/${playerId}/subscription?checkout=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = (err as { message?: string })?.message ?? "Could not start checkout.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
