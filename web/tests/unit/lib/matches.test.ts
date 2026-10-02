import { describe, expect, test } from "vitest";
import {
  applyBall, initialScoringState, oversDecimal, computeMatchResult,
  extractInningsContribution, aggregateCareerStats, combineWithImported, deriveRateStats,
  newDeliveryId, matchStatusLabel,
  type ScoringState, type BallInput,
} from "@/lib/matches";
import type { Delivery, Innings } from "@/lib/types";
import type { DbImportedMatchStats } from "@/lib/db";

const S = "striker-1";
const NS = "non-striker-1";
const BOWLER = "bowler-1";

function state(overrides: Partial<ScoringState> = {}): ScoringState {
  return { ...initialScoringState(S, NS, BOWLER), ...overrides };
}

function ball(overrides: Partial<BallInput> = {}): BallInput {
  return {
    runsBat: 0, runsExtra: 0, extraType: null, wicketType: null,
    dismissedEnd: null, fielderParticipantId: null, commentary: null,
    ...overrides,
  };
}

describe("applyBall", () => {
  test("a dot ball doesn't rotate strike or change the over", () => {
    const { nextState, delivery, overCompleted, isLegalDelivery } = applyBall(state(), ball());
    expect(isLegalDelivery).toBe(true);
    expect(overCompleted).toBe(false);
    expect(nextState.ballInOver).toBe(1);
    expect(nextState.strikerParticipantId).toBe(S);
    expect(nextState.nonStrikerParticipantId).toBe(NS);
    expect(nextState.totalRuns).toBe(0);
    expect(delivery.overNumber).toBe(0);
    expect(delivery.ballInOver).toBe(1);
  });

  test("an even run off the bat doesn't rotate strike", () => {
    const { nextState } = applyBall(state(), ball({ runsBat: 2 }));
    expect(nextState.strikerParticipantId).toBe(S);
    expect(nextState.totalRuns).toBe(2);
  });

  test("an odd run off the bat rotates strike", () => {
    const { nextState } = applyBall(state(), ball({ runsBat: 1 }));
    expect(nextState.strikerParticipantId).toBe(NS);
    expect(nextState.nonStrikerParticipantId).toBe(S);
  });

  test("a four is flagged and doesn't rotate strike", () => {
    const { delivery, nextState } = applyBall(state(), ball({ runsBat: 4 }));
    expect(delivery.isFour).toBe(true);
    expect(delivery.isSix).toBe(false);
    expect(nextState.strikerParticipantId).toBe(S);
    expect(nextState.totalRuns).toBe(4);
  });

  test("a six is flagged", () => {
    const { delivery } = applyBall(state(), ball({ runsBat: 6 }));
    expect(delivery.isSix).toBe(true);
  });

  test("a wide doesn't consume a ball of the over and adds its runs", () => {
    const { nextState, delivery, isLegalDelivery } = applyBall(state(), ball({ runsExtra: 1, extraType: "Wide" }));
    expect(isLegalDelivery).toBe(false);
    expect(nextState.ballInOver).toBe(0);
    expect(nextState.totalRuns).toBe(1);
    expect(delivery.extraType).toBe("Wide");
  });

  test("a wide with extra byes run (odd total) rotates strike even though it's illegal", () => {
    const { nextState } = applyBall(state(), ball({ runsExtra: 3, extraType: "Wide" }));
    expect(nextState.strikerParticipantId).toBe(NS);
    expect(nextState.totalRuns).toBe(3);
  });

  test("a no-ball doesn't consume a ball but bat runs off it still count and can rotate strike", () => {
    const { nextState, delivery, isLegalDelivery } = applyBall(state(), ball({ runsBat: 1, runsExtra: 1, extraType: "No Ball" }));
    expect(isLegalDelivery).toBe(false);
    expect(nextState.ballInOver).toBe(0);
    expect(nextState.totalRuns).toBe(2);
    expect(nextState.strikerParticipantId).toBe(NS); // 1 run off the bat rotates strike
    expect(delivery.isFour).toBe(false);
  });

  test("a four off a no-ball is flagged as a four", () => {
    const { delivery } = applyBall(state(), ball({ runsBat: 4, runsExtra: 1, extraType: "No Ball" }));
    expect(delivery.isFour).toBe(true);
  });

  test("a no-ball's mandatory penalty run alone (0 off the bat) doesn't rotate strike", () => {
    const { nextState } = applyBall(state(), ball({ runsBat: 0, runsExtra: 1, extraType: "No Ball" }));
    expect(nextState.strikerParticipantId).toBe(S);
  });

  test("a bye counts the over and rotates strike on odd runs run", () => {
    const { nextState, isLegalDelivery } = applyBall(state(), ball({ runsExtra: 1, extraType: "Bye" }));
    expect(isLegalDelivery).toBe(true);
    expect(nextState.ballInOver).toBe(1);
    expect(nextState.strikerParticipantId).toBe(NS);
    expect(nextState.totalRuns).toBe(1);
  });

  test("a leg bye behaves like a bye for scoring purposes", () => {
    const { nextState } = applyBall(state(), ball({ runsExtra: 2, extraType: "Leg Bye" }));
    expect(nextState.strikerParticipantId).toBe(S);
    expect(nextState.totalRuns).toBe(2);
  });

  test("the 6th legal ball completes the over and swaps ends regardless of the run count", () => {
    const s = state({ ballInOver: 5 });
    const { nextState, overCompleted, delivery } = applyBall(s, ball());
    expect(overCompleted).toBe(true);
    expect(nextState.overNumber).toBe(1);
    expect(nextState.ballInOver).toBe(0);
    expect(nextState.strikerParticipantId).toBe(NS); // ends change
    expect(delivery.ballInOver).toBe(6); // the ball that completed over 0
  });

  test("an over-completing ball with an odd run: the two rotations cancel, striker stays on strike", () => {
    const s = state({ ballInOver: 5 });
    const { nextState } = applyBall(s, ball({ runsBat: 1 }));
    // runs-rotation (odd -> swap) XOR over-rotation (swap) = no net swap
    expect(nextState.strikerParticipantId).toBe(S);
  });

  test("a wide never completes an over even on the 6th delivery attempt", () => {
    const s = state({ ballInOver: 5 });
    const { nextState, overCompleted } = applyBall(s, ball({ runsExtra: 1, extraType: "Wide" }));
    expect(overCompleted).toBe(false);
    expect(nextState.ballInOver).toBe(5);
  });

  test("a wicket increments totalWickets and dismisses the striker by default", () => {
    const { nextState, delivery } = applyBall(state(), ball({ wicketType: "Bowled" }));
    expect(nextState.totalWickets).toBe(1);
    expect(delivery.dismissedParticipantId).toBe(S);
  });

  test("a run-out can dismiss the non-striker instead", () => {
    const { delivery } = applyBall(state(), ball({ wicketType: "Run Out", dismissedEnd: "non-striker", runsBat: 1 }));
    expect(delivery.dismissedParticipantId).toBe(NS);
  });

  test("a caught dismissal records the fielder", () => {
    const { delivery } = applyBall(state(), ball({ wicketType: "Caught", fielderParticipantId: "fielder-1" }));
    expect(delivery.fielderParticipantId).toBe("fielder-1");
    expect(delivery.wicketType).toBe("Caught");
  });

  test("deliverySequence increments on every ball, legal or not — used for a collision-safe id", () => {
    const { nextState: s1 } = applyBall(state(), ball());
    const { nextState: s2 } = applyBall(s1, ball({ extraType: "Wide", runsExtra: 1 }));
    expect(s1.deliverySequence).toBe(1);
    expect(s2.deliverySequence).toBe(2);
  });
});

