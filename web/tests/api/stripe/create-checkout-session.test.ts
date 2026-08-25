import { describe, expect, test } from "vitest";
import { POST } from "@/app/api/stripe/create-checkout-session/route";
import { stripe } from "@/lib/stripe";
import { routeMockState } from "../../setup/api";
import { rawUser, jsonRequest } from "../../mocks/caller";

const URL = "http://localhost/api/stripe/create-checkout-session";
const PLAYER = { id: "p1", name: "Test Player", email: "player@example.com", stripe_customer_id: null };
const SETTINGS = { player_pro_price_aud: 9.99, coach_pro_price_aud: 29.99 };

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

  test("404 when the player is not found", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: null, error: null } };
    const res = await POST(jsonRequest(URL, { playerId: "p1", plan: "Player Pro" }));
    expect(res.status).toBe(404);
  });

  test("500 when platform pricing isn't configured", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: PLAYER, error: null }, platform_settings: { data: null, error: { message: "not found" } } };
    const res = await POST(jsonRequest(URL, { playerId: "p1", plan: "Player Pro" }));
    expect(res.status).toBe(500);
  });

  test("creates a real Stripe test-mode checkout session and returns its URL", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "p1" });
    routeMockState.tableResponses = { players: { data: PLAYER, error: null }, platform_settings: { data: SETTINGS, error: null } };

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
      platform_settings: { data: SETTINGS, error: null },
    };

    const res = await POST(jsonRequest(URL, { playerId: "p1", plan: "Coach Pro" }));
    expect(res.status).toBe(200);

    const client = routeMockState.lastServiceClient!;
    expect(client.tables.players.update).not.toHaveBeenCalled();
  }, 20_000);
});
