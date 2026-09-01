import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FindCoachClient } from "@/components/FindCoachClient";
import { makeAuthUser, makeCoach, makePlayer } from "../mocks/fixtures";

const { fetchPlayer, fetchCoaches, fetchAcademies, fetchActivePlans, upsertBooking } = vi.hoisted(() => ({
  fetchPlayer: vi.fn(), fetchCoaches: vi.fn(), fetchAcademies: vi.fn(), fetchActivePlans: vi.fn(), upsertBooking: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ fetchPlayer, fetchCoaches, fetchAcademies, fetchActivePlans, upsertBooking }));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

const originalFetch = global.fetch;

function setupDefaults() {
  useAuth.mockReturnValue({ user: makeAuthUser({ role: "player", playerId: "p1" }) });
  fetchPlayer.mockResolvedValue(makePlayer({ id: "p1", subscription: { plan: "Player Pro", startDate: "2026-01-01", endDate: "2027-01-01", sessionsUsed: 0, sessionsLimit: null } }));
  fetchAcademies.mockResolvedValue([]);
  fetchActivePlans.mockResolvedValue([]);
  fetchCoaches.mockResolvedValue([]);
}

describe("FindCoachClient", () => {
  test("renders marketplace-visible coaches", async () => {
    setupDefaults();
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", name: "Coach Dan", marketplaceVisible: true, available: true })]);

    render(<FindCoachClient />);
    expect(await screen.findByText("Coach Dan")).toBeInTheDocument();
  });

  test("location search geocodes via the API and shows an error on failure", async () => {
    const user = userEvent.setup();
    setupDefaults();
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Could not resolve that location (ZERO_RESULTS)." }) }) as typeof fetch;

    render(<FindCoachClient />);
    await screen.findByRole("heading", { level: 1 });

    const locationInput = screen.getByPlaceholderText(/suburb|location|postcode/i);
    await user.type(locationInput, "Nowhere");
    await user.keyboard("{Enter}");

    expect(await screen.findByText("Could not resolve that location (ZERO_RESULTS).")).toBeInTheDocument();
    global.fetch = originalFetch;
  });
});
