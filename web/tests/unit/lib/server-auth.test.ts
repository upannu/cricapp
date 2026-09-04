import { describe, expect, test } from "vitest";
import { callerCanAccessPlayer, findAuthUserByEmail, listAllAuthUsers, type Caller } from "@/lib/server-auth";
import { createSupabaseMock } from "../../mocks/supabase";

const TARGET_PLAYER = "player-123";

describe("callerCanAccessPlayer", () => {
  test("platform_admin can always access any player", async () => {
    const supabase = createSupabaseMock();
    const caller: Caller = { userId: "u1", role: "platform_admin" };

    await expect(callerCanAccessPlayer(supabase as never, caller, TARGET_PLAYER)).resolves.toBe(true);
  });

  test("player can access only themselves", async () => {
    const supabase = createSupabaseMock();

    await expect(
      callerCanAccessPlayer(supabase as never, { userId: "u1", role: "player", playerId: TARGET_PLAYER }, TARGET_PLAYER),
    ).resolves.toBe(true);
    await expect(
      callerCanAccessPlayer(supabase as never, { userId: "u1", role: "player", playerId: "someone-else" }, TARGET_PLAYER),
    ).resolves.toBe(false);
  });

  test("parent can access only their linked player", async () => {
    const supabase = createSupabaseMock();

    await expect(
      callerCanAccessPlayer(supabase as never, { userId: "u1", role: "parent", playerId: TARGET_PLAYER }, TARGET_PLAYER),
    ).resolves.toBe(true);
    await expect(
      callerCanAccessPlayer(supabase as never, { userId: "u1", role: "parent", playerId: "someone-else" }, TARGET_PLAYER),
    ).resolves.toBe(false);
  });

  test("coach can access a player assigned to them", async () => {
    const supabase = createSupabaseMock({ players: { data: { coach_id: "coach-1" }, error: null } });
    const caller: Caller = { userId: "u1", role: "coach", coachId: "coach-1" };

    await expect(callerCanAccessPlayer(supabase as never, caller, TARGET_PLAYER)).resolves.toBe(true);
  });

  test("coach cannot access a player assigned to a different coach", async () => {
    const supabase = createSupabaseMock({ players: { data: { coach_id: "someone-elses-coach" }, error: null } });
    const caller: Caller = { userId: "u1", role: "coach", coachId: "coach-1" };

    await expect(callerCanAccessPlayer(supabase as never, caller, TARGET_PLAYER)).resolves.toBe(false);
  });

  test("coach with no coachId on their session is denied without querying", async () => {
    const supabase = createSupabaseMock();
    const caller: Caller = { userId: "u1", role: "coach" };

    await expect(callerCanAccessPlayer(supabase as never, caller, TARGET_PLAYER)).resolves.toBe(false);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  test("academy_admin can access a player in their academy's roster", async () => {
    const supabase = createSupabaseMock({
      academies: { data: { player_ids: ["other-player", TARGET_PLAYER] }, error: null },
    });
    const caller: Caller = { userId: "u1", role: "academy_admin", academyId: "academy-1" };

    await expect(callerCanAccessPlayer(supabase as never, caller, TARGET_PLAYER)).resolves.toBe(true);
  });

  test("academy_admin cannot access a player outside their academy's roster", async () => {
    const supabase = createSupabaseMock({ academies: { data: { player_ids: ["other-player"] }, error: null } });
    const caller: Caller = { userId: "u1", role: "academy_admin", academyId: "academy-1" };

    await expect(callerCanAccessPlayer(supabase as never, caller, TARGET_PLAYER)).resolves.toBe(false);
  });

  test("unknown/missing role is denied", async () => {
    const supabase = createSupabaseMock();
    const caller: Caller = { userId: "u1" };

    await expect(callerCanAccessPlayer(supabase as never, caller, TARGET_PLAYER)).resolves.toBe(false);
  });
});

// The Admin API has no server-side "search by email" endpoint, so these page through
// listUsers() by hand — the exact bug this covers: every real call site used to fetch page 1
// only (perPage: 1000) and silently miss anyone past the 1000th signup. The shared mock's
// listUsers always returns the same static response regardless of the page requested, so these
// tests override it directly with a real multi-call sequence to prove the pagination loop itself
// works, not just the single-page case every route's own test already exercises.
describe("findAuthUserByEmail / listAllAuthUsers", () => {
  function userWithEmail(email: string) {
    return { id: `id-${email}`, email, app_metadata: {}, user_metadata: {} };
  }

  test("finds a match on the first page without requesting a second", async () => {
    const supabase = createSupabaseMock();
    let calls = 0;
    supabase.auth.admin.listUsers = (async () => {
      calls++;
      return { data: { users: [userWithEmail("alice@example.com")], nextPage: 2 }, error: null };
    }) as unknown as typeof supabase.auth.admin.listUsers;

    const { user, error } = await findAuthUserByEmail(supabase as never, "alice@example.com");
    expect(error).toBeNull();
    expect(user?.email).toBe("alice@example.com");
    expect(calls).toBe(1);
  });

  test("pages past a full first page to find a match on the second", async () => {
    const supabase = createSupabaseMock();
    let calls = 0;
    supabase.auth.admin.listUsers = (async () => {
      calls++;
      return calls === 1
        ? { data: { users: [userWithEmail("someone-else@example.com")], nextPage: 2 }, error: null }
        : { data: { users: [userWithEmail("bob@example.com")], nextPage: null }, error: null };
    }) as unknown as typeof supabase.auth.admin.listUsers;

    const { user, error } = await findAuthUserByEmail(supabase as never, "bob@example.com");
    expect(error).toBeNull();
    expect(user?.email).toBe("bob@example.com");
    expect(calls).toBe(2);
  });

  test("returns null, not an infinite loop, once every page is exhausted with no match", async () => {
    const supabase = createSupabaseMock();
    let calls = 0;
    supabase.auth.admin.listUsers = (async () => {
      calls++;
      return { data: { users: [userWithEmail("nobody-relevant@example.com")], nextPage: null }, error: null };
    }) as unknown as typeof supabase.auth.admin.listUsers;

    const { user, error } = await findAuthUserByEmail(supabase as never, "missing@example.com");
    expect(error).toBeNull();
    expect(user).toBeNull();
    expect(calls).toBe(1);
  });

  test("listAllAuthUsers collects users across every page, not just the first", async () => {
    const supabase = createSupabaseMock();
    let calls = 0;
    supabase.auth.admin.listUsers = (async () => {
      calls++;
      return calls === 1
        ? { data: { users: [userWithEmail("a@example.com")], nextPage: 2 }, error: null }
        : { data: { users: [userWithEmail("b@example.com")], nextPage: null }, error: null };
    }) as unknown as typeof supabase.auth.admin.listUsers;

    const { users, error } = await listAllAuthUsers(supabase as never);
    expect(error).toBeNull();
    expect(users.map((u) => u.email)).toEqual(["a@example.com", "b@example.com"]);
  });
});
