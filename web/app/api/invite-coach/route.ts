import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCaller } from "@/lib/server-auth";

export async function POST(request: Request) {
  const { email, name, coachId } = await request.json();

  if (!email || !name) {
    return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
  }

  const caller = await getCaller();
  if (!caller || (caller.role !== "platform_admin" && caller.role !== "academy_admin")) {
    return NextResponse.json({ error: "Only an academy admin or platform admin can invite a coach." }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: "Server not configured for invites." }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const origin = request.headers.get("origin") ?? "";

  // inviteUserByEmail's `data` option only ever writes to user_metadata — never app_metadata,
  // which is where role/approved/coach_id actually have to live (server-only, everything in this
  // app reads it exclusively for authorization). `data` here is display-only (`name`); the real
  // identity fields are set in a second call right after, same as every other account-creation
  // path in this app.
  const { data: inviteData, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { name },
    redirectTo: `${origin}/reset-password`,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Without linking coach_id here, an invited coach's login would never resolve to their own
  // coaches row — under real RLS that means seeing no players, no sessions, nothing. The coach
  // record is always created immediately before this call, so coachId is already known.
  const { error: metaError } = await supabase.auth.admin.updateUserById(inviteData.user.id, {
    app_metadata: { role: "coach", approved: true, ...(coachId ? { coach_id: coachId } : {}) },
  });
  if (metaError) return NextResponse.json({ error: metaError.message }, { status: 400 });

  return NextResponse.json({ success: true });
}
