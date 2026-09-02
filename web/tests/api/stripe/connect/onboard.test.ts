import { describe, expect, test } from "vitest";
import { POST } from "@/app/api/stripe/connect/onboard/route";
import { routeMockState } from "../../../setup/api";
import { rawUser, jsonRequest } from "../../../mocks/caller";

const URL = "http://localhost/api/stripe/connect/onboard";
const COACH = { id: "coach1", name: "Test Coach", email: "coach@example.com", stripe_connect_account_id: null };

describe("POST /api/stripe/connect/onboard", () => {
  test("400 when coachId is missing", async () => {
    const res = await POST(jsonRequest(URL, {}));
    expect(res.status).toBe(400);
  });

  test("401 when not signed in", async () => {
    const res = await POST(jsonRequest(URL, { coachId: "coach1" }));
    expect(res.status).toBe(401);
  });

  test("403 when a coach tries to onboard someone else's payout account", async () => {
    routeMockState.cookieUser = rawUser({ role: "coach", coach_id: "someone-else" });
    const res = await POST(jsonRequest(URL, { coachId: "coach1" }));
    expect(res.status).toBe(403);
  });

  test("403 when a player (non-staff, non-coach) attempts onboarding", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "p1" });
    const res = await POST(jsonRequest(URL, { coachId: "coach1" }));
    expect(res.status).toBe(403);
  });

  test("404 when the coach is not found", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { coaches: { data: null, error: null } };
    const res = await POST(jsonRequest(URL, { coachId: "coach1" }));
    expect(res.status).toBe(404);
  });

  // Real Stripe test-mode call (per AGENTS.md, Stripe routes hit the real test-mode API
  // rather than being mocked) — creates a real v2 recipient account with the "recipient"
  // configuration and returns a real hosted-onboarding accountLinks URL. This route used
  // to call the now-unsupported Accounts v1 API here and get rejected; the v2 migration
  // (see connect/onboard/route.ts) is what makes this a real 200 rather than a 502.
  test("creates a real Connect account and returns a hosted onboarding link", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { coaches: { data: COACH, error: null } };

    const res = await POST(jsonRequest(URL, { coachId: "coach1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toMatch(/^https:\/\/connect\.stripe\.com\//);
  }, 15_000);
});
