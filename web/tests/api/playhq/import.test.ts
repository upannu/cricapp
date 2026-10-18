import { describe, expect, test, vi } from "vitest";
import { POST } from "@/app/api/playhq/import/route";
import { routeMockState } from "../../setup/api";
import { rawUser, jsonRequest } from "../../mocks/caller";

const { fetchGameSummary, mapGameSummaryToImport } = vi.hoisted(() => ({
  fetchGameSummary: vi.fn(), mapGameSummaryToImport: vi.fn(),
}));
vi.mock("@/lib/playhq", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/playhq")>();
  return { ...original, fetchGameSummary, mapGameSummaryToImport };
});

const URL = "http://localhost/api/playhq/import";
const VALID_BODY = {
  academyId: "ac1", gameId: "game1", format: "T20", venue: "Main Oval", scheduledDate: "2026-01-01",
  playerLinks: [{ playhqPlayerId: "phq-p1", playerId: "p1" }],
};

describe("POST /api/playhq/import", () => {
  test("400 when a required field is missing", async () => {
    const res = await POST(jsonRequest(URL, { academyId: "ac1", gameId: "game1" }));
    expect(res.status).toBe(400);
  });

  test("400 for an invalid format", async () => {
    const res = await POST(jsonRequest(URL, { ...VALID_BODY, format: "ODI" }));
    expect(res.status).toBe(400);
  });

  test("401 when not signed in", async () => {
    const res = await POST(jsonRequest(URL, VALID_BODY));
    expect(res.status).toBe(401);
  });

  test("403 for an academy_admin from a different academy", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "someone-elses" });
    const res = await POST(jsonRequest(URL, VALID_BODY));
    expect(res.status).toBe(403);
  });

  test("409 when the game was already imported", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "ac1" });
    routeMockState.tableResponses = { matches: { data: { id: "m_existing" }, error: null } };
    const res = await POST(jsonRequest(URL, VALID_BODY));
    expect(res.status).toBe(409);
  });

  test("502 when PlayHQ fails to return the game summary", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "ac1" });
    routeMockState.tableResponses = { matches: { data: null, error: null } };
    fetchGameSummary.mockRejectedValueOnce(new Error("boom"));
    const res = await POST(jsonRequest(URL, VALID_BODY));
    expect(res.status).toBe(502);
  });

  test("imports the match and recomputes career stats for every resolved player", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "ac1" });
    routeMockState.tableResponses = {
      matches: { data: null, error: null },
      match_participants: { data: [], error: null },
      innings: { data: [], error: null },
      deliveries: { data: [], error: null },
      imported_match_stats: {
        data: [{
          id: "ims1", match_id: "m_x", player_id: "p1", runs_scored: 54, balls_faced: 40,
          not_out: true, wickets: 0, balls_bowled: 0, runs_conceded: 0, catches: 1, run_outs: 0, stumpings: 0,
        }],
        error: null,
      },
      player_career_stats: { data: null, error: null },
    };
    fetchGameSummary.mockResolvedValueOnce({ id: "game1", appearances: [] });
    mapGameSummaryToImport.mockReturnValueOnce({
      homeLabel: "Home XI", awayLabel: "Away XI", result: "Home XI won", tossWonBy: "home", tossDecision: "Bat",
      stats: [{ playerId: "p1", runsScored: 54, ballsFaced: 40, notOut: true, wickets: 0, ballsBowled: 0, runsConceded: 0, catches: 1, runOuts: 0, stumpings: 0 }],
    });

    const res = await POST(jsonRequest(URL, VALID_BODY));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.match.source).toBe("imported");
    expect(body.match.playhqGameId).toBe("game1");
    const client = routeMockState.lastServiceClient!;
    expect(client.tables.matches.insert).toHaveBeenCalledWith(expect.objectContaining({ playhq_game_id: "game1", source: "imported" }));
    expect(client.tables.match_participants.insert).not.toHaveBeenCalled();
    expect(client.tables.player_career_stats.upsert).toHaveBeenCalledWith(expect.objectContaining({ player_id: "p1" }));
  });
});
