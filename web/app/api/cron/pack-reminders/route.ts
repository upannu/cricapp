import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

/** Days past the payment due date before login is disabled. A single constant rather than a
 * settings-UI field — cheap to change here later if it needs to become configurable. */
const PACK_PAYMENT_GRACE_DAYS = 7;

function serviceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function daysUntil(dueDateIso: string, today: Date): number {
  const due = new Date(dueDateIso);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Not configured — set CRON_SECRET." }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    return NextResponse.json({ error: "Email sending is not configured on this deployment." }, { status: 500 });
  }

  const supabase = serviceClient();
  const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: gmailUser, pass: gmailPass } });

  const { data: packs, error: packsError } = await supabase
    .from("session_packs")
    .select("id, player_id, payment_status, payment_due_date, reminder_7d_sent_at, reminder_2d_sent_at, reminder_due_sent_at")
    .eq("status", "Active")
    .neq("payment_status", "Paid");
  if (packsError) return NextResponse.json({ error: packsError.message }, { status: 500 });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const results: Array<{ packId: string; action: string }> = [];

  for (const pk of packs ?? []) {
    const { data: player } = await supabase
      .from("players")
      .select("id, name, email, login_disabled")
      .eq("id", pk.player_id)
      .single();
    if (!player?.email) continue;

    const daysToDue = daysUntil(pk.payment_due_date, today);
    const dueText = `A payment of your session pack is due on ${pk.payment_due_date}. Please arrange payment to keep your sessions active.`;

    if (daysToDue === 7 && !pk.reminder_7d_sent_at) {
      try {
        await transporter.sendMail({
          from: `"CRIC HQ" <${gmailUser}>`, to: player.email,
          subject: "Your session pack payment is due in 1 week",
          text: `Hi ${player.name},\n\n${dueText}\n\n— CRIC HQ`,
        });
        await supabase.from("session_packs").update({ reminder_7d_sent_at: new Date().toISOString() }).eq("id", pk.id);
        results.push({ packId: pk.id, action: "reminder_7d_sent" });
      } catch {
        // best-effort — will retry on the next cron run since reminder_7d_sent_at stays unset
      }
    } else if (daysToDue === 2 && !pk.reminder_2d_sent_at) {
      try {
        await transporter.sendMail({
          from: `"CRIC HQ" <${gmailUser}>`, to: player.email,
          subject: "Your session pack payment is due in 2 days",
          text: `Hi ${player.name},\n\n${dueText}\n\n— CRIC HQ`,
        });
        await supabase.from("session_packs").update({ reminder_2d_sent_at: new Date().toISOString() }).eq("id", pk.id);
        results.push({ packId: pk.id, action: "reminder_2d_sent" });
      } catch {
        // best-effort — will retry on the next cron run
      }
    } else if (daysToDue === 0 && !pk.reminder_due_sent_at) {
      try {
        await transporter.sendMail({
          from: `"CRIC HQ" <${gmailUser}>`, to: player.email,
          subject: "Your session pack payment is due today",
          text: `Hi ${player.name},\n\nYour session pack payment is due today (${pk.payment_due_date}). Please pay today to avoid losing access.\n\n— CRIC HQ`,
        });
        await supabase.from("session_packs").update({ reminder_due_sent_at: new Date().toISOString() }).eq("id", pk.id);
        results.push({ packId: pk.id, action: "reminder_due_sent" });
      } catch {
        // best-effort — will retry on the next cron run
      }
    } else if (daysToDue < 0 && pk.payment_status === "Pending") {
      await supabase.from("session_packs").update({ payment_status: "Overdue" }).eq("id", pk.id);
      results.push({ packId: pk.id, action: "marked_overdue" });
    }

    if (daysToDue <= -PACK_PAYMENT_GRACE_DAYS && pk.payment_status !== "Paid" && !player.login_disabled) {
      await supabase.from("players").update({
        login_disabled: true,
        disabled_at: new Date().toISOString(),
        disabled_reason: "Overdue session pack payment",
      }).eq("id", player.id);

      const notifyList = [player.email, process.env.PLATFORM_ADMIN_EMAIL].filter(Boolean) as string[];
      for (const to of notifyList) {
        try {
          await transporter.sendMail({
            from: `"CRIC HQ" <${gmailUser}>`, to,
            subject: `Account locked — overdue session pack payment (${player.name})`,
            text: `${player.name}'s login has been locked after ${PACK_PAYMENT_GRACE_DAYS} days of non-payment on their session pack (due ${pk.payment_due_date}). A staff member must reactivate the account from Session Packs → Fees Due once payment is received.\n\n— CRIC HQ`,
          });
        } catch {
          // best-effort notification
        }
      }
      results.push({ packId: pk.id, action: "login_disabled" });
    }
  }

  return NextResponse.json({ success: true, processed: (packs ?? []).length, results });
}
