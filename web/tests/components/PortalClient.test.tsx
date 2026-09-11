import { afterAll, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PortalClient } from "@/components/PortalClient";
import { makeAuthUser, makeCoach, makeGroupSession, makePlayer, makeSessionPack } from "../mocks/fixtures";

const originalFetch = global.fetch;

const {
  fetchPlayer, fetchSessions, fetchReports, fetchTodaysTip, recordTipView, fetchSessionPacks,
  fetchActivePlans, fetchAcademies, fetchCoach, fetchBookings, fetchActionPlans,
} = vi.hoisted(() => ({
  fetchPlayer: vi.fn(), fetchSessions: vi.fn(), fetchReports: vi.fn(),
  fetchTodaysTip: vi.fn(), recordTipView: vi.fn(async () => ({ streak: 0 })), fetchSessionPacks: vi.fn(),
  fetchActivePlans: vi.fn(), fetchAcademies: vi.fn(), fetchCoach: vi.fn(),
  fetchBookings: vi.fn(), fetchActionPlans: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  fetchPlayer, fetchSessions, fetchReports, fetchTodaysTip, recordTipView, fetchSessionPacks,
  fetchActivePlans, fetchAcademies, fetchCoach, fetchBookings, fetchActionPlans,
}));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

// Has its own dedicated test file (InvoiceHistoryList.test.tsx) — stub it here so these tests
// stay about PortalClient's own layout/logic, and don't need to fake its independent fetch call.
vi.mock("@/components/InvoiceHistoryList", () => ({
  InvoiceHistoryList: ({ scope, id }: { scope: string; id: string }) => (
    <div data-testid="invoice-history">{scope}:{id}</div>
  ),
}));

function setupDefaults() {
  fetchSessions.mockResolvedValue([]);
  fetchReports.mockResolvedValue([]);
  fetchTodaysTip.mockResolvedValue(null);
  fetchSessionPacks.mockResolvedValue([]);
  fetchActivePlans.mockResolvedValue([]);
  fetchAcademies.mockResolvedValue([]);
  fetchCoach.mockResolvedValue(null);
  fetchBookings.mockResolvedValue([]);
  fetchActionPlans.mockResolvedValue([]);
  // /api/portal/squad-training — group_sessions has no player-facing RLS policy, so this is a
  // plain fetch() rather than a lib/db.ts call; default to "in no groups" unless a test overrides it.
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ groups: [] }) }) as unknown as typeof fetch;
}

