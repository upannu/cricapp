import { describe, expect, test } from "vitest";
import { getCoachOrAcademyLabel } from "@/lib/utils";
import { makePlayer, makeCoach, makeAcademy } from "../../mocks/fixtures";

describe("getCoachOrAcademyLabel", () => {
  test("prefers the academy's name when the player belongs to one, even if they also have a coach", () => {
    const player = makePlayer({ id: "p1", coachId: "c1" });
    const coach = makeCoach({ id: "c1", name: "Coach One" });
    const academy = makeAcademy({ id: "a1", name: "Riverside Academy", playerIds: ["p1"] });

    expect(getCoachOrAcademyLabel(player, [coach], [academy])).toBe("Riverside Academy");
  });

  test("falls back to the coach's name when the player has no academy", () => {
    const player = makePlayer({ id: "p1", coachId: "c1" });
    const coach = makeCoach({ id: "c1", name: "Coach One" });

    expect(getCoachOrAcademyLabel(player, [coach], [])).toBe("Coach One");
  });

  test("falls back to 'Unassigned' when the player has neither an academy nor a coach", () => {
    const player = makePlayer({ id: "p1", coachId: "" });
    expect(getCoachOrAcademyLabel(player, [], [])).toBe("Unassigned");
  });
});
