import { describe, expect, test } from "vitest";
import { POST } from "@/app/api/stripe/create-checkout-session/route";
import { stripe } from "@/lib/stripe";
import { routeMockState } from "../../setup/api";
import { rawUser, jsonRequest } from "../../mocks/caller";

const URL = "http://localhost/api/stripe/create-checkout-session";
const PLAYER = { id: "p1", name: "Test Player", email: "player@example.com", stripe_customer_id: null };
// Pricing now comes from the Plan Catalog (plans table, editable at /admin/plans), not the old
// flat platform_settings row — the route looks this up by slug ("player-pro"/"coach-pro").
const PLAN_ROW = { price_aud: 9.99, prices_by_currency: {}, billing_interval: "month" };

describe("POST /api/stripe/create-checkout-session", () => {
  test("400 when playerId or a valid plan is missing", async () => {
    const res = await POST(jsonRequest(URL, { playerId: "p1", plan: "Not A Real Plan" }));
    expect(res.status).toBe(400);
  });

  test("401 when not signed in", async () => {
    const res = await POST(jsonRequest(URL, { playerId: "p1", plan: "Player Pro" }));
    expect(res.status).toBe(401);
  });

  test("403 when a player tries to buy a subscription for someone else", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "someone-else" });
    const res = await POST(jsonRequest(URL, { playerId: "p1", plan: "Player Pro" }));
    expect(res.status).toBe(403);
  });

  // Confirmed bug, now fixed: the check above only ever rejected a *mismatched* player/parent —
  // any account with no role at all (unset/malformed app_metadata, never meant to reach this
  // route) fell straight through with no check and could start a real checkout for an arbitrary
  // playerId. Legitimate staff roles (coach/academy_admin/platform_admin) are still allowed
  // through, unchanged — same broad-trust convention every sibling Stripe route already uses.
  test("403 for an account with no recognized role at all", async () => {
    routeMockState.cookieUser = rawUser({ role: "" });
    const res = await POST(jsonRequest(URL, { playerId: "p1", plan: "Player Pro" }));
    expect(res.status).toBe(403);
  });

  test("404 when the player is not found", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: null, error: null } };
    const res = await POST(jsonRequest(URL, { playerId: "p1", plan: "Player Pro" }));
    expect(res.status).toBe(404);
  });

  test("500 when the plan's pricing row isn't configured", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: PLAYER, error: null }, plans: { data: null, error: { message: "not found" } } };
    const res = await POST(jsonRequest(URL, { playerId: "p1", plan: "Player Pro" }));
    expect(res.status).toBe(500);
  });

  test("creates a real Stripe test-mode checkout session and returns its URL", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "p1" });
    routeMockState.tableResponses = { players: { data: PLAYER, error: null }, plans: { data: PLAN_ROW, error: null } };

    const res = await POST(jsonRequest(URL, { playerId: "p1", plan: "Player Pro" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);

    // A new Stripe customer was created and persisted back onto the player row.
    const client = routeMockState.lastServiceClient!;
    expect(client.tables.players.update).toHaveBeenCalledWith(expect.objectContaining({ stripe_customer_id: expect.stringMatching(/^cus_/) }));
  }, 15_000);

  test("reuses an existing Stripe customer id instead of creating a new one", async () => {
    const existingCustomer = await stripe.customers.create({ email: "existing-player@example.com", name: "Existing Player" });
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = {
      players: { data: { ...PLAYER, stripe_customer_id: existingCustomer.id }, error: null },
      plans: { data: PLAN_ROW, error: null },
    };

    const res = await POST(jsonRequest(URL, { playerId: "p1", plan: "Coach Pro" }));
    expect(res.status).toBe(200);

    const client = routeMockState.lastServiceClient!;
    expect(client.tables.players.update).not.toHaveBeenCalled();
  }, 20_000);
});
