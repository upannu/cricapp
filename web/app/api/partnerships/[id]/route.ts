import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCaller } from "@/lib/server-auth";
import { dbToPartnershipApplication, dbToPartnershipActivityEntry, type DbPartnershipApplication, type DbPartnershipActivityEntry } from "@/lib/db";

/** Single application + its full activity feed for the admin detail view — same service-role
 * rationale as /api/partnerships/list (no RLS grants a browser client read access to either
 * table). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getCaller();
  if (caller?.role !== "platform_admin") {
    return NextResponse.json({ error: "Only a platform admin can view this." }, { status: 403 });
  }
  const { id } = await params;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: application, error: appError } = await supabase
    .from("partnership_applications").select("*").eq("id", id).maybeSingle();
  if (appError) return NextResponse.json({ error: appError.message }, { status: 500 });
  if (!application) return NextResponse.json({ error: "Application not found." }, { status: 404 });

  const { data: activity, error: activityError } = await supabase
    .from("partnership_activity").select("*").eq("application_id", id).order("created_at", { ascending: false });
  if (activityError) return NextResponse.json({ error: activityError.message }, { status: 500 });

  return NextResponse.json({
    application: dbToPartnershipApplication(application as DbPartnershipApplication),
    activity: (activity as DbPartnershipActivityEntry[]).map(dbToPartnershipActivityEntry),
  });
}
