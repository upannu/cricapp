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

type Source = "manual" | "pack" | "stripe";

/** The staff-entered date on the player record is a fallback for payments that never leave any
 * other trace (cash handed to a coach with nothing recorded elsewhere) — it should never win over
 * an actual payment record when one exists. Real records take priority: a pack's own paid_date
 * (cash/bank-transfer packs marked paid manually, or Stripe-paid packs since the webhook fix
 * above) and Stripe's own history (subscriptions, and pack/booking Checkout Sessions) are both
 * checked, and whichever is most recent wins. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: playerId } = await params;
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const supabase = serviceClient();
  const allowed = await callerCanAccessPlayer(supabase, caller, playerId);
  if (!allowed) return NextResponse.json({ error: "You don't have access to this player." }, { status: 403 });

  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("stripe_customer_id, sub_last_payment_date")
    .eq("id", playerId)
    .single();
  if (playerError || !player) return NextResponse.json({ error: "Player not found." }, { status: 404 });

  const candidates: { date: string; source: Source }[] = [];
  if (player.sub_last_payment_date) candidates.push({ date: player.sub_last_payment_date, source: "manual" });

  const { data: packs } = await supabase
    .from("session_packs")
    .select("paid_date")
    .eq("player_id", playerId)
    .eq("payment_status", "Paid")
    .not("paid_date", "is", null);
  for (const pk of packs ?? []) {
    if (pk.paid_date) candidates.push({ date: pk.paid_date, source: "pack" });
  }

  if (player.stripe_customer_id) {
    try {
      const invoices = await listInvoicesForCustomer(player.stripe_customer_id);
      const latestPaid = invoices.find((inv) => inv.status === "paid");
      if (latestPaid) candidates.push({ date: latestPaid.date, source: "stripe" });
    } catch {
      // Stripe unreachable — fall back silently to whatever DB-derived candidates exist.
    }
  }

  if (candidates.length === 0) return NextResponse.json({ lastPaymentDate: null, source: null });

  candidates.sort((a, b) => b.date.localeCompare(a.date));
  const best = candidates[0];
  return NextResponse.json({ lastPaymentDate: best.date.slice(0, 10), source: best.source });
}
