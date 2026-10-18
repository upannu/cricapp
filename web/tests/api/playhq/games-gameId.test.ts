import { describe, expect, test, vi } from "vitest";
import { GET } from "@/app/api/playhq/games/[gameId]/route";
import { routeMockState } from "../../setup/api";
import { rawUser } from "../../mocks/caller";

const { fetchGameSummary } = vi.hoisted(() => ({ fetchGameSummary: vi.fn() }));
vi.mock("@/lib/playhq", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/playhq")>();
  return { ...original, fetchGameSummary };
});

function call(gameId: string, academyId: string | null) {
  const qs = academyId ? `?academyId=${academyId}` : "";
  return GET(new Request(`http://localhost/api/playhq/games/${gameId}${qs}`), { params: Promise.resolve({ gameId }) });
}

describe("GET /api/playhq/games/[gameId]", () => {
  test("400 when academyId is missing", async () => {
    const res = await call("game1", null);
    expect(res.status).toBe(400);
  });

  test("401 when not signed in", async () => {
    const res = await call("game1", "ac1");
    expect(res.status).toBe(401);
  });

  test("403 for an academy_admin from a different academy", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "someone-elses" });
    const res = await call("game1", "ac1");
    expect(res.status).toBe(403);
  });

  test("returns the game summary for an authorized caller", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "ac1" });
    fetchGameSummary.mockResolvedValueOnce({ id: "game1", appearances: [] });
    const res = await call("game1", "ac1");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.summary).toEqual({ id: "game1", appearances: [] });
  });

  test("502 when PlayHQ can't return the summary", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "ac1" });
    fetchGameSummary.mockRejectedValueOnce(new Error("boom"));
    const res = await call("game1", "ac1");
    expect(res.status).toBe(502);
  });
});
