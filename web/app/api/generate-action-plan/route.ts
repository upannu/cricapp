import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

interface ReportMetric {
  id: string; label: string; zone: string;
  value: number | null; unit: string;
  idealRange?: [number, number]; score: number | null;
}

interface ReportBiomechanicsRow {
  metrics: ReportMetric[];
  zoneScores: Record<string, number | null>;
  flags: string[];
  flaggedMetricIds: string[];
  overallScore: number | null;
}

interface ReportDrillRow {
  id: string;
  name: string;
  focus: string;
  description: string;
}

interface PlanResult {
  title: string;
  notes: string;
}

const PRIORITY_BY_RISK: Record<string, "High" | "Medium" | "Low"> = {
  High: "High",
  Moderate: "Medium",
  Low: "Low",
};

const SYSTEM_PROMPT = `You are a cricket fast-bowling coach turning a biomechanics report into a focused training action plan for the player. You are given the REAL, geometrically-computed metrics, guideline flags, and injury-risk band for this bowler (measured from pose-tracking, not guessed), plus a pre-selected list of coaching drills already matched to the flagged issues — do not invent new drills or contradict the given numbers. Write a short, specific plan title and a coach's-notes paragraph explaining why this matters this training cycle, grounded in the actual metrics and flags provided. Be constructive and specific, as if writing for the player's own coach to hand to the player.`;

const PLAN_SCHEMA = {
  type: "object" as const,
  properties: {
    title: {
      type: "string",
      description: "Short, specific action plan title (e.g. 'Front Knee Brace & Elbow Extension Focus'), grounded in the flagged issues",
    },
    notes: {
      type: "string",
      description: "2-4 sentence coach's-notes paragraph explaining why this plan matters right now, referencing the specific flagged metrics/numbers",
    },
  },
  required: ["title", "notes"],
  additionalProperties: false,
};

export async function POST(request: Request) {
  const { playerId, reportId } = (await request.json()) as { playerId?: string; reportId?: string };
  if (!playerId || !reportId) {
    return NextResponse.json({ error: "playerId and reportId are required." }, { status: 400 });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey || anthropicKey.startsWith("REPLACE_ME")) {
    return NextResponse.json({ error: "AI action plans are not configured (missing ANTHROPIC_API_KEY)." }, { status: 500 });
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
    .select("name, age_group, bowling_style")
    .eq("id", playerId)
    .single();
  if (playerError || !player) return NextResponse.json({ error: "Player not found." }, { status: 404 });

  const { data: report, error: reportError } = await supabase
    .from("reports")
    .select("metrics, drills, injury_risk, action_type, overall_score")
    .eq("id", reportId)
    .eq("player_id", playerId)
    .single();
  if (reportError || !report) return NextResponse.json({ error: "Report not found." }, { status: 404 });

  const biomechanics = report.metrics as ReportBiomechanicsRow | null;
  const drills = (report.drills ?? []) as ReportDrillRow[];
  if (!biomechanics || drills.length === 0) {
    return NextResponse.json({ error: "This report has no flagged issues to build an action plan around." }, { status: 400 });
  }

  let plan: PlanResult;
  try {
    const anthropic = new Anthropic({ apiKey: anthropicKey });
    const metricsSummary = biomechanics.metrics
      .filter((m) => biomechanics.flaggedMetricIds.includes(m.id))
      .map((m) => `- ${m.label}: ${m.value}${m.unit}${m.idealRange ? ` (guideline range: ${m.idealRange[0]}-${m.idealRange[1]}${m.unit})` : ""}`)
      .join("\n");

    const response = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema", schema: PLAN_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: [
          `Bowler: ${player.name}, ${player.age_group}, ${player.bowling_style}.`,
          ``,
          `Flagged metrics (real geometry from pose-tracking):`,
          metricsSummary,
          ``,
          `Zone scores (0-100 vs guideline ranges): ${JSON.stringify(biomechanics.zoneScores)}`,
          `Overall score: ${biomechanics.overallScore ?? "n/a"}`,
          `Computed action type: ${report.action_type}`,
          `Computed injury-risk band: ${report.injury_risk}`,
          `Flags: ${biomechanics.flags.join(" | ")}`,
          ``,
          `Drills already selected for these flagged issues (reference/prioritize these, do not invent others): ${drills.map((d) => d.name).join(", ")}`,
        ].join("\n"),
      }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") throw new Error("No plan returned by the model.");
    plan = JSON.parse(textBlock.text) as PlanResult;
  } catch (err) {
    const msg = (err as { message?: string })?.message ?? String(err);
    return NextResponse.json({ error: `AI action plan generation failed: ${msg}` }, { status: 502 });
  }

  const id = `ap_${Date.now()}`;
  const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const priority = PRIORITY_BY_RISK[report.injury_risk as string] ?? "Medium";
  const planDrills = drills.map((d) => `${d.name} — ${d.description}`);

  const { error: insertError } = await supabase.from("action_plans").insert({
    id, player_id: playerId, title: plan.title, priority, status: "Pending",
    due_date: dueDate, drills: planDrills, notes: plan.notes,
  });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({
    plan: {
      id, playerId, title: plan.title, priority, status: "Pending",
      dueDate, drills: planDrills, notes: plan.notes,
    },
  });
}
