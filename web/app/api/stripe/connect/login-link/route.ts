import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

/** Deep-links a coach into their own Stripe Express dashboard for balance/payout history — Stripe's own compliant view, no custom payout ledger needed. */
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

  const role = user.user_metadata?.role;
  const ownCoachId = user.user_metadata?.coach_id as string | undefined;
  if (role === "coach" && ownCoachId !== coachId) {
    return NextResponse.json({ error: "You can only view your own payout account." }, { status: 403 });
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
    .select("stripe_connect_account_id, stripe_connect_onboarded")
    .eq("id", coachId)
    .single();
  if (coachError || !coach?.stripe_connect_account_id) {
    return NextResponse.json({ error: "This coach hasn't set up payouts yet." }, { status: 400 });
  }
  if (!coach.stripe_connect_onboarded) {
    return NextResponse.json({ error: "Payout onboarding isn't complete yet." }, { status: 400 });
  }

  const loginLink = await stripe.accounts.createLoginLink(coach.stripe_connect_account_id);
  return NextResponse.json({ url: loginLink.url });
}
