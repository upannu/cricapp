import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";

function serviceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** The Free plan's monthly session cap (admin-editable at /admin/plans) — looked up fresh here
 * rather than hardcoded, so a downgraded/cancelled subscriber gets whatever cap is currently set. */
async function freeSessionsLimit(supabase: ReturnType<typeof serviceClient>): Promise<number | null> {
  const { data } = await supabase.from("plans").select("sessions_per_month_limit").eq("slug", "free").maybeSingle();
  return data ? (data.sessions_per_month_limit as number | null) : 4;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret || webhookSecret.startsWith("REPLACE_ME")) {
    // Distinct from a signature-verification failure below — this means nobody has set
    // STRIPE_WEBHOOK_SECRET yet, not that a real secret was entered wrong.
    return NextResponse.json({ error: "Webhook not configured — set STRIPE_WEBHOOK_SECRET." }, { status: 500 });
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
      if (session.metadata?.type === "assessment_payment") {
        const assessmentPlayerId = session.metadata?.player_id;
        if (assessmentPlayerId) {
          const { data: p } = await supabase.from("players").select("assessment_credits").eq("id", assessmentPlayerId).single();
          await supabase.from("players").update({ assessment_credits: (p?.assessment_credits ?? 0) + 1 }).eq("id", assessmentPlayerId);
        }
        break;
      }
      if (session.metadata?.type === "library_subscription") {
        const libraryPlayerId = session.metadata?.player_id;
        if (libraryPlayerId && typeof session.subscription === "string") {
          const librarySub = await stripe.subscriptions.retrieve(session.subscription);
          await supabase.from("players").update({
            library_stripe_subscription_id: librarySub.id,
            library_subscription_status: librarySub.status,
          }).eq("id", libraryPlayerId);
        }
        break;
      }
      if (session.metadata?.type === "academy_subscription") {
        const academyId = session.metadata?.academy_id;
        const planId = session.metadata?.plan_id;
        if (academyId && typeof session.subscription === "string") {
          const academySub = await stripe.subscriptions.retrieve(session.subscription);

          // The board tier bills yearly but only grants a shorter AI-monitoring window per cycle
          // (access_duration_months) — everything else leaves access tied to subscription_status.
          let accessExpiresAt: string | null = null;
          if (planId) {
            const { data: plan } = await supabase.from("plans").select("access_duration_months").eq("id", planId).single();
            if (plan?.access_duration_months) {
              const expires = new Date();
              expires.setMonth(expires.getMonth() + plan.access_duration_months);
              accessExpiresAt = expires.toISOString();
            }
          }

          await supabase.from("academies").update({
            stripe_customer_id: typeof session.customer === "string" ? session.customer : undefined,
            stripe_subscription_id: academySub.id,
            subscription_status: academySub.status,
            plan_id: planId ?? null,
            access_expires_at: accessExpiresAt,
          }).eq("id", academyId);
        }
        break;
      }

      const playerId = session.metadata?.player_id ?? session.client_reference_id;
      if (!playerId || typeof session.subscription !== "string" || typeof session.customer !== "string") break;

      const subscription = await stripe.subscriptions.retrieve(session.subscription);
      const plan = subscription.metadata?.plan ?? session.metadata?.plan;

      await supabase.from("players").update({
        stripe_customer_id: session.customer,
        stripe_subscription_id: subscription.id,
        subscription_status: subscription.status,
        sub_plan: plan,
        sub_start_date: new Date(subscription.items.data[0].current_period_start * 1000).toISOString().split("T")[0],
        sub_end_date: new Date(subscription.items.data[0].current_period_end * 1000).toISOString().split("T")[0],
        sub_sessions_limit: null,
      }).eq("id", playerId);
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;

      if (subscription.metadata?.type === "library_subscription") {
        await supabase.from("players")
          .update({ library_subscription_status: subscription.status })
          .eq("library_stripe_subscription_id", subscription.id);
        break;
      }
      if (subscription.metadata?.type === "academy_subscription") {
        await supabase.from("academies")
          .update({ subscription_status: subscription.status })
          .eq("stripe_subscription_id", subscription.id);
        break;
      }

      const plan = subscription.metadata?.plan ?? null;
      const isActive = subscription.status === "active" || subscription.status === "trialing";

      await supabase.from("players").update({
        subscription_status: subscription.status,
        sub_end_date: new Date(subscription.items.data[0].current_period_end * 1000).toISOString().split("T")[0],
        ...(plan && isActive ? { sub_plan: plan, sub_sessions_limit: null } : {}),
        ...(!isActive ? { sub_plan: "Free", sub_sessions_limit: await freeSessionsLimit(supabase) } : {}),
      }).eq("stripe_subscription_id", subscription.id);
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;

      if (subscription.metadata?.type === "library_subscription") {
        await supabase.from("players")
          .update({ library_subscription_status: "canceled", library_stripe_subscription_id: null })
          .eq("library_stripe_subscription_id", subscription.id);
        break;
      }
      if (subscription.metadata?.type === "academy_subscription") {
        await supabase.from("academies")
          .update({ subscription_status: "canceled", stripe_subscription_id: null, plan_id: null, access_expires_at: null })
          .eq("stripe_subscription_id", subscription.id);
        break;
      }

      await supabase.from("players").update({
        sub_plan: "Free",
        subscription_status: "canceled",
        sub_sessions_limit: await freeSessionsLimit(supabase),
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
