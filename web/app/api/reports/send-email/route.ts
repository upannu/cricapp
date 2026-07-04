import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

const PDF_BUCKET = "session-reports";

function formatSessionDateTime(iso: string): string {
  const d = new Date(iso);
  const datePart = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const timePart = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${datePart} at ${timePart}`;
}

export async function POST(request: Request) {
  const { reportId, playerId } = (await request.json()) as { reportId?: string; playerId?: string };
  if (!reportId || !playerId) {
    return NextResponse.json({ error: "reportId and playerId are required." }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    return NextResponse.json({ error: "Email sending is not configured on this deployment." }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: report, error: reportError } = await supabase
    .from("reports")
    .select("id, summary, speed_kmh, front_knee_angle_deg, tags, highlight, date, session_date")
    .eq("id", reportId)
    .single();
  if (reportError || !report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("name, email")
    .eq("id", playerId)
    .single();
  if (playerError || !player) {
    return NextResponse.json({ error: "Player not found." }, { status: 404 });
  }
  if (!player.email) {
    return NextResponse.json({ error: "This player has no email address on file." }, { status: 400 });
  }

  // Best-effort: attach the previously generated PDF if one exists
  let pdfBuffer: Buffer | null = null;
  try {
    const { data: pdfBlob } = await supabase.storage.from(PDF_BUCKET).download(`${playerId}/${reportId}.pdf`);
    if (pdfBlob) pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer());
  } catch {
    // No PDF available — send without an attachment
  }

  const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: gmailUser, pass: gmailPass } });
  const sessionLine = report.session_date ? `Session: ${formatSessionDateTime(report.session_date)}` : "";

  try {
    await transporter.sendMail({
      from: `"PACE HQ" <${gmailUser}>`,
      to: player.email,
      subject: `Bowling Report — ${player.name} — ${report.date}`,
      text: [
        `Hi ${player.name},`,
        ``,
        `Here is your bowling biomechanics report.`,
        sessionLine,
        ``,
        report.summary,
        ``,
        report.speed_kmh !== null ? `Estimated speed: ${report.speed_kmh} km/h` : "",
        report.front_knee_angle_deg !== null ? `Front knee angle: ${report.front_knee_angle_deg}°` : "",
        ``,
        `— PACE HQ`,
      ].filter(Boolean).join("\n"),
      attachments: pdfBuffer ? [{ filename: `bowling-report-${report.date}.pdf`, content: pdfBuffer }] : undefined,
    });
  } catch (err) {
    const msg = (err as { message?: string })?.message ?? String(err);
    return NextResponse.json({ error: `Failed to send email: ${msg}` }, { status: 502 });
  }

  return NextResponse.json({ success: true, hadPdf: !!pdfBuffer });
}
