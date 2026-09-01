import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SessionPacksClient } from "@/components/SessionPacksClient";
import { makeAuthUser, makePlayer, makeSessionPack } from "../mocks/fixtures";

const { fetchSessionPacks, fetchPlayers, fetchAcademies, fetchCoaches, fetchBookings, fetchActivePlans, fetchPackFeeDues } = vi.hoisted(() => ({
  fetchSessionPacks: vi.fn(), fetchPlayers: vi.fn(), fetchAcademies: vi.fn(),
  fetchCoaches: vi.fn(), fetchBookings: vi.fn(), fetchActivePlans: vi.fn(), fetchPackFeeDues: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  fetchSessionPacks, fetchPlayers, fetchAcademies, fetchCoaches, fetchBookings, fetchActivePlans, fetchPackFeeDues,
  upsertSessionPack: vi.fn(), updatePackPaymentStatus: vi.fn(), updatePackAgreedDays: vi.fn(), markPackPaid: vi.fn(),
  insertSessionPacks: vi.fn(),
}));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

function setupDefaults() {
  useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
  fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);
  fetchAcademies.mockResolvedValue([]);
  fetchCoaches.mockResolvedValue([]);
  fetchBookings.mockResolvedValue([]);
  fetchActivePlans.mockResolvedValue([]);
  fetchSessionPacks.mockResolvedValue([]);
  fetchPackFeeDues.mockResolvedValue([]);
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

  test("scopes the fetch to the academy_admin's own academy", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "academy-9" }) });

    render(<SessionPacksClient />);
    await screen.findByRole("heading", { name: "Session Packs" });

    expect(fetchPlayers).toHaveBeenCalledWith(undefined, "academy-9");
  });
});
