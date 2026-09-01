import { describe, expect, test } from "vitest";
import { callerCanAccessPlayer, type Caller } from "@/lib/server-auth";
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
