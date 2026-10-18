import { describe, expect, test } from "vitest";
import { mapGameSummaryToImport, type PlayHQGameSummary } from "@/lib/playhq";

const SUMMARY: PlayHQGameSummary = {
  id: "game1",
  status: "COMPLETED",
  homeTeam: { id: "team-home", name: "Northside CC" },
  awayTeam: { id: "team-away", name: "Southside CC" },
  result: "Northside CC won by 24 runs",
  tossWonBy: "team-home",
  tossDecision: "BAT",
  appearances: [
    { discipline: "BATTING", playerId: "phq-p1", playerName: "A. Smith", teamId: "team-home", stats: { TOTAL_RUNS: 54, BALLS_FACED: 40, NOT_OUT: true } },
    { discipline: "FIELDING", playerId: "phq-p1", playerName: "A. Smith", teamId: "team-home", stats: { CATCHES: 1 } },
    { discipline: "BATTING", playerId: "phq-p2", playerName: "B. Jones", teamId: "team-away", stats: { TOTAL_RUNS: 12, BALLS_FACED: 18, NOT_OUT: false } },
    { discipline: "BOWLING", playerId: "phq-p3", playerName: "C. Lee", teamId: "team-home", stats: { WICKETS: 3, OVERS: 4.3, RUNS: 28, MAIDENS: 0 } },
    // No link supplied for this one — must contribute nothing.
    { discipline: "BATTING", playerId: "phq-p4", playerName: "D. Unmatched", teamId: "team-away", stats: { TOTAL_RUNS: 5, BALLS_FACED: 10, NOT_OUT: false } },
  ],
};

const LINKS = [
  { playhqPlayerId: "phq-p1", playerId: "cric-p1" },
  { playhqPlayerId: "phq-p2", playerId: "cric-p2" },
  { playhqPlayerId: "phq-p3", playerId: "cric-p3" },
  { playhqPlayerId: "phq-p4", playerId: null },
];

describe("mapGameSummaryToImport", () => {
  test("carries over match-level fields", () => {
    const mapped = mapGameSummaryToImport(SUMMARY, LINKS);
    expect(mapped.homeLabel).toBe("Northside CC");
    expect(mapped.awayLabel).toBe("Southside CC");
    expect(mapped.result).toBe("Northside CC won by 24 runs");
    expect(mapped.tossWonBy).toBe("home");
    expect(mapped.tossDecision).toBe("Bat");
  });

  test("merges a player's BATTING and FIELDING appearances into one row", () => {
    const mapped = mapGameSummaryToImport(SUMMARY, LINKS);
    const row = mapped.stats.find((s) => s.playerId === "cric-p1")!;
    expect(row.runsScored).toBe(54);
    expect(row.ballsFaced).toBe(40);
    expect(row.notOut).toBe(true);
    expect(row.catches).toBe(1);
  });

  test("converts cricket-notation overs (4.3 = 4 overs + 3 balls) to a ball count for bowling", () => {
    const mapped = mapGameSummaryToImport(SUMMARY, LINKS);
    const row = mapped.stats.find((s) => s.playerId === "cric-p3")!;
    expect(row.wickets).toBe(3);
    expect(row.ballsBowled).toBe(27); // 4*6 + 3
    expect(row.runsConceded).toBe(28);
  });

  test("an appearance with no confirmed player link contributes no row", () => {
    const mapped = mapGameSummaryToImport(SUMMARY, LINKS);
    expect(mapped.stats.find((s) => s.playerId === "phq-p4")).toBeUndefined();
    expect(mapped.stats).toHaveLength(3);
  });

  test("an appearance for a playhqPlayerId never passed in playerLinks is also skipped", () => {
    const mapped = mapGameSummaryToImport(SUMMARY, []);
    expect(mapped.stats).toHaveLength(0);
  });

  test("a not-out batter stays not out even if a later (unrelated) row sets nothing", () => {
    const summary: PlayHQGameSummary = {
      ...SUMMARY,
      appearances: [
        { discipline: "BATTING", playerId: "phq-p1", playerName: "A. Smith", teamId: "team-home", stats: { TOTAL_RUNS: 10, BALLS_FACED: 8, NOT_OUT: true } },
      ],
    };
    const mapped = mapGameSummaryToImport(summary, LINKS);
    expect(mapped.stats[0].notOut).toBe(true);
  });
});
