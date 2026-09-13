import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionPacksClient } from "@/components/SessionPacksClient";
import { makeAuthUser, makePlayer, makeSessionPack, makeGroupSession, makeAcademy } from "../mocks/fixtures";

const {
  fetchSessionPacks, fetchPlayers, fetchAcademies, fetchCoaches, fetchBookings, fetchActivePlans, fetchPackFeeDues, fetchPackActivity,
  fetchGroupSessions, setGroupSessionRoster, upsertSessionPack, updatePackAgreedDays, insertSessionPacks,
} = vi.hoisted(() => ({
  fetchSessionPacks: vi.fn(), fetchPlayers: vi.fn(), fetchAcademies: vi.fn(),
  fetchCoaches: vi.fn(), fetchBookings: vi.fn(), fetchActivePlans: vi.fn(), fetchPackFeeDues: vi.fn(), fetchPackActivity: vi.fn(),
  fetchGroupSessions: vi.fn(), setGroupSessionRoster: vi.fn(),
  upsertSessionPack: vi.fn(), updatePackAgreedDays: vi.fn(), insertSessionPacks: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  fetchSessionPacks, fetchPlayers, fetchAcademies, fetchCoaches, fetchBookings, fetchActivePlans, fetchPackFeeDues, fetchPackActivity,
  fetchGroupSessions, setGroupSessionRoster, upsertSessionPack, updatePackAgreedDays, insertSessionPacks,
  updatePackPaymentStatus: vi.fn(), markPackPaid: vi.fn(),
}));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

const { routerReplace, searchParamsGet } = vi.hoisted(() => ({
  routerReplace: vi.fn(),
  searchParamsGet: vi.fn((_key: string) => null as string | null),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: routerReplace }),
  useSearchParams: () => ({ get: searchParamsGet }),
}));

function setupDefaults() {
  routerReplace.mockClear();
  searchParamsGet.mockReturnValue(null);
  useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
  fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);
  fetchAcademies.mockResolvedValue([]);
  fetchCoaches.mockResolvedValue([]);
  fetchBookings.mockResolvedValue([]);
  fetchActivePlans.mockResolvedValue([]);
  fetchSessionPacks.mockResolvedValue([]);
  fetchPackFeeDues.mockResolvedValue([]);
  fetchPackActivity.mockResolvedValue([]);
  fetchGroupSessions.mockResolvedValue([]);
  setGroupSessionRoster.mockClear().mockResolvedValue(undefined);
  upsertSessionPack.mockClear();
  updatePackAgreedDays.mockClear();
  insertSessionPacks.mockClear().mockResolvedValue(undefined);
}

describe("SessionPacksClient", () => {
  test("shows a player with no purchased membership", async () => {
    setupDefaults();
    render(<SessionPacksClient />);

    expect(await screen.findByRole("heading", { name: "Memberships" })).toBeInTheDocument();
    expect(await screen.findByText("Alice Bowler")).toBeInTheDocument();
    expect(screen.getByText("No membership purchased")).toBeInTheDocument();
  });

  test("shows membership details for a player with an active membership", async () => {
    setupDefaults();
    fetchSessionPacks.mockResolvedValue([makeSessionPack({ playerId: "p1", totalSessions: 10, sessionsUsed: 3 })]);

    render(<SessionPacksClient />);

    expect(await screen.findByText("Alice Bowler")).toBeInTheDocument();
    expect(screen.queryByText("No membership purchased")).not.toBeInTheDocument();
  });

  // The "why did my balance drop" answer — every credit this pack has spent, and which of the
  // three mechanisms (manual mark, CSV import, unattended cron) spent it.
  test("shows Membership Activity with each entry's recorded-by attribution", async () => {
    setupDefaults();
    fetchSessionPacks.mockResolvedValue([makeSessionPack({ id: "pack1", playerId: "p1", totalSessions: 10, sessionsUsed: 3 })]);
    fetchPackActivity.mockResolvedValue([
      { id: "att1", packId: "pack1", playerId: "p1", groupSessionId: "gs1", date: "2026-01-13", status: "Present", recordedBy: "manual" },
      { id: "att2", packId: "pack1", playerId: "p1", groupSessionId: "gs1", date: "2026-01-06", status: "Absent", recordedBy: "auto-cron" },
      { id: "att3", packId: "pack1", playerId: "p1", groupSessionId: "gs1", date: "2025-12-30", status: "Present", recordedBy: null },
    ]);

    render(<SessionPacksClient />);

    expect(await screen.findByText("Membership Activity")).toBeInTheDocument();
    expect(screen.getByText("Marked by coach")).toBeInTheDocument();
    expect(screen.getByText("Auto (no-show)")).toBeInTheDocument();
    expect(screen.getByText("Unattributed")).toBeInTheDocument();
  });

  test("shows an empty state when a membership has no activity recorded yet", async () => {
    setupDefaults();
    fetchSessionPacks.mockResolvedValue([makeSessionPack({ id: "pack1", playerId: "p1", totalSessions: 10, sessionsUsed: 0 })]);
    fetchPackActivity.mockResolvedValue([]);

    render(<SessionPacksClient />);

    expect(await screen.findByText("Membership Activity")).toBeInTheDocument();
    expect(screen.getByText("No sessions drawn from this membership yet.")).toBeInTheDocument();
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

  test("toggling a squad training session on an existing membership syncs the roster and recomputes agreedDays", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "academy-1", name: "Fast Bowlers Academy" })]);
    fetchGroupSessions.mockResolvedValue([
      makeGroupSession({ id: "gs1", academyId: "academy-1", name: "U14 Tuesday Nets", dayOfWeek: 2, time: "16:00", playerIds: [] }),
    ]);
    fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);
    fetchSessionPacks.mockResolvedValue([makeSessionPack({ id: "pack1", playerId: "p1", academyId: "academy-1", agreedDays: [] })]);

    render(<SessionPacksClient />);
    await screen.findByText("Alice Bowler");

    await user.click(screen.getByText("U14 Tuesday Nets"));

    await waitFor(() => expect(setGroupSessionRoster).toHaveBeenCalledWith("gs1", ["p1"]));
    expect(updatePackAgreedDays).toHaveBeenCalledWith("pack1", ["Tue"]);
  });
});