describe("newDeliveryId", () => {
  test("is a deterministic, zero-padded, collision-safe compound key", () => {
    expect(newDeliveryId("in_m1_1", 7)).toBe("dl_in_m1_1_0007");
    expect(newDeliveryId("in_m1_1", 7)).toBe(newDeliveryId("in_m1_1", 7));
  });
});

describe("matchStatusLabel", () => {
  test("splits InProgress into two words", () => {
    expect(matchStatusLabel("InProgress")).toBe("In Progress");
  });

  test("leaves already space-separated or single-word statuses unchanged", () => {
    expect(matchStatusLabel("Completed")).toBe("Completed");
    expect(matchStatusLabel("Innings Break")).toBe("Innings Break");
  });
});

describe("oversDecimal", () => {
  test("formats overs as X.Y", () => {
    expect(oversDecimal(14, 3)).toBe(14.3);
    expect(oversDecimal(0, 0)).toBe(0);
  });
});

function innings(overrides: Partial<Innings>): Innings {
  return {
    id: "in1", matchId: "m1", inningsNumber: 1, battingSide: "home", bowlingSide: "away",
    status: "Completed", totalRuns: 0, totalWickets: 0, totalOvers: 0, targetRuns: null,
    ...overrides,
  };
}

describe("computeMatchResult", () => {
  test("a tie", () => {
    const result = computeMatchResult(
      [innings({ battingSide: "home", totalRuns: 150 }), innings({ battingSide: "away", totalRuns: 150 })],
      "Home", "Away",
    );
    expect(result).toBe("Match tied");
  });

  test("the side batting first wins by runs when the chase falls short", () => {
    const result = computeMatchResult(
      [innings({ battingSide: "home", totalRuns: 180 }), innings({ battingSide: "away", totalRuns: 150, totalWickets: 10 })],
      "Home", "Away",
    );
    expect(result).toBe("Home won by 30 runs");
  });

  test("a successful chase wins by wickets remaining, not runs", () => {
    const result = computeMatchResult(
      [innings({ battingSide: "home", totalRuns: 150 }), innings({ battingSide: "away", totalRuns: 151, totalWickets: 4 })],
      "Home", "Away",
    );
    expect(result).toBe("Away won by 6 wickets");
  });

  test("singular run/wicket phrasing", () => {
    const byOneRun = computeMatchResult(
      [innings({ battingSide: "home", totalRuns: 101 }), innings({ battingSide: "away", totalRuns: 100, totalWickets: 10 })],
      "Home", "Away",
    );
    expect(byOneRun).toBe("Home won by 1 run");

    const byOneWicket = computeMatchResult(
      [innings({ battingSide: "home", totalRuns: 100 }), innings({ battingSide: "away", totalRuns: 101, totalWickets: 9 })],
      "Home", "Away",
    );
    expect(byOneWicket).toBe("Away won by 1 wicket");
  });
});

