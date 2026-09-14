import { describe, expect, test } from "vitest";
import { POST } from "@/app/api/portal/log-session/route";
import { routeMockState } from "../../setup/api";
import { rawUser, jsonRequest } from "../../mocks/caller";

const URL = "http://localhost/api/portal/log-session";
const VIDEO = { angle: "side", label: "clip.mp4", url: "https://example.test/clip.mp4" };
const VALID_BODY = { date: "2026-01-15", type: "Individual Coaching", rpe: 6, videos: [VIDEO] };

const PRO_PLAN = {
  id: "pro1", slug: "player-pro", name: "Player Pro", audience: "individual",
  billing_type: "subscription", billing_interval: "month", price_aud: 20,
  seat_cap: null, access_duration_months: null, included_notes: null,
  waives_session_fees: false, platform_admin_only: false, platform_fee_percent: 10,
  active: true, sort_order: 0,
  sessions_per_month_limit: null, self_log_sessions_per_month_limit: 2,
  chat_messages_per_day_limit: null, ai_reports_enabled: true, marketplace_enabled: true, locked: true,
};

describe("POST /api/portal/log-session", () => {
  test("400 when date or type is missing/invalid", async () => {
    expect((await POST(jsonRequest(URL, { ...VALID_BODY, date: undefined }))).status).toBe(400);
    expect((await POST(jsonRequest(URL, { ...VALID_BODY, type: "Coffee" }))).status).toBe(400);
  });

  test("400 when a video is missing a url or has an invalid angle", async () => {
    const res = await POST(jsonRequest(URL, { ...VALID_BODY, videos: [{ angle: "bogus", url: "https://x" }] }));
    expect(res.status).toBe(400);
  });

  test("400 when RPE is out of range", async () => {
    const res = await POST(jsonRequest(URL, { ...VALID_BODY, rpe: 11 }));
    expect(res.status).toBe(400);
  });

  test("401 when not signed in", async () => {
    const res = await POST(jsonRequest(URL, VALID_BODY));
    expect(res.status).toBe(401);
  });

  test("403 for a non-player/parent role", async () => {
    routeMockState.cookieUser = rawUser({ role: "coach", coach_id: "coach1" });
    const res = await POST(jsonRequest(URL, VALID_BODY));
    expect(res.status).toBe(403);
  });

  test("400 when the account isn't linked to a player", async () => {
    routeMockState.cookieUser = rawUser({ role: "player" });
    const res = await POST(jsonRequest(URL, VALID_BODY));
    expect(res.status).toBe(400);
  });

  test("404 when the player doesn't exist", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "p1" });
    routeMockState.tableResponses = { players: { data: null, error: null } };
    const res = await POST(jsonRequest(URL, VALID_BODY));
    expect(res.status).toBe(404);
  });

  test("creates the session with coach_id null when under the plan's self-log limit", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "p1" });
    routeMockState.tableResponses = {
      players: { data: { id: "p1", sub_plan: "Player Pro" }, error: null },
      plans: { data: [PRO_PLAN], error: null },
      sessions: { data: [], error: null }, // no self-logged sessions yet this month
    };

    const res = await POST(jsonRequest(URL, VALID_BODY));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, selfLogRemaining: 1 });
    const client = routeMockState.lastServiceClient!;
    expect(client.tables.sessions.insert).toHaveBeenCalledWith(expect.objectContaining({
      player_id: "p1", coach_id: null, booking_id: null, date: "2026-01-15", rpe: 6, self_logged: true,
    }));
  });

  // The whole point of this cap: Player Pro's "unlimited sessions" doesn't apply here — a
  // self-logged session has no coach naturally rate-limiting it.
  test("403 once the plan's self-log limit (from the Plan Catalog, not hardcoded) is reached", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "p1" });
    routeMockState.tableResponses = {
      players: { data: { id: "p1", sub_plan: "Player Pro" }, error: null },
      plans: { data: [PRO_PLAN], error: null }, // self_log_sessions_per_month_limit: 2
      sessions: { data: [{ id: "s1" }, { id: "s2" }], error: null }, // already used both
    };

    const res = await POST(jsonRequest(URL, VALID_BODY));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toMatch(/used all 2 of your self-logged sessions/);
    expect(routeMockState.lastServiceClient!.tables.sessions.insert).not.toHaveBeenCalled();
  });

  // A Warm-up / Conditioning or Fitness Assessment session has no bowling action to analyze —
  // a video is optional here, same as when a coach logs a session in NewSessionForm.
  test("200 when no video is attached (e.g. a warm-up/conditioning session)", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "p1" });
    routeMockState.tableResponses = {
      players: { data: { id: "p1", sub_plan: "Player Pro" }, error: null },
      plans: { data: [PRO_PLAN], error: null },
      sessions: { data: [], error: null },
    };

    const res = await POST(jsonRequest(URL, { ...VALID_BODY, type: "Warm-up / Conditioning", videos: [] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.xpEarned).toBe(50);
    const client = routeMockState.lastServiceClient!;
    expect(client.tables.sessions.insert).toHaveBeenCalledWith(expect.objectContaining({ videos: [] }));
  });

  // The whole point of the self_logged column: coach_id IS NULL is not an exclusive signal for
  // "the player logged this themselves" — NewSessionForm can also leave coach_id null whenever
  // staff don't pick a coach, which must never count against a player's own monthly quota.
  test("counts the monthly cap by self_logged, not coach_id", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "p1" });
    routeMockState.tableResponses = {
      players: { data: { id: "p1", sub_plan: "Player Pro" }, error: null },
      plans: { data: [PRO_PLAN], error: null },
      sessions: { data: [], error: null },
    };

    await POST(jsonRequest(URL, VALID_BODY));

    const client = routeMockState.lastServiceClient!;
    expect(client.tables.sessions.eq).toHaveBeenCalledWith("self_logged", true);
    expect(client.tables.sessions.is).not.toHaveBeenCalledWith("coach_id", null);
  });

  test("a parent account can also self-log for their child", async () => {
    routeMockState.cookieUser = rawUser({ role: "parent", player_id: "p1" });
    routeMockState.tableResponses = {
      players: { data: { id: "p1", sub_plan: "Free" }, error: null },
      plans: { data: [], error: null }, // falls back to the default cap
      sessions: { data: [], error: null },
    };

    const res = await POST(jsonRequest(URL, VALID_BODY));
    expect(res.status).toBe(200);
  });
});
