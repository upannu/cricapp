import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const { coachId } = (await request.json()) as { coachId?: string };
  if (!coachId) {
    return NextResponse.json({ error: "coachId is required." }, { status: 400 });
  }

  // Identify the caller from their session cookie — never trust a client-supplied coachId alone
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
    return NextResponse.json({ error: "You can only manage your own payout account." }, { status: 403 });
  }
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
    .select("id, name, email, academy_id, stripe_connect_account_id")
    .eq("id", coachId)
    .single();
  if (coachError || !coach) {
    return NextResponse.json({ error: "Coach not found." }, { status: 404 });
  }

  try {
    let accountId = coach.stripe_connect_account_id as string | null;
    if (!accountId) {
      // The connected account's payout currency is tied to its country and can't be changed
      // later — resolve it from the coach's academy (see lib/currency.ts) so payouts land in the
      // right currency from day one. An unaffiliated coach defaults to AU.
      let country = "AU";
      if (coach.academy_id) {
        const { data: academy } = await supabase.from("academies").select("country").eq("id", coach.academy_id).maybeSingle();
        country = academy?.country ?? "AU";
      }
      const account = await stripe.accounts.create({
        type: "express",
        country,
        email: coach.email,
        capabilities: { transfers: { requested: true } },
        metadata: { coach_id: coachId },
      });
      accountId = account.id;
      await supabase.from("coaches").update({ stripe_connect_account_id: accountId }).eq("id", coachId);
    }

    // Payout management (Set up payouts / View Payouts) lives inline on the coaches list
    // itself — there's no dedicated per-coach payouts page, so send both links back there.
    const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/coaches?refresh=1`,
      return_url: `${origin}/coaches?onboarding=return`,
      type: "account_onboarding",
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (err) {
    // Most commonly: Stripe Connect isn't enabled yet on this platform account (a one-time
    // dashboard step at dashboard.stripe.com/connect) — surface it clearly instead of a raw 500.
    const message = (err as { message?: string })?.message ?? "Could not start payout onboarding.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
