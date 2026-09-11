import { describe, expect, test } from "vitest";
import { GET } from "@/app/api/portal/squad-training/route";
import { routeMockState } from "../../setup/api";
import { rawUser } from "../../mocks/caller";

const GROUP_ROW = {
  id: "gs1", academy_id: "ac1", coach_id: "coach1", name: "U14 Tuesday Nets",
  session_type: "Net Session", day_of_week: 2, time: "16:00",
  duration_mins: 60, location: "Riverside Nets", active: true,
};

describe("GET /api/portal/squad-training", () => {
  test("401 when not signed in", async () => {
    const res = await GET();
    expect(res.status).toBe(401);
  });

  test("403 for a non-player/parent role", async () => {
    routeMockState.cookieUser = rawUser({ role: "coach", coach_id: "coach1" });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  test("returns no groups when the account isn't linked to a player", async () => {
    routeMockState.cookieUser = rawUser({ role: "player" });
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ groups: [] });
  });

  test("returns no groups when the player is rostered on none", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "p1" });
    routeMockState.tableResponses = { group_session_players: { data: [], error: null } };
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({ groups: [] });
  });

  // group_sessions has no RLS policy at all for a player/parent (only platform_admin, an
  // academy_admin's own academy, or a coach's own groups can read it) — this route exists
  // specifically to serve a player their own rostered groups via the service role instead.
  test("returns the active groups this player is rostered on", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "p1" });
    routeMockState.tableResponses = {
      group_session_players: { data: [{ group_session_id: "gs1" }], error: null },
      group_sessions: { data: [GROUP_ROW], error: null },
    };
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.groups).toEqual([{
      id: "gs1", academyId: "ac1", coachId: "coach1", name: "U14 Tuesday Nets",
      sessionType: "Net Session", dayOfWeek: 2, time: "16:00",
      durationMins: 60, location: "Riverside Nets", active: true, playerIds: ["p1"],
    }]);
  });

  test("a parent account (not just a player) can also fetch their child's squad training", async () => {
    routeMockState.cookieUser = rawUser({ role: "parent", player_id: "p1" });
    routeMockState.tableResponses = { group_session_players: { data: [], error: null } };
    const res = await GET();
    expect(res.status).toBe(200);
  });

  test("500 when the roster lookup errors", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "p1" });
    routeMockState.tableResponses = { group_session_players: { data: null, error: { message: "boom" } } };
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
