import { describe, expect, test, vi, afterEach } from "vitest";
import { POST } from "@/app/api/send-plan-email/route";
import { routeMockState } from "../setup/api";
import { rawUser, jsonRequest } from "../mocks/caller";

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn(async (_opts: Record<string, unknown>) => ({})) }));
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail })) },
}));

const URL = "http://localhost/api/send-plan-email";
// fetchAcademyPlanInfo re-queries "academies" with different columns than the route's own
// lookup, but this mock harness returns one static row per table for the whole test — so this
// row needs every column either query might ask for at once.
const ACADEMY = { name: "Riverside Academy", plan_id: "plan1", currency: "aud" };
const PLAN = { name: "Academy License", price_aud: 999, prices_by_currency: {}, billing_interval: "month", included_notes: "Unlimited AI reports." };
const ADMIN_USER = { id: "auth-1", email: "admin@example.com", app_metadata: { role: "academy_admin", academy_id: "ac1" }, user_metadata: { name: "Admin One" } };

describe("POST /api/send-plan-email", () => {
  afterEach(() => {
    sendMail.mockClear();
  });

  test("400 when academyId is missing", async () => {
    const res = await POST(jsonRequest(URL, {}));
    expect(res.status).toBe(400);
  });

  test("401 when not signed in", async () => {
    const res = await POST(jsonRequest(URL, { academyId: "ac1" }));
    expect(res.status).toBe(401);
  });

  test("403 when the caller has no access to this academy", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "someone-else" });
    const res = await POST(jsonRequest(URL, { academyId: "ac1" }));
    expect(res.status).toBe(403);
  });

  test("404 when the academy doesn't exist", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { academies: { data: null, error: null } };
    const res = await POST(jsonRequest(URL, { academyId: "ac1" }));
    expect(res.status).toBe(404);
  });

  test("400 when the academy has no plan assigned", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { academies: { data: { name: "Riverside Academy", plan_id: null, currency: "aud" }, error: null } };
    const res = await POST(jsonRequest(URL, { academyId: "ac1" }));
    expect(res.status).toBe(400);
  });

  test("404 when the academy has a plan but no academy_admin account on file", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { academies: { data: ACADEMY, error: null }, plans: { data: PLAN, error: null } };
    routeMockState.authAdminResponses = { listUsers: { data: { users: [] }, error: null } };
    const res = await POST(jsonRequest(URL, { academyId: "ac1" }));
    expect(res.status).toBe(404);
  });

  test("emails every academy_admin on file for the academy", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { academies: { data: ACADEMY, error: null }, plans: { data: PLAN, error: null } };
    routeMockState.authAdminResponses = { listUsers: { data: { users: [ADMIN_USER] }, error: null } };

    const res = await POST(jsonRequest(URL, { academyId: "ac1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, sent: 1 });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0]).toMatchObject({ to: "admin@example.com" });
  });
});
