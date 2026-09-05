import { describe, expect, test, vi, afterEach } from "vitest";
import { POST } from "@/app/api/resend-coach-invite/route";
import { routeMockState } from "../setup/api";
import { rawUser, jsonRequest } from "../mocks/caller";

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn(async (_opts: Record<string, unknown>) => ({})) }));
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail })) },
}));

const URL = "http://localhost/api/resend-coach-invite";
const COACH = { id: "c1", name: "Coach Dan", email: "dan@example.com" };

describe("POST /api/resend-coach-invite", () => {
  afterEach(() => {
    sendMail.mockClear();
  });

  test("400 when coachId is missing", async () => {
    const res = await POST(jsonRequest(URL, {}));
    expect(res.status).toBe(400);
  });

  test("403 when caller is neither platform_admin nor academy_admin", async () => {
    routeMockState.cookieUser = rawUser({ role: "coach", coach_id: "c1" });
    const res = await POST(jsonRequest(URL, { coachId: "c1" }));
    expect(res.status).toBe(403);
  });

  test("404 when the coach doesn't exist", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { coaches: { data: null, error: null } };
    const res = await POST(jsonRequest(URL, { coachId: "c1" }));
    expect(res.status).toBe(404);
  });

  test("400 when the coach has no email on file", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { coaches: { data: { ...COACH, email: "" }, error: null } };
    const res = await POST(jsonRequest(URL, { coachId: "c1" }));
    expect(res.status).toBe(400);
  });

  test("for a coach with no existing account yet, creates one via type: invite", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { coaches: { data: COACH, error: null } };
    routeMockState.authAdminResponses = { listUsers: { data: { users: [] }, error: null } };

    const res = await POST(jsonRequest(URL, { coachId: "c1" }));
    expect(res.status).toBe(200);

    const client = routeMockState.lastServiceClient!;
    expect(client.auth.admin.generateLink).toHaveBeenCalledWith(expect.objectContaining({ type: "invite", email: "dan@example.com" }));
    expect(client.auth.admin.updateUserById).toHaveBeenCalledWith("mock-user-id", {
      app_metadata: { role: "coach", approved: true, coach_id: "c1" },
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].to).toBe("dan@example.com");
  });

  test("for a coach who already has an account, resends via type: recovery — no app_metadata rewrite", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { coaches: { data: COACH, error: null } };
    routeMockState.authAdminResponses = {
      listUsers: { data: { users: [{ id: "u1", email: "dan@example.com" }] }, error: null },
    };

    const res = await POST(jsonRequest(URL, { coachId: "c1" }));
    expect(res.status).toBe(200);

    const client = routeMockState.lastServiceClient!;
    expect(client.auth.admin.generateLink).toHaveBeenCalledWith(expect.objectContaining({ type: "recovery", email: "dan@example.com" }));
    expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  test("500 when email isn't configured on this deployment", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    vi.stubEnv("GMAIL_USER", "");
    const res = await POST(jsonRequest(URL, { coachId: "c1" }));
    expect(res.status).toBe(500);
    vi.unstubAllEnvs();
  });
});
