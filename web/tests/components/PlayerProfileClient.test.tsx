import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlayerProfileClient } from "@/components/PlayerProfileClient";
import { makeAcademy, makeAuthUser, makePlayer } from "../mocks/fixtures";
import type { Plan } from "@/lib/types";

const { fetchPlayer, fetchAcademies, fetchCoaches, fetchReports, fetchSessions, fetchSCWorkouts, fetchActivePlans } = vi.hoisted(() => ({
  fetchPlayer: vi.fn(),
  fetchAcademies: vi.fn(),
  fetchCoaches: vi.fn(),
  fetchReports: vi.fn(),
  fetchSessions: vi.fn(),
  fetchSCWorkouts: vi.fn(),
  fetchActivePlans: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ fetchPlayer, fetchAcademies, fetchCoaches, fetchReports, fetchSessions, fetchSCWorkouts, fetchActivePlans }));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

// These render their own fetched data (invoices, messages, badge computations) —
// stub them so this test stays about PlayerProfileClient's own layout/branching.
vi.mock("@/components/BadgeStrip", () => ({ BadgeStrip: () => <div data-testid="badge-strip" /> }));
vi.mock("@/components/InvoiceHistoryList", () => ({ InvoiceHistoryList: () => <div data-testid="invoice-history" /> }));
vi.mock("@/components/PlayerMessages", () => ({ PlayerMessages: () => <div data-testid="player-messages" /> }));

function setupDefaults() {
  useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
  fetchAcademies.mockResolvedValue([]);
  fetchCoaches.mockResolvedValue([]);
  fetchReports.mockResolvedValue([]);
  fetchSessions.mockResolvedValue([]);
  fetchSCWorkouts.mockResolvedValue([]);
  fetchActivePlans.mockResolvedValue([]);
}

const FREE_PLAN: Plan = {
  id: "plan-free", slug: "free", name: "Free", audience: "individual",
  billingType: "subscription", billingInterval: "month", priceAud: 0, pricesByCurrency: {}, seatCap: null,
  accessDurationMonths: null, includedNotes: null, waivesSessionFees: false, platformAdminOnly: false,
  platformFeePercent: 10, active: true, sortOrder: 0,
  sessionsPerMonthLimit: 1, chatMessagesPerDayLimit: 1, aiReportsEnabled: false,
  marketplaceEnabled: false, locked: true,
};

describe("PlayerProfileClient", () => {
  test("renders 'Player not found' when the player doesn't exist", async () => {
    setupDefaults();
    fetchPlayer.mockResolvedValue(null);

    render(<PlayerProfileClient playerId="missing" />);

    expect(await screen.findByText("Player not found.")).toBeInTheDocument();
  });

  test("renders the player's name, XP and subscription plan", async () => {
    setupDefaults();
    fetchPlayer.mockResolvedValue(makePlayer({ id: "p1", name: "Alice Bowler", xp: 1250 }));

    render(<PlayerProfileClient playerId="p1" />);

    expect(await screen.findByText("Alice Bowler")).toBeInTheDocument();
    expect(screen.getByText("⚡ 1,250 XP")).toBeInTheDocument();
    expect(screen.getAllByText("Free").length).toBeGreaterThan(0);
  });

  test("hides the subscription card for a player who belongs to an academy", async () => {
    setupDefaults();
    fetchPlayer.mockResolvedValue(makePlayer({ id: "p1", name: "Alice Bowler" }));
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "ac1", playerIds: ["p1"] })]);

    render(<PlayerProfileClient playerId="p1" />);
    await screen.findByText("Alice Bowler");

    expect(screen.queryByText("Sessions used")).not.toBeInTheDocument();
  });

  test("shows the live Plan Catalog session cap, not the possibly-stale value stored on the player's own row", async () => {
    setupDefaults();
    // The player's own subscription.sessionsLimit (4) is what it was snapshotted to at creation
    // time — the Plan Catalog's current Free-tier cap (1) has since been lowered by an admin.
    // The displayed cap must track the Plan Catalog, the same source NewSessionForm already uses
    // to actually enforce it, not this stale per-row snapshot.
    fetchPlayer.mockResolvedValue(
      makePlayer({ id: "p1", name: "Alice Bowler", subscription: { plan: "Free", startDate: "2026-01-01", endDate: "2027-01-01", sessionsUsed: 1, sessionsLimit: 4 } }),
    );
    fetchActivePlans.mockResolvedValue([FREE_PLAN]);

    render(<PlayerProfileClient playerId="p1" />);
    await screen.findByText("Alice Bowler");

    expect(screen.getByText("1 / 1")).toBeInTheDocument();
    expect(screen.queryByText("1 / 4")).not.toBeInTheDocument();
  });

  test("shows an injury-risk warning badge when risk is elevated", async () => {
    setupDefaults();
    fetchPlayer.mockResolvedValue(
      makePlayer({ id: "p1", name: "Alice Bowler", biomechanics: { ballSpeedKmh: 120, frontKneeAngleDeg: 170, actionType: "Side-on", injuryRisk: "High", lastSession: "2026-01-01" } }),
    );

    render(<PlayerProfileClient playerId="p1" />);

    expect(await screen.findByText("⚠ High Injury Risk")).toBeInTheDocument();
  });
});
