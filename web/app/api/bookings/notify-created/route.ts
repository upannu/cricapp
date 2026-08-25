import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getCaller, callerCanAccessPlayer } from "@/lib/server-auth";
import { sendSms } from "@/lib/sms";
import { buildBookingEmailHtml } from "@/lib/email-templates";
import { formatDate } from "@/lib/utils";

/** Fired once, right after a brand-new booking is saved — never on an edit. Best-effort: a failed
 * send here should never roll back or error the booking itself. */
export async function POST(request: Request) {
  const { bookingId } = (await request.json()) as { bookingId?: string };
  if (!bookingId) return NextResponse.json({ error: "bookingId is required." }, { status: 400 });

  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, player_id, coach_id, date, time, duration_mins, type, location, fee_aud")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  if (!(await callerCanAccessPlayer(supabase, caller, booking.player_id))) {
    return NextResponse.json({ error: "You don't have access to this booking." }, { status: 403 });
  }

  const { data: player } = await supabase.from("players").select("name, email, phone").eq("id", booking.player_id).maybeSingle();
  const { data: coach } = await supabase.from("coaches").select("name, email").eq("id", booking.coach_id).maybeSingle();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://crichq.com.au";
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;

  const when = `${formatDate(booking.date)} at ${booking.time}`;
  let emailsSent = 0;
  let smsSent = false;

  if (gmailUser && gmailPass) {
    const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: gmailUser, pass: gmailPass } });

    if (player?.email) {
      const rows = [
        { label: "Coach", value: coach?.name ?? "—" },
        { label: "Date", value: formatDate(booking.date) },
        { label: "Time", value: booking.time },
        { label: "Duration", value: `${booking.duration_mins} minutes` },
        { label: "Type", value: booking.type },
        { label: "Location", value: booking.location || "—" },
        ...(booking.fee_aud > 0 ? [{ label: "Fee", value: `$${booking.fee_aud} AUD` }] : []),
      ];
      const text = [
        `Hi ${player.name},`, ``,
        `Your CRIC HQ booking with ${coach?.name ?? "your coach"} is confirmed:`, ``,
        ...rows.map((r) => `${r.label}: ${r.value}`), ``,
        `${appUrl}/bookings`, ``, `— CRIC HQ`,
      ].join("\n");
      const html = buildBookingEmailHtml({
        appUrl, heading: "Booking confirmed 🏏",
        intro: `Hi ${player.name}, your session with ${coach?.name ?? "your coach"} is booked.`,
        rows,
      });
      await transporter.sendMail({ from: `"CRIC HQ" <${gmailUser}>`, to: player.email, subject: "Your CRIC HQ booking is confirmed", text, html })
        .then(() => { emailsSent++; }).catch(() => {});
    }

    if (coach?.email) {
      const rows = [
        { label: "Player", value: player?.name ?? "—" },
        { label: "Date", value: formatDate(booking.date) },
        { label: "Time", value: booking.time },
        { label: "Duration", value: `${booking.duration_mins} minutes` },
        { label: "Type", value: booking.type },
        { label: "Location", value: booking.location || "—" },
      ];
      const text = [
        `Hi ${coach.name},`, ``,
        `A new booking has been added to your schedule:`, ``,
        ...rows.map((r) => `${r.label}: ${r.value}`), ``,
        `${appUrl}/bookings`, ``, `— CRIC HQ`,
      ].join("\n");
      const html = buildBookingEmailHtml({
        appUrl, heading: "New booking",
        intro: `Hi ${coach.name}, a new booking with ${player?.name ?? "a player"} has been added to your schedule.`,
        rows,
      });
      await transporter.sendMail({ from: `"CRIC HQ" <${gmailUser}>`, to: coach.email, subject: "New CRIC HQ booking on your schedule", text, html })
        .then(() => { emailsSent++; }).catch(() => {});
    }
  }

  if (player?.phone) {
    const smsRes = await sendSms(
      player.phone,
      `Hi ${player.name}, your CRIC HQ session with ${coach?.name ?? "your coach"} is confirmed for ${when}. — CRIC HQ`,
    );
    smsSent = smsRes.success;
  }

  return NextResponse.json({ success: true, emailsSent, smsSent });
}
