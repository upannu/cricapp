import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NewSessionForm } from "@/components/NewSessionForm";
import { makeAuthUser, makeCoach, makePlayer } from "../mocks/fixtures";

const { insertSession, recordSessionCompletion, updateBookingStatus, fetchActivePlans, fetchCoaches } = vi.hoisted(() => ({
  insertSession: vi.fn(),
  recordSessionCompletion: vi.fn(),
  updateBookingStatus: vi.fn(),
  fetchActivePlans: vi.fn(),
  fetchCoaches: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ insertSession, recordSessionCompletion, updateBookingStatus, fetchActivePlans, fetchCoaches }));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

vi.mock("@/lib/supabase", () => ({ createClient: () => ({}) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

function setupDefaults() {
  useAuth.mockReturnValue({ user: makeAuthUser({ role: "coach", coachId: "coach-1" }) });
  fetchActivePlans.mockResolvedValue([]); // no Plan rows → Free falls back to the 4/month default
  fetchCoaches.mockResolvedValue([makeCoach({ id: "coach-1", name: "Coach Dan" })]);
}

// A Free-tier player who has used all 4 of their monthly sessions — the limit sessionsLimitForPlan
// falls back to for "Free" when no Plan rows exist (see lib/plan-features.ts).
function overLimitPlayer() {
  return makePlayer({
    id: "p1", name: "Alice Bowler",
    subscription: { plan: "Free", startDate: "2026-01-01", endDate: "2027-01-01", sessionsUsed: 4, sessionsLimit: 4 },
  });
}

describe("NewSessionForm", () => {
  test("blocks logging once the Free plan's monthly limit is reached, with an upgrade link", async () => {
    setupDefaults();
    render(<NewSessionForm player={overLimitPlayer()} />);

    expect(await screen.findByText("Monthly session limit reached")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Upgrade Options" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save Session" })).not.toBeInTheDocument();
  });

  // A session tied to a Confirmed booking is already paid for via that booking's fee, so it
  // shouldn't also need plan headroom — see the bookingWaivesLimit comment in NewSessionForm.
  test("a Confirmed booking waives the monthly limit and shows a waiver banner", async () => {
    setupDefaults();
    render(<NewSessionForm player={overLimitPlayer()} bookingId="b1" bookingStatus="Confirmed" />);

    expect(await screen.findByText(/does not count against Alice Bowler's monthly session limit/)).toBeInTheDocument();
    expect(screen.queryByText("Monthly session limit reached")).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Log Session" })).toBeInTheDocument();
  });

  // A booking that exists but isn't Confirmed yet (Pending/Cancelled) isn't a guaranteed paid
  // appointment, so it doesn't waive anything — but the blocked message should still point the
  // coach at the fix (confirm the booking) rather than just "upgrade".
  test("a non-Confirmed booking does not waive the limit, and hints that confirming it would help", async () => {
    setupDefaults();
    render(<NewSessionForm player={overLimitPlayer()} bookingId="b1" bookingStatus="Pending" />);

    expect(await screen.findByText("Monthly session limit reached")).toBeInTheDocument();
    expect(screen.getByText(/is not confirmed yet/)).toBeInTheDocument();
  });

  test("renders the form normally when well under the limit, with no banner", async () => {
    setupDefaults();
    const player = makePlayer({
      id: "p1", name: "Alice Bowler",
      subscription: { plan: "Free", startDate: "2026-01-01", endDate: "2027-01-01", sessionsUsed: 1, sessionsLimit: 4 },
    });

    render(<NewSessionForm player={player} />);

    expect(await screen.findByRole("heading", { name: "Log Session" })).toBeInTheDocument();
    expect(screen.queryByText("Monthly session limit reached")).not.toBeInTheDocument();
    expect(screen.queryByText(/does not count against/)).not.toBeInTheDocument();
  });
});
