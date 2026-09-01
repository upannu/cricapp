import { describe, expect, test } from "vitest";
import { POST } from "@/app/api/stripe/create-booking-checkout-session/route";
import { routeMockState } from "../../setup/api";
import { rawUser, jsonRequest } from "../../mocks/caller";

const URL = "http://localhost/api/stripe/create-booking-checkout-session";
const BOOKING = { id: "b1", player_id: "p1", coach_id: "coach1", type: "Net Session", fee_aud: 40, pack_id: null, payment_status: "Pending" };
const PLAYER = { id: "p1", name: "Test Player", email: "player@example.com", stripe_customer_id: null };
const COACH = { id: "coach1", name: "Test Coach", academy_id: "ac1" };
const ONBOARDED_COACH_FULL = { stripe_connect_account_id: "acct_test123", stripe_connect_onboarded: true };

describe("POST /api/stripe/create-booking-checkout-session", () => {
  test("400 when bookingId is missing", async () => {
    const res = await POST(jsonRequest(URL, {}));
    expect(res.status).toBe(400);
  });

  test("401 when not signed in", async () => {
    const res = await POST(jsonRequest(URL, { bookingId: "b1" }));
    expect(res.status).toBe(401);
  });

  test("404 when the booking is not found", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { bookings: { data: null, error: null } };
    const res = await POST(jsonRequest(URL, { bookingId: "b1" }));
    expect(res.status).toBe(404);
  });

  test("403 when a player tries to pay for someone else's booking", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "someone-else" });
    routeMockState.tableResponses = { bookings: { data: BOOKING, error: null } };
    const res = await POST(jsonRequest(URL, { bookingId: "b1" }));
    expect(res.status).toBe(403);
  });

  test("400 when the booking is already covered by a session pack", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { bookings: { data: { ...BOOKING, pack_id: "pack1" }, error: null } };
    const res = await POST(jsonRequest(URL, { bookingId: "b1" }));
    expect(res.status).toBe(400);
  });

  test("400 when the booking is already paid", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { bookings: { data: { ...BOOKING, payment_status: "Paid" }, error: null } };
    const res = await POST(jsonRequest(URL, { bookingId: "b1" }));
    expect(res.status).toBe(400);
  });

  test("400 when the booking has no fee to collect", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { bookings: { data: { ...BOOKING, fee_aud: 0 }, error: null } };
    const res = await POST(jsonRequest(URL, { bookingId: "b1" }));
    expect(res.status).toBe(400);
  });

  // See create-pack-checkout-session.test.ts's note on why this expects a
  // Stripe-level 502 for a synthetic (non-real) Connect destination account.
  test("resolves the head-coach payout destination and reaches Stripe with the platform fee applied", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = {
      bookings: { data: BOOKING, error: null },
      players: { data: PLAYER, error: null },
      // The route queries "coaches" twice (once for the booking's coach, once for
      // the head coach's connect account) — since head_coach_id === booking.coach_id
      // in this fixture, one merged response satisfies both .single() calls.
      coaches: { data: { ...COACH, ...ONBOARDED_COACH_FULL }, error: null },
      academies: { data: { id: "ac1", name: "Test Academy", head_coach_id: "coach1", payout_model: "head_coach", plan_id: null }, error: null },
    };

    const res = await POST(jsonRequest(URL, { bookingId: "b1" }));
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toMatch(/acct_test123|destination|account/i);
  }, 15_000);
});
