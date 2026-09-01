import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CoachesClient } from "@/components/CoachesClient";
import { makeAuthUser, makeCoach } from "../mocks/fixtures";

const { fetchCoaches, fetchAcademies, fetchPlayers } = vi.hoisted(() => ({
  fetchCoaches: vi.fn(), fetchAcademies: vi.fn(), fetchPlayers: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  fetchCoaches, fetchAcademies, fetchPlayers,
  upsertCoach: vi.fn(), deleteCoach: vi.fn(), reassignCoachPlayers: vi.fn(), updateAcademyFields: vi.fn(),
}));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

const { push, replace, searchParamsGet } = vi.hoisted(() => ({
  push: vi.fn(), replace: vi.fn(), searchParamsGet: vi.fn(() => null),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => ({ get: searchParamsGet }),
}));

const originalFetch = global.fetch;

function setupDefaults() {
  useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
  fetchCoaches.mockResolvedValue([]);
  fetchAcademies.mockResolvedValue([]);
  fetchPlayers.mockResolvedValue([]);
}

describe("CoachesClient", () => {
  test("renders fetched coaches with their payout status", async () => {
    setupDefaults();
    fetchCoaches.mockResolvedValue([
      makeCoach({ id: "c1", name: "Coach Dan", stripeConnectOnboarded: true }),
      makeCoach({ id: "c2", name: "Coach Sam", stripeConnectOnboarded: false, stripeConnectAccountId: undefined }),
    ]);

    render(<CoachesClient />);

    expect(await screen.findByText("Coach Dan")).toBeInTheDocument();
    expect(screen.getByText("Coach Sam")).toBeInTheDocument();
    expect(screen.getByText("✓ Connected")).toBeInTheDocument();
    expect(screen.getByText("Not set up")).toBeInTheDocument();
  });

  test("scopes the fetch to the academy_admin's own academy", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "academy-9" }) });

    render(<CoachesClient />);

    await screen.findByRole("heading", { name: "Coaches" });
    expect(fetchCoaches).toHaveBeenCalledWith("academy-9");
  });

  test("hides the 'New Coach' button for a coach viewing their own team page", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "coach", coachId: "c1" }) });

    render(<CoachesClient />);
    await screen.findByRole("heading", { name: "Coaches" });

    expect(screen.queryByRole("button", { name: "+ New Coach" })).not.toBeInTheDocument();
  });

  test("clicking 'Set up payouts' posts to the Connect onboarding endpoint", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", name: "Coach Dan", stripeConnectOnboarded: false, stripeConnectAccountId: undefined })]);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: "https://connect.stripe.com/setup/xyz" }) }) as typeof fetch;

    // jsdom doesn't implement navigation — swallow the "Not implemented" assignment.
    Object.defineProperty(window, "location", { value: { ...window.location, href: "" }, writable: true });

    render(<CoachesClient />);
    await user.click(await screen.findByRole("button", { name: "Set up payouts" }));

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/stripe/connect/onboard",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ coachId: "c1" }) }),
    );
    global.fetch = originalFetch;
  });
});
