import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionPacksClient } from "@/components/SessionPacksClient";
import { makeAuthUser, makePlayer, makeSessionPack } from "../mocks/fixtures";

const { fetchSessionPacks, fetchPlayers, fetchAcademies, fetchCoaches, fetchBookings, fetchActivePlans, fetchPackFeeDues, fetchPackActivity } = vi.hoisted(() => ({
  fetchSessionPacks: vi.fn(), fetchPlayers: vi.fn(), fetchAcademies: vi.fn(),
  fetchCoaches: vi.fn(), fetchBookings: vi.fn(), fetchActivePlans: vi.fn(), fetchPackFeeDues: vi.fn(), fetchPackActivity: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  fetchSessionPacks, fetchPlayers, fetchAcademies, fetchCoaches, fetchBookings, fetchActivePlans, fetchPackFeeDues, fetchPackActivity,
  upsertSessionPack: vi.fn(), updatePackPaymentStatus: vi.fn(), updatePackAgreedDays: vi.fn(), markPackPaid: vi.fn(),
  insertSessionPacks: vi.fn(),
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
}

describe("SessionPacksClient", () => {
  test("shows a player with no purchased pack", async () => {
    setupDefaults();
    render(<SessionPacksClient />);

    expect(await screen.findByRole("heading", { name: "Session Packs" })).toBeInTheDocument();
    expect(await screen.findByText("Alice Bowler")).toBeInTheDocument();
    expect(screen.getByText("No pack purchased")).toBeInTheDocument();
  });

  test("shows pack details for a player with an active pack", async () => {
    setupDefaults();
    fetchSessionPacks.mockResolvedValue([makeSessionPack({ playerId: "p1", totalSessions: 10, sessionsUsed: 3 })]);

    render(<SessionPacksClient />);

    expect(await screen.findByText("Alice Bowler")).toBeInTheDocument();
    expect(screen.queryByText("No pack purchased")).not.toBeInTheDocument();
  });

  // The "why did my balance drop" answer — every credit this pack has spent, and which of the
  // three mechanisms (manual mark, CSV import, unattended cron) spent it.
  test("shows Pack Activity with each entry's recorded-by attribution", async () => {
    setupDefaults();
    fetchSessionPacks.mockResolvedValue([makeSessionPack({ id: "pack1", playerId: "p1", totalSessions: 10, sessionsUsed: 3 })]);
    fetchPackActivity.mockResolvedValue([
      { id: "att1", packId: "pack1", playerId: "p1", groupSessionId: "gs1", date: "2026-01-13", status: "Present", recordedBy: "manual" },
      { id: "att2", packId: "pack1", playerId: "p1", groupSessionId: "gs1", date: "2026-01-06", status: "Absent", recordedBy: "auto-cron" },
      { id: "att3", packId: "pack1", playerId: "p1", groupSessionId: "gs1", date: "2025-12-30", status: "Present", recordedBy: null },
    ]);

    render(<SessionPacksClient />);

    expect(await screen.findByText("Pack Activity")).toBeInTheDocument();
    expect(screen.getByText("Marked by coach")).toBeInTheDocument();
    expect(screen.getByText("Auto (no-show)")).toBeInTheDocument();
    expect(screen.getByText("Unattributed")).toBeInTheDocument();
  });

  test("shows an empty state when a pack has no activity recorded yet", async () => {
    setupDefaults();
    fetchSessionPacks.mockResolvedValue([makeSessionPack({ id: "pack1", playerId: "p1", totalSessions: 10, sessionsUsed: 0 })]);
    fetchPackActivity.mockResolvedValue([]);

    render(<SessionPacksClient />);

    expect(await screen.findByText("Pack Activity")).toBeInTheDocument();
    expect(screen.getByText("No sessions drawn from this pack yet.")).toBeInTheDocument();
  });

  test("scopes the fetch to the academy_admin's own academy", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "academy-9" }) });

    render(<SessionPacksClient />);
    await screen.findByRole("heading", { name: "Session Packs" });

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

  test("?playerId= (from Attendance's no-pack dead-end) auto-opens the New Pack form prefilled for that player", async () => {
    setupDefaults();
    searchParamsGet.mockImplementation((key: string) => (key === "playerId" ? "p1" : null));
    fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);

    render(<SessionPacksClient />);

    expect(await screen.findByRole("heading", { name: "New Session Pack" })).toBeInTheDocument();
    expect((screen.getAllByRole("combobox")[0] as HTMLSelectElement).value).toBe("p1");
    // strips the query param so a refresh / back doesn't re-trigger
    expect(routerReplace).toHaveBeenCalledWith("/session-packs");
  });

  test("ignores ?playerId= for a coach (they can't create packs)", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "coach", coachId: "c1" }) });
    searchParamsGet.mockImplementation((key: string) => (key === "playerId" ? "p1" : null));
    fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);

    render(<SessionPacksClient />);
    await screen.findByText("Alice Bowler");

    expect(screen.queryByRole("heading", { name: "New Session Pack" })).not.toBeInTheDocument();
  });

  test("clicking the Active packs stat card filters the list to players with an active pack", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchPlayers.mockResolvedValue([
      makePlayer({ id: "p1", name: "Alice Bowler" }),
      makePlayer({ id: "p2", name: "Bob Seamer" }),
    ]);
    fetchSessionPacks.mockResolvedValue([makeSessionPack({ playerId: "p1", totalSessions: 10, sessionsUsed: 3 })]);

    render(<SessionPacksClient />);
    await screen.findByText("Alice Bowler");

    await user.click(screen.getByRole("button", { name: /^Active packs 1$/ }));

    expect(screen.getByText("Alice Bowler")).toBeInTheDocument();
    expect(screen.queryByText("Bob Seamer")).not.toBeInTheDocument();
  });
});
