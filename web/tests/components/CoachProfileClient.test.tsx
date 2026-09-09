import { describe, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CoachProfileClient } from "@/components/CoachProfileClient";
import { makeAcademy, makeCoach, makePlayer } from "../mocks/fixtures";

const { fetchCoach, fetchCoaches, fetchAcademies, fetchPlayers, updateCoachFields, reassignCoachPlayers, updateAcademyFields } = vi.hoisted(() => ({
  fetchCoach: vi.fn(),
  fetchCoaches: vi.fn(),
  fetchAcademies: vi.fn(),
  fetchPlayers: vi.fn(),
  updateCoachFields: vi.fn(),
  reassignCoachPlayers: vi.fn(),
  updateAcademyFields: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ fetchCoach, fetchCoaches, fetchAcademies, fetchPlayers, updateCoachFields, reassignCoachPlayers, updateAcademyFields }));

const originalFetch = global.fetch;

function setupDefaults() {
  fetchCoaches.mockResolvedValue([]);
  fetchAcademies.mockResolvedValue([]);
  fetchPlayers.mockResolvedValue([]);
  updateCoachFields.mockClear();
  updateCoachFields.mockResolvedValue(undefined);
  reassignCoachPlayers.mockClear();
  reassignCoachPlayers.mockResolvedValue(undefined);
}

