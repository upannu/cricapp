import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FindCoachClient } from "@/components/FindCoachClient";
import { makeAcademy, makeAuthUser, makeCoach, makePlayer } from "../mocks/fixtures";

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

  test("excludes a marketplace-visible coach at the player's own academy — they already have access to those", async () => {
    setupDefaults();
    fetchPlayer.mockResolvedValue(makePlayer({ id: "p1", subscription: { plan: "Player Pro", startDate: "2026-01-01", endDate: "2027-01-01", sessionsUsed: 0, sessionsLimit: null } }));
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "ac1", playerIds: ["p1"] })]);
    fetchCoaches.mockResolvedValue([
      makeCoach({ id: "c1", name: "Own Academy Coach", marketplaceVisible: true, academyId: "ac1" }),
      makeCoach({ id: "c2", name: "Other Academy Coach", marketplaceVisible: true, academyId: "ac2" }),
    ]);

    render(<FindCoachClient />);
    expect(await screen.findByText("Other Academy Coach")).toBeInTheDocument();
    expect(screen.queryByText("Own Academy Coach")).not.toBeInTheDocument();
  });

  test("excludes an Inactive coach even if marketplace-visible — not bookable, so not discoverable", async () => {
    setupDefaults();
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", name: "Inactive Coach", marketplaceVisible: true, status: "Inactive" })]);

    render(<FindCoachClient />);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByText("Inactive Coach")).not.toBeInTheDocument();
  });

  // A player who just self-registered via /signup's "I'm new here" path (see complete-signup)
  // lands on the Free plan with no coach and no academy at all — and Free doesn't get
  // marketplace_enabled (see plans.free.marketplace_enabled = false in the live schema). Without
  // this exemption they'd have no way to ever get a coach, and no session-logging path either
  // (a coach logs sessions, not the player), so their Free plan's "1 session" allowance would be
  // permanently unusable with no upgrade able to fix it (a coach is the actual prerequisite, not
  // a higher tier).
  test("a Free-tier player with no coach and no academy at all can still reach the marketplace, unpaywalled", async () => {
    setupDefaults();
    fetchPlayer.mockResolvedValue(makePlayer({
      id: "p1", coachId: "",
      subscription: { plan: "Free", startDate: "2026-01-01", endDate: "2027-01-01", sessionsUsed: 0, sessionsLimit: 1 },
    }));
    fetchAcademies.mockResolvedValue([]);
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", name: "Coach Dan", marketplaceVisible: true })]);

    render(<FindCoachClient />);
    expect(await screen.findByText("Coach Dan")).toBeInTheDocument();
    expect(screen.queryByText("Find a Coach is a Player Pro feature")).not.toBeInTheDocument();
  });

  test("a Free-tier player who already has an academy still hits the Player Pro paywall — the exemption is for having no coach at all, not just being Free", async () => {
    setupDefaults();
    fetchPlayer.mockResolvedValue(makePlayer({
      id: "p1", coachId: "",
      subscription: { plan: "Free", startDate: "2026-01-01", endDate: "2027-01-01", sessionsUsed: 0, sessionsLimit: 1 },
    }));
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "ac1", playerIds: ["p1"] })]);
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", name: "Coach Dan", marketplaceVisible: true })]);

    render(<FindCoachClient />);
    expect(await screen.findByText("Find a Coach is a Player Pro feature")).toBeInTheDocument();
    expect(screen.queryByText("Coach Dan")).not.toBeInTheDocument();
  });

  test("a Free-tier player with a direct coachId (but no academy) still hits the paywall too", async () => {
    setupDefaults();
    fetchPlayer.mockResolvedValue(makePlayer({
      id: "p1", coachId: "coach-1",
      subscription: { plan: "Free", startDate: "2026-01-01", endDate: "2027-01-01", sessionsUsed: 0, sessionsLimit: 1 },
    }));
    fetchAcademies.mockResolvedValue([]);
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", name: "Coach Dan", marketplaceVisible: true })]);

    render(<FindCoachClient />);
    expect(await screen.findByText("Find a Coach is a Player Pro feature")).toBeInTheDocument();
  });

  // The fee lives on the coach's academy row, which RLS hides from a marketplace player — so the
  // modal asks the server for it (api/marketplace/request-booking) rather than computing 0.
  test("Request Booking shows the server-computed fee and sends the request through the marketplace route", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", name: "Maz Sheikh", marketplaceVisible: true })]);
    const fetchMock = vi.fn(async (_url: string, opts: { body: string }) => {
      const parsed = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () =>
          parsed.estimateOnly
            ? { fee: 100, currency: "aud", feesWaived: false }
            : { success: true, bookingId: "b_1", fee: 100, currency: "aud" },
      };
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<FindCoachClient />);
    await user.click(await screen.findByRole("button", { name: "Request Booking" }));

    expect(await screen.findByText(/\$100\.00/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Send Request" }));
    expect(await screen.findByText("Request sent")).toBeInTheDocument();

    const createCall = fetchMock.mock.calls.find(([, o]) => !JSON.parse((o as { body: string }).body).estimateOnly);
    expect(createCall?.[0]).toBe("/api/marketplace/request-booking");
    expect(JSON.parse((createCall![1] as { body: string }).body)).toMatchObject({ coachId: "c1", type: "Net Session" });

    global.fetch = originalFetch;
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
