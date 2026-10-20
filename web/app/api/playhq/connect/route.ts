import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCaller } from "@/lib/server-auth";
import { fetchOrganisationSeasons, PlayHQApiError } from "@/lib/playhq";

/** Connects an academy to a PlayHQ organisation — validates the org id by actually calling
 * PlayHQ (confirms both the id and the platform's PLAYHQ_API_KEY/PLAYHQ_TENANT work) before
 * saving it. Mirrors app/api/stripe/connect/onboard/route.ts's shape: own role check, then a
 * service-role client for the write (academies.playhq_* isn't secret, but this route is the only
 * place allowed to set it). */
export async function POST(request: Request) {
  const { academyId, playhqOrgId, playhqOrgName } = (await request.json()) as {
    academyId?: string; playhqOrgId?: string; playhqOrgName?: string;
  };
  if (!academyId || !playhqOrgId?.trim()) {
    return NextResponse.json({ error: "academyId and playhqOrgId are required." }, { status: 400 });
  }

  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const canManage = caller.role === "platform_admin" || (caller.role === "academy_admin" && caller.academyId === academyId);
  if (!canManage) {
    return NextResponse.json({ error: "You don't have access to connect PlayHQ for this academy." }, { status: 403 });
  }

  try {
    await fetchOrganisationSeasons(playhqOrgId.trim());
  } catch (err) {
    const message = err instanceof PlayHQApiError ? err.message : "Could not verify that PlayHQ organisation.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { error } = await supabase.from("academies").update({
    playhq_org_id: playhqOrgId.trim(),
    playhq_org_name: playhqOrgName?.trim() || null,
    playhq_connected_at: new Date().toISOString(),
  }).eq("id", academyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
