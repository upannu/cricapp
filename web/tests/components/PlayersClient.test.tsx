import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlayersClient } from "@/components/PlayersClient";
import { makeAcademy, makeAuthUser, makeCoach, makePlayer } from "../mocks/fixtures";

const { fetchPlayers, fetchAcademies, fetchCoaches, fetchActivePlans, insertPlayer, insertPlayers, updateAcademyFields } = vi.hoisted(() => ({
  fetchPlayers: vi.fn(),
  fetchAcademies: vi.fn(),
  fetchCoaches: vi.fn(),
  // Not exercised by any assertion in this file — default it once here rather than in every
  // test, unlike the others above which each test configures with scenario-specific data.
  fetchActivePlans: vi.fn().mockResolvedValue([]),
  insertPlayer: vi.fn().mockResolvedValue(undefined),
  insertPlayers: vi.fn().mockResolvedValue(undefined),
  updateAcademyFields: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/db", () => ({ fetchPlayers, fetchAcademies, fetchCoaches, fetchActivePlans, insertPlayer, insertPlayers, updateAcademyFields }));

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

  test("searches players by name, email, and club", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchPlayers.mockResolvedValue([
      makePlayer({ id: "p1", name: "Alice Bowler", email: "alice@example.com", club: "Riverside CC" }),
      makePlayer({ id: "p2", name: "Bob Seamer", email: "bob@example.com", club: "Hillside CC" }),
      makePlayer({ id: "p3", name: "Cara Spinner", email: "cara@riverside.example.com", club: "Oakwood CC" }),
    ]);
    fetchAcademies.mockResolvedValue([]);
    fetchCoaches.mockResolvedValue([]);

    render(<PlayersClient />);
    await screen.findByText("Alice Bowler");
    expect(screen.getByText("3 Players")).toBeInTheDocument();

    // Match by name.
    await user.type(screen.getByPlaceholderText(/Search players/), "bob");
    expect(await screen.findByText("1 Player")).toBeInTheDocument();
    expect(screen.getByText("Bob Seamer")).toBeInTheDocument();
    expect(screen.queryByText("Alice Bowler")).not.toBeInTheDocument();

    // Match by email domain — case-insensitive, and matches a player whose name doesn't contain it.
    await user.clear(screen.getByPlaceholderText(/Search players/));
    await user.type(screen.getByPlaceholderText(/Search players/), "RIVERSIDE");
    expect(await screen.findByText("2 Players")).toBeInTheDocument();
    expect(screen.getByText("Alice Bowler")).toBeInTheDocument();
    expect(screen.getByText("Cara Spinner")).toBeInTheDocument();

    // No matches shows a search-specific empty state, not the generic "no players at all" one.
    await user.clear(screen.getByPlaceholderText(/Search players/));
    await user.type(screen.getByPlaceholderText(/Search players/), "nobody-like-this");
    expect(await screen.findByText('No players match "nobody-like-this".')).toBeInTheDocument();
  });

  test("paginates the table at 10 players per page", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchPlayers.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => makePlayer({ id: `p${i + 1}`, name: `Player ${String(i + 1).padStart(2, "0")}` })),
    );
    fetchAcademies.mockResolvedValue([]);
    fetchCoaches.mockResolvedValue([]);

    render(<PlayersClient />);
    await screen.findByText("Player 01");

    // Header count reflects the full roster, not just the current page.
    expect(screen.getByText("12 Players")).toBeInTheDocument();

    // Page 1: first 10 only.
    expect(screen.getByText("Player 10")).toBeInTheDocument();
    expect(screen.queryByText("Player 11")).not.toBeInTheDocument();
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "← Prev" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next →" }));

    // Page 2: the remaining 2.
    expect(await screen.findByText("Player 11")).toBeInTheDocument();
    expect(screen.getByText("Player 12")).toBeInTheDocument();
    expect(screen.queryByText("Player 01")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next →" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "← Prev" }));
    expect(await screen.findByText("Player 01")).toBeInTheDocument();
  });

  test("searching while on page 2 snaps back to page 1 instead of stranding an empty page", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchPlayers.mockResolvedValue([
      ...Array.from({ length: 11 }, (_, i) => makePlayer({ id: `p${i + 1}`, name: `Player ${String(i + 1).padStart(2, "0")}` })),
      makePlayer({ id: "p12", name: "Zara Unique" }),
    ]);
    fetchAcademies.mockResolvedValue([]);
    fetchCoaches.mockResolvedValue([]);

    render(<PlayersClient />);
    await screen.findByText("Player 01");
    await user.click(screen.getByRole("button", { name: "Next →" }));
    expect(await screen.findByText("Zara Unique")).toBeInTheDocument();

    // Narrowing to a single match while on page 2 must not leave the view on a page 2 that no
    // longer exists for the filtered set.
    await user.type(screen.getByPlaceholderText(/Search players/), "Zara");
    expect(await screen.findByText("1 Player")).toBeInTheDocument();
    expect(screen.getByText("Zara Unique")).toBeInTheDocument();
    expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
  });

  test("shows no pagination controls at 10 players or fewer", async () => {
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchPlayers.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => makePlayer({ id: `p${i + 1}`, name: `Player ${String(i + 1).padStart(2, "0")}` })),
    );
    fetchAcademies.mockResolvedValue([]);
    fetchCoaches.mockResolvedValue([]);

    render(<PlayersClient />);
    await screen.findByText("Player 10");
    expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
  });

  test("an academy_admin can add a player directly from /players, onto their own academy", async () => {
    const user = userEvent.setup();
    insertPlayer.mockClear(); insertPlayers.mockClear(); updateAcademyFields.mockClear();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "ac1" }) });
    fetchPlayers.mockResolvedValue([]);
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "ac1", name: "My Academy", playerIds: [] })]);
    fetchCoaches.mockResolvedValue([]);

    render(<PlayersClient />);
    await screen.findByText("No players in your scope.");

    await user.click(screen.getByRole("button", { name: "+ Add Player" }));
    // No academy picker for academy_admin — their own academy is implicit.
    expect(screen.queryByText("Assign to Academy (optional)")).not.toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Player name"), "New Kid");
    await user.click(screen.getByRole("button", { name: "Add Player" }));

    await screen.findByText("New Kid");
    expect(insertPlayer).toHaveBeenCalledWith(expect.objectContaining({ name: "New Kid", coach_id: null }));
    expect(updateAcademyFields).toHaveBeenCalledWith("ac1", expect.objectContaining({
      player_ids: expect.arrayContaining([expect.stringMatching(/^p_/)]),
    }));
  });

  test("a platform_admin can add a player and optionally assign an academy", async () => {
    const user = userEvent.setup();
    insertPlayer.mockClear(); insertPlayers.mockClear(); updateAcademyFields.mockClear();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchPlayers.mockResolvedValue([]);
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "ac1", name: "Riverside Academy", playerIds: [] })]);
    fetchCoaches.mockResolvedValue([]);

    render(<PlayersClient />);
    await screen.findByText("No players in your scope.");

    await user.click(screen.getByRole("button", { name: "+ Add Player" }));
    await user.type(screen.getByPlaceholderText("Player name"), "Unassigned Kid");
    // Left as "— Unassigned —" (the default) — no academy update should happen.
    await user.click(screen.getByRole("button", { name: "Add Player" }));

    await screen.findByText("Unassigned Kid");
    expect(insertPlayer).toHaveBeenCalledWith(expect.objectContaining({ name: "Unassigned Kid" }));
    expect(updateAcademyFields).not.toHaveBeenCalled();

    // Now add a second player, this time picking the academy.
    await user.click(screen.getByRole("button", { name: "+ Add Player" }));
    await user.type(screen.getByPlaceholderText("Player name"), "Assigned Kid");
    await user.selectOptions(screen.getByDisplayValue("— Unassigned —"), "Riverside Academy");
    await user.click(screen.getByRole("button", { name: "Add Player" }));

    await screen.findByText("Assigned Kid");
    expect(updateAcademyFields).toHaveBeenCalledWith("ac1", expect.objectContaining({
      player_ids: expect.arrayContaining([expect.stringMatching(/^p_/)]),
    }));
  });

  test("adding a player with an email fires a best-effort guardian-relink call", async () => {
    const user = userEvent.setup();
    insertPlayer.mockClear();
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}"));
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchPlayers.mockResolvedValue([]);
    fetchAcademies.mockResolvedValue([]);
    fetchCoaches.mockResolvedValue([]);

    render(<PlayersClient />);
    await screen.findByText("No players in your scope.");

    await user.click(screen.getByRole("button", { name: "+ Add Player" }));
    await user.type(screen.getByPlaceholderText("Player name"), "Emailed Kid");
    await user.type(screen.getByPlaceholderText("player@email.com"), "kid@example.com");
    await user.click(screen.getByRole("button", { name: "Add Player" }));

    await screen.findByText("Emailed Kid");
    const relinkCall = fetchSpy.mock.calls.find(([url]) => url === "/api/players/relink-guardians");
    expect(relinkCall).toBeTruthy();
    expect(JSON.parse(relinkCall![1]!.body as string)).toEqual({ playerIds: [expect.stringMatching(/^p_/)] });

    fetchSpy.mockRestore();
  });

  test("rejects a garbage email on quick-add instead of silently saving an unreachable player", async () => {
    const user = userEvent.setup();
    insertPlayer.mockClear();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "ac1" }) });
    fetchPlayers.mockResolvedValue([]);
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "ac1", name: "My Academy", playerIds: [] })]);
    fetchCoaches.mockResolvedValue([]);

    render(<PlayersClient />);
    await screen.findByText("No players in your scope.");

    await user.click(screen.getByRole("button", { name: "+ Add Player" }));
    await user.type(screen.getByPlaceholderText("Player name"), "Twisha");
    // A name fragment with no "@" — exactly what got typed into the email field in practice.
    await user.type(screen.getByPlaceholderText("player@email.com"), "Pannu");
    await user.click(screen.getByRole("button", { name: "Add Player" }));

    expect(await screen.findByText("Enter a valid email address, or leave it blank.")).toBeInTheDocument();
    expect(insertPlayer).not.toHaveBeenCalled();
  });

  test("imports players from a CSV file", async () => {
    const user = userEvent.setup();
    insertPlayer.mockClear(); insertPlayers.mockClear(); updateAcademyFields.mockClear();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "ac1" }) });
    fetchPlayers.mockResolvedValue([]);
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "ac1", name: "My Academy", playerIds: [] })]);
    fetchCoaches.mockResolvedValue([]);

    render(<PlayersClient />);
    await screen.findByText("No players in your scope.");

    await user.click(screen.getByRole("button", { name: "+ Add Player" }));
    await user.click(screen.getByRole("button", { name: "Import CSV instead" }));

    const csv = "name,email,ageGroup,bowlingStyle,club,phone\nCsv Kid,csvkid@example.com,U14,Right Arm Fast,Test Club,0412345678\n";
    const file = new File([csv], "players.csv", { type: "text/csv" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    await screen.findByText("✓ Ready");
    await user.click(screen.getByRole("button", { name: "Import 1 Player" }));

    await screen.findByText(/Imported 1 player from players\.csv/);
    expect(insertPlayers).toHaveBeenCalledWith([expect.objectContaining({ name: "Csv Kid", email: "csvkid@example.com" })]);
    expect(updateAcademyFields).toHaveBeenCalledWith("ac1", expect.objectContaining({
      player_ids: expect.arrayContaining([expect.stringMatching(/^p_/)]),
    }));
  });

  test("CSV import skips a row whose email isn't shaped like an email, instead of saving it", async () => {
    const user = userEvent.setup();
    insertPlayer.mockClear(); insertPlayers.mockClear(); updateAcademyFields.mockClear();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "ac1" }) });
    fetchPlayers.mockResolvedValue([]);
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "ac1", name: "My Academy", playerIds: [] })]);
    fetchCoaches.mockResolvedValue([]);

    render(<PlayersClient />);
    await screen.findByText("No players in your scope.");

    await user.click(screen.getByRole("button", { name: "+ Add Player" }));
    await user.click(screen.getByRole("button", { name: "Import CSV instead" }));

    const csv = "name,email,ageGroup,bowlingStyle,club,phone\nTwisha,Pannu,U10,Right Arm Fast,,\n";
    const file = new File([csv], "players.csv", { type: "text/csv" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    const statusCell = await screen.findByText("✗ Skipped");
    expect(statusCell).toBeInTheDocument();
    expect(statusCell).toHaveAttribute("title", "Not a valid email address");
    expect(screen.getByRole("button", { name: "Import 0 Players" })).toBeDisabled();
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
