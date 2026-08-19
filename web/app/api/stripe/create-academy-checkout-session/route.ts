import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const { academyId, planId } = (await request.json()) as { academyId?: string; planId?: string };
  if (!academyId || !planId) {
    return NextResponse.json({ error: "academyId and planId are required." }, { status: 400 });
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
  const ownAcademyId = user.user_metadata?.academy_id as string | undefined;
  if (role !== "platform_admin" && !(role === "academy_admin" && ownAcademyId === academyId)) {
    return NextResponse.json({ error: "You can only manage billing for your own academy." }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: academy, error: academyError } = await supabase
    .from("academies")
    .select("id, name, head_coach_id, stripe_customer_id")
    .eq("id", academyId)
    .single();
  if (academyError || !academy) {
    return NextResponse.json({ error: "Academy not found." }, { status: 404 });
  }

  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("id, name, audience, price_aud, billing_interval, active")
    .eq("id", planId)
    .single();
  if (planError || !plan || !plan.active || plan.audience !== "organization") {
    return NextResponse.json({ error: "That plan isn't available." }, { status: 400 });
  }

  try {
    let customerId = academy.stripe_customer_id as string | null;
    if (!customerId) {
      let contactEmail: string | undefined;
      if (academy.head_coach_id) {
        const { data: headCoach } = await supabase.from("coaches").select("email").eq("id", academy.head_coach_id).single();
        contactEmail = headCoach?.email ?? undefined;
      }
      const customer = await stripe.customers.create({
        name: academy.name,
        email: contactEmail,
        metadata: { academy_id: academyId },
      });
      customerId = customer.id;
      await supabase.from("academies").update({ stripe_customer_id: customerId }).eq("id", academyId);
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{
        price_data: {
          currency: "aud",
          unit_amount: Math.round(plan.price_aud * 100),
          recurring: { interval: (plan.billing_interval as "month" | "year") ?? "month" },
          product_data: { name: plan.name },
        },
        quantity: 1,
      }],
      subscription_data: { metadata: { type: "academy_subscription", academy_id: academyId, plan_id: planId } },
      metadata: { type: "academy_subscription", academy_id: academyId, plan_id: planId },
      success_url: `${origin}/academies/${academyId}/billing?checkout=success`,
      cancel_url: `${origin}/academies/${academyId}/billing?checkout=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = (err as { message?: string })?.message ?? "Could not start checkout.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