describe("PortalClient", () => {
  afterAll(() => { global.fetch = originalFetch; });

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

  test("shows the assigned coach's contact details", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "player", playerId: "p1" }) });
    fetchPlayer.mockResolvedValue(makePlayer({ id: "p1", name: "Alice Bowler", coachId: "c1" }));
    fetchCoach.mockResolvedValue(makeCoach({ id: "c1", name: "Coach Dan", email: "dan@example.com", phone: "0412345678" }));

    render(<PortalClient />);

    expect(await screen.findByText("Coach Dan")).toBeInTheDocument();
    expect(screen.getByText("dan@example.com")).toBeInTheDocument();
    expect(screen.getByText("0412345678")).toBeInTheDocument();
  });

  test("shows 'No coach assigned yet' when the player has none", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "player", playerId: "p1" }) });
    fetchPlayer.mockResolvedValue(makePlayer({ id: "p1", name: "Alice Bowler", coachId: "" }));
    // Mocks in this file accumulate call history across tests (no clearMocks) — same convention
    // every other test in this codebase already relies on.
    const callsBefore = fetchCoach.mock.calls.length;

    render(<PortalClient />);

    expect(await screen.findByText("No coach assigned yet.")).toBeInTheDocument();
    expect(fetchCoach.mock.calls.length).toBe(callsBefore);
  });

  test("shows the nearest upcoming, non-cancelled booking as the next session", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "player", playerId: "p1" }) });
    fetchPlayer.mockResolvedValue(makePlayer({ id: "p1", name: "Alice Bowler" }));
    const addDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    fetchBookings.mockResolvedValue([
      { id: "b1", playerId: "p1", coachId: "c1", date: addDays(5), time: "16:00", durationMins: 60, type: "Net Session", status: "Confirmed", location: "", notes: "", feeAud: 0, paymentStatus: "Paid" },
      { id: "b2", playerId: "p1", coachId: "c1", date: addDays(1), time: "09:00", durationMins: 60, type: "Video Review", status: "Cancelled", location: "", notes: "", feeAud: 0, paymentStatus: "Paid" },
      { id: "b3", playerId: "p1", coachId: "c1", date: addDays(2), time: "10:00", durationMins: 60, type: "Individual Coaching", status: "Confirmed", location: "Riverside Nets", feeAud: 0, notes: "", paymentStatus: "Paid" },
    ]);

    render(<PortalClient />);

    // Nearest upcoming that isn't cancelled — b3 (Jan 3), not b1 (later) or b2 (cancelled).
    expect(await screen.findByText("Individual Coaching")).toBeInTheDocument();
    expect(screen.getByText("Riverside Nets")).toBeInTheDocument();
    expect(screen.queryByText("Video Review")).not.toBeInTheDocument();
  });

  test("shows 'No upcoming sessions' with no future bookings", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "player", playerId: "p1" }) });
    fetchPlayer.mockResolvedValue(makePlayer({ id: "p1", name: "Alice Bowler" }));

    render(<PortalClient />);
    expect(await screen.findByText("No upcoming sessions scheduled.")).toBeInTheDocument();
  });

  test("titles the booking card 'Next Booking', not 'Next Session'", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "player", playerId: "p1" }) });
    fetchPlayer.mockResolvedValue(makePlayer({ id: "p1", name: "Alice Bowler" }));

    render(<PortalClient />);

    expect(await screen.findByText("Next Booking")).toBeInTheDocument();
    expect(screen.queryByText("Next Session")).not.toBeInTheDocument();
  });

  // The player's prepaid squad-net standing, drawn down by the nightly pack-auto-consume job —
  // shown regardless of payment status, unlike the unpaid-pack nudge banner above it.
  test("shows an active membership's standing, even while its payment is still Overdue", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "player", playerId: "p1" }) });
    fetchPlayer.mockResolvedValue(makePlayer({ id: "p1", name: "Alice Bowler" }));
    fetchSessionPacks.mockResolvedValue([
      makeSessionPack({
        playerId: "p1", status: "Active", paymentStatus: "Overdue",
        sessionType: "Net Session", totalSessions: 10, sessionsUsed: 3, sessionCredits: 0,
        agreedDays: ["Tuesday", "Thursday"],
      }),
    ]);

    render(<PortalClient />);

    expect(await screen.findByText("My Membership")).toBeInTheDocument();
    expect(screen.getByText("7 / 10")).toBeInTheDocument();
    expect(screen.getByText("Tuesday, Thursday")).toBeInTheDocument();
  });

  test("omits the membership card entirely when there is no active membership", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "player", playerId: "p1" }) });
    fetchPlayer.mockResolvedValue(makePlayer({ id: "p1", name: "Alice Bowler" }));
    fetchSessionPacks.mockResolvedValue([makeSessionPack({ playerId: "p1", status: "Exhausted" })]);

    render(<PortalClient />);
    await screen.findByText("Alice Bowler");

    expect(screen.queryByText("My Membership")).not.toBeInTheDocument();
  });

  // group_sessions has no player-facing RLS policy, so this goes through /api/portal/squad-training
  // rather than a lib/db.ts call — the test's global.fetch mock stands in for that route.
  test("shows the next squad training date(s) for a group this player is rostered on", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "player", playerId: "p1" }) });
    fetchPlayer.mockResolvedValue(makePlayer({ id: "p1", name: "Alice Bowler" }));
    const group = makeGroupSession({ id: "gs1", name: "U14 Tuesday Nets", dayOfWeek: new Date().getDay(), time: "16:00", location: "Riverside Nets" });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ groups: [group] }) }) as unknown as typeof fetch;

    render(<PortalClient />);

    expect(await screen.findByText("Upcoming Squad Training")).toBeInTheDocument();
    // A player rostered on only one weekly group still sees up to 2 upcoming dates for it.
    const entries = await screen.findAllByText("U14 Tuesday Nets");
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Riverside Nets/).length).toBe(entries.length);
  });

  test("omits the squad training card entirely when the player is in no groups", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "player", playerId: "p1" }) });
    fetchPlayer.mockResolvedValue(makePlayer({ id: "p1", name: "Alice Bowler" }));

    render(<PortalClient />);
    await screen.findByText("Alice Bowler");

    expect(screen.queryByText("Upcoming Squad Training")).not.toBeInTheDocument();
  });

  test("locks the Reports section behind an upgrade prompt for a Free player with no reports", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "player", playerId: "p1" }) });
    fetchPlayer.mockResolvedValue(makePlayer({
      id: "p1", name: "Alice Bowler",
      subscription: { plan: "Free", startDate: "2026-01-01", endDate: "2027-01-01", sessionsUsed: 0, sessionsLimit: 1 },
    }));

    render(<PortalClient />);

    expect(await screen.findByText(/AI biomechanics reports require Player Pro/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upgrade to unlock" })).toHaveAttribute("href", "/players/p1/subscription");
  });

  test("shows a neutral empty state (not an upgrade prompt) once reports are actually included", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "player", playerId: "p1" }) });
    fetchPlayer.mockResolvedValue(makePlayer({
      id: "p1", name: "Alice Bowler",
      subscription: { plan: "Player Pro", startDate: "2026-01-01", endDate: "2027-01-01", sessionsUsed: 0, sessionsLimit: null },
    }));

    render(<PortalClient />);

    expect(await screen.findByText(/one will appear here after your next session/)).toBeInTheDocument();
    expect(screen.queryByText(/require Player Pro/)).not.toBeInTheDocument();
  });

  test("renders coach-assigned Action Plans when present, hides the section when there are none", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "player", playerId: "p1" }) });
    fetchPlayer.mockResolvedValue(makePlayer({ id: "p1", name: "Alice Bowler" }));
    fetchActionPlans.mockResolvedValue([
      { id: "ap1", playerId: "p1", title: "Fix front-arm collapse", priority: "High", status: "In Progress", dueDate: "2026-02-01", drills: ["Wall drill", "Mirror drill"], notes: "Focus on video review." },
    ]);

    render(<PortalClient />);

    expect(await screen.findByText("Fix front-arm collapse")).toBeInTheDocument();
    expect(screen.getByText("Wall drill")).toBeInTheDocument();
    expect(screen.queryByText("Action Plans")).toBeInTheDocument();
  });

  test("shows the tip streak in Academy Progress", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "player", playerId: "p1" }) });
    fetchPlayer.mockResolvedValue(makePlayer({ id: "p1", name: "Alice Bowler", tipStreakCount: 5, tipBestStreak: 12 }));

    render(<PortalClient />);

    expect(await screen.findByText("🔥 5 days (best 12)")).toBeInTheDocument();
  });

  test("renders invoice history scoped to the player", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "player", playerId: "p1" }) });
    fetchPlayer.mockResolvedValue(makePlayer({ id: "p1", name: "Alice Bowler" }));

    render(<PortalClient />);

    expect(await screen.findByTestId("invoice-history")).toHaveTextContent("player:p1");
  });
});
