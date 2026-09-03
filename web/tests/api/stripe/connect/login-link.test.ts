import { describe, expect, test } from "vitest";
import { POST } from "@/app/api/stripe/connect/login-link/route";
import { routeMockState } from "../../../setup/api";
import { rawUser, jsonRequest } from "../../../mocks/caller";

const URL = "http://localhost/api/stripe/connect/login-link";

describe("POST /api/stripe/connect/login-link", () => {
  test("400 when coachId is missing", async () => {
    const res = await POST(jsonRequest(URL, {}));
    expect(res.status).toBe(400);
  });

  test("401 when not signed in", async () => {
    const res = await POST(jsonRequest(URL, { coachId: "coach1" }));
    expect(res.status).toBe(401);
  });

  test("403 when a coach requests someone else's login link", async () => {
    routeMockState.cookieUser = rawUser({ role: "coach", coach_id: "someone-else" });
    const res = await POST(jsonRequest(URL, { coachId: "coach1" }));
    expect(res.status).toBe(403);
  });

  // Confirmed bug, now fixed: this role check only rejected a *mismatched* coach — a player or
  // parent (or anyone else with no relationship to this coach at all) fell straight through with
  // no check and got a real login link into that coach's live Stripe Express dashboard.
  test("403 when a player (no coach relationship at all) requests a coach's login link", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "p1" });
    const res = await POST(jsonRequest(URL, { coachId: "coach1" }));
    expect(res.status).toBe(403);
  });

  test("403 when a parent requests a coach's login link", async () => {
    routeMockState.cookieUser = rawUser({ role: "parent", player_id: "p1" });
    const res = await POST(jsonRequest(URL, { coachId: "coach1" }));
    expect(res.status).toBe(403);
  });

  test("400 when the coach hasn't set up payouts at all", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { coaches: { data: { stripe_connect_account_id: null }, error: null } };
    const res = await POST(jsonRequest(URL, { coachId: "coach1" }));
    expect(res.status).toBe(400);
  });

  test("400 when the coach has an account but onboarding isn't complete", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { coaches: { data: { stripe_connect_account_id: "acct_test123", stripe_connect_onboarded: false }, error: null } };
    const res = await POST(jsonRequest(URL, { coachId: "coach1" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/isn't complete/);
  });

  // BUG (found by this test, not a test-authoring issue): unlike every other
  // Stripe route in this codebase, this route does NOT wrap
  // stripe.accounts.createLoginLink(...) in try/catch. A Stripe-side failure
  // (bad/nonexistent account, revoked access, network blip) becomes an
  // unhandled exception here instead of the app's usual structured
  // { error: "..." } JSON response — in production that means a raw 500
  // crash page instead of a helpful message. Pinning down the current
  // (buggy) behavior rather than masking it; fix is to wrap the call in
  // try/catch like every sibling Stripe route does.
  test("throws unhandled instead of returning a structured error when Stripe rejects the account", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { coaches: { data: { stripe_connect_account_id: "acct_test123", stripe_connect_onboarded: true }, error: null } };

    await expect(POST(jsonRequest(URL, { coachId: "coach1" }))).rejects.toThrow(/does not have access to account/);
  }, 15_000);
});
