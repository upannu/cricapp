import { describe, expect, test } from "vitest";
import { POST } from "@/app/api/stripe/create-assessment-checkout-session/route";
import { routeMockState } from "../../setup/api";
import { rawUser, jsonRequest } from "../../mocks/caller";

const URL = "http://localhost/api/stripe/create-assessment-checkout-session";
const PLAYER = { id: "p1", name: "Test Player", email: "player@example.com", stripe_customer_id: null };
const PLAN = { id: "plan1", name: "Individual Assessment", price_aud: 15, active: true };

describe("POST /api/stripe/create-assessment-checkout-session", () => {
  test("400 when playerId is missing", async () => {
    const res = await POST(jsonRequest(URL, {}));
    expect(res.status).toBe(400);
  });

  test("401 when not signed in", async () => {
    const res = await POST(jsonRequest(URL, { playerId: "p1" }));
    expect(res.status).toBe(401);
  });

  test("403 when a player tries to buy an assessment for someone else", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "someone-else" });
    const res = await POST(jsonRequest(URL, { playerId: "p1" }));
    expect(res.status).toBe(403);
  });

  test("500 when the individual-assessment plan isn't active", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: PLAYER, error: null }, plans: { data: { ...PLAN, active: false }, error: null } };
    const res = await POST(jsonRequest(URL, { playerId: "p1" }));
    expect(res.status).toBe(500);
  });

  test("creates a real Stripe one-time checkout session for the assessment", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "p1" });
    routeMockState.tableResponses = { players: { data: PLAYER, error: null }, plans: { data: PLAN, error: null } };

    const res = await POST(jsonRequest(URL, { playerId: "p1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
  }, 15_000);
});
