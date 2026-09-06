import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReportsClient } from "@/components/ReportsClient";
import { makeAuthUser, makeCoach, makePlayer, makeReport } from "../mocks/fixtures";

// ReportCard's expanded body renders ReportActions/ReportReview, which have their own dedicated
// tests — none of these tests open an individual report, so they're mocked purely defensively.
vi.mock("@/components/ReportActions", () => ({ ReportActions: () => null }));
vi.mock("@/components/ReportReview", () => ({
  ReportReview: () => null,
  ReportStatusBadge: () => null,
}));

const { fetchReports, fetchPlayers, fetchAcademies, fetchCoaches } = vi.hoisted(() => ({
  fetchReports: vi.fn(), fetchPlayers: vi.fn(), fetchAcademies: vi.fn(), fetchCoaches: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ fetchReports, fetchPlayers, fetchAcademies, fetchCoaches }));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

function setupDefaults() {
  useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
  fetchPlayers.mockResolvedValue([]);
  fetchAcademies.mockResolvedValue([]);
  fetchCoaches.mockResolvedValue([]);
  fetchReports.mockResolvedValue([]);
}

describe("ReportsClient", () => {
  test("renders an empty state with no reports", async () => {
    setupDefaults();
    render(<ReportsClient />);
    expect(await screen.findByText("No reports match your filters.")).toBeInTheDocument();
  });

  test("groups a report under its player's coach", async () => {
    setupDefaults();
    fetchCoaches.mockResolvedValue([makeCoach({ id: "coach1", name: "Coach Dan" })]);
    fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler", coachId: "coach1" })]);
    fetchReports.mockResolvedValue([makeReport({ id: "r1", playerId: "p1", type: "Biomechanics" })]);

    render(<ReportsClient />);
    expect(await screen.findByText("👤 Coach Dan")).toBeInTheDocument();
  });

  test("paginates a large roster within an open coach group and resets to page 1 on a new coach", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoaches.mockResolvedValue([
      makeCoach({ id: "coach1", name: "Coach Dan" }),
      makeCoach({ id: "coach2", name: "Coach Ella" }),
    ]);
    const bigRoster = Array.from({ length: 12 }, (_, i) =>
      makePlayer({ id: `p${i}`, name: `Player Twelve${i}`, coachId: "coach1" })
    );
    fetchPlayers.mockResolvedValue([
      ...bigRoster,
      makePlayer({ id: "q1", name: "Solo Player", coachId: "coach2" }),
    ]);
    fetchReports.mockResolvedValue([
      // speedKmh: null keeps these players out of the speed leaderboard further down the page,
      // which would otherwise link to the same player names this test is asserting on.
      ...bigRoster.map((p, i) => makeReport({ id: `r${i}`, playerId: p.id, date: `2026-01-${String(i + 1).padStart(2, "0")}`, speedKmh: null })),
      makeReport({ id: "rq1", playerId: "q1", speedKmh: null }),
    ]);

    render(<ReportsClient />);
    await user.click(await screen.findByText("👤 Coach Dan"));

    expect(await screen.findByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("Player Twelve11")).toBeInTheDocument(); // most recent report first
    expect(screen.queryByText("Player Twelve0")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next →" }));
    expect(await screen.findByText("Player Twelve0")).toBeInTheDocument();
    expect(screen.queryByText("Player Twelve11")).not.toBeInTheDocument();

    // Opening a different coach's (smaller) group starts back on page 1, not stranded on page 2.
    await user.click(screen.getByText("👤 Coach Ella"));
    expect(await screen.findByText("Solo Player")).toBeInTheDocument();
    expect(screen.queryByText("Page 1 of 2")).not.toBeInTheDocument(); // only one page for coach2

    await user.click(screen.getByText("👤 Coach Dan"));
    expect(await screen.findByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("Player Twelve11")).toBeInTheDocument();
  });
});
