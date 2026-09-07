import { describe, expect, test } from "vitest";
import { POST } from "@/app/api/stripe/connect/check-status/route";
import { routeMockState } from "../../../setup/api";
import { rawUser, jsonRequest } from "../../../mocks/caller";

const URL = "http://localhost/api/stripe/connect/check-status";

describe("POST /api/stripe/connect/check-status", () => {
  test("400 when coachId is missing", async () => {
    const res = await POST(jsonRequest(URL, {}));
    expect(res.status).toBe(400);
  });

  test("401 when not signed in", async () => {
    const res = await POST(jsonRequest(URL, { coachId: "coach1" }));
    expect(res.status).toBe(401);
  });

  test("403 when a coach requests someone else's status", async () => {
    routeMockState.cookieUser = rawUser({ role: "coach", coach_id: "someone-else" });
    const res = await POST(jsonRequest(URL, { coachId: "coach1" }));
    expect(res.status).toBe(403);
  });

  test("403 when a player (no coach relationship at all) requests a coach's status", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "p1" });
    const res = await POST(jsonRequest(URL, { coachId: "coach1" }));
    expect(res.status).toBe(403);
  });

  test("400 when the coach hasn't started payout setup at all", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { coaches: { data: { stripe_connect_account_id: null }, error: null } };
    const res = await POST(jsonRequest(URL, { coachId: "coach1" }));
    expect(res.status).toBe(400);
  });

  // Hits the real Stripe test-mode API (per this repo's testing conventions, Stripe routes are
  // never mocked) with an account id that doesn't exist — exercises the error path (this route
  // does wrap the Stripe call in try/catch, unlike connect/login-link's own pinned bug) rather
  // than depending on a specific real Connect account's onboarding state staying fixed forever.
  test("returns a structured 502, not an unhandled crash, when Stripe rejects the account", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { coaches: { data: { stripe_connect_account_id: "acct_test123" }, error: null } };

    const res = await POST(jsonRequest(URL, { coachId: "coach1" }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/does not have access to account/);
  }, 15_000);
});
