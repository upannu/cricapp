import { describe, expect, test } from "vitest";
import { POST } from "@/app/api/invite-coach/route";
import { routeMockState } from "../setup/api";
import { rawUser, jsonRequest } from "../mocks/caller";

const URL = "http://localhost/api/invite-coach";

describe("POST /api/invite-coach", () => {
  test("400 when name or email is missing", async () => {
    const res = await POST(jsonRequest(URL, { name: "Coach" }));
    expect(res.status).toBe(400);
  });

  test("403 when not signed in", async () => {
    const res = await POST(jsonRequest(URL, { name: "Coach", email: "coach@example.com" }));
    expect(res.status).toBe(403);
  });

  test("403 when caller is neither platform_admin nor academy_admin", async () => {
    routeMockState.cookieUser = rawUser({ role: "coach", coach_id: "c1" });
    const res = await POST(jsonRequest(URL, { name: "Coach", email: "coach@example.com" }));
    expect(res.status).toBe(403);
  });

  test("invites a coach and links the given coachId", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "ac1" });
    routeMockState.authAdminResponses = {
      inviteUserByEmail: { data: { user: { id: "invited-1" } }, error: null },
    };
    const res = await POST(jsonRequest(URL, { name: "New Coach", email: "newcoach@example.com", coachId: "coach-9" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    const client = routeMockState.lastServiceClient!;
    // The invite call's own `data` is display-only (name) — role/approved/coach_id are never
    // writable via user_metadata, so they're set in a separate updateUserById(app_metadata) call
    // right after (see app/api/invite-coach/route.ts).
    expect(client.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
      "newcoach@example.com",
      expect.objectContaining({ data: { name: "New Coach" } }),
    );
    expect(client.auth.admin.updateUserById).toHaveBeenCalledWith(
      "invited-1",
      { app_metadata: { role: "coach", approved: true, coach_id: "coach-9" } },
    );
  });

  test("400 when Supabase invite fails", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.authAdminResponses = { inviteUserByEmail: { data: {}, error: { message: "invite failed" } } };
    const res = await POST(jsonRequest(URL, { name: "Coach", email: "coach@example.com" }));
    expect(res.status).toBe(400);
  });
});
