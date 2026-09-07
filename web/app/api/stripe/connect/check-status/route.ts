import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

/** Actively reconciles a coach's real Stripe Connect status instead of waiting on a webhook.
 * Every payout account is created via `stripe.v2.core.accounts.create` (connect/onboard/route.ts)
 * — and a v2-created account's capability changes are delivered as v2 thin events
 * (`v2.core.account[requirements].updated`), never the classic v1 `account.updated` event this
 * app's webhook handler listens for. Confirmed empirically: zero `account.updated` events exist,
 * ever, for an account created this way — so `stripe_connect_onboarded` could never update on its
 * own no matter how long anyone waited. Called from CoachesClient right when a coach lands back
 * on /coaches?onboarding=return, so the page can reflect reality immediately instead of the old
 * "wait a few minutes and refresh," which — for this exact reason — never actually resolved
 * itself. */
export async function POST(request: Request) {
  const { coachId } = (await request.json()) as { coachId?: string };
  if (!coachId) {
    return NextResponse.json({ error: "coachId is required." }, { status: 400 });
  }

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
  const isStaff = role === "platform_admin" || role === "academy_admin";
  if (role === "coach" && ownCoachId !== coachId) {
    return NextResponse.json({ error: "You can only check your own payout account." }, { status: 403 });
  }
  // Mirrors the same guard connect/onboard and connect/login-link already have — without it, a
  // player/parent (or anyone with no relationship to this coach at all) falls straight through.
  if (!isStaff && role !== "coach") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
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
    .select("stripe_connect_account_id")
    .eq("id", coachId)
    .single();
  if (coachError || !coach?.stripe_connect_account_id) {
    return NextResponse.json({ error: "This coach hasn't started payout setup." }, { status: 400 });
  }

  try {
    // A v1-shaped retrieve still works against a v2-created account id (Stripe's own Accounts v2
    // docs: "the response is structured as a v1 Account") — charges_enabled/payouts_enabled is
    // the exact same formula the (unreachable, for this account shape) account.updated webhook
    // handler already uses, kept identical deliberately.
    const account = await stripe.accounts.retrieve(coach.stripe_connect_account_id);
    const onboarded = !!account.charges_enabled && !!account.payouts_enabled;
    await supabase.from("coaches").update({ stripe_connect_onboarded: onboarded }).eq("id", coachId);
    return NextResponse.json({ onboarded });
  } catch (err) {
    const message = (err as { message?: string })?.message ?? "Could not check payout status.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
