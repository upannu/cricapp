import { describe, expect, test } from "vitest";
import { POST } from "@/app/api/reports/delete/route";
import { routeMockState } from "../../setup/api";
import { rawUser, jsonRequest } from "../../mocks/caller";

const URL = "http://localhost/api/reports/delete";

describe("POST /api/reports/delete", () => {
  test("400 when reportId or playerId missing", async () => {
    const res = await POST(jsonRequest(URL, { reportId: "r1" }));
    expect(res.status).toBe(400);
  });

  test("401 when not signed in", async () => {
    const res = await POST(jsonRequest(URL, { reportId: "r1", playerId: "p1" }));
    expect(res.status).toBe(401);
  });

  test("403 when caller cannot access the player", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "someone-else" });
    const res = await POST(jsonRequest(URL, { reportId: "r1", playerId: "p1" }));
    expect(res.status).toBe(403);
  });

  test("removes the PDF (best-effort) then deletes the report row", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    const res = await POST(jsonRequest(URL, { reportId: "r1", playerId: "p1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true });

    const client = routeMockState.lastServiceClient!;
    expect(client.buckets["session-reports"].remove).toHaveBeenCalledWith(["p1/r1.pdf"]);
    expect(client.tables.reports.delete).toHaveBeenCalled();
  });

  test("500 when the delete fails", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { reports: { data: null, error: { message: "db is down" } } };

    const res = await POST(jsonRequest(URL, { reportId: "r1", playerId: "p1" }));
    expect(res.status).toBe(500);
  });
});
