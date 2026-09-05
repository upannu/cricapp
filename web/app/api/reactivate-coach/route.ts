import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/** Undoes CoachesClient's "Remove Coach" — clears login_disabled/disabled_at/disabled_reason,
 * same fields, same shape as reactivate-player. */
export async function POST(request: Request) {
  const { coachId } = (await request.json()) as { coachId?: string };
  if (!coachId) return NextResponse.json({ error: "coachId required." }, { status: 400 });

  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user: caller } } = await authClient.auth.getUser();
  const callerRole = caller?.app_metadata?.role as string | undefined;
  if (callerRole !== "platform_admin" && callerRole !== "academy_admin") {
    return NextResponse.json({ error: "Only a platform admin or academy admin can reactivate an account." }, { status: 403 });
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
    .select("id, academy_id")
    .eq("id", coachId)
    .single();
  if (coachError || !coach) return NextResponse.json({ error: "Coach not found." }, { status: 404 });

  if (callerRole === "academy_admin") {
    const callerAcademyId = caller?.app_metadata?.academy_id as string | undefined;
    if (!callerAcademyId || coach.academy_id !== callerAcademyId) {
      return NextResponse.json({ error: "You can only reactivate coaches in your own academy." }, { status: 403 });
    }
  }

  const { error: updateError } = await supabase
    .from("coaches")
    .update({ login_disabled: false, disabled_at: null, disabled_reason: null })
    .eq("id", coachId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
