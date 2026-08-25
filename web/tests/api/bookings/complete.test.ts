import { describe, expect, test } from "vitest";
import { POST } from "@/app/api/bookings/complete/route";
import { routeMockState } from "../../setup/api";
import { rawUser, jsonRequest } from "../../mocks/caller";

const URL = "http://localhost/api/bookings/complete";
const BOOKING = { id: "b1", player_id: "p1", date: "2026-01-01", type: "Net Session", pack_id: null, status: "Confirmed" };
const PLAYER_ROW = { xp: 100, sessions_count: 5, sub_sessions_used: 2 };

describe("POST /api/bookings/complete", () => {
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

  test("403 when caller cannot access the booking's player", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "someone-else" });
    routeMockState.tableResponses = { bookings: { data: BOOKING, error: null } };
    const res = await POST(jsonRequest(URL, { bookingId: "b1" }));
    expect(res.status).toBe(403);
  });

  test("400 when the booking is already completed", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { bookings: { data: { ...BOOKING, status: "Completed" }, error: null } };
    const res = await POST(jsonRequest(URL, { bookingId: "b1" }));
    expect(res.status).toBe(400);
  });

  test("logs a session, marks the booking Completed, and credits XP/session counts", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { bookings: { data: BOOKING, error: null }, players: { data: PLAYER_ROW, error: null } };

    const res = await POST(jsonRequest(URL, { bookingId: "b1", notes: "Great session" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(typeof body.sessionId).toBe("string");

    const client = routeMockState.lastServiceClient!;
    expect(client.tables.sessions.insert).toHaveBeenCalledWith(expect.objectContaining({ player_id: "p1", booking_id: "b1", xp_earned: 50, notes: "Great session" }));
    expect(client.tables.bookings.update).toHaveBeenCalledWith({ status: "Completed" });
    // No pack_id on this booking, so the subscription's session quota is consumed.
    expect(client.tables.players.update).toHaveBeenCalledWith(
      expect.objectContaining({ xp: 150, sessions_count: 6, sub_sessions_used: 3 }),
    );
  });

  test("draws down a session pack and does NOT touch the subscription quota when the booking is pack-funded", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = {
      bookings: { data: { ...BOOKING, pack_id: "pack1" }, error: null },
      players: { data: PLAYER_ROW, error: null },
      session_packs: { data: { sessions_used: 3 }, error: null },
    };

    const res = await POST(jsonRequest(URL, { bookingId: "b1" }));
    expect(res.status).toBe(200);

    const client = routeMockState.lastServiceClient!;
    const playersUpdateArg = client.tables.players.update.mock.calls[0][0];
    expect(playersUpdateArg).not.toHaveProperty("sub_sessions_used");
    expect(client.tables.session_packs.update).toHaveBeenCalledWith({ sessions_used: 4 });
  });

  test("500 when logging the session fails", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { bookings: { data: BOOKING, error: null }, sessions: { data: null, error: { message: "db down" } } };

    const res = await POST(jsonRequest(URL, { bookingId: "b1" }));
    expect(res.status).toBe(500);
  });
});
