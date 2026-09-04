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

  test("paginates the Past tab's flat list and resets to page 1 on tab switch", async () => {
    const user = userEvent.setup();
    setupDefaults();
    const pastDate = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400000).toISOString().split("T")[0];
    fetchBookings.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => ({
        id: `b${i}`, playerId: "p1", coachId: "coach1", date: pastDate(i + 1), time: "09:00",
        durationMins: 60, type: "Net Session", status: "Confirmed", location: `loc-${i}`, notes: "",
        feeAud: 0, paymentStatus: "Paid",
      }))
    );

    render(<BookingsClient />);
    await user.click(await screen.findByRole("button", { name: "Past" }));

    expect(await screen.findByText("Page 1 of 2")).toBeInTheDocument();
    // Sorted most-recent-first — page 1 holds days-ago 1..10, i.e. loc-0..loc-9.
    expect(screen.getByText("loc-0")).toBeInTheDocument();
    expect(screen.queryByText("loc-11")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next →" }));
    expect(await screen.findByText("loc-11")).toBeInTheDocument();
    expect(screen.queryByText("loc-0")).not.toBeInTheDocument();

    // Switching tabs away and back resets pagination rather than stranding page 2.
    await user.click(screen.getByRole("button", { name: "All" }));
    await user.click(screen.getByRole("button", { name: "Past" }));
    expect(await screen.findByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("loc-0")).toBeInTheDocument();
  });
});
