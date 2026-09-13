import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionPacksClient } from "@/components/SessionPacksClient";
import { makeAuthUser, makePlayer, makeSessionPack, makeGroupSession, makeAcademy } from "../mocks/fixtures";

const {
  fetchSessionPacks, fetchPlayers, fetchAcademies, fetchCoaches, fetchActivePlans, fetchPackFeeDues,
  fetchGroupSessions, setGroupSessionRoster, upsertSessionPack, updatePackAgreedDays, insertSessionPacks,
} = vi.hoisted(() => ({
  fetchSessionPacks: vi.fn(), fetchPlayers: vi.fn(), fetchAcademies: vi.fn(),
  fetchCoaches: vi.fn(), fetchActivePlans: vi.fn(), fetchPackFeeDues: vi.fn(),
  fetchGroupSessions: vi.fn(), setGroupSessionRoster: vi.fn(),
  upsertSessionPack: vi.fn(), updatePackAgreedDays: vi.fn(), insertSessionPacks: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  fetchSessionPacks, fetchPlayers, fetchAcademies, fetchCoaches, fetchActivePlans, fetchPackFeeDues,
  fetchGroupSessions, setGroupSessionRoster, upsertSessionPack, updatePackAgreedDays, insertSessionPacks,
  updatePackPaymentStatus: vi.fn(), markPackPaid: vi.fn(),
}));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

const { routerPush, routerReplace, searchParamsGet } = vi.hoisted(() => ({
  routerPush: vi.fn(),
  routerReplace: vi.fn(),
  searchParamsGet: vi.fn((_key: string) => null as string | null),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
  useSearchParams: () => ({ get: searchParamsGet }),
}));

function setupDefaults() {
  routerPush.mockClear();
  routerReplace.mockClear();
  searchParamsGet.mockReturnValue(null);
  useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
  fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);
  fetchAcademies.mockResolvedValue([]);
  fetchCoaches.mockResolvedValue([]);
  fetchActivePlans.mockResolvedValue([]);
  fetchSessionPacks.mockResolvedValue([]);
  fetchPackFeeDues.mockResolvedValue([]);
  fetchGroupSessions.mockResolvedValue([]);
  setGroupSessionRoster.mockClear().mockResolvedValue(undefined);
  upsertSessionPack.mockClear();
  updatePackAgreedDays.mockClear();
  insertSessionPacks.mockClear().mockResolvedValue(undefined);
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }) as unknown as typeof fetch;
}

