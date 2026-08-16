import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCaller, callerCanAccessPlayer } from "@/lib/server-auth";
import { listInvoicesForCustomer } from "@/lib/stripe-invoices";

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const playerId = url.searchParams.get("playerId");
  const academyId = url.searchParams.get("academyId");
  if ((!playerId && !academyId) || (playerId && academyId)) {
    return NextResponse.json({ error: "Provide exactly one of playerId or academyId." }, { status: 400 });
  }

  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const supabase = serviceClient();

  if (playerId) {
    const allowed = await callerCanAccessPlayer(supabase, caller, playerId);
    if (!allowed) return NextResponse.json({ error: "You don't have access to this player's invoices." }, { status: 403 });

    const { data: player } = await supabase.from("players").select("stripe_customer_id").eq("id", playerId).single();
    if (!player?.stripe_customer_id) return NextResponse.json({ invoices: [] });
    const invoices = await listInvoicesForCustomer(player.stripe_customer_id);
    return NextResponse.json({ invoices });
  }

  const allowed = caller.role === "platform_admin" || (caller.role === "academy_admin" && caller.academyId === academyId);
  if (!allowed) return NextResponse.json({ error: "You can only view invoices for your own academy." }, { status: 403 });

  const { data: academy } = await supabase.from("academies").select("stripe_customer_id").eq("id", academyId!).single();
  if (!academy?.stripe_customer_id) return NextResponse.json({ invoices: [] });
  const invoices = await listInvoicesForCustomer(academy.stripe_customer_id);
  return NextResponse.json({ invoices });
}
