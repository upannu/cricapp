import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { sendSms } from "@/lib/sms";
import { sydneyLocalToInstant, sydneyNowParts, sydneyOffsetMs } from "@/lib/cron-time";
import { formatDate } from "@/lib/utils";

/** How many hours before a booking starts the reminder fires — same window as session-reminders. */
const LEAD_HOURS = 3;

function serviceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Not configured — set CRON_SECRET." }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = serviceClient();
  const now = new Date();
  const offsetMs = sydneyOffsetMs(now);
  const todayIso = sydneyNowParts(now).dateIso;

  const { data: bookings, error: bookingsError } = await supabase
    .from("bookings")
    .select("id, player_id, coach_id, date, time")
    .eq("status", "Confirmed")
    .eq("date", todayIso);
  if (bookingsError) return NextResponse.json({ error: bookingsError.message }, { status: 500 });

  const results: Array<{ bookingId: string; action: string }> = [];

  for (const b of bookings ?? []) {
    const start = sydneyLocalToInstant(todayIso, b.time, offsetMs);
    const hoursUntil = (start.getTime() - now.getTime()) / 3600000;
    if (hoursUntil < 0 || hoursUntil > LEAD_HOURS) continue;

    const { data: alreadySent } = await supabase
      .from("booking_reminder_log")
      .select("id")
      .eq("id", `brl_${b.id}`)
      .maybeSingle();
    if (alreadySent) continue;

    const { data: player } = await supabase.from("players").select("name, email, phone").eq("id", b.player_id).maybeSingle();
    const { data: coach } = await supabase.from("coaches").select("name").eq("id", b.coach_id).maybeSingle();
    if (!player) continue;

    try {
      if (player.phone) {
        await sendSms(
          player.phone,
          `Hi ${player.name}, reminder: your CRIC HQ session with ${coach?.name ?? "your coach"} is today at ${b.time}. — CRIC HQ`,
        );
      }

      const gmailUser = process.env.GMAIL_USER;
      const gmailPass = process.env.GMAIL_APP_PASSWORD;
      if (player.email && gmailUser && gmailPass) {
        const nodemailer = (await import("nodemailer")).default;
        const { buildBookingEmailHtml, emailFrom } = await import("@/lib/email-templates");
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://crichq.com.au";
        const rows = [
          { label: "Coach", value: coach?.name ?? "—" },
          { label: "Date", value: formatDate(b.date) },
          { label: "Time", value: b.time },
        ];
        const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: gmailUser, pass: gmailPass } });
        const html = buildBookingEmailHtml({
          appUrl, heading: "Reminder: your session is coming up",
          intro: `Hi ${player.name}, your session with ${coach?.name ?? "your coach"} is coming up soon.`,
          rows,
        });
        const text = [`Hi ${player.name},`, ``, `Reminder — your session with ${coach?.name ?? "your coach"} is today at ${b.time}.`, ``, `${appUrl}/bookings`, ``, `— CRIC HQ`].join("\n");
        await transporter.sendMail({ from: emailFrom(gmailUser), to: player.email, subject: "Reminder: your CRIC HQ session is coming up", text, html }).catch(() => {});
      }

      await supabase.from("booking_reminder_log").insert({ id: `brl_${b.id}`, booking_id: b.id });
      results.push({ bookingId: b.id, action: "reminder_sent" });
    } catch {
      // best-effort — will retry on the next cron tick since the log row was never written
    }
  }

  return NextResponse.json({ success: true, processed: (bookings ?? []).length, results });
}
