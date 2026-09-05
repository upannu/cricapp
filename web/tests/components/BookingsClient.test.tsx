import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookingsClient } from "@/components/BookingsClient";
import { makeAuthUser, makeCoach, makePlayer } from "../mocks/fixtures";

const { fetchBookings, fetchPlayers, fetchCoaches, fetchAcademies, fetchActivePlans, fetchSessionPacks, fetchBookingFeeDues, fetchNets, upsertBooking } = vi.hoisted(() => ({
  fetchBookings: vi.fn(), fetchPlayers: vi.fn(), fetchCoaches: vi.fn(),
  fetchAcademies: vi.fn(), fetchActivePlans: vi.fn(), fetchSessionPacks: vi.fn(),
  fetchBookingFeeDues: vi.fn(), fetchNets: vi.fn(),
  upsertBooking: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/db", () => ({
  fetchBookings, fetchPlayers, fetchCoaches, fetchAcademies, fetchActivePlans, fetchSessionPacks, fetchBookingFeeDues, fetchNets,
  upsertBooking, updateBookingStatus: vi.fn(), deleteBooking: vi.fn(), updatePackPaymentStatus: vi.fn(), markBookingPaid: vi.fn(),
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
  fetchBookingFeeDues.mockResolvedValue([]);
  fetchNets.mockResolvedValue([]);
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

  test("blocks creating a second booking for the same coach at an overlapping time", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchPlayers.mockResolvedValue([
      makePlayer({ id: "p1", name: "Alice Bowler" }),
      makePlayer({ id: "p2", name: "Bob Batter" }),
    ]);
    // An existing 09:00-10:00 booking for coach1 — the form defaults to today at 09:00, so
    // submitting without touching date/time collides with this directly.
    fetchBookings.mockResolvedValue([
      { id: "b1", playerId: "p1", coachId: "coach1", date: today, time: "09:00", durationMins: 60, type: "Net Session", status: "Confirmed", location: "", notes: "", feeAud: 0, paymentStatus: "Paid" },
    ]);

    render(<BookingsClient />);
    await user.click((await screen.findAllByRole("button", { name: "+ New Booking" }))[0]);

    await user.selectOptions(screen.getByDisplayValue("— Select coach —"), "coach1");
    await user.selectOptions(screen.getByDisplayValue("— Select player —"), "p2");
    await user.click(screen.getByRole("button", { name: "Create Booking" }));

    expect(await screen.findByText(/already has another booking at this time/i)).toBeInTheDocument();
    expect(upsertBooking).not.toHaveBeenCalled();
  });

  test("searches the visible tab's bookings by player or coach name", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchPlayers.mockResolvedValue([
      makePlayer({ id: "p1", name: "Alice Bowler" }),
      makePlayer({ id: "p2", name: "Bob Batter" }),
    ]);
    fetchBookings.mockResolvedValue([
      { id: "b1", playerId: "p1", coachId: "coach1", date: today, time: "09:00", durationMins: 60, type: "Net Session", status: "Confirmed", location: "", notes: "", feeAud: 0, paymentStatus: "Paid" },
      { id: "b2", playerId: "p2", coachId: "coach1", date: today, time: "11:00", durationMins: 60, type: "Net Session", status: "Confirmed", location: "", notes: "", feeAud: 0, paymentStatus: "Paid" },
    ]);

    render(<BookingsClient />);
    await screen.findByText("Alice Bowler");

    await user.type(screen.getByPlaceholderText(/Search by player or coach/), "Bob");
    expect(await screen.findByText("Bob Batter")).toBeInTheDocument();
    expect(screen.queryByText("Alice Bowler")).not.toBeInTheDocument();
  });

  test("shows a shown/total/pending summary line under the page title", async () => {
    setupDefaults();
    fetchBookings.mockResolvedValue([
      { id: "b1", playerId: "p1", coachId: "coach1", date: today, time: "09:00", durationMins: 60, type: "Net Session", status: "Confirmed", location: "", notes: "", feeAud: 0, paymentStatus: "Paid" },
      { id: "b2", playerId: "p1", coachId: "coach1", date: today, time: "11:00", durationMins: 60, type: "Net Session", status: "Pending", location: "", notes: "", feeAud: 0, paymentStatus: "Pending" },
    ]);

    render(<BookingsClient />);
    await screen.findByText("Alice Bowler");

    // Default "Upcoming" tab excludes the Pending one — 1 shown, 2 total, 1 pending overall.
    expect(screen.getByText("1 shown · 2 total · 1 pending")).toBeInTheDocument();
  });
});
