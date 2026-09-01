import { describe, expect, test, vi, afterEach } from "vitest";
import { POST } from "@/app/api/reports/send-email/route";
import { routeMockState } from "../../setup/api";
import { rawUser, jsonRequest } from "../../mocks/caller";

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn(async (_opts: Record<string, unknown>) => ({})) }));
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail })) },
}));

const URL = "http://localhost/api/reports/send-email";
const REPORT = {
  id: "r1",
  summary: "Solid session.",
  speed_kmh: 120,
  front_knee_angle_deg: 170,
  tags: ["Good knee brace"],
  highlight: "Great follow-through.",
  date: "2026-08-01",
  session_date: null,
  review_status: "completed",
};
const PLAYER = { name: "Test Player", email: "player@example.com" };

describe("POST /api/reports/send-email", () => {
  afterEach(() => {
    sendMail.mockClear();
  });

  test("400 when reportId or playerId missing", async () => {
    const res = await POST(jsonRequest(URL, { reportId: "r1" }));
    expect(res.status).toBe(400);
  });

  test("401 when not signed in", async () => {
    const res = await POST(jsonRequest(URL, { reportId: "r1", playerId: "p1" }));
    expect(res.status).toBe(401);
  });

  test("500 when Gmail credentials are not configured", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    vi.stubEnv("GMAIL_USER", "");
    try {
      const res = await POST(jsonRequest(URL, { reportId: "r1", playerId: "p1" }));
      expect(res.status).toBe(500);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test("403 when caller cannot access the player", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "someone-else" });
    const res = await POST(jsonRequest(URL, { reportId: "r1", playerId: "p1" }));
    expect(res.status).toBe(403);
  });

  test("404 when the report is not found", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { reports: { data: null, error: { message: "not found" } } };
    const res = await POST(jsonRequest(URL, { reportId: "r1", playerId: "p1" }));
    expect(res.status).toBe(404);
  });

  test("400 when the player has no email on file", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = {
      reports: { data: REPORT, error: null },
      players: { data: { name: "Test Player", email: "" }, error: null },
    };
    const res = await POST(jsonRequest(URL, { reportId: "r1", playerId: "p1" }));
    expect(res.status).toBe(400);
  });

  test("sends the email and reports success", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = {
      reports: { data: REPORT, error: null },
      players: { data: PLAYER, error: null },
    };

    const res = await POST(jsonRequest(URL, { reportId: "r1", playerId: "p1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0]).toMatchObject({ to: "player@example.com" });
  });

  test("502 when sendMail throws", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = {
      reports: { data: REPORT, error: null },
      players: { data: PLAYER, error: null },
    };
    sendMail.mockRejectedValueOnce(new Error("SMTP exploded"));

    const res = await POST(jsonRequest(URL, { reportId: "r1", playerId: "p1" }));
    expect(res.status).toBe(502);
  });
});
