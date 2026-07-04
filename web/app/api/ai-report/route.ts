import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import nodemailer from "nodemailer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const PDF_BUCKET = "session-reports";

type Phase = "backFootContact" | "frontFootContact" | "release" | "followThrough";
type ZoneId = "approach" | "deliveryStride" | "release" | "followThrough";

interface ReportMetric {
  id: string; label: string; zone: ZoneId;
  value: number | null; unit: string;
  idealRange?: [number, number]; score: number | null;
}

interface BiomechanicsInput {
  phases: Record<string, number | null>;
  metrics: ReportMetric[];
  zoneScores: Record<ZoneId, number | null>;
  flags: string[];
  overallScore: number | null;
  actionType: "Side-on" | "Front-on" | "Mixed";
  injuryRisk: "Low" | "Moderate" | "High";
  disclaimer: string;
}

interface SkeletonFrameInput {
  phase: Phase;
  base64: string;
  mediaType: string;
}

interface NarrativeResult {
  speedKmh: number;
  summary: string;
  tags: string[];
  highlight: string;
}

const SYSTEM_PROMPT = `You are a cricket fast-bowling biomechanics analyst working for a cricket academy. You are given the REAL, geometrically-computed biomechanics metrics for a single bowling delivery (joint angles, phase timing, zone scores, guideline-based flags — measured from pose-tracking, not guessed), plus a few skeleton-overlay key frames for visual context. Write a coaching narrative grounded in the given numbers — do not invent numbers that contradict them. The only thing you are estimating visually (not measured) is ball release speed; make that clear in your summary as a visual approximation, not radar-gun accuracy. Be specific and constructive, as if writing for the player's coach.`;

const NARRATIVE_SCHEMA = {
  type: "object" as const,
  properties: {
    speedKmh: {
      type: "number",
      description: "Estimated ball release speed in km/h — a visual approximation only, since it cannot be measured from a single camera without radar/calibration",
    },
    summary: {
      type: "string",
      description: "2-4 sentence coaching summary, grounded in the provided computed metrics and flags",
    },
    tags: {
      type: "array",
      items: { type: "string" },
      description: "3-6 short tags, e.g. 'Good knee brace', 'Mixed action', 'High elbow'",
    },
    highlight: {
      type: "string",
      description: "One standout observation or recommendation for the coach, referencing the computed metrics/flags",
    },
  },
  required: ["speedKmh", "summary", "tags", "highlight"],
  additionalProperties: false,
};

