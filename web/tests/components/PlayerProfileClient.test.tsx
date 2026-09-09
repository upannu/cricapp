import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlayerProfileClient } from "@/components/PlayerProfileClient";
import { makeAcademy, makeAuthUser, makeCoach, makePlayer } from "../mocks/fixtures";
import type { Plan } from "@/lib/types";

const { fetchPlayer, fetchAcademies, fetchCoaches, fetchReports, fetchSessions, fetchSCWorkouts, fetchActivePlans, updatePlayer } = vi.hoisted(() => ({
  fetchPlayer: vi.fn(),
  fetchAcademies: vi.fn(),
  fetchCoaches: vi.fn(),
  fetchReports: vi.fn(),
  fetchSessions: vi.fn(),
  fetchSCWorkouts: vi.fn(),
  fetchActivePlans: vi.fn(),
  updatePlayer: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ fetchPlayer, fetchAcademies, fetchCoaches, fetchReports, fetchSessions, fetchSCWorkouts, fetchActivePlans, updatePlayer }));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

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
  updatePlayer.mockClear();
  updatePlayer.mockResolvedValue(undefined);
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

  // Edit Player moved out of the top bar into the identity card's own action row (alongside
  // View All Reports/Action Plans/etc.), outlined rather than solid-filled — matching how Coaches'
  // own profile page places "Edit Coach" next to its other actions instead of up in the top bar.
  test("Edit Player sits in the action row, outlined, not solid-filled in the top bar", async () => {
    setupDefaults();
    fetchPlayer.mockResolvedValue(makePlayer({ id: "p1", name: "Alice Bowler" }));

    render(<PlayerProfileClient playerId="p1" />);
    await screen.findByText("Alice Bowler");

    const editLink = screen.getByRole("link", { name: "Edit Player" });
    expect(editLink).toHaveAttribute("href", "/players/p1/edit");
    expect(editLink).toHaveClass("text-pace-green", "border-pace-green/40");
    expect(editLink).not.toHaveClass("bg-pace-green");
    // Lives beside the other per-player actions, not alone up in the top bar next to Back.
    expect(editLink.closest("div")).toBe(screen.getByRole("link", { name: "View All Reports" }).closest("div"));
  });

  // The ⋮ menu brings Send Message/Reassign Coach/Remove/Reinstate onto the profile page —
  // matching Coaches' own profile page, which got the identical treatment first. View/Edit/Manage
  // Subscription are deliberately absent from this menu since they're already dedicated buttons
  // on this same page.
  test("the ⋮ menu offers Send Message, Reassign Coach, and Remove — not View/Edit/Manage Subscription", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchPlayer.mockResolvedValue(makePlayer({ id: "p1", name: "Alice Bowler" }));

    render(<PlayerProfileClient playerId="p1" />);
    await screen.findByText("Alice Bowler");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByText("Send Message")).toBeInTheDocument();
    expect(screen.getByText("Reassign Coach")).toBeInTheDocument();
    expect(screen.getByText("Remove Player")).toBeInTheDocument();
    expect(screen.queryByText("View")).not.toBeInTheDocument();
    // "Manage Subscription" still exists exactly once — as the dedicated button already on this
    // page, not repeated as a second, redundant menu item.
    expect(screen.getAllByText("Manage Subscription")).toHaveLength(1);
  });

  // Action Plans/S&C Log moved out of the visible row into the ⋮ menu, to keep that row to one
  // line — Edit/View All Reports/Manage Subscription/+New Session stay direct buttons.
  test("Action Plans and S&C Log live in the ⋮ menu, not as separate buttons in the row", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchPlayer.mockResolvedValue(makePlayer({ id: "p1", name: "Alice Bowler" }));

    render(<PlayerProfileClient playerId="p1" />);
    await screen.findByText("Alice Bowler");

    expect(screen.queryByRole("link", { name: "Action Plans" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "S&C Log" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByText("Action Plans"));
    expect(push).toHaveBeenCalledWith("/players/p1/action-plans");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByText("S&C Log"));
    expect(push).toHaveBeenCalledWith("/players/p1/sc-log");
  });

  test("a coach viewing their own player doesn't get Reassign Coach — nobody else to pick", async () => {
    const user = userEvent.setup();
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "coach", coachId: "c1" }) });
    fetchPlayer.mockResolvedValue(makePlayer({ id: "p1", name: "Alice Bowler", coachId: "c1" }));

    render(<PlayerProfileClient playerId="p1" />);
    await screen.findByText("Alice Bowler");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByText("Send Message")).toBeInTheDocument();
    expect(screen.queryByText("Reassign Coach")).not.toBeInTheDocument();
  });

  test("Send Message opens the message modal", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchPlayer.mockResolvedValue(makePlayer({ id: "p1", name: "Alice Bowler", email: "alice@example.com" }));

    render(<PlayerProfileClient playerId="p1" />);
    await screen.findByText("Alice Bowler");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByText("Send Message"));

    expect(await screen.findByText("Message Alice Bowler")).toBeInTheDocument();
  });

  test("reassigning from the profile page moves the player to the picked coach", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchPlayer.mockResolvedValue(makePlayer({ id: "p1", name: "Alice Bowler", coachId: "c1" }));
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", name: "Coach Dan" }), makeCoach({ id: "c2", name: "Coach Sam" })]);

    render(<PlayerProfileClient playerId="p1" />);
    await screen.findByText("Alice Bowler");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByText("Reassign Coach"));
    expect(await screen.findByText("Reassign Coach?")).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "New coach" }), "Coach Sam");
    await user.click(screen.getByRole("button", { name: "Reassign" }));

    expect(updatePlayer).toHaveBeenCalledWith("p1", { coach_id: "c2" });
  });

  test("removing from the profile page soft-deletes the player, shown in place with a Removed badge", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchPlayer.mockResolvedValue(makePlayer({ id: "p1", name: "Alice Bowler" }));

    render(<PlayerProfileClient playerId="p1" />);
    await screen.findByText("Alice Bowler");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByText("Remove Player"));
    expect(await screen.findByText("Remove Player?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Yes, Remove" }));

    expect(updatePlayer).toHaveBeenCalledWith("p1", expect.objectContaining({ login_disabled: true }));
    expect(await screen.findByText("Removed")).toBeInTheDocument();
  });

  test("a removed player's ⋮ menu offers only Reinstate, which restores them in place", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchPlayer.mockResolvedValue(makePlayer({
      id: "p1", name: "Alice Bowler", loginDisabled: true, disabledReason: "Left the club",
    }));

    render(<PlayerProfileClient playerId="p1" />);
    await screen.findByText("Alice Bowler");
    expect(screen.getByText("Removed")).toBeInTheDocument();
    expect(screen.getByText(/Left the club/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByText("Reinstate Player")).toBeInTheDocument();
    expect(screen.queryByText("Remove Player")).not.toBeInTheDocument();
    expect(screen.queryByText("Send Message")).not.toBeInTheDocument();

    await user.click(screen.getByText("Reinstate Player"));
    await user.click(screen.getByRole("button", { name: "Yes, Reinstate" }));

    expect(updatePlayer).toHaveBeenCalledWith("p1", expect.objectContaining({ login_disabled: false }));
    expect(await screen.findByRole("link", { name: "Edit Player" })).toBeInTheDocument();
    expect(screen.queryByText("Removed")).not.toBeInTheDocument();
  });

  test("a coach who can't add players doesn't get Remove Player", async () => {
    const user = userEvent.setup();
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "coach", coachId: "c1" }) });
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", academyId: "ac1" })]); // academy-employed, not independent
    fetchPlayer.mockResolvedValue(makePlayer({ id: "p1", name: "Alice Bowler", coachId: "c1" }));

    render(<PlayerProfileClient playerId="p1" />);
    await screen.findByText("Alice Bowler");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.queryByText("Remove Player")).not.toBeInTheDocument();
  });
});
