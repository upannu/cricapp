import { describe, expect, test } from "vitest";
import { POST } from "@/app/api/stripe/create-portal-session/route";
import { stripe } from "@/lib/stripe";
import { routeMockState } from "../../setup/api";
import { rawUser, jsonRequest } from "../../mocks/caller";

const URL = "http://localhost/api/stripe/create-portal-session";

describe("POST /api/stripe/create-portal-session", () => {
  test("400 when playerId is missing", async () => {
    const res = await POST(jsonRequest(URL, {}));
    expect(res.status).toBe(400);
  });

  test("401 when not signed in", async () => {
    const res = await POST(jsonRequest(URL, { playerId: "p1" }));
    expect(res.status).toBe(401);
  });

  test("403 when a player requests another player's billing portal", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "someone-else" });
    const res = await POST(jsonRequest(URL, { playerId: "p1" }));
    expect(res.status).toBe(403);
  });

  // Confirmed bug, now fixed: an account with no recognized role at all used to fall straight
  // through with no check and could open a real Stripe billing portal session for an arbitrary
  // playerId. Legitimate staff roles are still allowed through unchanged.
  test("403 for an account with no recognized role at all", async () => {
    routeMockState.cookieUser = rawUser({ role: "" });
    const res = await POST(jsonRequest(URL, { playerId: "p1" }));
    expect(res.status).toBe(403);
  });

  test("400 when the player has no billing account yet", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: { stripe_customer_id: null }, error: null } };
    const res = await POST(jsonRequest(URL, { playerId: "p1" }));
    expect(res.status).toBe(400);
  });

  test("returns a real Stripe billing portal URL for an existing customer", async () => {
    const customer = await stripe.customers.create({ email: "portal-player@example.com" });
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "p1" });
    routeMockState.tableResponses = { players: { data: { stripe_customer_id: customer.id }, error: null } };

    const res = await POST(jsonRequest(URL, { playerId: "p1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toMatch(/^https:\/\/billing\.stripe\.com\//);
  }, 15_000);
});
