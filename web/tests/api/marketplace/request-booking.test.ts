import { describe, expect, test } from "vitest";
import { POST } from "@/app/api/marketplace/request-booking/route";
import { routeMockState } from "../../setup/api";
import { rawUser, jsonRequest } from "../../mocks/caller";

const URL = "http://localhost/api/marketplace/request-booking";
const COACH = {
  id: "coach1", academy_id: "ac1", location: "Sydney", currency: "aud",
  marketplace_visible: true, status: "Active", login_disabled: false,
};
const ACADEMY = {
  session_type_fees: { "Net Session": 100, "Video Review": 80 },
  session_fee_aud: 60, plan_id: null, currency: "aud",
};
const player = () => rawUser({ role: "player", player_id: "p1" });

describe("POST /api/marketplace/request-booking", () => {
  test("400 when coachId or type is missing", async () => {
    routeMockState.cookieUser = player();
    expect((await POST(jsonRequest(URL, { type: "Net Session" }))).status).toBe(400);
    expect((await POST(jsonRequest(URL, { coachId: "coach1" }))).status).toBe(400);
  });

  test("400 for a session type that isn't real", async () => {
    routeMockState.cookieUser = player();
    const res = await POST(jsonRequest(URL, { coachId: "coach1", type: "Coffee" }));
    expect(res.status).toBe(400);
  });

  test("401 when not signed in", async () => {
    const res = await POST(jsonRequest(URL, { coachId: "coach1", type: "Net Session" }));
    expect(res.status).toBe(401);
  });

  test("403 for a non-player/parent role", async () => {
    routeMockState.cookieUser = rawUser({ role: "coach", coach_id: "coach9" });
    const res = await POST(jsonRequest(URL, { coachId: "coach1", type: "Net Session" }));
    expect(res.status).toBe(403);
  });

  test("400 when the account isn't linked to a player", async () => {
    routeMockState.cookieUser = rawUser({ role: "player" });
    const res = await POST(jsonRequest(URL, { coachId: "coach1", type: "Net Session" }));
    expect(res.status).toBe(400);
  });

  test("404 when the coach doesn't exist", async () => {
    routeMockState.cookieUser = player();
    routeMockState.tableResponses = { coaches: { data: null, error: null } };
    const res = await POST(jsonRequest(URL, { coachId: "nope", type: "Net Session" }));
    expect(res.status).toBe(404);
  });

  test("403 when the coach isn't marketplace-visible", async () => {
    routeMockState.cookieUser = player();
    routeMockState.tableResponses = { coaches: { data: { ...COACH, marketplace_visible: false }, error: null } };
    const res = await POST(jsonRequest(URL, { coachId: "coach1", type: "Net Session" }));
    expect(res.status).toBe(403);
  });

  // The bug this route exists to fix: the fee is on the coach's academy row, which RLS hid from a
  // marketplace player — so it must be computed here, server-side.
  test("estimateOnly returns the academy's per-type fee for that session type", async () => {
    routeMockState.cookieUser = player();
    routeMockState.tableResponses = { coaches: { data: COACH, error: null }, academies: { data: ACADEMY, error: null } };
    const res = await POST(jsonRequest(URL, { coachId: "coach1", type: "Net Session", estimateOnly: true }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ fee: 100, currency: "aud", feesWaived: false });
  });

  test("estimateOnly falls back to the academy's default session fee when there's no per-type rate", async () => {
    routeMockState.cookieUser = player();
    routeMockState.tableResponses = { coaches: { data: COACH, error: null }, academies: { data: ACADEMY, error: null } };
    const res = await POST(jsonRequest(URL, { coachId: "coach1", type: "Match Practice", estimateOnly: true }));
    const body = await res.json();
    expect(body.fee).toBe(60);
  });

  test("estimateOnly returns fee 0 + feesWaived when the academy's plan waives session fees", async () => {
    routeMockState.cookieUser = player();
    routeMockState.tableResponses = {
      coaches: { data: COACH, error: null },
      academies: { data: { ...ACADEMY, plan_id: "plan1" }, error: null },
      plans: { data: { waives_session_fees: true }, error: null },
    };
    const res = await POST(jsonRequest(URL, { coachId: "coach1", type: "Net Session", estimateOnly: true }));
    const body = await res.json();
    expect(body).toEqual({ fee: 0, currency: "aud", feesWaived: true });
  });

  test("creates a Pending marketplace booking with the server-computed fee and the caller's own player id", async () => {
    routeMockState.cookieUser = player();
    routeMockState.tableResponses = {
      coaches: { data: COACH, error: null },
      academies: { data: ACADEMY, error: null },
      bookings: { data: null, error: null },
    };
    const res = await POST(jsonRequest(URL, {
      coachId: "coach1", type: "Net Session", date: "2026-02-01", time: "09:00", notes: "keen",
      // A tampered fee / player_id in the body must be ignored.
      fee_aud: 1, player_id: "someone-else",
    }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, fee: 100 });

    const client = routeMockState.lastServiceClient!;
    expect(client.tables.bookings.insert).toHaveBeenCalledWith(expect.objectContaining({
      player_id: "p1", coach_id: "coach1", type: "Net Session",
      date: "2026-02-01", time: "09:00", status: "Pending",
      fee_aud: 100, source: "marketplace", payment_status: "Pending",
    }));
  });

  test("400 when creating (not estimating) without a date/time", async () => {
    routeMockState.cookieUser = player();
    routeMockState.tableResponses = { coaches: { data: COACH, error: null }, academies: { data: ACADEMY, error: null } };
    const res = await POST(jsonRequest(URL, { coachId: "coach1", type: "Net Session" }));
    expect(res.status).toBe(400);
  });
});
