import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const { coachId } = (await request.json()) as { coachId?: string };
  if (!coachId) return NextResponse.json({ error: "coachId is required." }, { status: 400 });

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
  if (role !== "platform_admin" && !(role === "coach" && ownCoachId === coachId)) {
    return NextResponse.json({ error: "You can only manage your own subscription." }, { status: 403 });
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
    .select("stripe_customer_id")
    .eq("id", coachId)
    .single();
  if (coachError || !coach?.stripe_customer_id) {
    return NextResponse.json({ error: "No billing account yet — subscribe to a paid plan first." }, { status: 400 });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: coach.stripe_customer_id,
    return_url: `${origin}/coach/subscription`,
  });

  return NextResponse.json({ url: portalSession.url });
}
