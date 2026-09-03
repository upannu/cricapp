import { describe, expect, test } from "vitest";
import { POST } from "@/app/api/stripe/create-library-checkout-session/route";
import { routeMockState } from "../../setup/api";
import { rawUser, jsonRequest } from "../../mocks/caller";

const URL = "http://localhost/api/stripe/create-library-checkout-session";
const PLAYER = { id: "p1", name: "Test Player", email: "player@example.com", stripe_customer_id: null };
const PLAN = { id: "plan1", name: "Content Library", price_aud: 4.99, billing_interval: "month", active: true };

describe("POST /api/stripe/create-library-checkout-session", () => {
  test("400 when playerId is missing", async () => {
    const res = await POST(jsonRequest(URL, {}));
    expect(res.status).toBe(400);
  });

  test("401 when not signed in", async () => {
    const res = await POST(jsonRequest(URL, { playerId: "p1" }));
    expect(res.status).toBe(401);
  });

  test("403 when a parent tries to buy library access for someone else's child", async () => {
    routeMockState.cookieUser = rawUser({ role: "parent", player_id: "someone-else" });
    const res = await POST(jsonRequest(URL, { playerId: "p1" }));
    expect(res.status).toBe(403);
  });

  // Confirmed bug, now fixed: an account with no recognized role at all used to fall straight
  // through with no check and could start a real checkout for an arbitrary playerId. Legitimate
  // staff roles are still allowed through unchanged.
  test("403 for an account with no recognized role at all", async () => {
    routeMockState.cookieUser = rawUser({ role: "" });
    const res = await POST(jsonRequest(URL, { playerId: "p1" }));
    expect(res.status).toBe(403);
  });

  test("500 when the library plan isn't active", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: PLAYER, error: null }, plans: { data: { ...PLAN, active: false }, error: null } };
    const res = await POST(jsonRequest(URL, { playerId: "p1" }));
    expect(res.status).toBe(500);
  });

  test("creates a real Stripe subscription checkout session for library access", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: PLAYER, error: null }, plans: { data: PLAN, error: null } };

    const res = await POST(jsonRequest(URL, { playerId: "p1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
  }, 15_000);
});
