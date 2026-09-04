import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCaller, listAllAuthUsers } from "@/lib/server-auth";

export async function GET() {
  const caller = await getCaller();
  if (caller?.role !== "platform_admin") {
    return NextResponse.json({ error: "Only a platform admin can view this." }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { users: allUsers, error } = await listAllAuthUsers(supabase);
  if (error) return NextResponse.json({ error }, { status: 500 });

  const users = allUsers
    .filter((u) => u.app_metadata?.approved !== false)
    .map((u) => ({
      id: u.id,
      email: u.email ?? "",
      name: (u.user_metadata?.name as string) ?? u.email ?? "",
      role: (u.app_metadata?.role as string) ?? "coach",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ users });
}
