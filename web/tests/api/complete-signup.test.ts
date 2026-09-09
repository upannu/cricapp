import { describe, expect, test } from "vitest";
import { POST } from "@/app/api/complete-signup/route";
import { routeMockState } from "../setup/api";
import { jsonRequest } from "../mocks/caller";

const URL = "http://localhost/api/complete-signup";
const AUTH_USER = { id: "u1", email: "new@example.com", app_metadata: {} };

function authUser(overrides: Partial<typeof AUTH_USER> = {}) {
  routeMockState.authAdminResponses = {
    getUserById: { data: { user: { ...AUTH_USER, ...overrides } }, error: null },
  };
}

const BODY = { userId: "u1", name: "Jamie Player", email: "new@example.com", role: "player" };

describe("POST /api/complete-signup", () => {
  test("400 when a required field is missing", async () => {
    const res = await POST(jsonRequest(URL, { ...BODY, role: undefined }));
    expect(res.status).toBe(400);
  });

  test("400 for a role this route doesn't handle", async () => {
    const res = await POST(jsonRequest(URL, { ...BODY, role: "platform_admin" }));
    expect(res.status).toBe(400);
  });

  test("400 when the account/email doesn't match a real, freshly-created user", async () => {
    authUser({ email: "someone-else@example.com" });
    const res = await POST(jsonRequest(URL, BODY));
    expect(res.status).toBe(400);
  });

  test("409 when the account already has a role set — refuses to overwrite it", async () => {
    authUser({ app_metadata: { role: "player", approved: true } });
    const res = await POST(jsonRequest(URL, BODY));
    expect(res.status).toBe(409);
  });

  // ── New: a brand-new player with no coach/academy at all — newPlayerAgeGroup instead of a
  // playerLookupEmail match, see /signup's "I'm new here" toggle. ──────────────────────────────
  describe("role: player, newPlayerAgeGroup set (no coach/academy yet)", () => {
    test("creates a standalone player row and approves the account immediately", async () => {
      authUser();
      routeMockState.tableResponses = {
        plans: { data: [], error: null },
        players: { data: null, error: null },
      };
      const res = await POST(jsonRequest(URL, { ...BODY, newPlayerAgeGroup: "U14" }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ success: true, approved: true });

      const client = routeMockState.lastServiceClient!;
      expect(client.tables.players.insert).toHaveBeenCalledWith(expect.objectContaining({
        id: "p_u1", name: "Jamie Player", email: "new@example.com",
        age_group: "U14", coach_id: null, guardian_consent_status: "Pending",
        sub_plan: "Free", sub_sessions_limit: 4, // no "free" plan row configured — falls back to 4
      }));
      expect(client.auth.admin.updateUserById).toHaveBeenCalledWith("u1", {
        app_metadata: { role: "player", approved: true, player_id: "p_u1" },
      });
    });

    test("uses the configured Free plan's session limit when one exists, not the hardcoded fallback", async () => {
      authUser();
      routeMockState.tableResponses = {
        plans: { data: [{ id: "pl1", slug: "free", audience: "player", sessions_per_month_limit: 6, active: true, sort_order: 1, billing_type: "free", billing_interval: null, price_aud: 0, seat_cap: null, access_duration_months: null, included_notes: null, name: "Free" }], error: null },
        players: { data: null, error: null },
      };
      await POST(jsonRequest(URL, { ...BODY, newPlayerAgeGroup: "U10" }));

      const client = routeMockState.lastServiceClient!;
      expect(client.tables.players.insert).toHaveBeenCalledWith(expect.objectContaining({ sub_sessions_limit: 6 }));
    });

    test("400 for an invalid age group", async () => {
      authUser();
      const res = await POST(jsonRequest(URL, { ...BODY, newPlayerAgeGroup: "U15-not-real" }));
      expect(res.status).toBe(400);
    });

    test("500 and no app_metadata write when the player insert fails", async () => {
      authUser();
      routeMockState.tableResponses = {
        plans: { data: [], error: null },
        players: { data: null, error: { message: "duplicate key" } },
      };
      const res = await POST(jsonRequest(URL, { ...BODY, newPlayerAgeGroup: "U14" }));
      expect(res.status).toBe(500);

      const client = routeMockState.lastServiceClient!;
      expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
    });

    test("never used for role: parent — parent still goes through the lookup path", async () => {
      authUser();
      // No playerLookupEmail and no matching player — the lookup branch should be the one that
      // runs (and reject for a missing email), not the new-player branch, even with an age group
      // present, since role !== "player".
      const res = await POST(jsonRequest(URL, { ...BODY, role: "parent", newPlayerAgeGroup: "U14", playerLookupEmail: undefined }));
      expect(res.status).toBe(400);

      // Never even reached the players table — proves it took the "missing playerLookupEmail"
      // branch, not the new-player one (which would have inserted a row instead of 400ing).
      const client = routeMockState.lastServiceClient!;
      expect(client.tables.players).toBeUndefined();
    });
  });

  describe("role: player/parent, playerLookupEmail set (existing behavior, unchanged)", () => {
    test("400 when playerLookupEmail is missing entirely", async () => {
      authUser();
      const res = await POST(jsonRequest(URL, BODY));
      expect(res.status).toBe(400);
    });

    test("links to the matched player and approves immediately", async () => {
      authUser();
      routeMockState.tableResponses = { players: { data: [{ id: "p1" }], error: null } };
      const res = await POST(jsonRequest(URL, { ...BODY, playerLookupEmail: "kid@example.com" }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ success: true, approved: true });
      const client = routeMockState.lastServiceClient!;
      expect(client.auth.admin.updateUserById).toHaveBeenCalledWith("u1", {
        app_metadata: { role: "player", approved: true, player_id: "p1" },
      });
    });

    test("400 when nothing matches the lookup email", async () => {
      authUser();
      routeMockState.tableResponses = { players: { data: [], error: null } };
      const res = await POST(jsonRequest(URL, { ...BODY, playerLookupEmail: "nobody@example.com" }));
      expect(res.status).toBe(400);
    });
  });

  describe("role: academy_admin (existing behavior, unchanged)", () => {
    test("queues a pending request rather than auto-approving", async () => {
      authUser();
      routeMockState.tableResponses = {
        academies: { data: [], error: null },
        user_requests: { data: null, error: null },
      };
      const fetchSpy = globalThis.fetch;
      globalThis.fetch = (async () => new Response("{}")) as typeof fetch;
      const res = await POST(jsonRequest(URL, { ...BODY, role: "academy_admin", academyName: "Riverside Academy" }));
      globalThis.fetch = fetchSpy;
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ success: true, approved: false });
      const client = routeMockState.lastServiceClient!;
      expect(client.auth.admin.updateUserById).toHaveBeenCalledWith("u1", {
        app_metadata: { role: "academy_admin", approved: false },
      });
    });
  });
});