describe("SessionPacksClient", () => {
  test("shows a player with no purchased membership", async () => {
    setupDefaults();
    render(<SessionPacksClient />);

    expect(await screen.findByRole("heading", { name: "Memberships" })).toBeInTheDocument();
    expect(await screen.findByText("Alice Bowler")).toBeInTheDocument();
    expect(screen.getByText("No Membership")).toBeInTheDocument();
  });

  test("shows membership details for a player with an active membership", async () => {
    setupDefaults();
    fetchSessionPacks.mockResolvedValue([makeSessionPack({ playerId: "p1", totalSessions: 10, sessionsUsed: 3 })]);

    render(<SessionPacksClient />);

    expect(await screen.findByText("Alice Bowler")).toBeInTheDocument();
    expect(screen.queryByText("No Membership")).not.toBeInTheDocument();
  });

  test("scopes the fetch to the academy_admin's own academy", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "academy-9" }) });

    render(<SessionPacksClient />);
    await screen.findByRole("heading", { name: "Memberships" });

    expect(fetchPlayers).toHaveBeenCalledWith(undefined, "academy-9");
  });

  test("searches by player name", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchPlayers.mockResolvedValue([
      makePlayer({ id: "p1", name: "Alice Bowler" }),
      makePlayer({ id: "p2", name: "Bob Seamer" }),
    ]);
    fetchSessionPacks.mockResolvedValue([makeSessionPack({ playerId: "p1", totalSessions: 10, sessionsUsed: 3 })]);

    render(<SessionPacksClient />);
    await screen.findByText("Alice Bowler");

    await user.type(screen.getByPlaceholderText("Search by player name…"), "Bob");
    expect(await screen.findByText("Bob Seamer")).toBeInTheDocument();
    expect(screen.queryByText("Alice Bowler")).not.toBeInTheDocument();
  });

  test("?playerId= (from Attendance's no-membership dead-end) auto-opens the New Membership form prefilled for that player", async () => {
    setupDefaults();
    searchParamsGet.mockImplementation((key: string) => (key === "playerId" ? "p1" : null));
    fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);

    render(<SessionPacksClient />);

    expect(await screen.findByRole("heading", { name: "New Membership" })).toBeInTheDocument();
    expect((screen.getAllByRole("combobox")[0] as HTMLSelectElement).value).toBe("p1");
    // strips the query param so a refresh / back doesn't re-trigger
    expect(routerReplace).toHaveBeenCalledWith("/session-packs");
  });

  test("ignores ?playerId= for a coach (they can't create memberships)", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "coach", coachId: "c1" }) });
    searchParamsGet.mockImplementation((key: string) => (key === "playerId" ? "p1" : null));
    fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);

    render(<SessionPacksClient />);
    await screen.findByText("Alice Bowler");

    expect(screen.queryByRole("heading", { name: "New Membership" })).not.toBeInTheDocument();
  });

  test("clicking the Active memberships stat card filters the list to players with an active membership", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchPlayers.mockResolvedValue([
      makePlayer({ id: "p1", name: "Alice Bowler" }),
      makePlayer({ id: "p2", name: "Bob Seamer" }),
    ]);
    fetchSessionPacks.mockResolvedValue([makeSessionPack({ playerId: "p1", totalSessions: 10, sessionsUsed: 3 })]);

    render(<SessionPacksClient />);
    await screen.findByText("Alice Bowler");

    await user.click(screen.getByRole("button", { name: /^Active memberships 1$/ }));

    expect(screen.getByText("Alice Bowler")).toBeInTheDocument();
    expect(screen.queryByText("Bob Seamer")).not.toBeInTheDocument();
  });

  // A Membership must bind to a real, pre-created squad training session (not a freeform
  // weekday pick) — see groupSessionsForAcademy's own doc comment for why.
  test("New Membership form lists the academy's real squad training sessions, requires picking one, and syncs the player onto its roster on save", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "academy-1", name: "Fast Bowlers Academy" })]);
    fetchGroupSessions.mockResolvedValue([
      makeGroupSession({ id: "gs1", academyId: "academy-1", name: "U14 Tuesday Nets", dayOfWeek: 2, time: "16:00", playerIds: [] }),
    ]);
    fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);

    render(<SessionPacksClient />);
    await screen.findByText("Alice Bowler");
    await user.click(screen.getAllByRole("button", { name: "+ New Membership" })[0]);

    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0], "p1");
    await user.selectOptions(selects[1], "academy-1");

    expect(await screen.findByText("U14 Tuesday Nets")).toBeInTheDocument();
    expect(screen.getByText(/Tue · 16:00/)).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("0.00"), "20");
    await user.click(screen.getByRole("button", { name: "Create Membership" }));
    expect(screen.getByText("Please select at least one squad training session.")).toBeInTheDocument();

    await user.click(screen.getByText("U14 Tuesday Nets"));
    await user.click(screen.getByRole("button", { name: "Create Membership" }));

    await waitFor(() => expect(setGroupSessionRoster).toHaveBeenCalledWith("gs1", ["p1"]));
    expect(upsertSessionPack).toHaveBeenCalledWith(expect.objectContaining({ agreed_days: ["Tue"] }));
    expect(global.fetch).toHaveBeenCalledWith("/api/packs/notify-created", expect.objectContaining({
      body: expect.stringContaining('"packId"'),
    }));
  });

  test("skips the payment-due notification for a fee-waived membership", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "academy-1", name: "Fast Bowlers Academy", planId: "plan-1" })]);
    fetchActivePlans.mockResolvedValue([{
      id: "plan-1", slug: "waived", name: "Waived Plan", audience: "academy", billingType: "subscription",
      billingInterval: "month", priceAud: 0, seatCap: null, accessDurationMonths: null, includedNotes: null,
      waivesSessionFees: true, platformAdminOnly: false, platformFeePercent: 10, active: true, sortOrder: 0,
      sessionsPerMonthLimit: null, selfLogSessionsPerMonthLimit: 4, chatMessagesPerDayLimit: null,
      aiReportsEnabled: true, marketplaceEnabled: true, locked: true,
    }]);
    fetchGroupSessions.mockResolvedValue([
      makeGroupSession({ id: "gs1", academyId: "academy-1", name: "U14 Tuesday Nets", dayOfWeek: 2, time: "16:00", playerIds: [] }),
    ]);
    fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);

    render(<SessionPacksClient />);
    await screen.findByText("Alice Bowler");
    await user.click(screen.getAllByRole("button", { name: "+ New Membership" })[0]);

    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0], "p1");
    await user.selectOptions(selects[1], "academy-1");
    await screen.findByText("U14 Tuesday Nets");
    await user.click(screen.getByText("U14 Tuesday Nets"));
    await user.click(screen.getByRole("button", { name: "Create Membership" }));

    await waitFor(() => expect(upsertSessionPack).toHaveBeenCalled());
    expect(global.fetch).not.toHaveBeenCalledWith("/api/packs/notify-created", expect.anything());
  });

  test("shows an empty state with a link to Attendance when the selected academy has no active squad training sessions", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "academy-1", name: "Fast Bowlers Academy" })]);
    fetchGroupSessions.mockResolvedValue([]);
    fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);

    render(<SessionPacksClient />);
    await screen.findByText("Alice Bowler");
    await user.click(screen.getAllByRole("button", { name: "+ New Membership" })[0]);

    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[1], "academy-1");

    expect(await screen.findByText(/no active squad training sessions yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Create one in Attendance/ })).toHaveAttribute("href", "/attendance");
  });

  // Existing-membership squad-training-session view/edit (read-only until Edit, roster diffing on
  // toggle) now lives entirely on MembershipProfileClient's own View page — see
  // tests/components/MembershipProfileClient.test.tsx for that coverage.

  test("a row's Actions menu links View/Edit to the membership's own pages", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchSessionPacks.mockResolvedValue([makeSessionPack({ id: "pack1", playerId: "p1", paymentStatus: "Paid" })]);

    render(<SessionPacksClient />);
    await screen.findByText("Alice Bowler");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("button", { name: "View" }));
    expect(routerPush).toHaveBeenCalledWith("/session-packs/pack1");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(routerPush).toHaveBeenCalledWith("/session-packs/pack1/edit");
  });

  test("Mark Paid (Cash) on a pending membership opens a confirm, then records payment", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchSessionPacks.mockResolvedValue([makeSessionPack({ id: "pack1", playerId: "p1", paymentStatus: "Pending" })]);

    render(<SessionPacksClient />);
    await screen.findByText("Alice Bowler");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("button", { name: "Mark Paid (Cash)" }));

    expect(await screen.findByText("Mark as Paid (Cash)?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mark Paid" }));

    await waitFor(() => expect(screen.queryByText("Mark as Paid (Cash)?")).not.toBeInTheDocument());
  });

  test("Renew Membership on an Exhausted pack prefills the New Membership form", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchGroupSessions.mockResolvedValue([
      makeGroupSession({ id: "gs1", academyId: "academy-1", name: "U14 Tuesday Nets", dayOfWeek: 2, time: "16:00", playerIds: ["p1"] }),
    ]);
    fetchSessionPacks.mockResolvedValue([makeSessionPack({
      id: "pack1", playerId: "p1", academyId: "academy-1", status: "Exhausted", feePerSession: 25, agreedDays: ["Tue"],
    })]);

    render(<SessionPacksClient />);
    await screen.findByText("Alice Bowler");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("button", { name: "Renew Membership" }));

    expect(await screen.findByRole("heading", { name: "New Membership" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("25")).toBeInTheDocument();
  });
});
