import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PerformanceClient } from "@/components/PerformanceClient";
import { makeAuthUser, makePlayer, makeReport, makeSession } from "../mocks/fixtures";

const { fetchPlayers, fetchReports, fetchSessions } = vi.hoisted(() => ({
  fetchPlayers: vi.fn(),
  fetchReports: vi.fn(),
  fetchSessions: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ fetchPlayers, fetchReports, fetchSessions }));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

describe("PerformanceClient", () => {
  test("shows an empty state with no players", async () => {
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchPlayers.mockResolvedValue([]);
    fetchReports.mockResolvedValue([]);
    fetchSessions.mockResolvedValue([]);

    render(<PerformanceClient />);
    expect(await screen.findByText("No players to show yet.")).toBeInTheDocument();
  });

  test("surfaces a player with a High injury-risk report under Needs Attention", async () => {
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchPlayers.mockResolvedValue([
      makePlayer({ id: "p1", name: "Alice Bowler" }),
      makePlayer({ id: "p2", name: "Bob Bowler" }),
    ]);
    fetchReports.mockResolvedValue([
      makeReport({ playerId: "p1", injuryRisk: "High", overallScore: 40 }),
      makeReport({ playerId: "p2", injuryRisk: "Low", overallScore: 90 }),
    ]);
    fetchSessions.mockResolvedValue([]);

    render(<PerformanceClient />);

    expect(await screen.findByText("⚠ Needs Attention (1)")).toBeInTheDocument();
    // Alice appears both in the alert banner and the full list.
    expect(screen.getAllByText("Alice Bowler").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Bob Bowler")).toBeInTheDocument();
  });
});
