import { describe, expect, test, vi } from "vitest";
import { GET } from "@/app/api/playhq/games/route";
import { routeMockState } from "../../setup/api";
import { rawUser } from "../../mocks/caller";

const { fetchOrganisationSeasons, fetchSeasonGrades, fetchGradeGames } = vi.hoisted(() => ({
  fetchOrganisationSeasons: vi.fn(), fetchSeasonGrades: vi.fn(), fetchGradeGames: vi.fn(),
}));
vi.mock("@/lib/playhq", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/playhq")>();
  return { ...original, fetchOrganisationSeasons, fetchSeasonGrades, fetchGradeGames };
});

function req(academyId: string) {
  return new Request(`http://localhost/api/playhq/games?academyId=${academyId}`);
}

const GAME = {
  id: "game1", status: "COMPLETED", date: "2026-01-01", venue: "Main Oval",
  homeTeam: { id: "t1", name: "Home XI" }, awayTeam: { id: "t2", name: "Away XI" }, result: "Home XI won",
};

describe("GET /api/playhq/games", () => {
  test("400 when academyId is missing", async () => {
    const res = await GET(new Request("http://localhost/api/playhq/games"));
    expect(res.status).toBe(400);
  });

  test("401 when not signed in", async () => {
    const res = await GET(req("ac1"));
    expect(res.status).toBe(401);
  });

  test("403 for an academy_admin from a different academy", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "someone-elses" });
    const res = await GET(req("ac1"));
    expect(res.status).toBe(403);
  });

  test("400 when the academy hasn't connected PlayHQ yet", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "ac1" });
    routeMockState.tableResponses = { academies: { data: { playhq_org_id: null }, error: null } };
    const res = await GET(req("ac1"));
    expect(res.status).toBe(400);
  });

  test("returns completed games not yet imported, excluding non-completed and already-imported ones", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "ac1" });
    routeMockState.tableResponses = {
      academies: { data: { playhq_org_id: "org1" }, error: null },
      matches: { data: [{ playhq_game_id: "game2" }], error: null },
    };
    fetchOrganisationSeasons.mockResolvedValueOnce([{ id: "season1", name: "2026" }]);
    fetchSeasonGrades.mockResolvedValueOnce([{ id: "grade1", name: "U14" }]);
    fetchGradeGames.mockResolvedValueOnce([
      GAME,
      { ...GAME, id: "game2" }, // already imported
      { ...GAME, id: "game3", status: "SCHEDULED" }, // not completed
    ]);

    const res = await GET(req("ac1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.games.map((g: { id: string }) => g.id)).toEqual(["game1"]);
  });

  test("502 when PlayHQ itself errors", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "ac1" });
    routeMockState.tableResponses = { academies: { data: { playhq_org_id: "org1" }, error: null } };
    fetchOrganisationSeasons.mockRejectedValueOnce(new Error("boom"));
    const res = await GET(req("ac1"));
    expect(res.status).toBe(502);
  });
});
