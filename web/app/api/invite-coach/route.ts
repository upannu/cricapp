import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCaller } from "@/lib/server-auth";

export async function POST(request: Request) {
  const { email, name } = await request.json();

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

  const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { name, role: "coach" },
    redirectTo: `${origin}/reset-password`,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
