import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MembershipProfileClient } from "@/components/MembershipProfileClient";
import { makePlayer, makeAcademy, makeSessionPack, makeGroupSession } from "../mocks/fixtures";

const {
  fetchSessionPack, fetchPlayer, fetchAcademies, fetchCoaches, fetchActivePlans,
  fetchGroupSessions, fetchBookings, fetchPackActivity, setGroupSessionRoster,
  updatePackAgreedDays, upsertSessionPack,
} = vi.hoisted(() => ({
  fetchSessionPack: vi.fn(), fetchPlayer: vi.fn(), fetchAcademies: vi.fn(), fetchCoaches: vi.fn(),
  fetchActivePlans: vi.fn(), fetchGroupSessions: vi.fn(), fetchBookings: vi.fn(), fetchPackActivity: vi.fn(),
  setGroupSessionRoster: vi.fn(), updatePackAgreedDays: vi.fn(), upsertSessionPack: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  fetchSessionPack, fetchPlayer, fetchAcademies, fetchCoaches, fetchActivePlans,
  fetchGroupSessions, fetchBookings, fetchPackActivity, setGroupSessionRoster,
  updatePackAgreedDays, upsertSessionPack,
}));

function setupDefaults() {
  fetchSessionPack.mockResolvedValue(makeSessionPack({ id: "pack1", playerId: "p1", academyId: "academy-1", totalSessions: 10, sessionsUsed: 3 }));
  fetchPlayer.mockResolvedValue(makePlayer({ id: "p1", name: "Alice Bowler" }));
  fetchAcademies.mockResolvedValue([makeAcademy({ id: "academy-1", name: "Fast Bowlers Academy" })]);
  fetchCoaches.mockResolvedValue([]);
  fetchActivePlans.mockResolvedValue([]);
  fetchGroupSessions.mockResolvedValue([]);
  fetchBookings.mockResolvedValue([]);
  fetchPackActivity.mockResolvedValue([]);
  setGroupSessionRoster.mockClear().mockResolvedValue(undefined);
  updatePackAgreedDays.mockClear().mockResolvedValue(undefined);
  upsertSessionPack.mockClear().mockResolvedValue(undefined);
}

describe("MembershipProfileClient", () => {
  test("renders the membership's detail once fetched", async () => {
    setupDefaults();
    render(<MembershipProfileClient packId="pack1" />);

    expect(await screen.findByText("Alice Bowler")).toBeInTheDocument();
    expect(screen.getByText("3 / 10")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Back to Memberships" })).toHaveAttribute("href", "/session-packs");
  });

  // The "why did my balance drop" answer — every credit this pack has spent, and which of the
  // three mechanisms (manual mark, CSV import, unattended cron) spent it.
  test("shows Membership Activity with each entry's recorded-by attribution", async () => {
    setupDefaults();
    fetchPackActivity.mockResolvedValue([
      { id: "att1", packId: "pack1", playerId: "p1", groupSessionId: "gs1", date: "2026-01-13", status: "Present", recordedBy: "manual" },
      { id: "att2", packId: "pack1", playerId: "p1", groupSessionId: "gs1", date: "2026-01-06", status: "Absent", recordedBy: "auto-cron" },
      { id: "att3", packId: "pack1", playerId: "p1", groupSessionId: "gs1", date: "2025-12-30", status: "Present", recordedBy: null },
    ]);

    render(<MembershipProfileClient packId="pack1" />);

    expect(await screen.findByText("Membership Activity")).toBeInTheDocument();
    expect(screen.getByText("Marked by coach")).toBeInTheDocument();
    expect(screen.getByText("Auto (no-show)")).toBeInTheDocument();
    expect(screen.getByText("Unattributed")).toBeInTheDocument();
  });

  test("shows an empty state when a membership has no activity recorded yet", async () => {
    setupDefaults();
    fetchPackActivity.mockResolvedValue([]);

    render(<MembershipProfileClient packId="pack1" />);

    expect(await screen.findByText("Membership Activity")).toBeInTheDocument();
    expect(screen.getByText("No sessions drawn from this membership yet.")).toBeInTheDocument();
  });

  test("shows a not-found state when the membership doesn't exist", async () => {
    setupDefaults();
    fetchSessionPack.mockResolvedValue(null);
    render(<MembershipProfileClient packId="bogus" />);

    expect(await screen.findByText("Membership not found")).toBeInTheDocument();
  });

  // Read-only by default (see SessionPacksClient's own equivalent test) — a bare checkbox in a
  // summary view invites an accidental roster change.
  test("shows enrolled squad training sessions read-only until Edit is clicked", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchGroupSessions.mockResolvedValue([
      makeGroupSession({ id: "gs1", academyId: "academy-1", name: "U14 Tuesday Nets", dayOfWeek: 2, time: "16:00", playerIds: ["p1"] }),
      makeGroupSession({ id: "gs2", academyId: "academy-1", name: "U13 Thursday Nets", dayOfWeek: 4, time: "17:00", playerIds: [] }),
    ]);

    render(<MembershipProfileClient packId="pack1" />);
    await screen.findByText("Alice Bowler");

    expect(screen.getByText("U14 Tuesday Nets")).toBeInTheDocument();
    expect(screen.queryByText("U13 Thursday Nets")).not.toBeInTheDocument();
    expect(document.querySelector('input[type="checkbox"]')).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByText("U13 Thursday Nets")).toBeInTheDocument();

    await user.click(screen.getByText("U13 Thursday Nets"));
    await waitFor(() => expect(setGroupSessionRoster).toHaveBeenCalledWith("gs2", ["p1"]));
    expect(updatePackAgreedDays).toHaveBeenCalledWith("pack1", expect.arrayContaining(["Tue", "Thu"]));
  });

  test("crediting a session calls upsertSessionPack with an incremented session_credits", async () => {
    const user = userEvent.setup();
    setupDefaults();
    // Within the agreed-pace window (packCreditExpiryDate) so the Credit button is actually live.
    fetchSessionPack.mockResolvedValue(makeSessionPack({
      id: "pack1", playerId: "p1", academyId: "academy-1", totalSessions: 10, sessionsUsed: 3, sessionCredits: 0,
      purchaseDate: new Date().toISOString().split("T")[0],
    }));
    render(<MembershipProfileClient packId="pack1" />);
    await screen.findByText("Alice Bowler");

    await user.click(screen.getByRole("button", { name: /Credit a Session/ }));
    await user.click(screen.getByRole("button", { name: "Yes, credit it" }));

    expect(upsertSessionPack).toHaveBeenCalledWith(expect.objectContaining({ id: "pack1", session_credits: 1 }));
    expect(await screen.findByText(/Session credited/)).toBeInTheDocument();
  });
});
