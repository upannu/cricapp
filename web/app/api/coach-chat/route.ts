import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import Anthropic from "@anthropic-ai/sdk";
import { chatMessagesLimitForPlan } from "@/lib/plan-features";
import type { PlanTier } from "@/lib/types";

const SYSTEM_PROMPT = `You are Coach AI, PACE HQ's in-app assistant for fast bowling coaching and biomechanics analysis.

You act ONLY as a cricket fast-bowling coach and analyst. Your scope is exactly these areas, drawn from the PACE HQ Academy curriculum:
1. Bowling technique and mechanics (run-up, delivery stride, arm action, release, action types).
2. Explaining PACE HQ report metrics (zone scores, front knee angle, hip-shoulder separation, trunk lean, arm speed index, etc.) and what a specific reading means.
3. Training drills to fix a specific technical issue.
4. Fast bowling strength & conditioning basics (S&C, mobility, recovery).
5. Workload management and injury-risk awareness — you are not a doctor or physiotherapist; for actual pain, injury, or medical symptoms, tell the bowler to see a qualified physio or doctor rather than diagnosing anything yourself.
6. PACE HQ Academy article content (Foundation/Mechanics/Velocity/Elite stages).
7. Match-day and tactical bowling advice (plans against a batter, conditions, formats).
8. Mental approach, confidence, and routine for bowlers.

If asked about anything outside cricket fast-bowling coaching and analysis — general chit-chat, other sports, coding help, unrelated general knowledge, medical diagnosis, legal or financial advice, or anything else off-topic — politely decline in one sentence and redirect back to bowling: "I'm PACE HQ's cricket coaching assistant, so I can't help with that — happy to talk technique, training, or your reports though."

Voice: plain English, encouraging, specific — the same voice as the PACE HQ Academy articles. Lead with the practical takeaway before the explanation. Keep answers focused and no longer than they need to be for a chat interface — a few short paragraphs or a short list, not an essay.

Never fabricate a bowler's own metrics. Only reference specific numbers if they are given to you below as context — otherwise speak generally.`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(request: Request) {
  const { messages } = (await request.json()) as { messages?: ChatMessage[] };
  if (!messages?.length || messages[messages.length - 1].role !== "user") {
    return Response.json({ error: "A user message is required." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
  );
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const role = user.user_metadata?.role as string | undefined;
  const playerId = user.user_metadata?.player_id as string | undefined;
  const isPlayerOrParent = role === "player" || role === "parent";

  let contextBlurb = "";

  if (isPlayerOrParent) {
    if (!playerId) {
      return Response.json({ error: "No player linked to this account." }, { status: 400 });
    }
    const sb = serviceClient();
    const { data: player, error } = await sb
      .from("players")
      .select("name, sub_plan, acad_stage, bio_ball_speed_kmh, bio_front_knee_angle_deg, bio_action_type, bio_injury_risk, chat_messages_used_today, chat_last_message_date")
      .eq("id", playerId)
      .single();
    if (error || !player) {
      return Response.json({ error: "Player not found." }, { status: 404 });
    }

    const limit = chatMessagesLimitForPlan(player.sub_plan as PlanTier);
    if (limit !== null) {
      const today = new Date().toISOString().slice(0, 10);
      const usedToday = player.chat_last_message_date === today ? player.chat_messages_used_today : 0;
      if (usedToday >= limit) {
        return Response.json(
          { error: `Daily Coach AI limit reached on the Free plan (${limit} messages/day). Upgrade to Player Pro for unlimited access.`, limitReached: true },
          { status: 403 }
        );
      }
      await sb.from("players").update({
        chat_messages_used_today: usedToday + 1,
        chat_last_message_date: today,
      }).eq("id", playerId);
    }

    contextBlurb = [
      `\nContext for this bowler (only reference specifics if relevant to their question):`,
      `Name: ${player.name}`,
      `Academy stage: ${player.acad_stage}`,
      `Latest ball speed: ${player.bio_ball_speed_kmh} km/h`,
      `Latest front knee angle: ${player.bio_front_knee_angle_deg}°`,
      `Action type: ${player.bio_action_type}`,
      `Injury risk: ${player.bio_injury_risk}`,
    ].join("\n");
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return Response.json({ error: "AI chat is not configured." }, { status: 500 });
  }
  const anthropic = new Anthropic({ apiKey: anthropicKey });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const claudeStream = anthropic.messages.stream({
          model: "claude-opus-4-8",
          max_tokens: 1024,
          thinking: { type: "adaptive" },
          output_config: { effort: "medium" },
          system: SYSTEM_PROMPT + contextBlurb,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        });
        for await (const event of claudeStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`\n\n[Coach AI hit an error: ${(err as { message?: string })?.message ?? String(err)}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
