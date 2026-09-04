import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AcademyClient } from "@/components/AcademyClient";
import { makeAcademy, makeAuthUser } from "../mocks/fixtures";

const { fetchAcademies, fetchPlayers, fetchCoaches, fetchActivePlans, fetchNets, insertPlayer, upsertCoach, updateAcademyFields } = vi.hoisted(() => ({
  fetchAcademies: vi.fn(), fetchPlayers: vi.fn(), fetchCoaches: vi.fn(), fetchActivePlans: vi.fn(), fetchNets: vi.fn(),
  insertPlayer: vi.fn(), upsertCoach: vi.fn(), updateAcademyFields: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  fetchAcademies, fetchPlayers, fetchCoaches, fetchActivePlans, fetchNets,
  upsertAcademy: vi.fn(), upsertCoach, setCoachesAcademy: vi.fn(),
  insertPlayer, insertPlayers: vi.fn(), updateAcademyFields,
  upsertNet: vi.fn(), deleteNet: vi.fn(),
}));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

function setupDefaults() {
  fetchPlayers.mockResolvedValue([]);
  fetchCoaches.mockResolvedValue([]);
  fetchActivePlans.mockResolvedValue([]);
  fetchAcademies.mockResolvedValue([]);
  fetchNets.mockResolvedValue([]);
  insertPlayer.mockResolvedValue(undefined);
  upsertCoach.mockResolvedValue(undefined);
  updateAcademyFields.mockResolvedValue(undefined);
}

