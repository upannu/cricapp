import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AcademyProfileClient } from "@/components/AcademyProfileClient";
import { makeAcademy, makeAuthUser } from "../mocks/fixtures";

const { fetchAcademy, fetchPlayers, fetchCoaches, fetchActivePlans, fetchNets, insertPlayer, upsertCoach, updateAcademyFields } = vi.hoisted(() => ({
  fetchAcademy: vi.fn(), fetchPlayers: vi.fn(), fetchCoaches: vi.fn(), fetchActivePlans: vi.fn(), fetchNets: vi.fn(),
  insertPlayer: vi.fn(), upsertCoach: vi.fn(), updateAcademyFields: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  fetchAcademy, fetchPlayers, fetchCoaches, fetchActivePlans, fetchNets,
  insertPlayer, upsertCoach, updateAcademyFields,
  upsertNet: vi.fn(), deleteNet: vi.fn(),
}));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

function setupDefaults() {
  fetchAcademy.mockResolvedValue(makeAcademy({ id: "ac1", name: "My Academy", playerIds: [], coachIds: [], headCoachId: "" }));
  fetchPlayers.mockResolvedValue([]);
  fetchCoaches.mockResolvedValue([]);
  fetchActivePlans.mockResolvedValue([]);
  fetchNets.mockResolvedValue([]);
  insertPlayer.mockResolvedValue(undefined);
  upsertCoach.mockResolvedValue(undefined);
  updateAcademyFields.mockResolvedValue(undefined);
}

describe("AcademyProfileClient", () => {
  test("shows a not-found message when the academy doesn't exist", async () => {
    setupDefaults();
    fetchAcademy.mockResolvedValue(null);
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });

    render(<AcademyProfileClient academyId="missing" />);

    expect(await screen.findByText("Academy not found.")).toBeInTheDocument();
  });

  test("renders the academy's identity and defaults an academy_admin straight to Pricing", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "ac1" }) });

    render(<AcademyProfileClient academyId="ac1" />);

    expect(await screen.findByRole("heading", { name: "My Academy" })).toBeInTheDocument();
    // Pricing tab renders its own "Default Session Fee" card only once active — a platform_admin
    // gets Players by default, so this proves the academy_admin default landed on Pricing instead.
    expect(await screen.findByText("Default Session Fee")).toBeInTheDocument();
  });

  test("defaults a platform admin to the Players tab", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });

    render(<AcademyProfileClient academyId="ac1" />);

    await screen.findByRole("heading", { name: "My Academy" });
    expect(screen.getByText("No players assigned yet.")).toBeInTheDocument();
  });

  test("adds a player directly from the Players tab", async () => {
    const user = userEvent.setup();
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "ac1" }) });

    render(<AcademyProfileClient academyId="ac1" />);
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

  test("adding a player with an email fires a best-effort guardian-relink call", async () => {
    const user = userEvent.setup();
    setupDefaults();
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}"));
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "ac1" }) });

    render(<AcademyProfileClient academyId="ac1" />);
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

  test("rejects a garbage email on the Players tab's inline Add Player, instead of silently saving an unreachable player", async () => {
    const user = userEvent.setup();
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "ac1" }) });

    render(<AcademyProfileClient academyId="ac1" />);
    const callsBefore = insertPlayer.mock.calls.length;
    await user.click(await screen.findByRole("button", { name: "Players (0)" }));
    await user.click(screen.getByRole("button", { name: "+ Add Player" }));
    await user.type(screen.getByPlaceholderText("Player name"), "Twisha");
    await user.type(screen.getByPlaceholderText("player@email.com"), "Pannu");
    await user.click(screen.getByRole("button", { name: "Create & Assign" }));

    expect(await screen.findByText("Enter a valid email address, or leave it blank.")).toBeInTheDocument();
    expect(insertPlayer.mock.calls.length).toBe(callsBefore);
  });

  test("adds a coach directly from the Coaches tab and assigns them as head coach", async () => {
    const user = userEvent.setup();
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "ac1" }) });

    render(<AcademyProfileClient academyId="ac1" />);
    await screen.findByRole("button", { name: "Pricing" }); // confirms rendered
    await user.click(screen.getByRole("button", { name: "Coaches (0)" }));
    await user.click(screen.getByRole("button", { name: "+ Add Coach" }));
    await user.type(screen.getByPlaceholderText("Coach full name"), "Priya Sharma");
    await user.click(screen.getByRole("button", { name: "Create & Assign" }));

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

    render(<AcademyProfileClient academyId="ac1" />);
    await screen.findByRole("button", { name: "Pricing" });
    await user.click(screen.getByRole("button", { name: "Coaches (0)" }));
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

    render(<AcademyProfileClient academyId="ac1" />);
    await screen.findByRole("button", { name: "Pricing" });
    await user.click(screen.getByRole("button", { name: "Coaches (0)" }));
    await user.click(screen.getByRole("button", { name: /Create New Coach/ }));
    await user.type(screen.getByPlaceholderText("Coach full name"), "Priya Sharma");
    await user.click(screen.getByRole("button", { name: "Create & Assign" }));

    expect(await screen.findAllByText("Priya Sharma")).not.toHaveLength(0);
    expect(upsertCoach).toHaveBeenLastCalledWith(expect.objectContaining({ name: "Priya Sharma", email: "" }));
  });

  test("a platform admin can Deactivate the academy from the profile page's own ⋮ menu", async () => {
    const user = userEvent.setup();
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });

    render(<AcademyProfileClient academyId="ac1" />);
    await screen.findByRole("heading", { name: "My Academy" });

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByText("Deactivate"));
    await user.click(screen.getByRole("button", { name: "Yes, Deactivate" }));

    expect(updateAcademyFields).toHaveBeenCalledWith("ac1", { status: "Inactive" });
  });

  test("hides the Deactivate/Activate menu entirely for an academy_admin", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "ac1" }) });

    render(<AcademyProfileClient academyId="ac1" />);
    await screen.findByRole("heading", { name: "My Academy" });

    expect(screen.queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
  });

  test("Edit Academy links back to the list with ?edit=<id>, and Billing links to the billing page", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });

    render(<AcademyProfileClient academyId="ac1" />);
    await screen.findByRole("heading", { name: "My Academy" });

    expect(screen.getByRole("link", { name: "Edit Academy" })).toHaveAttribute("href", "/academy?edit=ac1");
    expect(screen.getByRole("link", { name: /Billing/ })).toHaveAttribute("href", "/academies/ac1/billing");
  });
});
