import { describe, expect, test, vi } from "vitest";
import { POST } from "@/app/api/coach-chat/route";
import { routeMockState } from "../setup/api";
import { rawUser, jsonRequest } from "../mocks/caller";

const { messagesStream } = vi.hoisted(() => ({ messagesStream: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(function AnthropicMock() {
    return { messages: { stream: messagesStream } };
  }),
}));

const URL = "http://localhost/api/coach-chat";

/** Fake async-iterable matching Anthropic's messages.stream() event shape. */
function fakeClaudeStream(textChunks: string[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const text of textChunks) {
        yield { type: "content_block_delta", delta: { type: "text_delta", text } };
      }
    },
  };
}

async function readAll(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

const STAFF_PLAYER = {
  name: "Test Player", sub_plan: "Player Pro", acad_stage: "Foundation",
  bio_ball_speed_kmh: 120, bio_front_knee_angle_deg: 170, bio_action_type: "Side-on", bio_injury_risk: "Low",
  chat_messages_used_today: 0, chat_last_message_date: null,
};

describe("POST /api/coach-chat", () => {
  test("400 when there are no messages", async () => {
    const res = await POST(jsonRequest(URL, { messages: [] }));
    expect(res.status).toBe(400);
  });

  test("400 when the last message isn't from the user", async () => {
    const res = await POST(jsonRequest(URL, { messages: [{ role: "assistant", content: "hi" }] }));
    expect(res.status).toBe(400);
  });

  test("401 when not signed in", async () => {
    const res = await POST(jsonRequest(URL, { messages: [{ role: "user", content: "hi" }] }));
    expect(res.status).toBe(401);
  });

  test("400 when a player/parent account has no linked player", async () => {
    routeMockState.cookieUser = rawUser({ role: "player" });
    const res = await POST(jsonRequest(URL, { messages: [{ role: "user", content: "hi" }] }));
    expect(res.status).toBe(400);
  });

  test("404 when the linked player is not found", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "p1" });
    routeMockState.tableResponses = { players: { data: null, error: null } };
    const res = await POST(jsonRequest(URL, { messages: [{ role: "user", content: "hi" }] }));
    expect(res.status).toBe(404);
  });

  test("403 with limitReached once a Free-plan player hits today's message cap", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "p1" });
    const today = new Date().toISOString().slice(0, 10);
    routeMockState.tableResponses = {
      players: { data: { ...STAFF_PLAYER, sub_plan: "Free", chat_messages_used_today: 3, chat_last_message_date: today }, error: null },
    };

    const res = await POST(jsonRequest(URL, { messages: [{ role: "user", content: "hi" }] }));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.limitReached).toBe(true);
  });

  test("resets the daily count when the last message was on a previous day", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "p1" });
    routeMockState.tableResponses = {
      players: { data: { ...STAFF_PLAYER, sub_plan: "Free", chat_messages_used_today: 3, chat_last_message_date: "2020-01-01" }, error: null },
    };
    messagesStream.mockReturnValue(fakeClaudeStream(["Hello ", "there."]));

    const res = await POST(jsonRequest(URL, { messages: [{ role: "user", content: "hi" }] }));
    expect(res.status).toBe(200);

    const client = routeMockState.lastServiceClient!;
    expect(client.tables.players.update).toHaveBeenCalledWith(expect.objectContaining({ chat_messages_used_today: 1 }));
  });

  test("streams the response and increments the player's daily usage", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "p1" });
    const today = new Date().toISOString().slice(0, 10);
    routeMockState.tableResponses = {
      players: { data: { ...STAFF_PLAYER, sub_plan: "Free", chat_messages_used_today: 1, chat_last_message_date: today }, error: null },
    };
    messagesStream.mockReturnValue(fakeClaudeStream(["Front knee ", "stability matters most."]));

    const res = await POST(jsonRequest(URL, { messages: [{ role: "user", content: "What matters most?" }] }));
    expect(res.status).toBe(200);
    expect(await readAll(res)).toBe("Front knee stability matters most.");

    const client = routeMockState.lastServiceClient!;
    expect(client.tables.players.update).toHaveBeenCalledWith(expect.objectContaining({ chat_messages_used_today: 2 }));
  });

  test("Player Pro (unlimited) never touches the usage counter", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "p1" });
    routeMockState.tableResponses = { players: { data: STAFF_PLAYER, error: null } };
    messagesStream.mockReturnValue(fakeClaudeStream(["Sure."]));

    const res = await POST(jsonRequest(URL, { messages: [{ role: "user", content: "Hi" }] }));
    expect(res.status).toBe(200);

    const client = routeMockState.lastServiceClient!;
    expect(client.tables.players.update).not.toHaveBeenCalled();
  });

  test("a coach isn't gated by the player message-limit logic at all", async () => {
    routeMockState.cookieUser = rawUser({ role: "coach", coach_id: "c1" });
    messagesStream.mockReturnValue(fakeClaudeStream(["General coaching advice."]));

    const res = await POST(jsonRequest(URL, { messages: [{ role: "user", content: "How do I coach pace?" }] }));
    expect(res.status).toBe(200);
    expect(await readAll(res)).toBe("General coaching advice.");
  });

  test("500 when ANTHROPIC_API_KEY isn't configured", async () => {
    routeMockState.cookieUser = rawUser({ role: "coach", coach_id: "c1" });
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    try {
      const res = await POST(jsonRequest(URL, { messages: [{ role: "user", content: "hi" }] }));
      expect(res.status).toBe(500);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test("streams a graceful error message instead of throwing when Claude fails mid-stream", async () => {
    routeMockState.cookieUser = rawUser({ role: "coach", coach_id: "c1" });
    messagesStream.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        throw new Error("model overloaded");
      },
    });

    const res = await POST(jsonRequest(URL, { messages: [{ role: "user", content: "hi" }] }));
    expect(res.status).toBe(200);
    expect(await readAll(res)).toContain("model overloaded");
  });
});
