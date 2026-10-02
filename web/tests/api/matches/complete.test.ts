import { describe, expect, test } from "vitest";
import { POST } from "@/app/api/matches/[id]/complete/route";
import { routeMockState } from "../../setup/api";
import { rawUser } from "../../mocks/caller";

const MATCH_ID = "m1";

function callComplete() {
  return POST(new Request("http://localhost/api/matches/m1/complete", { method: "POST" }), {
    params: Promise.resolve({ id: MATCH_ID }),
  });
}

const BASE_MATCH = {
  id: MATCH_ID, home_label: "Home XI", away_label: "Away XI", home_academy_id: "ac1",
  format: "T20", overs_per_side: 20, status: "InProgress", source: "live",
  toss_won_by: "home", toss_decision: "Bat", venue: "Main Oval", scheduled_date: "2026-01-01",
  competition_id: null, fixture_id: null, scored_by_coach_id: "coach-1",
  created_by_user_id: "u1", result: null, created_at: "2026-01-01T00:00:00Z",
};

describe("POST /api/matches/[id]/complete", () => {
  test("401 when not signed in", async () => {
    const res = await callComplete();
    expect(res.status).toBe(401);
  });

  test("403 when the caller isn't the assigned coach, the home academy_admin, or a delegated scorer", async () => {
    routeMockState.cookieUser = rawUser({ role: "coach", coach_id: "someone-else" });
    routeMockState.tableResponses = {
      matches: { data: BASE_MATCH, error: null },
      match_scorers: { data: null, error: null },
    };
    const res = await callComplete();
    expect(res.status).toBe(403);
  });

  test("404 when the match doesn't exist", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = {
      matches: { data: null, error: null },
    };
    const res = await callComplete();
    expect(res.status).toBe(404);
  });

  test("computes the result, marks the match Completed, and recomputes career stats for linked participants", async () => {
    routeMockState.cookieUser = rawUser({ role: "coach", coach_id: "coach-1" });
    routeMockState.tableResponses = {
      matches: { data: BASE_MATCH, error: null },
      innings: {
        data: [
          { id: "in1", match_id: MATCH_ID, innings_number: 1, batting_side: "home", bowling_side: "away", status: "Completed", total_runs: 150, total_wickets: 8, total_overs: 20, target_runs: null },
          { id: "in2", match_id: MATCH_ID, innings_number: 2, batting_side: "away", bowling_side: "home", status: "Completed", total_runs: 120, total_wickets: 10, total_overs: 18.4, target_runs: 151 },
        ],
        error: null,
      },
      match_participants: {
        data: [{ id: "mp1", match_id: MATCH_ID, player_id: "p1" }, { id: "mp2", match_id: MATCH_ID, player_id: null }],
        error: null,
      },
      deliveries: { data: [], error: null },
      imported_match_stats: { data: [], error: null },
      player_career_stats: { data: null, error: null },
    };

    const res = await callComplete();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.result).toBe("Home XI won by 30 runs");

    const client = routeMockState.lastServiceClient!;
    expect(client.tables.matches.update).toHaveBeenCalledWith({ status: "Completed", result: "Home XI won by 30 runs" });
    // Only the linked participant (player_id set) should ever reach player_career_stats — the
    // unlinked one (player_id: null) must never trigger a recompute/upsert for a null id.
    expect(client.tables.player_career_stats.upsert).toHaveBeenCalledTimes(1);
    expect(client.tables.player_career_stats.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ player_id: "p1" }),
    );
  });
});
