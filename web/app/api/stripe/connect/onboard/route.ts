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
      // Accounts v1 (stripe.accounts.create) is no longer available for new Connect
      // integrations on this Stripe account — see AGENTS.md-level finding. Accounts v2's
      // "recipient" configuration is the replacement for a transfers-only Express-style
      // account: stripe_balance.stripe_transfers is v2's name for v1's `transfers`
      // capability. The resulting acct_... id is fully interoperable with v1 endpoints
      // (transfers.create destination, accounts.createLoginLink, the account.updated
      // webhook) per https://docs.stripe.com/connect/accounts-v2 — nothing downstream
      // of this needs to change.
      const account = await stripe.v2.core.accounts.create({
        contact_email: coach.email,
        dashboard: "express",
        identity: { country },
        configuration: {
          recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
        },
        // Required by Stripe whenever dashboard is "express": the platform (not Stripe)
        // bears Connect fees/losses on this account, matching v1 Express's actual
        // liability model — Stripe still collects onboarding requirements by default.
        defaults: { responsibilities: { fees_collector: "application", losses_collector: "application" } },
        metadata: { coach_id: coachId },
      });
      accountId = account.id;
      await supabase.from("coaches").update({ stripe_connect_account_id: accountId }).eq("id", coachId);
    }

    // Payout management (Set up payouts / View Payouts) lives inline on the coaches list
    // itself — there's no dedicated per-coach payouts page, so send both links back there.
    // Account Links is also a v2-only resource for a v2-created account (the v1
    // accountLinks.create call rejects a v2 account id).
    const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const accountLink = await stripe.v2.core.accountLinks.create({
      account: accountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          configurations: ["recipient"],
          refresh_url: `${origin}/coaches?refresh=1`,
          return_url: `${origin}/coaches?onboarding=return`,
        },
      },
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (err) {
    // Most commonly: Stripe Connect isn't enabled yet on this platform account (a one-time
    // dashboard step at dashboard.stripe.com/connect) — surface it clearly instead of a raw 500.
    const message = (err as { message?: string })?.message ?? "Could not start payout onboarding.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