describe("AcademyClient", () => {
  test("shows an empty state with the create-first CTA for a platform admin", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });

    render(<AcademyClient />);

    expect(await screen.findByText("No academies found.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Create First Academy" })).toBeInTheDocument();
  });

  test("hides the New Academy action for an academy_admin (scoped to their own academy only)", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "ac1" }) });
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "ac1", name: "My Academy" })]);

    render(<AcademyClient />);

    expect(await screen.findByText("My Academy")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ New Academy" })).not.toBeInTheDocument();
  });

  test("scopes the players/coaches fetch to the academy_admin's own academy", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "ac1" }) });

    render(<AcademyClient />);
    await screen.findByRole("heading", { name: "Academies" });

    expect(fetchPlayers).toHaveBeenCalledWith(undefined, "ac1");
    expect(fetchCoaches).toHaveBeenCalledWith("ac1");
  });

  test("starts expanded by default for an academy_admin viewing their own single academy", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "ac1" }) });
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "ac1", name: "My Academy" })]);

    render(<AcademyClient />);
    await screen.findByText("My Academy");

    // The tab strip (Players/Coaches/Pricing/Nets) only renders once a row is expanded — an
    // academy_admin has nothing else to pick from, so there's no reason to make them click first.
    expect(screen.getByRole("button", { name: "Pricing" })).toBeInTheDocument();
  });

  test("stays collapsed by default for a platform admin, even with only one academy", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "ac1", name: "Only Academy" })]);

    render(<AcademyClient />);
    await screen.findByText("Only Academy");

    expect(screen.queryByRole("button", { name: "Pricing" })).not.toBeInTheDocument();
  });

  test("renders multiple academies for a platform admin", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchAcademies.mockResolvedValue([
      makeAcademy({ id: "ac1", name: "Academy One" }),
      makeAcademy({ id: "ac2", name: "Academy Two" }),
    ]);

    render(<AcademyClient />);

    expect(await screen.findByText("Academy One")).toBeInTheDocument();
    expect(screen.getByText("Academy Two")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ New Academy" })).toBeInTheDocument();
  });

  test("adds a player directly from the expanded Players tab, no Edit Academy round-trip", async () => {
    const user = userEvent.setup();
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "ac1" }) });
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "ac1", name: "My Academy", playerIds: [] })]);

    render(<AcademyClient />);
    // academy_admin starts expanded (see the auto-expand fix), but on the Pricing tab by
    // default (see the pricing-default-tab change) — switch to Players first.
    await user.click(await screen.findByRole("button", { name: "Players (0)" }));
    await user.click(screen.getByRole("button", { name: "+ Add Player" }));
    await user.type(screen.getByPlaceholderText("Player name"), "New Kid");
    await user.click(screen.getByRole("button", { name: "Create & Assign" }));

    await screen.findByText("New Kid");
    expect(insertPlayer).toHaveBeenCalledWith(expect.objectContaining({ name: "New Kid" }));
    expect(updateAcademyFields).toHaveBeenCalledWith("ac1", expect.objectContaining({
      player_ids: expect.arrayContaining([expect.stringMatching(/^p_/)]),
    }));
  });

  test("adding a player with an email from the Players tab fires a best-effort guardian-relink call", async () => {
    const user = userEvent.setup();
    setupDefaults();
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}"));
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "ac1" }) });
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "ac1", name: "My Academy", playerIds: [] })]);

    render(<AcademyClient />);
    await user.click(await screen.findByRole("button", { name: "Players (0)" }));
    await user.click(screen.getByRole("button", { name: "+ Add Player" }));
    await user.type(screen.getByPlaceholderText("Player name"), "Emailed Kid");
    await user.type(screen.getByPlaceholderText("player@email.com"), "kid@example.com");
    await user.click(screen.getByRole("button", { name: "Create & Assign" }));

    await screen.findByText("Emailed Kid");
    const relinkCall = fetchSpy.mock.calls.find(([url]) => url === "/api/players/relink-guardians");
    expect(relinkCall).toBeTruthy();
    expect(JSON.parse(relinkCall![1]!.body as string)).toEqual({ playerIds: [expect.stringMatching(/^p_/)] });

    fetchSpy.mockRestore();
  });

  test("rejects a garbage email on the Coaches tab's inline Add Player, instead of silently saving an unreachable player", async () => {
    const user = userEvent.setup();
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "ac1" }) });
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "ac1", name: "My Academy", playerIds: [] })]);

    render(<AcademyClient />);
    // Mocks in this file accumulate call history across tests (no clearMocks) — same convention
    // every other test here already relies on — so check this interaction didn't add a call,
    // not that the mock has never been called at all.
    const callsBefore = insertPlayer.mock.calls.length;
    await user.click(await screen.findByRole("button", { name: "Players (0)" }));
    await user.click(screen.getByRole("button", { name: "+ Add Player" }));
    await user.type(screen.getByPlaceholderText("Player name"), "Twisha");
    await user.type(screen.getByPlaceholderText("player@email.com"), "Pannu");
    await user.click(screen.getByRole("button", { name: "Create & Assign" }));

    expect(await screen.findByText("Enter a valid email address, or leave it blank.")).toBeInTheDocument();
    expect(insertPlayer.mock.calls.length).toBe(callsBefore);
  });

  test("adds a coach directly from the expanded Coaches tab and assigns them as head coach", async () => {
    const user = userEvent.setup();
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "ac1" }) });
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "ac1", name: "My Academy", coachIds: [], headCoachId: "" })]);

    render(<AcademyClient />);
    await screen.findByRole("button", { name: "Pricing" }); // confirms already expanded
    await user.click(screen.getByRole("button", { name: "Coaches (0)" }));
    await user.click(screen.getByRole("button", { name: "+ Add Coach" }));
    await user.type(screen.getByPlaceholderText("Coach full name"), "Priya Sharma");
    await user.click(screen.getByRole("button", { name: "Create & Assign" }));

    // The new head coach's name legitimately renders twice once assigned — the Coaches tab's own
    // list card, plus a small head-coach indicator elsewhere in the row — so this scenario
    // deliberately uses findAllByText rather than the strict single-match findByText.
    expect(await screen.findAllByText("Priya Sharma")).not.toHaveLength(0);
    expect(upsertCoach).toHaveBeenCalledWith(expect.objectContaining({ name: "Priya Sharma" }));
    expect(updateAcademyFields).toHaveBeenCalledWith("ac1", expect.objectContaining({
      coach_ids: expect.arrayContaining([expect.stringMatching(/^c_/)]),
      head_coach_id: expect.stringMatching(/^c_/),
    }));
  });

  test("adds the signed-in admin as head coach with one click from the empty Coaches tab", async () => {
    const user = userEvent.setup();
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "ac1", name: "Alex Morgan", email: "alex@bellavista.cricket" }) });
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "ac1", name: "My Academy", coachIds: [], headCoachId: "" })]);

    render(<AcademyClient />);
    await screen.findByRole("button", { name: "Pricing" }); // confirms already expanded
    await user.click(screen.getByRole("button", { name: "Coaches (0)" }));
    // No form to fill in — the shortcut uses the signed-in admin's own identity directly.
    await user.click(screen.getByRole("button", { name: /Add Yourself as Head Coach/ }));

    expect(await screen.findAllByText("Alex Morgan")).not.toHaveLength(0);
    expect(upsertCoach).toHaveBeenCalledWith(expect.objectContaining({ name: "Alex Morgan", email: "alex@bellavista.cricket" }));
    expect(updateAcademyFields).toHaveBeenCalledWith("ac1", expect.objectContaining({
      coach_ids: expect.arrayContaining([expect.stringMatching(/^c_/)]),
      head_coach_id: expect.stringMatching(/^c_/),
    }));
  });

  test("still offers Create New Coach alongside Add Yourself, for hiring someone else", async () => {
    const user = userEvent.setup();
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "ac1", name: "Alex Morgan", email: "alex@bellavista.cricket" }) });
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "ac1", name: "My Academy", coachIds: [], headCoachId: "" })]);

    render(<AcademyClient />);
    await screen.findByRole("button", { name: "Pricing" });
    await user.click(screen.getByRole("button", { name: "Coaches (0)" }));
    await user.click(screen.getByRole("button", { name: /Create New Coach/ }));
    await user.type(screen.getByPlaceholderText("Coach full name"), "Priya Sharma");
    await user.click(screen.getByRole("button", { name: "Create & Assign" }));

    expect(await screen.findAllByText("Priya Sharma")).not.toHaveLength(0);
    // Assert on the call this interaction actually produced, not "was ever called with" — mocks
    // in this file accumulate call history across tests (no clearMocks), same convention every
    // other test here already relies on.
    expect(upsertCoach).toHaveBeenLastCalledWith(expect.objectContaining({ name: "Priya Sharma", email: "" }));
  });

  test("adds the signed-in admin as head coach from the New Academy modal's Owner field", async () => {
    const user = userEvent.setup();
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin", name: "Jordan Blake", email: "jordan@crichq.com.au" }) });

    render(<AcademyClient />);
    await user.click(await screen.findByRole("button", { name: "+ New Academy" }));
    await user.type(screen.getByPlaceholderText("e.g. Brisbane Fast Bowling Foundation"), "Brand New Academy");
    await user.click(screen.getByRole("button", { name: /Add Yourself as Head Coach/ }));

    // The Owner picker only renders coach options once one exists — its appearance here is
    // itself proof the shortcut created a coach and staged it as the draft's headCoachId.
    await screen.findByText("★ Owner");
    expect(upsertCoach).toHaveBeenCalledWith(expect.objectContaining({ name: "Jordan Blake", email: "jordan@crichq.com.au" }));
  });
});
