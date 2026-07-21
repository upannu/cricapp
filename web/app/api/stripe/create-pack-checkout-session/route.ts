import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

/**
 * Pack revenue belongs to the academy (the pack UI already shows "Academy keeps 90%"), and an
 * Academy has no email/bank-account concept of its own — so the payout destination is the
 * academy's head coach's Connect account, reusing the same onboarding as the booking marketplace.
 */
export async function POST(request: Request) {
  const { packId } = (await request.json()) as { packId?: string };
  if (!packId) {
    return NextResponse.json({ error: "packId is required." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const role = user.user_metadata?.role as string | undefined;
  const ownPlayerId = user.user_metadata?.player_id as string | undefined;
  const isStaff = role === "platform_admin" || role === "academy_admin" || role === "coach";

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: pack, error: packError } = await supabase
    .from("session_packs")
    .select("id, player_id, academy_id, session_type, total_sessions, fee_per_session, payment_status")
    .eq("id", packId)
    .single();
  if (packError || !pack) {
    return NextResponse.json({ error: "Pack not found." }, { status: 404 });
  }
  if ((role === "player" || role === "parent") && ownPlayerId !== pack.player_id) {
    return NextResponse.json({ error: "You can only pay for your own pack." }, { status: 403 });
  }
  if (!isStaff && role !== "player" && role !== "parent") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  if (pack.payment_status === "Paid") {
    return NextResponse.json({ error: "This pack is already paid." }, { status: 400 });
  }

  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("id, name, email, stripe_customer_id")
    .eq("id", pack.player_id)
    .single();
  if (playerError || !player) {
    return NextResponse.json({ error: "Player not found." }, { status: 404 });
  }

  const { data: academy, error: academyError } = await supabase
    .from("academies")
    .select("id, name, head_coach_id")
    .eq("id", pack.academy_id)
    .single();
  if (academyError || !academy?.head_coach_id) {
    return NextResponse.json({ error: "This academy has no head coach assigned to receive payouts." }, { status: 400 });
  }

  const { data: headCoach, error: headCoachError } = await supabase
    .from("coaches")
    .select("id, stripe_connect_account_id, stripe_connect_onboarded")
    .eq("id", academy.head_coach_id)
    .single();
  if (headCoachError || !headCoach?.stripe_connect_account_id || !headCoach.stripe_connect_onboarded) {
    return NextResponse.json({ error: `${academy.name}'s head coach hasn't finished setting up payouts yet.` }, { status: 400 });
  }

  try {
    let customerId = player.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: player.email,
        name: player.name,
        metadata: { player_id: player.id },
      });
      customerId = customer.id;
      await supabase.from("players").update({ stripe_customer_id: customerId }).eq("id", player.id);
    }

    const totalAud = pack.total_sessions * pack.fee_per_session;
    const totalCents = Math.round(totalAud * 100);
    const platformFeeCents = Math.round(totalCents * 0.10);

    const origin = new URL(request.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [{
        price_data: {
          currency: "aud",
          unit_amount: totalCents,
          product_data: {
            name: `${pack.total_sessions}-session pack — ${pack.session_type}`,
            description: `${academy.name}`,
          },
        },
        quantity: 1,
      }],
      payment_intent_data: {
        application_fee_amount: platformFeeCents,
        transfer_data: { destination: headCoach.stripe_connect_account_id },
      },
      metadata: { type: "pack_payment", pack_id: packId },
      success_url: `${origin}/session-packs?checkout=success`,
      cancel_url: `${origin}/session-packs?checkout=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = (err as { message?: string })?.message ?? "Could not start checkout.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
