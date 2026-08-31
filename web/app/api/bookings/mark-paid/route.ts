import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCaller } from "@/lib/server-auth";

/** Marks a booking paid outside Stripe (cash, bank transfer). Staff-only — a player/parent pays
 * via BookingPayOnlineButton (Stripe Checkout) instead, never this route directly. */
export async function POST(request: Request) {
  const { bookingId, paidDate } = (await request.json()) as { bookingId?: string; paidDate?: string };
  if (!bookingId || !paidDate) {
    return NextResponse.json({ error: "bookingId and paidDate are required." }, { status: 400 });
  }

  const caller = await getCaller();
  if (!caller || !["platform_admin", "academy_admin", "coach"].includes(caller.role ?? "")) {
    return NextResponse.json({ error: "You don't have access to mark this booking paid." }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { error } = await supabase.from("bookings").update({
    payment_status: "Paid", paid_date: paidDate,
  }).eq("id", bookingId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
