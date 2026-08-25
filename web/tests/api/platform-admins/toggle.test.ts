import { describe, expect, test } from "vitest";
import { POST } from "@/app/api/platform-admins/toggle/route";
import { routeMockState } from "../../setup/api";
import { rawUser, jsonRequest } from "../../mocks/caller";

const URL = "http://localhost/api/platform-admins/toggle";

describe("POST /api/platform-admins/toggle", () => {
  test("400 when userId or makeAdmin is missing", async () => {
    const res = await POST(jsonRequest(URL, { userId: "u1" }));
    expect(res.status).toBe(400);
  });

  test("400 when removing platform_admin without a fallback role", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" }, "caller-1");
    const res = await POST(jsonRequest(URL, { userId: "u2", makeAdmin: false }));
    expect(res.status).toBe(400);
  });

  test("403 when the caller is not a platform admin", async () => {
    routeMockState.cookieUser = rawUser({ role: "coach", coach_id: "c1" });
    const res = await POST(jsonRequest(URL, { userId: "u2", makeAdmin: true }));
    expect(res.status).toBe(403);
  });

  test("400 when a platform admin tries to change their own status", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" }, "caller-1");
    const res = await POST(jsonRequest(URL, { userId: "caller-1", makeAdmin: false, fallbackRole: "coach" }));
    expect(res.status).toBe(400);
  });

  test("promotes a user to platform_admin", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" }, "caller-1");
    const res = await POST(jsonRequest(URL, { userId: "u2", makeAdmin: true }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    const client = routeMockState.lastServiceClient!;
    expect(client.auth.admin.updateUserById).toHaveBeenCalledWith("u2", { user_metadata: { role: "platform_admin" } });
  });

  test("demotes a user to the given fallback role", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" }, "caller-1");
    const res = await POST(jsonRequest(URL, { userId: "u2", makeAdmin: false, fallbackRole: "academy_admin" }));
    expect(res.status).toBe(200);

    const client = routeMockState.lastServiceClient!;
    expect(client.auth.admin.updateUserById).toHaveBeenCalledWith("u2", { user_metadata: { role: "academy_admin" } });
  });

  test("500 when the update fails", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" }, "caller-1");
    routeMockState.authAdminResponses = { updateUserById: { data: null, error: { message: "update failed" } } };
    const res = await POST(jsonRequest(URL, { userId: "u2", makeAdmin: true }));
    expect(res.status).toBe(500);
  });
});
