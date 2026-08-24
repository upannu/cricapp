import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCaller, callerCanAccessPlayer } from "@/lib/server-auth";

/** Called right after a coach marks a session pack Paid outside Stripe (cash, bank transfer) —
 * the only path where the platform's own fee cut is never actually collected, since no Stripe
 * charge occurs. Records what's owed as a ledger entry; a platform admin reconciles/collects it
 * separately (see mark-fee-collected). The fee % is snapshotted at this moment, not recalculated
 * later if the academy's plan changes. */
export async function POST(request: Request) {
  const { packId } = (await request.json()) as { packId?: string };
  if (!packId) return NextResponse.json({ error: "packId is required." }, { status: 400 });

  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: pack, error: packError } = await supabase
    .from("session_packs")
    .select("id, player_id, academy_id, total_sessions, fee_per_session")
    .eq("id", packId)
    .single();
  if (packError || !pack) return NextResponse.json({ error: "Pack not found." }, { status: 404 });

  if (!(await callerCanAccessPlayer(supabase, caller, pack.player_id))) {
    return NextResponse.json({ error: "You don't have access to this pack." }, { status: 403 });
  }

  const { data: academy } = await supabase.from("academies").select("plan_id").eq("id", pack.academy_id).maybeSingle();
  let feePercent = 10;
  if (academy?.plan_id) {
    const { data: plan } = await supabase.from("plans").select("platform_fee_percent").eq("id", academy.plan_id).maybeSingle();
    if (plan?.platform_fee_percent != null) feePercent = plan.platform_fee_percent;
  }

  const amount = Math.round(pack.total_sessions * pack.fee_per_session * feePercent) / 100;
  if (amount <= 0) return NextResponse.json({ success: true, skipped: "zero_fee" });

  // One due row per pack (UNIQUE constraint) — a pack is only ever marked Paid once, but guard
  // against a double-click/retry creating a second row for the same pack.
  const { error: upsertError } = await supabase.from("pack_fee_dues").upsert(
    { id: `pfd_${packId}`, pack_id: packId, academy_id: pack.academy_id, amount_aud: amount, fee_percent: feePercent, status: "pending" },
    { onConflict: "pack_id", ignoreDuplicates: true },
  );
  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

  return NextResponse.json({ success: true, amount });
}
