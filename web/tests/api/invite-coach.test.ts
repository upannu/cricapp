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
    const res = await POST(jsonRequest(URL, { name: "New Coach", email: "newcoach@example.com", coachId: "coach-9" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    const client = routeMockState.lastServiceClient!;
    expect(client.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
      "newcoach@example.com",
      expect.objectContaining({ data: { name: "New Coach", role: "coach", coach_id: "coach-9" } }),
    );
  });

  test("400 when Supabase invite fails", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.authAdminResponses = { inviteUserByEmail: { data: {}, error: { message: "invite failed" } } };
    const res = await POST(jsonRequest(URL, { name: "Coach", email: "coach@example.com" }));
    expect(res.status).toBe(400);
  });
});
