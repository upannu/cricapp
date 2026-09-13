import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getCaller, callerCanAccessPlayer } from "@/lib/server-auth";
import { sendSms } from "@/lib/sms";
import { buildPackEmailHtml, emailFrom } from "@/lib/email-templates";
import { formatDate } from "@/lib/utils";

/** Fired once, right after a brand-new Membership (SessionPack) is saved — never on an edit or
 * renewal update. Best-effort: a failed send here should never roll back or error the pack
 * itself. Without this, a family's first notice of a new membership was whatever the
 * pack-reminders cron happened to send next — as late as 7 days after creation, since that cron
 * is keyed off proximity to the due date, not creation. */
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

  const { data: pack } = await supabase
    .from("session_packs")
    .select("id, player_id, academy_id, total_sessions, fee_per_session, payment_status, payment_due_date")
    .eq("id", packId)
    .maybeSingle();
  if (!pack) return NextResponse.json({ error: "Membership not found." }, { status: 404 });

  if (!(await callerCanAccessPlayer(supabase, caller, pack.player_id))) {
    return NextResponse.json({ error: "You don't have access to this membership." }, { status: 403 });
  }

  // A waived or already-paid membership has nothing to ask the family for — never send a
  // "payment due" notice for one.
  if (pack.payment_status === "Paid") {
    return NextResponse.json({ success: true, emailSent: false, smsSent: false });
  }

  const { data: player } = await supabase.from("players").select("name, email, phone").eq("id", pack.player_id).maybeSingle();
  const { data: academy } = await supabase.from("academies").select("name, currency").eq("id", pack.academy_id).maybeSingle();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://crichq.com.au";
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const currency = (academy?.currency ?? "aud").toUpperCase();
  const total = pack.total_sessions * pack.fee_per_session;

  let emailSent = false;
  let smsSent = false;

  if (gmailUser && gmailPass && player?.email) {
    const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: gmailUser, pass: gmailPass } });
    const rows = [
      { label: "Academy", value: academy?.name ?? "—" },
      { label: "Sessions", value: String(pack.total_sessions) },
      { label: "Fee", value: `${currency} ${pack.fee_per_session}/session` },
      { label: "Total due", value: `${currency} ${total}` },
      { label: "Due date", value: formatDate(pack.payment_due_date) },
    ];
    const text = [
      `Hi ${player.name},`, ``,
      `A new CRIC HQ membership has been set up for you${academy?.name ? ` at ${academy.name}` : ""}:`, ``,
      ...rows.map((r) => `${r.label}: ${r.value}`), ``,
      `${appUrl}/portal`, ``, `— CRIC HQ`,
    ].join("\n");
    const html = buildPackEmailHtml({
      appUrl, heading: "New membership — payment due",
      intro: `Hi ${player.name}, a new membership has been set up for you${academy?.name ? ` at ${academy.name}` : ""}.`,
      rows,
    });
    await transporter.sendMail({ from: emailFrom(gmailUser), to: player.email, subject: "Your new CRIC HQ membership — payment due", text, html })
      .then(() => { emailSent = true; }).catch(() => {});
  }

  if (player?.phone) {
    const smsRes = await sendSms(
      player.phone,
      `Hi ${player.name}, a new CRIC HQ membership has been set up for you. Payment of ${currency} ${total} is due by ${formatDate(pack.payment_due_date)}. — CRIC HQ`,
    );
    smsSent = smsRes.success;
  }

  return NextResponse.json({ success: true, emailSent, smsSent });
}
