import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import nodemailer from "nodemailer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const PDF_BUCKET = "session-reports";

interface FrameInput {
  angle: string;
  base64: string;
  mediaType: string;
}

interface AiReportResult {
  speedKmh: number;
  frontKneeAngleDeg: number;
  actionType: "Side-on" | "Front-on" | "Mixed";
  injuryRisk: "Low" | "Moderate" | "High";
  summary: string;
  tags: string[];
  highlight: string;
}

const SYSTEM_PROMPT = `You are a cricket fast-bowling biomechanics analyst working for a cricket academy. You are given still frames captured from multiple camera angles (front, side, back) of a single bowling delivery. Analyze the bowler's action from what is visible: alignment, front knee brace, arm path, release point, and overall action classification. Your estimates of ball speed and knee angle are visual approximations for coaching purposes, not radar-gun or motion-capture accuracy — write the summary accordingly. Be specific and constructive, as if writing for the player's coach.`;

const REPORT_SCHEMA = {
  type: "object" as const,
  properties: {
    speedKmh: {
      type: "number",
      description: "Estimated ball release speed in km/h based on the bowling action mechanics visible in the frames",
    },
    frontKneeAngleDeg: {
      type: "number",
      description: "Estimated front knee angle in degrees at front-foot landing / back-foot contact",
    },
    actionType: { type: "string", enum: ["Side-on", "Front-on", "Mixed"] },
    injuryRisk: { type: "string", enum: ["Low", "Moderate", "High"] },
    summary: {
      type: "string",
      description: "2-4 sentence coaching summary of the bowling action observed across the frames",
    },
    tags: {
      type: "array",
      items: { type: "string" },
      description: "3-6 short tags, e.g. 'Good alignment', 'Mixed action', 'High elbow'",
    },
    highlight: {
      type: "string",
      description: "One standout observation or recommendation for the coach",
    },
  },
  required: ["speedKmh", "frontKneeAngleDeg", "actionType", "injuryRisk", "summary", "tags", "highlight"],
  additionalProperties: false,
};

