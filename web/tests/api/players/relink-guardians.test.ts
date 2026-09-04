import { describe, expect, test } from "vitest";
import { POST } from "@/app/api/players/relink-guardians/route";
import { routeMockState } from "../../setup/api";
import { rawUser, jsonRequest } from "../../mocks/caller";

const URL = "http://localhost/api/players/relink-guardians";

describe("POST /api/players/relink-guardians", () => {
  test("400 when playerIds is missing", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    const res = await POST(jsonRequest(URL, {}));
    expect(res.status).toBe(400);
  });

  test("401 when not signed in", async () => {
    const res = await POST(jsonRequest(URL, { playerIds: ["p1"] }));
    expect(res.status).toBe(401);
  });

  test("skips a player the caller has no access to — never touches any auth account", async () => {
    routeMockState.cookieUser = rawUser({ role: "coach", coach_id: "coach-mine" });
    routeMockState.tableResponses = { players: { data: { coach_id: "coach-someone-else" }, error: null } };

    const res = await POST(jsonRequest(URL, { playerIds: ["p1"] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ linked: 0 });
    expect(routeMockState.lastServiceClient!.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  test("skips a player with no email on file", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: { id: "p1", email: "" }, error: null } };

    const res = await POST(jsonRequest(URL, { playerIds: ["p1"] }));
    expect((await res.json()).linked).toBe(0);
  });

  test("skips a player whose email has no matching auth account", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: { id: "p1", email: "nobody@example.com" }, error: null } };
    routeMockState.authAdminResponses = { listUsers: { data: { users: [] }, error: null } };

    const res = await POST(jsonRequest(URL, { playerIds: ["p1"] }));
    expect((await res.json()).linked).toBe(0);
  });

  test("never grants a role the matching account never held — a coach whose email coincidentally matches", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: { id: "p1", email: "coach@example.com" }, error: null } };
    routeMockState.authAdminResponses = {
      listUsers: { data: { users: [{ id: "u1", email: "coach@example.com", app_metadata: { role: "coach", coach_id: "c1" } }] } },
    };

    const res = await POST(jsonRequest(URL, { playerIds: ["p1"] }));
    expect((await res.json()).linked).toBe(0);
    expect(routeMockState.lastServiceClient!.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  test("links a guardian who already holds parent to a newly-added sibling", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: { id: "p2", email: "guardian@example.com" }, error: null } };
    routeMockState.authAdminResponses = {
      listUsers: {
        data: {
          users: [{
            id: "u1", email: "guardian@example.com",
            app_metadata: { role: "parent", approved: true, player_id: "p1" },
          }],
        },
      },
    };

    const res = await POST(jsonRequest(URL, { playerIds: ["p2"] }));
    expect((await res.json()).linked).toBe(1);
    expect(routeMockState.lastServiceClient!.auth.admin.updateUserById).toHaveBeenCalledWith("u1", {
      app_metadata: {
        role: "parent", approved: true, player_id: "p1",
        linkedIdentities: [{ role: "parent", playerId: "p1" }, { role: "parent", playerId: "p2" }],
      },
    });
  });

  test("a no-email-of-their-own kid: an account holding both player and parent for the same prior playerId gets both extended", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: { id: "p2", email: "family@example.com" }, error: null } };
    routeMockState.authAdminResponses = {
      listUsers: {
        data: {
          users: [{
            id: "u1", email: "family@example.com",
            app_metadata: {
              role: "parent", approved: true, player_id: "p1",
              linkedIdentities: [{ role: "parent", playerId: "p1" }, { role: "player", playerId: "p1" }],
            },
          }],
        },
      },
    };

    const res = await POST(jsonRequest(URL, { playerIds: ["p2"] }));
    expect((await res.json()).linked).toBe(1);
    expect(routeMockState.lastServiceClient!.auth.admin.updateUserById).toHaveBeenCalledWith("u1", {
      app_metadata: {
        role: "parent", approved: true, player_id: "p1",
        linkedIdentities: [
          { role: "parent", playerId: "p1" }, { role: "player", playerId: "p1" },
          { role: "parent", playerId: "p2" }, { role: "player", playerId: "p2" },
        ],
      },
    });
  });

  test("already fully linked — no-op, no update call", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: { id: "p1", email: "guardian@example.com" }, error: null } };
    routeMockState.authAdminResponses = {
      listUsers: {
        data: {
          users: [{
            id: "u1", email: "guardian@example.com",
            app_metadata: { role: "parent", approved: true, player_id: "p1", linkedIdentities: [{ role: "parent", playerId: "p1" }] },
          }],
        },
      },
    };

    const res = await POST(jsonRequest(URL, { playerIds: ["p1"] }));
    expect((await res.json()).linked).toBe(0);
    expect(routeMockState.lastServiceClient!.auth.admin.updateUserById).not.toHaveBeenCalled();
  });
});
