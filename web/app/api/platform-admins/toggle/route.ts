import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCaller } from "@/lib/server-auth";

export async function POST(request: Request) {
  const { userId, makeAdmin, fallbackRole } = (await request.json()) as {
    userId?: string;
    makeAdmin?: boolean;
    fallbackRole?: "academy_admin" | "coach";
  };
  if (!userId || typeof makeAdmin !== "boolean") {
    return NextResponse.json({ error: "userId and makeAdmin are required." }, { status: 400 });
  }
  if (!makeAdmin && fallbackRole !== "academy_admin" && fallbackRole !== "coach") {
    return NextResponse.json({ error: "A fallback role (academy_admin or coach) is required to remove platform_admin." }, { status: 400 });
  }

  const caller = await getCaller();
  if (caller?.role !== "platform_admin") {
    return NextResponse.json({ error: "Only a platform admin can change platform_admin status." }, { status: 403 });
  }
  // No self-promotion/self-demotion — the acting admin should never be able to lock themselves
  // out or silently self-escalate outside the normal flow.
  if (caller.userId === userId) {
    return NextResponse.json({ error: "You can't change your own platform_admin status here." }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { error } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: { role: makeAdmin ? "platform_admin" : fallbackRole },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
