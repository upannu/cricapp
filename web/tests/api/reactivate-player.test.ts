import { describe, expect, test } from "vitest";
import { POST } from "@/app/api/reactivate-player/route";
import { routeMockState } from "../setup/api";
import { rawUser, jsonRequest } from "../mocks/caller";

const URL = "http://localhost/api/reactivate-player";

describe("POST /api/reactivate-player", () => {
  test("400 when playerId is missing", async () => {
    const res = await POST(jsonRequest(URL, {}));
    expect(res.status).toBe(400);
  });

  test("403 when the caller is neither platform_admin nor academy_admin", async () => {
    routeMockState.cookieUser = rawUser({ role: "coach", coach_id: "c1" });
    const res = await POST(jsonRequest(URL, { playerId: "p1" }));
    expect(res.status).toBe(403);
  });

  test("404 when the player is not found", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: null, error: null } };
    const res = await POST(jsonRequest(URL, { playerId: "p1" }));
    expect(res.status).toBe(404);
  });

  test("403 when an academy_admin tries to reactivate a player outside their academy", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "ac1" });
    routeMockState.tableResponses = {
      players: { data: { id: "p1" }, error: null },
      academies: { data: { player_ids: ["someone-else"] }, error: null },
    };
    const res = await POST(jsonRequest(URL, { playerId: "p1" }));
    expect(res.status).toBe(403);
  });

  test("reactivates a player within the academy_admin's own roster", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "ac1" });
    routeMockState.tableResponses = {
      players: { data: { id: "p1" }, error: null },
      academies: { data: { player_ids: ["p1"] }, error: null },
    };
    const res = await POST(jsonRequest(URL, { playerId: "p1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    const client = routeMockState.lastServiceClient!;
    expect(client.tables.players.update).toHaveBeenCalledWith({ login_disabled: false, disabled_at: null, disabled_reason: null });
  });

  test("platform_admin can reactivate any player, no academy scoping applied", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: { id: "p1" }, error: null } };
    const res = await POST(jsonRequest(URL, { playerId: "p1" }));
    expect(res.status).toBe(200);
  });

  test("404 when the initial player lookup errors", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: null, error: { message: "db down" } } };
    const res = await POST(jsonRequest(URL, { playerId: "p1" }));
    expect(res.status).toBe(404);
  });
});
