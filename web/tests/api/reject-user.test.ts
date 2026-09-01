import { describe, expect, test } from "vitest";
import { POST } from "@/app/api/reject-user/route";
import { routeMockState } from "../setup/api";
import { rawUser, jsonRequest } from "../mocks/caller";

const URL = "http://localhost/api/reject-user";

describe("POST /api/reject-user", () => {
  test("400 when userId is missing", async () => {
    const res = await POST(jsonRequest(URL, {}));
    expect(res.status).toBe(400);
  });

  test("403 when the caller is not a platform admin", async () => {
    routeMockState.cookieUser = rawUser({ role: "coach", coach_id: "c1" });
    const res = await POST(jsonRequest(URL, { userId: "r1" }));
    expect(res.status).toBe(403);
  });

  test("deletes the matching auth user and dequeues a new-signup request", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { user_requests: { data: { email: "reject-me@example.com", request_type: "new" }, error: null } };
    routeMockState.authAdminResponses = { listUsers: { data: { users: [{ id: "auth-1", email: "reject-me@example.com" }] }, error: null } };

    const res = await POST(jsonRequest(URL, { userId: "r1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    const client = routeMockState.lastServiceClient!;
    expect(client.auth.admin.deleteUser).toHaveBeenCalledWith("auth-1");
    expect(client.tables.user_requests.delete).toHaveBeenCalled();
  });

  test("never deletes the auth account for a 'link' request (only dequeues)", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { user_requests: { data: { email: "existing@example.com", request_type: "link" }, error: null } };

    const res = await POST(jsonRequest(URL, { userId: "r1" }));
    expect(res.status).toBe(200);

    const client = routeMockState.lastServiceClient!;
    expect(client.auth.admin.deleteUser).not.toHaveBeenCalled();
    expect(client.tables.user_requests.delete).toHaveBeenCalled();
  });

  test("400 when deleting the auth user fails", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { user_requests: { data: { email: "reject-me@example.com", request_type: "new" }, error: null } };
    routeMockState.authAdminResponses = {
      listUsers: { data: { users: [{ id: "auth-1", email: "reject-me@example.com" }] }, error: null },
      deleteUser: { data: null, error: { message: "delete failed" } },
    };

    const res = await POST(jsonRequest(URL, { userId: "r1" }));
    expect(res.status).toBe(400);
  });
});
