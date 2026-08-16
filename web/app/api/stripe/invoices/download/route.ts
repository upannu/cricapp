import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCaller, callerCanAccessPlayer } from "@/lib/server-auth";
import { fetchSingleInvoice, type InvoiceKind } from "@/lib/stripe-invoices";
import { buildInvoicePdf } from "@/lib/invoice-pdf";

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
  const kind = url.searchParams.get("kind") as InvoiceKind | null;
  const stripeId = url.searchParams.get("stripeId");

  if ((!playerId && !academyId) || (playerId && academyId)) {
    return NextResponse.json({ error: "Provide exactly one of playerId or academyId." }, { status: 400 });
  }
  if (kind !== "stripe_invoice" && kind !== "checkout_session") {
    return NextResponse.json({ error: "Invalid kind." }, { status: 400 });
  }
  if (!stripeId) return NextResponse.json({ error: "stripeId is required." }, { status: 400 });

  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const supabase = serviceClient();
  let expectedCustomerId: string;
  let billedToName: string;
  let billedToEmail: string | null;

  if (playerId) {
    const allowed = await callerCanAccessPlayer(supabase, caller, playerId);
    if (!allowed) return NextResponse.json({ error: "You don't have access to this player's invoices." }, { status: 403 });

    const { data: player } = await supabase.from("players").select("stripe_customer_id, name, email").eq("id", playerId).single();
    if (!player?.stripe_customer_id) return NextResponse.json({ error: "No billing account found." }, { status: 404 });
    expectedCustomerId = player.stripe_customer_id;
    billedToName = player.name;
    billedToEmail = player.email ?? null;
  } else {
    const allowed = caller.role === "platform_admin" || (caller.role === "academy_admin" && caller.academyId === academyId);
    if (!allowed) return NextResponse.json({ error: "You can only view invoices for your own academy." }, { status: 403 });

    const { data: academy } = await supabase.from("academies").select("stripe_customer_id, name").eq("id", academyId!).single();
    if (!academy?.stripe_customer_id) return NextResponse.json({ error: "No billing account found." }, { status: 404 });
    expectedCustomerId = academy.stripe_customer_id;
    billedToName = academy.name;
    billedToEmail = null;
  }

  try {
    const invoice = await fetchSingleInvoice(kind, stripeId);
    if (invoice.customerId !== expectedCustomerId) {
      return NextResponse.json({ error: "Invoice does not belong to this account." }, { status: 403 });
    }

    const pdfBytes = await buildInvoicePdf(invoice, { name: billedToName, email: billedToEmail });
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }
}