describe("CoachProfileClient", () => {
  test("renders 'Coach not found' when the coach doesn't exist", async () => {
    setupDefaults();
    fetchCoach.mockResolvedValue(null);

    render(<CoachProfileClient coachId="missing" />);

    expect(await screen.findByText("Coach not found.")).toBeInTheDocument();
  });

  test("renders the coach's name, certification level, and 'Independent' when they have no academy", async () => {
    setupDefaults();
    fetchCoach.mockResolvedValue(makeCoach({ id: "c1", name: "Coach Dan", certificationLevel: "Elite", academyId: "" }));

    render(<CoachProfileClient coachId="c1" />);

    expect(await screen.findByText("Coach Dan")).toBeInTheDocument();
    expect(screen.getByText("Elite")).toBeInTheDocument();
    expect(screen.getAllByText("Independent").length).toBeGreaterThan(0);
  });

  test("shows the academy's name instead of 'Independent' when the coach belongs to one", async () => {
    setupDefaults();
    fetchCoach.mockResolvedValue(makeCoach({ id: "c1", name: "Coach Dan", academyId: "a1" }));
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "a1", name: "Riverside Academy" })]);

    render(<CoachProfileClient coachId="c1" />);

    expect(await screen.findByText("Coach Dan")).toBeInTheDocument();
    expect(screen.getAllByText("Riverside Academy").length).toBeGreaterThan(0);
  });

  test("lists assigned players, linking each to their own profile", async () => {
    setupDefaults();
    fetchCoach.mockResolvedValue(makeCoach({ id: "c1", name: "Coach Dan" }));
    fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);

    render(<CoachProfileClient coachId="c1" />);
    await screen.findByText("Coach Dan");

    const link = screen.getByRole("link", { name: "Alice Bowler" });
    expect(link).toHaveAttribute("href", "/players/p1");
  });

  test("shows 'No players assigned yet' when the coach has none", async () => {
    setupDefaults();
    fetchCoach.mockResolvedValue(makeCoach({ id: "c1", name: "Coach Dan" }));

    render(<CoachProfileClient coachId="c1" />);
    await screen.findByText("Coach Dan");

    expect(screen.getByText("No players assigned yet.")).toBeInTheDocument();
  });

  test("shows 'Set Up Payouts' when not onboarded, and posts to the connect endpoint", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoach.mockResolvedValue(makeCoach({ id: "c1", name: "Coach Dan", stripeConnectOnboarded: false }));
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: "https://connect.stripe.com/setup/xyz" }) }) as typeof fetch;
    Object.defineProperty(window, "location", { value: { ...window.location, href: "" }, writable: true });

    render(<CoachProfileClient coachId="c1" />);
    await user.click(await screen.findByRole("button", { name: "Set Up Payouts" }));

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/stripe/connect/onboard",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ coachId: "c1" }) }),
    );
    global.fetch = originalFetch;
  });

  test("shows 'View Payouts' once onboarded", async () => {
    setupDefaults();
    fetchCoach.mockResolvedValue(makeCoach({ id: "c1", name: "Coach Dan", stripeConnectOnboarded: true }));

    render(<CoachProfileClient coachId="c1" />);

    expect(await screen.findByRole("button", { name: "View Payouts" })).toBeInTheDocument();
  });

  test("shows the removed reason and hides the payout action for a removed coach", async () => {
    setupDefaults();
    fetchCoach.mockResolvedValue(makeCoach({
      id: "c1", name: "Coach Dan", loginDisabled: true, disabledReason: "Left the academy",
    }));

    render(<CoachProfileClient coachId="c1" />);
    await screen.findByText("Coach Dan");

    expect(screen.getByText(/Left the academy/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set Up Payouts" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View Payouts" })).not.toBeInTheDocument();
  });

  test("links Edit Coach to the dedicated edit page", async () => {
    setupDefaults();
    fetchCoach.mockResolvedValue(makeCoach({ id: "c1", name: "Coach Dan" }));

    render(<CoachProfileClient coachId="c1" />);
    await screen.findByText("Coach Dan");

    expect(screen.getByRole("link", { name: "Edit Coach" })).toHaveAttribute("href", "/coaches/c1/edit");
  });

  test("deactivating from the profile page requires confirmation, then updates the status badge in place", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoach.mockResolvedValue(makeCoach({ id: "c1", name: "Coach Dan", status: "Active" }));

    render(<CoachProfileClient coachId="c1" />);
    await screen.findByText("Coach Dan");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByText("Deactivate"));
    expect(await screen.findByText("Deactivate Coach?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Yes, Deactivate" }));

    expect(updateCoachFields).toHaveBeenCalledWith("c1", { status: "Inactive" });
    const header = screen.getByText("Coach Dan").closest(".bg-surface") as HTMLElement;
    expect(await within(header).findByText("Inactive")).toBeInTheDocument();
  });

  test("toggling marketplace visibility from the profile page updates the info card in place", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoach.mockResolvedValue(makeCoach({ id: "c1", name: "Coach Dan", marketplaceVisible: false }));

    render(<CoachProfileClient coachId="c1" />);
    await screen.findByText("Coach Dan");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByText("Show in Marketplace"));
    await user.click(screen.getByRole("button", { name: "Yes, Show" }));

    expect(updateCoachFields).toHaveBeenCalledWith("c1", { marketplace_visible: true });
    expect(await screen.findByText("Marketplace visible")).toBeInTheDocument();
  });

  test("reassigning all players from the profile page moves them and empties the Assigned Players card", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoach.mockResolvedValue(makeCoach({ id: "c1", name: "Coach Dan" }));
    fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice", coachId: "c1" })]);
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", name: "Coach Dan" }), makeCoach({ id: "c2", name: "Coach Sam" })]);

    render(<CoachProfileClient coachId="c1" />);
    await screen.findByText("Coach Dan");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByText("Reassign All Players"));
    expect(await screen.findByText("Reassign All Players?")).toBeInTheDocument();
    await user.selectOptions(screen.getByDisplayValue("— Leave unassigned —"), "Coach Sam");
    await user.click(screen.getByRole("button", { name: "Reassign" }));

    expect(reassignCoachPlayers).toHaveBeenCalledWith("c1", "c2");
    expect(await screen.findByText("No players assigned yet.")).toBeInTheDocument();
  });

  test("removing a coach with no dependents from the profile page soft-deletes them in place", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoach.mockResolvedValue(makeCoach({ id: "c1", name: "Coach Dan" }));

    render(<CoachProfileClient coachId="c1" />);
    await screen.findByText("Coach Dan");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByText("Remove Coach"));
    expect(await screen.findByText("Remove Coach?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Yes, Remove" }));

    expect(updateCoachFields).toHaveBeenCalledWith("c1", expect.objectContaining({ login_disabled: true }));
    expect(await screen.findByText("Removed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByText("Reinstate Coach")).toBeInTheDocument();
  });

  test("removing a coach with assigned players requires picking where they go first", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoach.mockResolvedValue(makeCoach({ id: "c1", name: "Coach Dan" }));
    fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice", coachId: "c1" })]);
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", name: "Coach Dan" }), makeCoach({ id: "c2", name: "Coach Sam" })]);

    render(<CoachProfileClient coachId="c1" />);
    await screen.findByText("Coach Dan");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByText("Remove Coach"));

    expect(await screen.findByText("Reassign & Remove Coach?")).toBeInTheDocument();
    await user.selectOptions(screen.getByDisplayValue("— Leave unassigned —"), "Coach Sam");
    await user.click(screen.getByRole("button", { name: "Reassign & Remove" }));

    expect(reassignCoachPlayers).toHaveBeenCalledWith("c1", "c2");
    expect(updateCoachFields).toHaveBeenCalledWith("c1", expect.objectContaining({ login_disabled: true }));
  });

  test("a removed coach's ⋮ menu offers only Reinstate, and it restores their login in place", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoach.mockResolvedValue(makeCoach({ id: "c1", name: "Coach Dan", loginDisabled: true }));
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true })));

    render(<CoachProfileClient coachId="c1" />);
    await screen.findByText("Coach Dan");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByText("Reinstate Coach")).toBeInTheDocument();
    expect(screen.queryByText("Deactivate")).not.toBeInTheDocument();
    expect(screen.queryByText("Remove Coach")).not.toBeInTheDocument();

    await user.click(screen.getByText("Reinstate Coach"));
    await user.click(screen.getByRole("button", { name: "Yes, Reinstate" }));

    expect(fetchSpy).toHaveBeenCalledWith("/api/reactivate-coach", expect.objectContaining({
      method: "POST", body: JSON.stringify({ coachId: "c1" }),
    }));
    expect(await screen.findByRole("button", { name: "Set Up Payouts" })).toBeInTheDocument();

    fetchSpy.mockRestore();
  });
});
