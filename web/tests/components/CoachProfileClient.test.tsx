import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CoachProfileClient } from "@/components/CoachProfileClient";
import { makeAcademy, makeCoach, makePlayer } from "../mocks/fixtures";

const { fetchCoach, fetchAcademies, fetchPlayers } = vi.hoisted(() => ({
  fetchCoach: vi.fn(),
  fetchAcademies: vi.fn(),
  fetchPlayers: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ fetchCoach, fetchAcademies, fetchPlayers }));

const originalFetch = global.fetch;

function setupDefaults() {
  fetchAcademies.mockResolvedValue([]);
  fetchPlayers.mockResolvedValue([]);
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
});
