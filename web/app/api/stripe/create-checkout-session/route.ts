import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { stripe, isPaidPlan, priceIdForPlan } from "@/lib/stripe";

export async function POST(request: Request) {
  const { playerId, plan } = (await request.json()) as { playerId?: string; plan?: string };
  if (!playerId || !plan || !isPaidPlan(plan)) {
    return NextResponse.json({ error: "playerId and a valid plan are required." }, { status: 400 });
  }

  // Identify the caller from their session cookie — never trust a client-supplied playerId alone
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const role = user.user_metadata?.role;
  const ownPlayerId = user.user_metadata?.player_id as string | undefined;
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

  const origin = new URL(request.url).origin;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceIdForPlan(plan), quantity: 1 }],
    client_reference_id: playerId,
    subscription_data: { metadata: { player_id: playerId, plan } },
    metadata: { player_id: playerId, plan },
    success_url: `${origin}/players/${playerId}/subscription?checkout=success`,
    cancel_url: `${origin}/players/${playerId}/subscription?checkout=cancelled`,
  });

  return NextResponse.json({ url: session.url });
}
