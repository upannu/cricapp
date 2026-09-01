import { describe, expect, test } from "vitest";
import { POST } from "@/app/api/stripe/create-academy-portal-session/route";
import { stripe } from "@/lib/stripe";
import { routeMockState } from "../../setup/api";
import { rawUser, jsonRequest } from "../../mocks/caller";

const URL = "http://localhost/api/stripe/create-academy-portal-session";

describe("POST /api/stripe/create-academy-portal-session", () => {
  test("400 when academyId is missing", async () => {
    const res = await POST(jsonRequest(URL, {}));
    expect(res.status).toBe(400);
  });

  test("401 when not signed in", async () => {
    const res = await POST(jsonRequest(URL, { academyId: "ac1" }));
    expect(res.status).toBe(401);
  });

  test("403 when an academy_admin requests another academy's billing portal", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "someone-else" });
    const res = await POST(jsonRequest(URL, { academyId: "ac1" }));
    expect(res.status).toBe(403);
  });

  test("400 when the academy has no billing account yet", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { academies: { data: { stripe_customer_id: null }, error: null } };
    const res = await POST(jsonRequest(URL, { academyId: "ac1" }));
    expect(res.status).toBe(400);
  });

  test("returns a real Stripe billing portal URL for an existing academy customer", async () => {
    const customer = await stripe.customers.create({ name: "Portal Test Academy" });
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "ac1" });
    routeMockState.tableResponses = { academies: { data: { stripe_customer_id: customer.id }, error: null } };

    const res = await POST(jsonRequest(URL, { academyId: "ac1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toMatch(/^https:\/\/billing\.stripe\.com\//);
  }, 15_000);
});
