import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const { academyId } = (await request.json()) as { academyId?: string };
  if (!academyId) return NextResponse.json({ error: "academyId is required." }, { status: 400 });

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
    .select("stripe_customer_id")
    .eq("id", academyId)
    .single();
  if (academyError || !academy?.stripe_customer_id) {
    return NextResponse.json({ error: "No billing account yet — subscribe to a plan first." }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: academy.stripe_customer_id,
    return_url: `${origin}/academies/${academyId}/billing`,
  });

  return NextResponse.json({ url: portalSession.url });
}
