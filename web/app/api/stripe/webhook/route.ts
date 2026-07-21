import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe, planForPriceId } from "@/lib/stripe";

function serviceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    return NextResponse.json({ error: `Signature verification failed: ${(err as Error).message}` }, { status: 400 });
  }

  const supabase = serviceClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.metadata?.type === "pack_payment") {
        const packId = session.metadata?.pack_id;
        if (packId) {
          await supabase.from("session_packs").update({ payment_status: "Paid" }).eq("id", packId);
        }
        break;
      }
      if (session.metadata?.type === "booking_payment") {
        const bookingId = session.metadata?.booking_id;
        if (bookingId) {
          await supabase.from("bookings").update({ payment_status: "Paid" }).eq("id", bookingId);
        }
        break;
      }

      const playerId = session.metadata?.player_id ?? session.client_reference_id;
      if (!playerId || typeof session.subscription !== "string" || typeof session.customer !== "string") break;

      const subscription = await stripe.subscriptions.retrieve(session.subscription);
      const priceId = subscription.items.data[0]?.price.id;
      const plan = (priceId && planForPriceId(priceId)) ?? session.metadata?.plan;

      await supabase.from("players").update({
        stripe_customer_id: session.customer,
        stripe_subscription_id: subscription.id,
        subscription_status: subscription.status,
        sub_plan: plan,
        sub_start_date: new Date(subscription.items.data[0].current_period_start * 1000).toISOString(),
        sub_end_date: new Date(subscription.items.data[0].current_period_end * 1000).toISOString(),
        sub_sessions_limit: null,
      }).eq("id", playerId);
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const priceId = subscription.items.data[0]?.price.id;
      const plan = priceId ? planForPriceId(priceId) : null;
      const isActive = subscription.status === "active" || subscription.status === "trialing";

      await supabase.from("players").update({
        subscription_status: subscription.status,
        sub_end_date: new Date(subscription.items.data[0].current_period_end * 1000).toISOString(),
        ...(plan && isActive ? { sub_plan: plan, sub_sessions_limit: null } : {}),
        ...(!isActive ? { sub_plan: "Free", sub_sessions_limit: 4 } : {}),
      }).eq("stripe_subscription_id", subscription.id);
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await supabase.from("players").update({
        sub_plan: "Free",
        subscription_status: "canceled",
        sub_sessions_limit: 4,
        stripe_subscription_id: null,
      }).eq("stripe_subscription_id", subscription.id);
      break;
    }

    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      const onboarded = !!account.charges_enabled && !!account.payouts_enabled;
      await supabase.from("coaches").update({ stripe_connect_onboarded: onboarded }).eq("stripe_connect_account_id", account.id);
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoice.parent?.subscription_details?.subscription;
      const id = typeof subscriptionId === "string" ? subscriptionId : subscriptionId?.id;
      if (id) {
        await supabase.from("players").update({ subscription_status: "past_due" }).eq("stripe_subscription_id", id);
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
