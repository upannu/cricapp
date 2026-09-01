import { describe, expect, test, vi, afterEach } from "vitest";
import { POST } from "@/app/api/ai-report/route";
import { routeMockState } from "../setup/api";
import { rawUser, jsonRequest } from "../mocks/caller";

const { messagesCreate } = vi.hoisted(() => ({ messagesCreate: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  // Must be a real `function`, not an arrow — the route does `new Anthropic(...)`.
  default: vi.fn(function AnthropicMock() {
    return { messages: { create: messagesCreate } };
  }),
}));

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn(async () => ({})) }));
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail })) },
}));

const URL = "http://localhost/api/ai-report";
const PLAYER = { id: "p1", name: "Test Player", email: "player@example.com", bowling_style: "Right Arm Fast", age_group: "Senior", assessment_credits: 2 };

const BIOMECHANICS = {
  phases: {},
  metrics: [{ id: "frontKneeFFC", label: "Front Knee Angle", zone: "release", value: 150, unit: "°", score: 60 }],
  zoneScores: { approach: 70, deliveryStride: 65, release: 60, followThrough: 68 },
  flags: ["Front knee collapsing early"],
  flaggedMetricIds: ["frontKneeFFC"],
  overallScore: 65,
  actionType: "Side-on",
  injuryRisk: "Moderate",
  disclaimer: "Estimates only, not medical advice.",
};

function anthropicNarrativeResponse(narrative: { speedKmh: number; summary: string; tags: string[]; highlight: string }) {
  return { content: [{ type: "text", text: JSON.stringify(narrative) }] };
}

const NARRATIVE = { speedKmh: 118, summary: "Solid pace with a knee brace issue.", tags: ["Good pace"], highlight: "Work on front knee." };

describe("POST /api/ai-report", () => {
  afterEach(() => {
    sendMail.mockClear();
  });

  test("400 when playerId or biomechanics missing", async () => {
    const res = await POST(jsonRequest(URL, { playerId: "p1" }));
    expect(res.status).toBe(400);
  });

  test("401 when not signed in", async () => {
    const res = await POST(jsonRequest(URL, { playerId: "p1", biomechanics: BIOMECHANICS }));
    expect(res.status).toBe(401);
  });

  test("403 when caller cannot access the player", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "someone-else" });
    const res = await POST(jsonRequest(URL, { playerId: "p1", biomechanics: BIOMECHANICS }));
    expect(res.status).toBe(403);
  });

  test("404 when the player is not found", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: null, error: null } };
    const res = await POST(jsonRequest(URL, { playerId: "p1", biomechanics: BIOMECHANICS }));
    expect(res.status).toBe(404);
  });

  test("402 when spending an assessment credit with none remaining", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: { ...PLAYER, assessment_credits: 0 }, error: null } };
    const res = await POST(jsonRequest(URL, { playerId: "p1", biomechanics: BIOMECHANICS, useAssessmentCredit: true }));
    expect(res.status).toBe(402);
  });

  test("spends exactly one assessment credit when requested", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: PLAYER, error: null } };
    messagesCreate.mockResolvedValueOnce(anthropicNarrativeResponse(NARRATIVE));

    const res = await POST(jsonRequest(URL, { playerId: "p1", biomechanics: BIOMECHANICS, useAssessmentCredit: true }));
    expect(res.status).toBe(200);

    const client = routeMockState.lastServiceClient!;
    expect(client.tables.players.update).toHaveBeenCalledWith(expect.objectContaining({ assessment_credits: 1 }));
  });

  test("502 when the Anthropic call fails", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: PLAYER, error: null } };
    messagesCreate.mockRejectedValueOnce(new Error("model overloaded"));

    const res = await POST(jsonRequest(URL, { playerId: "p1", biomechanics: BIOMECHANICS }));
    expect(res.status).toBe(502);
  });

  test("prefers a measured ball-tracking speed over Claude's estimate", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: PLAYER, error: null } };
    messagesCreate.mockResolvedValueOnce(anthropicNarrativeResponse(NARRATIVE));

    const res = await POST(
      jsonRequest(URL, {
        playerId: "p1",
        biomechanics: BIOMECHANICS,
        ballTracking: { measured: true, confidence: "high", speedKmh: 132, bounceLengthZone: "Good Length", bounceLineApprox: "Off Stump" },
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.report.speedKmh).toBe(132);

    const client = routeMockState.lastServiceClient!;
    expect(client.tables.reports.insert).toHaveBeenCalledWith(expect.objectContaining({ speed_kmh: 132 }));
  });

  test("saves the report, updates player/session snapshots, and uploads a PDF", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: PLAYER, error: null }, sessions: { data: { created_at: "2026-08-01T10:00:00Z" }, error: null } };
    messagesCreate.mockResolvedValueOnce(anthropicNarrativeResponse(NARRATIVE));

    const res = await POST(jsonRequest(URL, { playerId: "p1", sessionId: "s1", biomechanics: BIOMECHANICS }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.report.summary).toBe(NARRATIVE.summary);
    expect(body.pdfUrl).toBeTruthy();

    const client = routeMockState.lastServiceClient!;
    expect(client.tables.reports.insert).toHaveBeenCalledTimes(1);
    expect(client.tables.players.update).toHaveBeenCalledWith(expect.objectContaining({ bio_action_type: "Side-on" }));
    expect(client.tables.sessions.update).toHaveBeenCalledWith(expect.objectContaining({ front_knee_angle_deg: 150 }));
    expect(client.buckets["session-reports"].upload).toHaveBeenCalled();
    // Emailing the report to the player/parent is no longer part of report generation — it's a
    // separate, explicit step (POST /api/reports/send-email) gated behind the review workflow
    // (a report starts "not_reviewed" and isn't emailable until a coach marks it reviewed). See
    // tests/api/reports/send-email.test.ts for that route's own coverage.
    expect(sendMail).not.toHaveBeenCalled();
  });

  test("500 when saving the report row fails", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: PLAYER, error: null }, reports: { data: null, error: { message: "insert failed" } } };
    messagesCreate.mockResolvedValueOnce(anthropicNarrativeResponse(NARRATIVE));

    const res = await POST(jsonRequest(URL, { playerId: "p1", biomechanics: BIOMECHANICS }));
    expect(res.status).toBe(500);
  });

  test("still returns 200 when the post-save PDF/email step fails", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: PLAYER, error: null } };
    messagesCreate.mockResolvedValueOnce(anthropicNarrativeResponse(NARRATIVE));
    sendMail.mockRejectedValueOnce(new Error("SMTP exploded"));

    const res = await POST(jsonRequest(URL, { playerId: "p1", biomechanics: BIOMECHANICS }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});
