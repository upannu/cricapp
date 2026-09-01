import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { BadgeStrip } from "@/components/BadgeStrip";
import { makePlayer } from "../mocks/fixtures";

describe("BadgeStrip", () => {
  test("shows the no-badges message for a fresh player", () => {
    render(<BadgeStrip player={makePlayer({ sessionsCount: 0, xp: 0, tipBestStreak: 0 })} reportCount={0} />);

    expect(screen.getByText("Badges (0)")).toBeInTheDocument();
    expect(screen.getByText("No badges earned yet")).toBeInTheDocument();
  });

  test("counts earned badges and shows progress toward the next one", () => {
    // 1+ report earns the first-report badge; sessionsCount/xp still below their first tiers.
    render(<BadgeStrip player={makePlayer({ sessionsCount: 0, xp: 0, tipBestStreak: 0 })} reportCount={1} />);

    expect(screen.getByText("Badges (1)")).toBeInTheDocument();
    expect(screen.getByText(/^Next:/)).toBeInTheDocument();
  });
});
