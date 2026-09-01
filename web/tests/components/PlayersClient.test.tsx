import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlayersClient } from "@/components/PlayersClient";
import { makeAcademy, makeAuthUser, makeCoach, makePlayer } from "../mocks/fixtures";

const { fetchPlayers, fetchAcademies, fetchCoaches, fetchActivePlans } = vi.hoisted(() => ({
  fetchPlayers: vi.fn(),
  fetchAcademies: vi.fn(),
  fetchCoaches: vi.fn(),
  // Not exercised by any assertion in this file — default it once here rather than in every
  // test, unlike the others above which each test configures with scenario-specific data.
  fetchActivePlans: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/db", () => ({ fetchPlayers, fetchAcademies, fetchCoaches, fetchActivePlans, insertPlayer: vi.fn() }));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

// Real MessageModal/BulkMessageModal pull in their own data-fetching/sending concerns —
// stub them so this test stays about PlayersClient's own list/selection logic.
vi.mock("@/components/MessageModal", () => ({
  MessageModal: ({ playerName, onClose }: { playerName: string; onClose: () => void }) => (
    <div data-testid="message-modal">
      Messaging {playerName}
      <button onClick={onClose}>close</button>
    </div>
  ),
}));
vi.mock("@/components/BulkMessageModal", () => ({
  BulkMessageModal: ({ players }: { players: { id: string }[] }) => (
    <div data-testid="bulk-message-modal">Bulk messaging {players.length}</div>
  ),
}));

describe("PlayersClient", () => {
  test("renders fetched players and computed stats", async () => {
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchPlayers.mockResolvedValue([
      makePlayer({ id: "p1", name: "Alice Bowler", subscription: { plan: "Player Pro", startDate: "2026-01-01", endDate: "2027-01-01", sessionsUsed: 0, sessionsLimit: null }, sessionsCount: 5 }),
      makePlayer({ id: "p2", name: "Bob Bowler", sessionsCount: 3 }),
    ]);
    fetchAcademies.mockResolvedValue([]);
    fetchCoaches.mockResolvedValue([]);

    render(<PlayersClient />);

    expect(await screen.findByText("Alice Bowler")).toBeInTheDocument();
    expect(screen.getByText("Bob Bowler")).toBeInTheDocument();
    expect(screen.getByText("2 Players")).toBeInTheDocument();
    // Total Sessions stat = 5 + 3
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  test("scopes the fetch to the coach's own players when the caller is a coach", async () => {
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "coach", coachId: "coach-42" }) });
    fetchPlayers.mockResolvedValue([]);
    fetchAcademies.mockResolvedValue([]);
    fetchCoaches.mockResolvedValue([]);

    render(<PlayersClient />);

    await waitFor(() => expect(fetchPlayers).toHaveBeenCalledWith("coach-42", undefined));
  });

  test("scopes the fetch to the academy when the caller is an academy admin", async () => {
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "academy-7" }) });
    fetchPlayers.mockResolvedValue([]);
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "academy-7" })]);
    fetchCoaches.mockResolvedValue([]);

    render(<PlayersClient />);

    await waitFor(() => expect(fetchPlayers).toHaveBeenCalledWith(undefined, "academy-7"));
  });

  test("selecting players and opening the message modal for one player", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);
    fetchAcademies.mockResolvedValue([]);
    fetchCoaches.mockResolvedValue([]);

    render(<PlayersClient />);
    await screen.findByText("Alice Bowler");

    await user.click(screen.getByTitle("Send message"));
    expect(screen.getByTestId("message-modal")).toHaveTextContent("Messaging Alice Bowler");
  });

  test("shows an empty state with no players", async () => {
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchPlayers.mockResolvedValue([]);
    fetchAcademies.mockResolvedValue([]);
    fetchCoaches.mockResolvedValue([]);

    render(<PlayersClient />);
    expect(await screen.findByText("No players in your scope.")).toBeInTheDocument();
  });
});
