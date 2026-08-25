import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BookingsClient } from "@/components/BookingsClient";
import { makeAuthUser, makeCoach, makePlayer } from "../mocks/fixtures";

const { fetchBookings, fetchPlayers, fetchCoaches, fetchAcademies, fetchActivePlans, fetchSessionPacks } = vi.hoisted(() => ({
  fetchBookings: vi.fn(), fetchPlayers: vi.fn(), fetchCoaches: vi.fn(),
  fetchAcademies: vi.fn(), fetchActivePlans: vi.fn(), fetchSessionPacks: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  fetchBookings, fetchPlayers, fetchCoaches, fetchAcademies, fetchActivePlans, fetchSessionPacks,
  upsertBooking: vi.fn(), updateBookingStatus: vi.fn(), deleteBooking: vi.fn(), updatePackPaymentStatus: vi.fn(),
}));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

const today = new Date().toISOString().split("T")[0];

function setupDefaults() {
  useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
  fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);
  fetchCoaches.mockResolvedValue([makeCoach({ id: "coach1", name: "Coach Dan" })]);
  fetchAcademies.mockResolvedValue([]);
  fetchActivePlans.mockResolvedValue([]);
  fetchSessionPacks.mockResolvedValue([]);
  fetchBookings.mockResolvedValue([]);
}

describe("BookingsClient", () => {
  test("shows an empty state on the default Upcoming tab with no bookings", async () => {
    setupDefaults();
    render(<BookingsClient />);
    expect(await screen.findByRole("heading", { name: "Bookings" })).toBeInTheDocument();
    expect(await screen.findByText(/No .*bookings/i)).toBeInTheDocument();
  });

  test("renders an upcoming, confirmed booking with the player's name", async () => {
    setupDefaults();
    fetchBookings.mockResolvedValue([
      { id: "b1", playerId: "p1", coachId: "coach1", date: today, time: "10:00", durationMins: 60, type: "Net Session", status: "Confirmed", location: "", notes: "", feeAud: 0, paymentStatus: "Paid" },
    ]);

    render(<BookingsClient />);
    expect(await screen.findByText("Alice Bowler")).toBeInTheDocument();
  });

  test("scopes the fetch to the coach's own bookings/players", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "coach", coachId: "coach1" }) });

    render(<BookingsClient />);
    await screen.findByRole("heading", { name: "Bookings" });

    expect(fetchPlayers).toHaveBeenCalledWith("coach1", undefined);
    expect(fetchCoaches).toHaveBeenCalledWith(undefined);
  });
});
