import { describe, expect, test, vi, afterEach } from "vitest";
import { POST } from "@/app/api/approve-user/route";
import { routeMockState } from "../setup/api";
import { rawUser, jsonRequest } from "../mocks/caller";

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn(async (_opts: Record<string, unknown>) => ({})) }));
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail })) },
}));

const URL = "http://localhost/api/approve-user";
const AUTH_USER = { id: "auth-1", email: "newcoach@example.com", user_metadata: {} };

describe("POST /api/approve-user", () => {
  afterEach(() => {
    sendMail.mockClear();
  });

  test("400 when userId is missing", async () => {
    const res = await POST(jsonRequest(URL, {}));
    expect(res.status).toBe(400);
  });

  test("403 when the caller is not a platform admin", async () => {
    routeMockState.cookieUser = rawUser({ role: "coach", coach_id: "c1" });
    const res = await POST(jsonRequest(URL, { userId: "r1" }));
    expect(res.status).toBe(403);
  });

  test("404 when the request is not found in the queue", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { user_requests: { data: null, error: null } };
    const res = await POST(jsonRequest(URL, { userId: "r1" }));
    expect(res.status).toBe(404);
  });

  test("400 when a player/parent request has no linked lookup email", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = {
      user_requests: { data: { email: "p@example.com", name: "P", role: "player", player_lookup_email: null, request_type: "new" }, error: null },
    };
    const res = await POST(jsonRequest(URL, { userId: "r1" }));
    expect(res.status).toBe(400);
  });

  test("400 when no player matches the lookup email", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = {
      user_requests: { data: { email: "p@example.com", name: "P", role: "player", player_lookup_email: "kid@example.com", request_type: "new" }, error: null },
      players: { data: [], error: null },
    };
    const res = await POST(jsonRequest(URL, { userId: "r1" }));
    expect(res.status).toBe(400);
  });

  test("404 and dequeues the request when no matching Supabase auth account exists", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = {
      user_requests: { data: { email: "ghost@example.com", name: "Ghost", role: "coach", request_type: "new" }, error: null },
    };
    routeMockState.authAdminResponses = { listUsers: { data: { users: [] }, error: null } };

    const res = await POST(jsonRequest(URL, { userId: "r1" }));
    expect(res.status).toBe(404);

    const client = routeMockState.lastServiceClient!;
    expect(client.tables.user_requests.delete).toHaveBeenCalled();
  });

  test("approves a new coach signup: confirms the auth user, dequeues, and emails them", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = {
      user_requests: { data: { email: "newcoach@example.com", name: "New Coach", role: "coach", request_type: "new" }, error: null },
      coaches: { data: null, error: null },
    };
    routeMockState.authAdminResponses = { listUsers: { data: { users: [AUTH_USER] }, error: null } };

    const res = await POST(jsonRequest(URL, { userId: "r1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    const client = routeMockState.lastServiceClient!;
    expect(client.auth.admin.updateUserById).toHaveBeenCalledWith(
      "auth-1",
      expect.objectContaining({ app_metadata: expect.objectContaining({ approved: true }), email_confirm: true }),
    );
    expect(client.tables.user_requests.delete).toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0]).toMatchObject({ to: "newcoach@example.com" });
  });

  test("400 when updateUserById fails", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = {
      user_requests: { data: { email: "newcoach@example.com", name: "New Coach", role: "coach", request_type: "new" }, error: null },
      coaches: { data: null, error: null },
    };
    routeMockState.authAdminResponses = {
      listUsers: { data: { users: [AUTH_USER] }, error: null },
      updateUserById: { data: null, error: { message: "update failed" } },
    };

    const res = await POST(jsonRequest(URL, { userId: "r1" }));
    expect(res.status).toBe(400);
  });

  test("link request: merges a new identity onto the existing account's linkedIdentities", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = {
      user_requests: { data: { email: "existing@example.com", name: "Existing", role: "academy_admin", request_type: "link", existing_user_id: "auth-existing" }, error: null },
    };
    routeMockState.authAdminResponses = {
      getUserById: { data: { user: { id: "auth-existing", app_metadata: { role: "coach", coach_id: "c1" } } }, error: null },
    };

    const res = await POST(jsonRequest(URL, { userId: "r1", academyId: "ac1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    const client = routeMockState.lastServiceClient!;
    expect(client.auth.admin.updateUserById).toHaveBeenCalledWith(
      "auth-existing",
      expect.objectContaining({
        app_metadata: expect.objectContaining({
          linkedIdentities: [
            { role: "coach", academyId: undefined, coachId: "c1", playerId: undefined },
            { role: "academy_admin", academyId: "ac1" },
          ],
        }),
      }),
    );
    // Link requests never send an approval email or touch email_confirm.
    expect(sendMail).not.toHaveBeenCalled();
  });

  test("link request: links every matching player for a parent request, not just the first", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = {
      user_requests: { data: { email: "existing@example.com", name: "Existing", role: "parent", player_lookup_email: "family@example.com", request_type: "link", existing_user_id: "auth-existing" }, error: null },
      players: { data: [{ id: "p1" }, { id: "p2" }, { id: "p3" }], error: null },
    };
    routeMockState.authAdminResponses = {
      getUserById: { data: { user: { id: "auth-existing", app_metadata: { role: "coach", coach_id: "c1" } } }, error: null },
    };

    const res = await POST(jsonRequest(URL, { userId: "r1" }));
    expect(res.status).toBe(200);

    const client = routeMockState.lastServiceClient!;
    expect(client.auth.admin.updateUserById).toHaveBeenCalledWith(
      "auth-existing",
      expect.objectContaining({
        app_metadata: expect.objectContaining({
          linkedIdentities: [
            { role: "coach", academyId: undefined, coachId: "c1", playerId: undefined },
            { role: "parent", playerId: "p1" },
            { role: "parent", playerId: "p2" },
            { role: "parent", playerId: "p3" },
          ],
        }),
      }),
    );
  });

  test("link request: re-approving the same parent request doesn't duplicate an already-linked child", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = {
      user_requests: { data: { email: "existing@example.com", name: "Existing", role: "parent", player_lookup_email: "family@example.com", request_type: "link", existing_user_id: "auth-existing" }, error: null },
      players: { data: [{ id: "p1" }, { id: "p2" }], error: null },
    };
    routeMockState.authAdminResponses = {
      getUserById: {
        data: { user: { id: "auth-existing", app_metadata: {
          role: "parent", player_id: "p1",
          linkedIdentities: [{ role: "parent", playerId: "p1" }],
        } } },
        error: null,
      },
    };

    const res = await POST(jsonRequest(URL, { userId: "r1" }));
    expect(res.status).toBe(200);

    const client = routeMockState.lastServiceClient!;
    expect(client.auth.admin.updateUserById).toHaveBeenCalledWith(
      "auth-existing",
      expect.objectContaining({
        app_metadata: expect.objectContaining({
          linkedIdentities: [
            { role: "parent", playerId: "p1" },
            { role: "parent", playerId: "p2" },
          ],
        }),
      }),
    );
  });

  test("link request: 404 and dequeues when the linked account no longer exists", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = {
      user_requests: { data: { email: "gone@example.com", name: "Gone", role: "coach", request_type: "link", existing_user_id: "auth-gone" }, error: null },
    };
    routeMockState.authAdminResponses = { getUserById: { data: { user: null }, error: { message: "not found" } } };

    const res = await POST(jsonRequest(URL, { userId: "r1" }));
    expect(res.status).toBe(404);

    const client = routeMockState.lastServiceClient!;
    expect(client.tables.user_requests.delete).toHaveBeenCalled();
  });
});