export async function POST(request: Request) {
  const { sessionId, playerId, angleUsed, biomechanics, skeletonFrames } = (await request.json()) as {
    sessionId?: string;
    playerId?: string;
    angleUsed?: "front" | "side" | "back";
    biomechanics?: BiomechanicsInput;
    skeletonFrames?: SkeletonFrameInput[];
  };

  if (!playerId || !biomechanics) {
    return NextResponse.json({ error: "playerId and biomechanics are required." }, { status: 400 });
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

  const reportId = `r_${Date.now()}`;
  const today = new Date().toISOString().split("T")[0];

  // 1. Upload skeleton-overlay key frames (small annotated images, sent from the
  // client where they were rendered — not the raw video, which never leaves the browser).
  let skeletonImages: { phase: Phase; url: string }[] = [];
  if (skeletonFrames && skeletonFrames.length > 0) {
    try {
      await supabase.storage.createBucket(PDF_BUCKET, { public: true, fileSizeLimit: 10485760 });
      const uploads = await Promise.all(
        skeletonFrames.map(async (frame) => {
          const path = `${playerId}/${reportId}/skeleton-${frame.phase}.jpg`;
          const bytes = Buffer.from(frame.base64, "base64");
          const { error } = await supabase.storage.from(PDF_BUCKET).upload(path, bytes, { contentType: frame.mediaType, upsert: true });
          if (error) return null;
          const { data } = supabase.storage.from(PDF_BUCKET).getPublicUrl(path);
          return { phase: frame.phase, url: data.publicUrl };
        }),
      );
      skeletonImages = uploads.filter((u): u is { phase: Phase; url: string } => u !== null);
    } catch {
      // Non-fatal — report still saves without skeleton images
    }
  }

  // 2. Ask Claude for the narrative only — grounded in the real computed metrics,
  // not guessing the numbers themselves.
  let narrative: NarrativeResult;
  try {
    const anthropic = new Anthropic({ apiKey: anthropicKey });

    const metricsSummary = biomechanics.metrics
      .map((m) => `- ${m.label}: ${m.value === null ? "not detected" : `${m.value}${m.unit}`}${m.idealRange ? ` (guideline range: ${m.idealRange[0]}-${m.idealRange[1]}${m.unit})` : ""}`)
      .join("\n");

    const content: Anthropic.ContentBlockParam[] = [
      {
        type: "text",
        text: [
          `Bowler: ${player.name}, ${player.age_group}, ${player.bowling_style}.`,
          `Camera angle used for measurement: ${angleUsed ?? "unknown"}.`,
          ``,
          `Computed metrics (real geometry from pose-tracking):`,
          metricsSummary,
          ``,
          `Zone scores (0-100 vs guideline ranges): ${JSON.stringify(biomechanics.zoneScores)}`,
          `Overall score: ${biomechanics.overallScore ?? "n/a"}`,
          `Computed action type: ${biomechanics.actionType}`,
          `Computed injury-risk band: ${biomechanics.injuryRisk}`,
          `Flags: ${biomechanics.flags.join(" | ")}`,
        ].join("\n"),
      },
    ];
    for (const frame of skeletonFrames ?? []) {
      content.push({ type: "text", text: `Skeleton-overlay frame at ${frame.phase}:` });
      content.push({ type: "image", source: { type: "base64", media_type: frame.mediaType as "image/jpeg", data: frame.base64 } });
    }

    const response = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema", schema: NARRATIVE_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") throw new Error("No analysis returned by the model.");
    narrative = JSON.parse(textBlock.text) as NarrativeResult;
  } catch (err) {
    const msg = (err as { message?: string })?.message ?? String(err);
    return NextResponse.json({ error: `AI analysis failed: ${msg}` }, { status: 502 });
  }

  const frontKneeMetric = biomechanics.metrics.find((m) => m.id === "frontKneeFFC");
  const frontKneeAngleDeg = frontKneeMetric?.value ?? null;

  // 3. Save report row — the numbers now come from real measurement, not the LLM.
  const { error: insertError } = await supabase.from("reports").insert({
    id: reportId,
    player_id: playerId,
    date: today,
    type: "Biomechanics",
    summary: narrative.summary,
    speed_kmh: narrative.speedKmh,
    front_knee_angle_deg: frontKneeAngleDeg,
    tags: narrative.tags,
    highlight: narrative.highlight,
    session_id: sessionId ?? null,
    session_date: sessionDate,
    action_type: biomechanics.actionType,
    injury_risk: biomechanics.injuryRisk,
    overall_score: biomechanics.overallScore,
    angle_used: angleUsed ?? null,
    metrics: biomechanics,
    skeleton_images: skeletonImages,
  });
  if (insertError) {
    return NextResponse.json({ error: `Failed to save report: ${insertError.message}` }, { status: 500 });
  }

  // 4. Refresh the player's biomechanics snapshot with this delivery's real numbers.
  await supabase.from("players").update({
    bio_ball_speed_kmh: narrative.speedKmh,
    bio_front_knee_angle_deg: frontKneeAngleDeg,
    bio_action_type: biomechanics.actionType,
    bio_injury_risk: biomechanics.injuryRisk,
    bio_last_session: today,
  }).eq("id", playerId);

  // Also reflect it on the session itself — previously left null forever,
  // so the Sessions list metrics panel never showed a generated report's numbers.
  if (sessionId) {
    await supabase.from("sessions").update({
      ball_speed_kmh: narrative.speedKmh,
      front_knee_angle_deg: frontKneeAngleDeg,
    }).eq("id", sessionId);
  }

  // 5. Generate PDF — the report row above is already saved, so a PDF/email
  // hiccup here must not turn into a 500 that discards an otherwise-successful report.
  let pdfUrl: string | null = null;
  try {
    const pdfBytes = await buildReportPdf({
      playerName: player.name,
      date: today,
      sessionDate,
      narrative,
      biomechanics,
      frontKneeAngleDeg,
      skeletonFrames: skeletonFrames ?? [],
    });

    // 6. Upload PDF to storage
    const path = `${playerId}/${reportId}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from(PDF_BUCKET)
      .upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (!uploadError) {
      const { data } = supabase.storage.from(PDF_BUCKET).getPublicUrl(path);
      pdfUrl = data.publicUrl;
    }

    // 7. Email the PDF to the player
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
            narrative.summary,
            ``,
            `Overall score: ${biomechanics.overallScore ?? "n/a"}/100`,
            `Estimated speed: ${narrative.speedKmh} km/h`,
            frontKneeAngleDeg !== null ? `Front knee angle at front-foot contact: ${frontKneeAngleDeg}°` : ``,
            `Action type: ${biomechanics.actionType}`,
            `Injury-risk band: ${biomechanics.injuryRisk}`,
            ``,
            `— PACE HQ`,
          ].filter(Boolean).join("\n"),
          attachments: [{ filename: `bowling-report-${today}.pdf`, content: Buffer.from(pdfBytes) }],
        })
        .catch(() => {
          // Don't fail the request if email sending fails
        });
    }
  } catch (err) {
    // PDF/email are a bonus on top of an already-saved report — log and move on
    // rather than returning a 500 that implies the whole report generation failed.
    console.error("PDF/email step failed after report was already saved:", err);
  }

  return NextResponse.json({
    success: true,
    report: {
      id: reportId, ...narrative, frontKneeAngleDeg,
      actionType: biomechanics.actionType, injuryRisk: biomechanics.injuryRisk,
      overallScore: biomechanics.overallScore, skeletonImages,
    },
    pdfUrl,
  });
}

function formatSessionDateTime(iso: string): string {
  const d = new Date(iso);
  const datePart = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const timePart = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${datePart} at ${timePart}`;
}

const PHASE_LABELS: Record<Phase, string> = {
  backFootContact: "Back-Foot Contact",
  frontFootContact: "Front-Foot Contact",
  release: "Release",
  followThrough: "Follow-Through",
};

/** pdf-lib's standard fonts are WinAnsi-encoded and throw on characters like ⚠/✓/ℹ — swap the common ones for ASCII and strip anything else outside Latin-1. */
function sanitizeForPdf(text: string): string {
  return text
    .replace(/⚠/g, "[!]")
    .replace(/✓/g, "[OK]")
    .replace(/ℹ/g, "[i]")
    .replace(/[^\x00-\xFF]/g, "");
}

async function buildReportPdf(opts: {
  playerName: string;
  date: string;
  sessionDate: string | null;
  narrative: NarrativeResult;
  biomechanics: BiomechanicsInput;
  frontKneeAngleDeg: number | null;
  skeletonFrames: SkeletonFrameInput[];
}): Promise<Uint8Array> {
  const { playerName, date, sessionDate, narrative, biomechanics, frontKneeAngleDeg, skeletonFrames } = opts;
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

  const headline: [string, string][] = [
    ["Overall Score", biomechanics.overallScore !== null ? `${biomechanics.overallScore}/100` : "n/a"],
    ["Estimated Speed", `${narrative.speedKmh} km/h`],
    ["Front Knee Angle (FFC)", frontKneeAngleDeg !== null ? `${frontKneeAngleDeg}°` : "not detected"],
    ["Action Type", biomechanics.actionType],
    ["Injury-Risk Band", biomechanics.injuryRisk],
  ];
  for (const [label, value] of headline) {
    page.drawText(label, { x: 50, y, size: 11, font, color: gray });
    page.drawText(value, { x: 260, y, size: 11, font: bold, color: dark });
    y -= 20;
  }
  y -= 12;

  page.drawText("Zone Scores", { x: 50, y, size: 13, font: bold, color: dark });
  y -= 20;
  const zoneLabels: Record<ZoneId, string> = { approach: "Approach", deliveryStride: "Delivery Stride", release: "Release", followThrough: "Follow-Through" };
  for (const [zone, label] of Object.entries(zoneLabels) as [ZoneId, string][]) {
    const score = biomechanics.zoneScores[zone];
    page.drawText(label, { x: 50, y, size: 11, font, color: gray });
    page.drawText(score !== null ? `${score}/100` : "n/a", { x: 260, y, size: 11, font: bold, color: dark });
    y -= 18;
  }
  y -= 12;

  page.drawText("Summary", { x: 50, y, size: 13, font: bold, color: dark });
  y -= 20;
  y = drawWrappedText(page, sanitizeForPdf(narrative.summary), 50, y, 495, 11, font, dark);
  y -= 16;

  if (biomechanics.flags.length > 0) {
    page.drawText("Flags", { x: 50, y, size: 13, font: bold, color: dark });
    y -= 20;
    for (const flag of biomechanics.flags) {
      y = drawWrappedText(page, sanitizeForPdf(flag), 50, y, 495, 10, font, gray);
      y -= 8;
    }
    y -= 8;
  }

  if (narrative.highlight) {
    page.drawText("Highlight", { x: 50, y, size: 13, font: bold, color: dark });
    y -= 20;
    y = drawWrappedText(page, sanitizeForPdf(narrative.highlight), 50, y, 495, 11, font, dark);
    y -= 16;
  }

  if (narrative.tags.length > 0) {
    page.drawText("Tags", { x: 50, y, size: 13, font: bold, color: dark });
    y -= 20;
    y = drawWrappedText(page, sanitizeForPdf(narrative.tags.join(" · ")), 50, y, 495, 11, font, gray);
  }

  page.drawText(
    sanitizeForPdf(biomechanics.disclaimer),
    { x: 50, y: 60, size: 8, font, color: gray, maxWidth: 495 },
  );

  // Second page: skeleton-overlay key frames, so the coach can see exactly
  // what the pose-tracking measured, not just the numbers it produced.
  if (skeletonFrames.length > 0) {
    const imgPage = doc.addPage([595, 842]);
    imgPage.drawText("Skeleton Overlay - Key Phases", { x: 50, y: 790, size: 14, font: bold, color: dark });

    const cellW = 247, cellH = 280;
    const positions = [[50, 480], [298, 480], [50, 180], [298, 180]];
    for (let i = 0; i < Math.min(4, skeletonFrames.length); i++) {
      const frame = skeletonFrames[i];
      const [x, yPos] = positions[i];
      try {
        const bytes = Buffer.from(frame.base64, "base64");
        const img = frame.mediaType === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        const scale = Math.min((cellW - 10) / img.width, (cellH - 30) / img.height);
        const w = img.width * scale, h = img.height * scale;
        imgPage.drawImage(img, { x: x + (cellW - w) / 2, y: yPos + 20, width: w, height: h });
        imgPage.drawText(PHASE_LABELS[frame.phase], { x, y: yPos, size: 10, font: bold, color: dark });
      } catch {
        // Skip a frame that fails to embed rather than failing the whole PDF
      }
    }
  }

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
