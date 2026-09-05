import { describe, expect, test } from "vitest";
import { POST } from "@/app/api/reactivate-coach/route";
import { routeMockState } from "../setup/api";
import { rawUser, jsonRequest } from "../mocks/caller";

const URL = "http://localhost/api/reactivate-coach";

describe("POST /api/reactivate-coach", () => {
  test("400 when coachId is missing", async () => {
    const res = await POST(jsonRequest(URL, {}));
    expect(res.status).toBe(400);
  });

  test("403 when the caller is neither platform_admin nor academy_admin", async () => {
    routeMockState.cookieUser = rawUser({ role: "coach", coach_id: "c1" });
    const res = await POST(jsonRequest(URL, { coachId: "c1" }));
    expect(res.status).toBe(403);
  });

  test("404 when the coach is not found", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { coaches: { data: null, error: null } };
    const res = await POST(jsonRequest(URL, { coachId: "c1" }));
    expect(res.status).toBe(404);
  });

  test("403 when an academy_admin tries to reactivate a coach outside their academy", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "ac1" });
    routeMockState.tableResponses = { coaches: { data: { id: "c1", academy_id: "ac2" }, error: null } };
    const res = await POST(jsonRequest(URL, { coachId: "c1" }));
    expect(res.status).toBe(403);
  });

  test("reactivates a coach within the academy_admin's own academy", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "ac1" });
    routeMockState.tableResponses = { coaches: { data: { id: "c1", academy_id: "ac1" }, error: null } };
    const res = await POST(jsonRequest(URL, { coachId: "c1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    const client = routeMockState.lastServiceClient!;
    expect(client.tables.coaches.update).toHaveBeenCalledWith({ login_disabled: false, disabled_at: null, disabled_reason: null });
  });

  test("platform_admin can reactivate any coach, no academy scoping applied", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { coaches: { data: { id: "c1", academy_id: "ac9" }, error: null } };
    const res = await POST(jsonRequest(URL, { coachId: "c1" }));
    expect(res.status).toBe(200);
  });

  test("404 when the initial coach lookup errors", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { coaches: { data: null, error: { message: "db down" } } };
    const res = await POST(jsonRequest(URL, { coachId: "c1" }));
    expect(res.status).toBe(404);
  });
});
