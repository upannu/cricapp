import { describe, expect, test } from "vitest";
import { POST } from "@/app/api/sessions/delete/route";
import { routeMockState } from "../../setup/api";
import { rawUser, jsonRequest } from "../../mocks/caller";

const URL = "http://localhost/api/sessions/delete";

describe("POST /api/sessions/delete", () => {
  test("400 when sessionId or playerId missing", async () => {
    const res = await POST(jsonRequest(URL, { sessionId: "s1" }));
    expect(res.status).toBe(400);
  });

  test("401 when not signed in", async () => {
    const res = await POST(jsonRequest(URL, { sessionId: "s1", playerId: "p1" }));
    expect(res.status).toBe(401);
  });

  test("403 when caller cannot access the player", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "someone-else" });
    const res = await POST(jsonRequest(URL, { sessionId: "s1", playerId: "p1" }));
    expect(res.status).toBe(403);
  });

  test("deletes videos, linked reports and their PDFs, then the session", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = {
      reports: { data: [{ id: "r1" }, { id: "r2" }], error: null },
      sessions: { data: null, error: null },
    };
    routeMockState.storageResponses = {
      "session-videos": { list: { data: [{ name: "front.mp4" }], error: null } },
    };

    const res = await POST(jsonRequest(URL, { sessionId: "s1", playerId: "p1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true });

    const client = routeMockState.lastServiceClient!;
    expect(client.buckets["session-videos"].list).toHaveBeenCalledWith("p1/s1");
    expect(client.buckets["session-videos"].remove).toHaveBeenCalledWith(["p1/s1/front.mp4"]);
    expect(client.buckets["session-reports"].remove).toHaveBeenCalledWith(["p1/r1.pdf", "p1/r2.pdf"]);
    expect(client.tables.reports.delete).toHaveBeenCalled();
    expect(client.tables.sessions.delete).toHaveBeenCalled();
  });

  test("500 when the final session delete fails", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = {
      reports: { data: [], error: null },
      sessions: { data: null, error: { message: "db is down" } },
    };

    const res = await POST(jsonRequest(URL, { sessionId: "s1", playerId: "p1" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("db is down");
  });
});
