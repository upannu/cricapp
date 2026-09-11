import { describe, expect, test, vi } from "vitest";
import { POST } from "@/app/api/cron/pack-auto-consume/route";
import { routeMockState } from "../../setup/api";
import { sydneyNowParts, DAY_TOKENS } from "@/lib/cron-time";

function req(bearer?: string): Request {
  return new Request("http://localhost/api/cron/pack-auto-consume", {
    method: "POST",
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  });
}

// Computed the same way the route itself resolves "today" (Australia/Sydney, not the test
// runner's own TZ) so this test doesn't depend on hardcoding a date that has to keep working.
const todayIso = sydneyNowParts(new Date()).dateIso;
const todayDow = new Date(`${todayIso}T00:00:00Z`).getUTCDay();
const todayToken = DAY_TOKENS[todayDow];

const PACK = {
  id: "pack1", player_id: "p1", academy_id: "ac1", session_type: "Net Session",
  agreed_days: [todayToken], sessions_used: 3, total_sessions: 10,
};

describe("POST /api/cron/pack-auto-consume", () => {
  test("401 with the wrong bearer token", async () => {
    const res = await POST(req("nope"));
    expect(res.status).toBe(401);
  });

  test("500 when CRON_SECRET isn't configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    try {
      const res = await POST(req());
      expect(res.status).toBe(500);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  // The one thing this whole PR adds: every credit this cron draws down is now attributable —
  // a coach seeing a spent credit can tell it was this unattended job, not a mis-click.
  test("tags the attendance record it writes as recorded_by 'auto-cron'", async () => {
    routeMockState.tableResponses = {
      session_packs: { data: [PACK], error: null },
      group_session_players: { data: [{ group_session_id: "gs1" }], error: null },
      group_sessions: { data: { id: "gs1" }, error: null },
      group_session_occurrences: { data: null, error: null }, // no existing occurrence yet
      attendance_records: { data: null, error: null }, // nobody's recorded this player today yet
    };

    const res = await POST(req(process.env.CRON_SECRET));
    expect(res.status).toBe(200);

    const upsertCalls = routeMockState.lastServiceClient!.tables.attendance_records.upsert.mock.calls;
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0][0]).toMatchObject({
      player_id: "p1", status: "Absent", pack_id: "pack1", recorded_by: "auto-cron",
    });
  });

  test("still tags recorded_by 'auto-cron' even when the pack has no room left (pack_id null)", async () => {
    routeMockState.tableResponses = {
      session_packs: { data: [{ ...PACK, sessions_used: 10 }], error: null },
      group_session_players: { data: [{ group_session_id: "gs1" }], error: null },
      group_sessions: { data: { id: "gs1" }, error: null },
      group_session_occurrences: { data: null, error: null },
      attendance_records: { data: null, error: null },
    };

    await POST(req(process.env.CRON_SECRET));

    const upsertCalls = routeMockState.lastServiceClient!.tables.attendance_records.upsert.mock.calls;
    expect(upsertCalls[0][0]).toMatchObject({ pack_id: null, recorded_by: "auto-cron" });
  });

  test("never writes a second record for a player already recorded today, by anyone", async () => {
    routeMockState.tableResponses = {
      session_packs: { data: [PACK], error: null },
      group_session_players: { data: [{ group_session_id: "gs1" }], error: null },
      group_sessions: { data: { id: "gs1" }, error: null },
      group_session_occurrences: { data: { id: "gso1" }, error: null },
      attendance_records: { data: { id: "att1" }, error: null }, // already recorded
    };

    await POST(req(process.env.CRON_SECRET));

    expect(routeMockState.lastServiceClient!.tables.attendance_records.upsert).not.toHaveBeenCalled();
  });

  test("skips a pack whose agreed days don't include today", async () => {
    routeMockState.tableResponses = {
      session_packs: { data: [{ ...PACK, agreed_days: [] }], error: null },
    };

    const res = await POST(req(process.env.CRON_SECRET));
    const body = await res.json();
    expect(body.results).toEqual([]);
  });
});
