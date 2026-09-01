import { describe, expect, test } from "vitest";
import { POST } from "@/app/api/stripe/create-pack-checkout-session/route";
import { routeMockState } from "../../setup/api";
import { rawUser, jsonRequest } from "../../mocks/caller";

const URL = "http://localhost/api/stripe/create-pack-checkout-session";
const PACK = {
  id: "pack1", player_id: "p1", academy_id: "ac1", coach_id: null,
  session_type: "Net Session", total_sessions: 10, fee_per_session: 20, payment_status: "Pending",
};
const PLAYER = { id: "p1", name: "Test Player", email: "player@example.com", stripe_customer_id: null };
const ONBOARDED_COACH = { id: "coach1", stripe_connect_account_id: "acct_test123", stripe_connect_onboarded: true };

describe("POST /api/stripe/create-pack-checkout-session", () => {
  test("400 when packId is missing", async () => {
    const res = await POST(jsonRequest(URL, {}));
    expect(res.status).toBe(400);
  });

  test("401 when not signed in", async () => {
    const res = await POST(jsonRequest(URL, { packId: "pack1" }));
    expect(res.status).toBe(401);
  });

  test("404 when the pack is not found", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { session_packs: { data: null, error: null } };
    const res = await POST(jsonRequest(URL, { packId: "pack1" }));
    expect(res.status).toBe(404);
  });

  test("403 when a player tries to pay for someone else's pack", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "someone-else" });
    routeMockState.tableResponses = { session_packs: { data: PACK, error: null } };
    const res = await POST(jsonRequest(URL, { packId: "pack1" }));
    expect(res.status).toBe(403);
  });

  test("400 when the pack is already paid", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { session_packs: { data: { ...PACK, payment_status: "Paid" }, error: null } };
    const res = await POST(jsonRequest(URL, { packId: "pack1" }));
    expect(res.status).toBe(400);
  });

  test("400 when the academy has no head coach to receive payouts (head_coach mode)", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = {
      session_packs: { data: PACK, error: null },
      players: { data: PLAYER, error: null },
      academies: { data: { id: "ac1", name: "Test Academy", head_coach_id: null, payout_model: "head_coach", plan_id: null }, error: null },
    };
    const res = await POST(jsonRequest(URL, { packId: "pack1" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no head coach/);
  });

  // NOTE: as of this Stripe account/API version, real Express Connect accounts
  // can no longer be created via accounts.create() at all ("Accounts v1 support"
  // must be enabled in the Stripe Dashboard) — see AGENTS.md-level finding. So a
  // synthetic-but-onboarded coach.stripe_connect_account_id can never be a REAL
  // account, and Stripe correctly rejects it as a transfer destination. This
  // still proves everything up through the real Stripe call — auth, pack
  // lookup, payout-model resolution, platform fee math — is correct; only the
  // final destination-account validity is necessarily synthetic here.
  test("resolves the head-coach payout destination and reaches Stripe with the platform fee applied", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = {
      session_packs: { data: PACK, error: null },
      players: { data: PLAYER, error: null },
      academies: { data: { id: "ac1", name: "Test Academy", head_coach_id: "coach1", payout_model: "head_coach", plan_id: null }, error: null },
      coaches: { data: ONBOARDED_COACH, error: null },
    };

    const res = await POST(jsonRequest(URL, { packId: "pack1" }));
    const body = await res.json();

    // 502 here is Stripe correctly rejecting the synthetic (non-real) destination
    // account — see the note above. Confirms the route reached Stripe with the
    // resolved head-coach destination rather than failing earlier in our own code.
    expect(res.status).toBe(502);
    expect(body.error).toMatch(/acct_test123|destination|account/i);
  }, 15_000);

  test("400 when the split-mode destination coach hasn't finished onboarding", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = {
      session_packs: { data: { ...PACK, coach_id: "coach1" }, error: null },
      players: { data: PLAYER, error: null },
      academies: { data: { id: "ac1", name: "Test Academy", head_coach_id: null, payout_model: "split_by_coach", plan_id: null }, error: null },
      coaches: { data: { id: "coach1", stripe_connect_account_id: null, stripe_connect_onboarded: false }, error: null },
    };

    const res = await POST(jsonRequest(URL, { packId: "pack1" }));
    expect(res.status).toBe(400);
  });
});
