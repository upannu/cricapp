import { describe, expect, test } from "vitest";
import { GET } from "@/app/api/platform-admins/list/route";
import { routeMockState } from "../../setup/api";
import { rawUser } from "../../mocks/caller";

describe("GET /api/platform-admins/list", () => {
  test("403 when not signed in", async () => {
    const res = await GET();
    expect(res.status).toBe(403);
  });

  test("403 when the caller is not a platform admin", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "ac1" });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  test("lists approved users, sorted by name, excluding not-yet-approved accounts", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.authAdminResponses = {
      listUsers: {
        data: {
          users: [
            { id: "u1", email: "zoe@example.com", user_metadata: { name: "Zoe" }, app_metadata: { role: "coach", approved: true } },
            { id: "u2", email: "amy@example.com", user_metadata: { name: "Amy" }, app_metadata: { role: "platform_admin", approved: true } },
            { id: "u3", email: "pending@example.com", user_metadata: {}, app_metadata: { role: "coach", approved: false } },
          ],
        },
        error: null,
      },
    };

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.users).toEqual([
      { id: "u2", email: "amy@example.com", name: "Amy", role: "platform_admin" },
      { id: "u1", email: "zoe@example.com", name: "Zoe", role: "coach" },
    ]);
  });
});
