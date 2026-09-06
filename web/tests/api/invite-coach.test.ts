import { describe, expect, test, vi, afterEach } from "vitest";
import { POST } from "@/app/api/invite-coach/route";
import { routeMockState } from "../setup/api";
import { rawUser, jsonRequest } from "../mocks/caller";

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn(async (_opts: Record<string, unknown>) => ({})) }));
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail })) },
}));

const URL = "http://localhost/api/invite-coach";
const BODY = { name: "New Coach", email: "newcoach@example.com", coachId: "coach-9" };

describe("POST /api/invite-coach", () => {
  afterEach(() => {
    sendMail.mockClear();
  });

  test("400 when name, email, or coachId is missing", async () => {
    const res = await POST(jsonRequest(URL, { name: "Coach" }));
    expect(res.status).toBe(400);
  });

  test("403 when not signed in", async () => {
    const res = await POST(jsonRequest(URL, BODY));
    expect(res.status).toBe(403);
  });

  test("403 when caller is neither platform_admin nor academy_admin", async () => {
    routeMockState.cookieUser = rawUser({ role: "coach", coach_id: "c1" });
    const res = await POST(jsonRequest(URL, BODY));
    expect(res.status).toBe(403);
  });

  test("invites a coach: generates a signup link, links coachId, and emails the invite", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "ac1" });
    routeMockState.tableResponses = { email_templates: { data: null, error: null } };
    const res = await POST(jsonRequest(URL, BODY));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    const client = routeMockState.lastServiceClient!;
    expect(client.auth.admin.generateLink).toHaveBeenCalledWith(expect.objectContaining({
      type: "invite", email: "newcoach@example.com",
    }));
    // role/approved/coach_id have to be set in a separate app_metadata call — generateLink's own
    // `data` option only ever writes to user_metadata (display-only, client-writable).
    expect(client.auth.admin.updateUserById).toHaveBeenCalledWith("mock-user-id", {
      app_metadata: { role: "coach", approved: true, coach_id: "coach-9" },
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const sent = sendMail.mock.calls[0][0];
    expect(sent.to).toBe("newcoach@example.com");
    expect(sent.html).toContain("token_hash=mock-hashed-token");
    expect(sent.html).toContain("type=signup");
  });

  test("uses the admin-editable coach_invite template when one exists", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = {
      email_templates: { data: { subject: "Join {{name}}!", heading: "Hi {{name}}", body: "Custom invite body." }, error: null },
    };
    await POST(jsonRequest(URL, BODY));

    const sent = sendMail.mock.calls[0][0];
    expect(sent.subject).toBe("Join New Coach!");
    expect(sent.html).toContain("Hi New Coach");
    expect(sent.html).toContain("Custom invite body.");
  });

  test("400 when generateLink fails", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.authAdminResponses = { generateLink: { data: null, error: { message: "invite failed" } } };
    const res = await POST(jsonRequest(URL, BODY));
    expect(res.status).toBe(400);
    expect(sendMail).not.toHaveBeenCalled();
  });

  test("500 when email isn't configured on this deployment — a deployment-wide condition, not per-invite", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    vi.stubEnv("GMAIL_USER", "");
    const res = await POST(jsonRequest(URL, BODY));
    expect(res.status).toBe(500);
    vi.unstubAllEnvs();
  });
});
