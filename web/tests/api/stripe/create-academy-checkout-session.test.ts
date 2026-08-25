import { describe, expect, test } from "vitest";
import { POST } from "@/app/api/stripe/create-academy-checkout-session/route";
import { routeMockState } from "../../setup/api";
import { rawUser, jsonRequest } from "../../mocks/caller";

const URL = "http://localhost/api/stripe/create-academy-checkout-session";
const ACADEMY = { id: "ac1", name: "Test Academy", head_coach_id: null, stripe_customer_id: null };
const ORG_PLAN = { id: "plan1", name: "Board License", audience: "organization", price_aud: 500, billing_interval: "year", active: true };

describe("POST /api/stripe/create-academy-checkout-session", () => {
  test("400 when academyId or planId is missing", async () => {
    const res = await POST(jsonRequest(URL, { academyId: "ac1" }));
    expect(res.status).toBe(400);
  });

  test("401 when not signed in", async () => {
    const res = await POST(jsonRequest(URL, { academyId: "ac1", planId: "plan1" }));
    expect(res.status).toBe(401);
  });

  test("403 when an academy_admin tries to buy a plan for a different academy", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "someone-else" });
    const res = await POST(jsonRequest(URL, { academyId: "ac1", planId: "plan1" }));
    expect(res.status).toBe(403);
  });

  test("404 when the academy is not found", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { academies: { data: null, error: null } };
    const res = await POST(jsonRequest(URL, { academyId: "ac1", planId: "plan1" }));
    expect(res.status).toBe(404);
  });

  test("400 when the plan isn't an active organization-audience plan", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = {
      academies: { data: ACADEMY, error: null },
      plans: { data: { ...ORG_PLAN, audience: "individual" }, error: null },
    };
    const res = await POST(jsonRequest(URL, { academyId: "ac1", planId: "plan1" }));
    expect(res.status).toBe(400);
  });

  test("creates a real Stripe subscription checkout session for the academy", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "ac1" });
    routeMockState.tableResponses = { academies: { data: ACADEMY, error: null }, plans: { data: ORG_PLAN, error: null } };

    const res = await POST(jsonRequest(URL, { academyId: "ac1", planId: "plan1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);

    const client = routeMockState.lastServiceClient!;
    expect(client.tables.academies.update).toHaveBeenCalledWith(expect.objectContaining({ stripe_customer_id: expect.stringMatching(/^cus_/) }));
  }, 15_000);
});
