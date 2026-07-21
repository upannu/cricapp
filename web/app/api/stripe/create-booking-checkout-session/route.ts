import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

/**
 * Booking revenue belongs to the academy, same as packs (the booking UI already shows "Academy
 * keeps 90%") — so this pays out to the booked coach's academy's head coach, not the booked coach
 * directly. Individual coaches are staff; the academy is the financial party in this product.
 */
export async function POST(request: Request) {
  const { bookingId } = (await request.json()) as { bookingId?: string };
  if (!bookingId) {
    return NextResponse.json({ error: "bookingId is required." }, { status: 400 });
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

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, player_id, coach_id, type, fee_aud, pack_id, payment_status")
    .eq("id", bookingId)
    .single();
  if (bookingError || !booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }
  if ((role === "player" || role === "parent") && ownPlayerId !== booking.player_id) {
    return NextResponse.json({ error: "You can only pay for your own booking." }, { status: 403 });
  }
  if (!isStaff && role !== "player" && role !== "parent") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  if (booking.pack_id) {
    return NextResponse.json({ error: "This booking is already covered by a session pack." }, { status: 400 });
  }
  if (booking.payment_status === "Paid") {
    return NextResponse.json({ error: "This booking is already paid." }, { status: 400 });
  }
  if (!booking.fee_aud || booking.fee_aud <= 0) {
    return NextResponse.json({ error: "This booking has no fee to collect." }, { status: 400 });
  }

  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("id, name, email, stripe_customer_id")
    .eq("id", booking.player_id)
    .single();
  if (playerError || !player) {
    return NextResponse.json({ error: "Player not found." }, { status: 404 });
  }

  const { data: coach, error: coachError } = await supabase
    .from("coaches")
    .select("id, name, academy_id")
    .eq("id", booking.coach_id)
    .single();
  if (coachError || !coach) {
    return NextResponse.json({ error: "Coach not found." }, { status: 404 });
  }

  const { data: academy, error: academyError } = await supabase
    .from("academies")
    .select("id, name, head_coach_id")
    .eq("id", coach.academy_id)
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

    const totalCents = Math.round(booking.fee_aud * 100);
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
            name: `${booking.type} with ${coach.name}`,
          },
        },
        quantity: 1,
      }],
      payment_intent_data: {
        application_fee_amount: platformFeeCents,
        transfer_data: { destination: headCoach.stripe_connect_account_id },
      },
      metadata: { type: "booking_payment", booking_id: bookingId },
      success_url: `${origin}/bookings?checkout=success`,
      cancel_url: `${origin}/bookings?checkout=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = (err as { message?: string })?.message ?? "Could not start checkout.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