export async function POST(request: Request) {
  const { sessionId, playerId, frames } = (await request.json()) as {
    sessionId?: string;
    playerId?: string;
    frames?: FrameInput[];
  };

  if (!playerId || !frames || frames.length === 0) {
    return NextResponse.json({ error: "playerId and frames are required." }, { status: 400 });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json({ error: "AI report generation is not configured (missing ANTHROPIC_API_KEY)." }, { status: 500 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("id, name, email, bowling_style, age_group")
    .eq("id", playerId)
    .single();
  if (playerError || !player) {
    return NextResponse.json({ error: "Player not found." }, { status: 404 });
  }

  let sessionDate: string | null = null;
  if (sessionId) {
    const { data: sessionRow } = await supabase
      .from("sessions")
      .select("created_at")
      .eq("id", sessionId)
      .single();
    sessionDate = sessionRow?.created_at ?? null;
  }

  // 1. Analyze frames with Claude Vision
  let analysis: AiReportResult;
  try {
    const anthropic = new Anthropic({ apiKey: anthropicKey });

    const imageContent: Anthropic.ContentBlockParam[] = [];
    for (const frame of frames) {
      imageContent.push({ type: "text", text: `Frame from the ${frame.angle} camera angle:` });
      imageContent.push({
        type: "image",
        source: { type: "base64", media_type: frame.mediaType as "image/jpeg", data: frame.base64 },
      });
    }

    const response = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema", schema: REPORT_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            ...imageContent,
            {
              type: "text",
              text: `Bowler: ${player.name}, ${player.age_group}, ${player.bowling_style}. Analyze this delivery and return the structured report.`,
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") throw new Error("No analysis returned by the model.");
    analysis = JSON.parse(textBlock.text) as AiReportResult;
  } catch (err) {
    const msg = (err as { message?: string })?.message ?? String(err);
    return NextResponse.json({ error: `AI analysis failed: ${msg}` }, { status: 502 });
  }

  // 2. Save report row
  const reportId = `r_${Date.now()}`;
  const today = new Date().toISOString().split("T")[0];
  const { error: insertError } = await supabase.from("reports").insert({
    id: reportId,
    player_id: playerId,
    date: today,
    type: "Biomechanics",
    summary: analysis.summary,
    speed_kmh: analysis.speedKmh,
    front_knee_angle_deg: analysis.frontKneeAngleDeg,
    tags: analysis.tags,
    highlight: analysis.highlight,
    session_id: sessionId ?? null,
    session_date: sessionDate,
  });
  if (insertError) {
    return NextResponse.json({ error: `Failed to save report: ${insertError.message}` }, { status: 500 });
  }

  // 3. Generate PDF
  const pdfBytes = await buildReportPdf({
    playerName: player.name,
    date: today,
    sessionDate,
    analysis,
  });

  // 4. Upload PDF to storage
  let pdfUrl: string | null = null;
  try {
    await supabase.storage.createBucket(PDF_BUCKET, { public: true, fileSizeLimit: 10485760 });
    const path = `${playerId}/${reportId}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from(PDF_BUCKET)
      .upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (!uploadError) {
      const { data } = supabase.storage.from(PDF_BUCKET).getPublicUrl(path);
      pdfUrl = data.publicUrl;
    }
  } catch {
    // Non-fatal — report is already saved even if PDF storage fails
  }

  // 5. Email the PDF to the player
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (gmailUser && gmailPass && player.email) {
    const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: gmailUser, pass: gmailPass } });
    await transporter
      .sendMail({
        from: `"PACE HQ" <${gmailUser}>`,
        to: player.email,
        subject: `AI Bowling Report — ${player.name} — ${today}`,
        text: [
          `Hi ${player.name},`,
          ``,
          `Your AI-generated bowling biomechanics report is ready.`,
          sessionDate ? `Session: ${formatSessionDateTime(sessionDate)}` : ``,
          ``,
          analysis.summary,
          ``,
          `Estimated speed: ${analysis.speedKmh} km/h`,
          `Front knee angle: ${analysis.frontKneeAngleDeg}°`,
          `Action type: ${analysis.actionType}`,
          `Injury risk: ${analysis.injuryRisk}`,
          ``,
          `— PACE HQ`,
        ].join("\n"),
        attachments: [{ filename: `bowling-report-${today}.pdf`, content: Buffer.from(pdfBytes) }],
      })
      .catch(() => {
        // Don't fail the request if email sending fails
      });
  }

  return NextResponse.json({ success: true, report: { id: reportId, ...analysis }, pdfUrl });
}

function formatSessionDateTime(iso: string): string {
  const d = new Date(iso);
  const datePart = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const timePart = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${datePart} at ${timePart}`;
}

async function buildReportPdf(opts: {
  playerName: string;
  date: string;
  sessionDate: string | null;
  analysis: AiReportResult;
}): Promise<Uint8Array> {
  const { playerName, date, sessionDate, analysis } = opts;
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const green = rgb(0.05, 0.65, 0.35);
  const dark = rgb(0.12, 0.12, 0.14);
  const gray = rgb(0.4, 0.4, 0.42);

  let y = 780;
  page.drawText("PACE HQ", { x: 50, y, size: 22, font: bold, color: green });
  y -= 20;
  page.drawText("AI Bowling Biomechanics Report", { x: 50, y, size: 14, font, color: dark });
  y -= 40;

  page.drawText(`Player: ${playerName}`, { x: 50, y, size: 12, font: bold, color: dark });
  y -= 18;
  if (sessionDate) {
    page.drawText(`Session: ${formatSessionDateTime(sessionDate)}`, { x: 50, y, size: 11, font, color: gray });
    y -= 16;
  }
  page.drawText(`Report generated: ${date}`, { x: 50, y, size: 11, font, color: gray });
  y -= 40;

  const metrics: [string, string][] = [
    ["Estimated Speed", `${analysis.speedKmh} km/h`],
    ["Front Knee Angle", `${analysis.frontKneeAngleDeg}°`],
    ["Action Type", analysis.actionType],
    ["Injury Risk", analysis.injuryRisk],
  ];
  for (const [label, value] of metrics) {
    page.drawText(label, { x: 50, y, size: 11, font, color: gray });
    page.drawText(value, { x: 220, y, size: 11, font: bold, color: dark });
    y -= 20;
  }
  y -= 20;

  page.drawText("Summary", { x: 50, y, size: 13, font: bold, color: dark });
  y -= 20;
  y = drawWrappedText(page, analysis.summary, 50, y, 495, 11, font, dark);
  y -= 20;

  if (analysis.highlight) {
    page.drawText("Highlight", { x: 50, y, size: 13, font: bold, color: dark });
    y -= 20;
    y = drawWrappedText(page, analysis.highlight, 50, y, 495, 11, font, dark);
    y -= 20;
  }

  if (analysis.tags.length > 0) {
    page.drawText("Tags", { x: 50, y, size: 13, font: bold, color: dark });
    y -= 20;
    y = drawWrappedText(page, analysis.tags.join(" · "), 50, y, 495, 11, font, gray);
    y -= 20;
  }

  page.drawText(
    "This report is generated by AI from visual analysis of session video and is intended as a coaching aid, not a certified biomechanical measurement.",
    { x: 50, y: 60, size: 8, font, color: gray, maxWidth: 495 },
  );

  return doc.save();
}

function drawWrappedText(
  page: import("pdf-lib").PDFPage,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  font: import("pdf-lib").PDFFont,
  color: ReturnType<typeof rgb>,
): number {
  const words = text.split(" ");
  let line = "";
  let cursorY = y;
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(testLine, size) > maxWidth && line) {
      page.drawText(line, { x, y: cursorY, size, font, color });
      cursorY -= size + 6;
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line) {
    page.drawText(line, { x, y: cursorY, size, font, color });
    cursorY -= size + 6;
  }
  return cursorY;
}
