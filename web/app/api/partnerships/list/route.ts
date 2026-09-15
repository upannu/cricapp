import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCaller } from "@/lib/server-auth";
import { dbToPartnershipApplication, type DbPartnershipApplication } from "@/lib/db";

/**
 * Lists every Cricket Board Partnership application for the admin list view. Deliberately a
 * service-role API route, not a browser-client lib/db.ts fetch like session_packs — unlike that
 * table, partnership_applications has no RLS policy granting SELECT to the authenticated role
 * (confirmed by testing the anon key directly: 0 rows back despite real rows existing), so a
 * browser-client read would silently show nothing even to a genuine platform_admin. The role
 * check below is the real gate, matching /api/platform-admins/list's own pattern.
 */
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

  const { data, error } = await supabase
    .from("partnership_applications").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ applications: (data as DbPartnershipApplication[]).map(dbToPartnershipApplication) });
}
