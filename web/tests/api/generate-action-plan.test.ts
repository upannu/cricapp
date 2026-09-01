import { describe, expect, test, vi } from "vitest";
import { POST } from "@/app/api/generate-action-plan/route";
import { routeMockState } from "../setup/api";
import { rawUser, jsonRequest } from "../mocks/caller";

const { messagesCreate } = vi.hoisted(() => ({ messagesCreate: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  // Must be a real `function`, not an arrow — the route does `new Anthropic(...)`.
  default: vi.fn(function AnthropicMock() {
    return { messages: { create: messagesCreate } };
  }),
}));

const URL = "http://localhost/api/generate-action-plan";
const PLAYER = { name: "Test Player", age_group: "Senior", bowling_style: "Right Arm Fast" };
const REPORT_WITH_FLAGS = {
  metrics: {
    metrics: [{ id: "frontKneeFFC", label: "Front Knee Angle", value: 150, unit: "°" }],
    zoneScores: { release: 60 },
    flags: ["Front knee collapsing early"],
    flaggedMetricIds: ["frontKneeFFC"],
    overallScore: 60,
  },
  drills: [{ id: "d1", name: "Wall Drill", focus: "Knee brace", description: "Practice bracing the front knee." }],
  injury_risk: "Moderate",
  action_type: "Side-on",
  overall_score: 60,
};

function anthropicTextResponse(plan: { title: string; notes: string }) {
  return { content: [{ type: "text", text: JSON.stringify(plan) }] };
}

describe("POST /api/generate-action-plan", () => {
  test("400 when playerId or reportId missing", async () => {
    const res = await POST(jsonRequest(URL, { playerId: "p1" }));
    expect(res.status).toBe(400);
  });

  test("401 when not signed in", async () => {
    const res = await POST(jsonRequest(URL, { playerId: "p1", reportId: "r1" }));
    expect(res.status).toBe(401);
  });

  test("500 when ANTHROPIC_API_KEY is a placeholder", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    vi.stubEnv("ANTHROPIC_API_KEY", "REPLACE_ME_LATER");
    try {
      const res = await POST(jsonRequest(URL, { playerId: "p1", reportId: "r1" }));
      expect(res.status).toBe(500);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test("403 when caller cannot access the player", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "someone-else" });
    const res = await POST(jsonRequest(URL, { playerId: "p1", reportId: "r1" }));
    expect(res.status).toBe(403);
  });

  test("404 when the player is not found", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: null, error: null } };
    const res = await POST(jsonRequest(URL, { playerId: "p1", reportId: "r1" }));
    expect(res.status).toBe(404);
  });

  test("404 when the report is not found", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: PLAYER, error: null }, reports: { data: null, error: null } };
    const res = await POST(jsonRequest(URL, { playerId: "p1", reportId: "r1" }));
    expect(res.status).toBe(404);
  });

  test("400 when the report has no flagged issues to build a plan around", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = {
      players: { data: PLAYER, error: null },
      reports: { data: { ...REPORT_WITH_FLAGS, drills: [] }, error: null },
    };
    const res = await POST(jsonRequest(URL, { playerId: "p1", reportId: "r1" }));
    expect(res.status).toBe(400);
  });

  test("502 when the Anthropic call fails", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: PLAYER, error: null }, reports: { data: REPORT_WITH_FLAGS, error: null } };
    messagesCreate.mockRejectedValueOnce(new Error("model overloaded"));

    const res = await POST(jsonRequest(URL, { playerId: "p1", reportId: "r1" }));
    expect(res.status).toBe(502);
  });

  test("generates and saves the plan on success", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: PLAYER, error: null }, reports: { data: REPORT_WITH_FLAGS, error: null } };
    messagesCreate.mockResolvedValueOnce(anthropicTextResponse({ title: "Knee Brace Focus", notes: "Work on front knee stability." }));

    const res = await POST(jsonRequest(URL, { playerId: "p1", reportId: "r1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.plan).toMatchObject({
      playerId: "p1",
      title: "Knee Brace Focus",
      notes: "Work on front knee stability.",
      priority: "Medium",
      status: "Pending",
      drills: ["Wall Drill — Practice bracing the front knee."],
    });

    const client = routeMockState.lastServiceClient!;
    expect(client.tables.action_plans.insert).toHaveBeenCalledWith(
      expect.objectContaining({ player_id: "p1", title: "Knee Brace Focus", priority: "Medium" }),
    );
  });

  test("500 when saving the action plan fails", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = {
      players: { data: PLAYER, error: null },
      reports: { data: REPORT_WITH_FLAGS, error: null },
      action_plans: { data: null, error: { message: "insert failed" } },
    };
    messagesCreate.mockResolvedValueOnce(anthropicTextResponse({ title: "T", notes: "N" }));

    const res = await POST(jsonRequest(URL, { playerId: "p1", reportId: "r1" }));
    expect(res.status).toBe(500);
  });
});