function delivery(overrides: Partial<Delivery>): Delivery {
  return {
    id: "d1", inningsId: "in1", overNumber: 0, ballInOver: 1,
    strikerParticipantId: S, nonStrikerParticipantId: NS, bowlerParticipantId: BOWLER,
    runsBat: 0, runsExtra: 0, extraType: null, wicketType: null,
    dismissedParticipantId: null, fielderParticipantId: null,
    isFour: false, isSix: false, commentary: null, recordedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("extractInningsContribution", () => {
  test("tallies a batter's runs, balls faced, fours and sixes", () => {
    const deliveries = [
      delivery({ strikerParticipantId: S, runsBat: 4, isFour: true }),
      delivery({ strikerParticipantId: S, runsBat: 1 }),
      delivery({ strikerParticipantId: NS, runsBat: 6, isSix: true }), // not this player's ball
    ];
    const c = extractInningsContribution(deliveries, S);
    expect(c.battedThisInnings).toBe(true);
    expect(c.runsScored).toBe(5);
    expect(c.ballsFaced).toBe(2);
    expect(c.fours).toBe(1);
    expect(c.sixes).toBe(0);
    expect(c.dismissed).toBe(false);
  });

  test("a wide doesn't count as a ball faced; a no-ball does", () => {
    const deliveries = [
      delivery({ strikerParticipantId: S, extraType: "Wide", runsExtra: 1 }),
      delivery({ strikerParticipantId: S, extraType: "No Ball", runsBat: 1, runsExtra: 1 }),
    ];
    const c = extractInningsContribution(deliveries, S);
    expect(c.ballsFaced).toBe(1);
    expect(c.runsScored).toBe(1);
  });

  test("marks dismissed only when this participant is the one given out", () => {
    const deliveries = [delivery({ strikerParticipantId: S, wicketType: "Bowled", dismissedParticipantId: S })];
    const c = extractInningsContribution(deliveries, S);
    expect(c.dismissed).toBe(true);
  });

  test("a bowler's figures exclude byes/leg-byes but include wide/no-ball penalty runs", () => {
    const deliveries = [
      delivery({ bowlerParticipantId: BOWLER, runsBat: 4 }),
      delivery({ bowlerParticipantId: BOWLER, extraType: "Bye", runsExtra: 4 }),
      delivery({ bowlerParticipantId: BOWLER, extraType: "Wide", runsExtra: 1 }),
      delivery({ bowlerParticipantId: BOWLER, extraType: "No Ball", runsBat: 1, runsExtra: 1 }),
    ];
    const c = extractInningsContribution(deliveries, BOWLER);
    // 4 (off bat) + 0 (bye excluded from runsConceded, though it IS a legal ball) + 1 (wide) + 2 (no-ball: 1 bat + 1 penalty) = 7
    expect(c.runsConceded).toBe(7);
    expect(c.ballsBowled).toBe(2); // the bat-runs ball and the bye both count toward the over; the wide and no-ball don't
  });

  test("only bowled/caught/lbw/stumped/hit-wicket count as the bowler's wicket — not run-outs", () => {
    const deliveries = [
      delivery({ bowlerParticipantId: BOWLER, wicketType: "Bowled" }),
      delivery({ bowlerParticipantId: BOWLER, wicketType: "Run Out" }),
    ];
    const c = extractInningsContribution(deliveries, BOWLER);
    expect(c.wicketsTaken).toBe(1);
  });

  test("fielding credits go to the fielder, split by catch/run-out/stumping", () => {
    const fielder = "fielder-1";
    const deliveries = [
      delivery({ wicketType: "Caught", fielderParticipantId: fielder }),
      delivery({ wicketType: "Run Out", fielderParticipantId: fielder }),
      delivery({ wicketType: "Stumped", fielderParticipantId: fielder }),
    ];
    const c = extractInningsContribution(deliveries, fielder);
    expect(c.catches).toBe(1);
    expect(c.runOuts).toBe(1);
    expect(c.stumpings).toBe(1);
  });
});

describe("aggregateCareerStats", () => {
  test("a not-out innings doesn't count as a dismissal; highest score tracks the best innings", () => {
    const agg = aggregateCareerStats([
      { battedThisInnings: true, runsScored: 30, ballsFaced: 20, fours: 2, sixes: 0, dismissed: true, bowledThisInnings: false, ballsBowled: 0, runsConceded: 0, wicketsTaken: 0, catches: 0, runOuts: 0, stumpings: 0 },
      { battedThisInnings: true, runsScored: 55, ballsFaced: 40, fours: 5, sixes: 1, dismissed: false, bowledThisInnings: false, ballsBowled: 0, runsConceded: 0, wicketsTaken: 0, catches: 0, runOuts: 0, stumpings: 0 },
    ], 2);
    expect(agg.inningsBatted).toBe(2);
    expect(agg.runsScored).toBe(85);
    expect(agg.notOuts).toBe(1);
    expect(agg.highestScore).toBe(55);
  });

  test("best bowling prefers more wickets, then fewer runs conceded on a tie", () => {
    const agg = aggregateCareerStats([
      { battedThisInnings: false, runsScored: 0, ballsFaced: 0, fours: 0, sixes: 0, dismissed: false, bowledThisInnings: true, ballsBowled: 24, runsConceded: 30, wicketsTaken: 2, catches: 0, runOuts: 0, stumpings: 0 },
      { battedThisInnings: false, runsScored: 0, ballsFaced: 0, fours: 0, sixes: 0, dismissed: false, bowledThisInnings: true, ballsBowled: 24, runsConceded: 18, wicketsTaken: 2, catches: 0, runOuts: 0, stumpings: 0 },
      { battedThisInnings: false, runsScored: 0, ballsFaced: 0, fours: 0, sixes: 0, dismissed: false, bowledThisInnings: true, ballsBowled: 24, runsConceded: 40, wicketsTaken: 1, catches: 0, runOuts: 0, stumpings: 0 },
    ], 3);
    expect(agg.bestBowlingWickets).toBe(2);
    expect(agg.bestBowlingRuns).toBe(18);
  });
});

describe("deriveRateStats", () => {
  test("averages and rates are null when there's no relevant denominator yet", () => {
    const rates = deriveRateStats({
      matchesPlayed: 0, inningsBatted: 0, runsScored: 0, ballsFaced: 0, notOuts: 0, fours: 0, sixes: 0, highestScore: 0,
      inningsBowled: 0, ballsBowled: 0, runsConceded: 0, wickets: 0, bestBowlingWickets: -1, bestBowlingRuns: 0,
      catches: 0, runOuts: 0, stumpings: 0,
    });
    expect(rates.battingAverage).toBeNull();
    expect(rates.strikeRate).toBeNull();
    expect(rates.bowlingAverage).toBeNull();
    expect(rates.economyRate).toBeNull();
    expect(rates.bestBowling).toBeNull();
  });

  test("an undismissed-every-innings player has no finite average (not a divide-by-zero)", () => {
    const rates = deriveRateStats({
      matchesPlayed: 2, inningsBatted: 2, runsScored: 100, ballsFaced: 80, notOuts: 2, fours: 0, sixes: 0, highestScore: 60,
      inningsBowled: 0, ballsBowled: 0, runsConceded: 0, wickets: 0, bestBowlingWickets: -1, bestBowlingRuns: 0,
      catches: 0, runOuts: 0, stumpings: 0,
    });
    expect(rates.battingAverage).toBeNull();
    expect(rates.strikeRate).toBe(125);
  });

  test("computes batting average, strike rate, bowling average, economy and best-bowling string", () => {
    const rates = deriveRateStats({
      matchesPlayed: 3, inningsBatted: 3, runsScored: 90, ballsFaced: 60, notOuts: 0, fours: 0, sixes: 0, highestScore: 50,
      inningsBowled: 3, ballsBowled: 72, runsConceded: 90, wickets: 6, bestBowlingWickets: 3, bestBowlingRuns: 20,
      catches: 0, runOuts: 0, stumpings: 0,
    });
    expect(rates.battingAverage).toBe(30);
    expect(rates.strikeRate).toBe(150);
    expect(rates.bowlingAverage).toBe(15);
    expect(rates.economyRate).toBe(7.5);
    expect(rates.bestBowling).toBe("3/20");
  });
});

function importedRow(overrides: Partial<DbImportedMatchStats>): DbImportedMatchStats {
  return {
    id: "ims1", match_id: "m-imported-1", player_id: "p1",
    runs_scored: 0, balls_faced: 0, not_out: false, wickets: 0, balls_bowled: 0, runs_conceded: 0,
    catches: 0, run_outs: 0, stumpings: 0,
    ...overrides,
  };
}

describe("combineWithImported", () => {
  const empty = aggregateCareerStats([], 0);

  test("an imported match with no bowling involvement doesn't inflate inningsBowled", () => {
    const combined = combineWithImported(empty, [importedRow({ runs_scored: 25, balls_faced: 20 })]);
    expect(combined.matchesPlayed).toBe(1);
    expect(combined.inningsBatted).toBe(1);
    expect(combined.runsScored).toBe(25);
    expect(combined.inningsBowled).toBe(0);
  });

  test("merges both batting and bowling contributions and updates highest score / best bowling", () => {
    const live = aggregateCareerStats([
      { battedThisInnings: true, runsScored: 40, ballsFaced: 30, fours: 3, sixes: 0, dismissed: true, bowledThisInnings: false, ballsBowled: 0, runsConceded: 0, wicketsTaken: 0, catches: 0, runOuts: 0, stumpings: 0 },
    ], 1);
    const combined = combineWithImported(live, [
      importedRow({ runs_scored: 60, balls_faced: 45, not_out: true, wickets: 3, balls_bowled: 24, runs_conceded: 22, catches: 1 }),
    ]);
    expect(combined.matchesPlayed).toBe(2);
    expect(combined.highestScore).toBe(60);
    expect(combined.notOuts).toBe(1);
    expect(combined.bestBowlingWickets).toBe(3);
    expect(combined.bestBowlingRuns).toBe(22);
    expect(combined.catches).toBe(1);
  });
});
