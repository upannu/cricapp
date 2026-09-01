import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PortalClient } from "@/components/PortalClient";
import { makeAuthUser, makePlayer } from "../mocks/fixtures";

const { fetchPlayer, fetchSessions, fetchReports, fetchTodaysTip, recordTipView, fetchSessionPacks } = vi.hoisted(() => ({
  fetchPlayer: vi.fn(), fetchSessions: vi.fn(), fetchReports: vi.fn(),
  fetchTodaysTip: vi.fn(), recordTipView: vi.fn(async () => ({ streak: 0 })), fetchSessionPacks: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ fetchPlayer, fetchSessions, fetchReports, fetchTodaysTip, recordTipView, fetchSessionPacks }));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

function setupDefaults() {
  fetchSessions.mockResolvedValue([]);
  fetchReports.mockResolvedValue([]);
  fetchTodaysTip.mockResolvedValue(null);
  fetchSessionPacks.mockResolvedValue([]);
}

describe("PortalClient", () => {
  test("shows a 'no player linked' message for an account with no playerId", () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "player", playerId: undefined }) });

    render(<PortalClient />);
    expect(screen.getByText("No player linked to this account")).toBeInTheDocument();
  });

  test("renders the player's name and XP once loaded", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "player", playerId: "p1" }) });
    fetchPlayer.mockResolvedValue(makePlayer({ id: "p1", name: "Alice Bowler", xp: 500 }));

    render(<PortalClient />);

    expect(await screen.findByText("Alice Bowler")).toBeInTheDocument();
    expect(screen.getByText("⚡ 500 XP")).toBeInTheDocument();
    expect(recordTipView).toHaveBeenCalledWith("p1");
  });

  test("shows today's tip when one is returned", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "parent", playerId: "p1" }) });
    fetchPlayer.mockResolvedValue(makePlayer({ id: "p1", name: "Alice Bowler" }));
    fetchTodaysTip.mockResolvedValue({ id: "tip1", publishDate: "2026-01-01", category: "Technical", body: "Keep your front arm high." });

    render(<PortalClient />);

    expect(await screen.findByText("Keep your front arm high.")).toBeInTheDocument();
  });
});
