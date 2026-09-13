import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MembershipEditClient } from "@/components/MembershipEditClient";
import { makeAuthUser, makePlayer, makeAcademy, makeCoach, makeSessionPack, makeGroupSession } from "../mocks/fixtures";

const {
  fetchSessionPack, fetchPlayer, fetchAcademies, fetchCoaches, fetchActivePlans,
  fetchGroupSessions, upsertSessionPack, setGroupSessionRoster,
} = vi.hoisted(() => ({
  fetchSessionPack: vi.fn(), fetchPlayer: vi.fn(), fetchAcademies: vi.fn(), fetchCoaches: vi.fn(),
  fetchActivePlans: vi.fn(), fetchGroupSessions: vi.fn(), upsertSessionPack: vi.fn(), setGroupSessionRoster: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  fetchSessionPack, fetchPlayer, fetchAcademies, fetchCoaches, fetchActivePlans,
  fetchGroupSessions, upsertSessionPack, setGroupSessionRoster,
}));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: routerPush }) }));

function setupDefaults() {
  routerPush.mockClear();
  useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
  fetchSessionPack.mockResolvedValue(makeSessionPack({
    id: "pack1", playerId: "p1", academyId: "academy-1", coachId: "coach-1",
    totalSessions: 10, feePerSession: 20, agreedDays: ["Tue"],
  }));
  fetchPlayer.mockResolvedValue(makePlayer({ id: "p1", name: "Alice Bowler" }));
  fetchAcademies.mockResolvedValue([makeAcademy({ id: "academy-1", name: "Fast Bowlers Academy" })]);
  fetchCoaches.mockResolvedValue([makeCoach({ id: "coach-1", name: "Coach Dan", academyId: "academy-1" })]);
  fetchActivePlans.mockResolvedValue([]);
  fetchGroupSessions.mockResolvedValue([
    makeGroupSession({ id: "gs1", academyId: "academy-1", name: "U14 Tuesday Nets", dayOfWeek: 2, time: "16:00", playerIds: ["p1"] }),
    makeGroupSession({ id: "gs2", academyId: "academy-1", name: "U13 Thursday Nets", dayOfWeek: 4, time: "17:00", playerIds: [] }),
  ]);
  upsertSessionPack.mockClear().mockResolvedValue(undefined);
  setGroupSessionRoster.mockClear().mockResolvedValue(undefined);
}

describe("MembershipEditClient", () => {
  test("renders prefilled from the existing membership", async () => {
    setupDefaults();
    render(<MembershipEditClient packId="pack1" />);

    expect(await screen.findByText("Alice Bowler · Senior")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Fast Bowlers Academy")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Coach Dan")).toBeInTheDocument();
    expect(screen.getByDisplayValue("10 sessions")).toBeInTheDocument();
    expect(screen.getByDisplayValue("20")).toBeInTheDocument();
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes[0].checked).toBe(true); // U14 Tuesday Nets — currently enrolled
    expect(checkboxes[1].checked).toBe(false); // U13 Thursday Nets — not enrolled
  });

  test("shows a not-found state when the membership doesn't exist", async () => {
    setupDefaults();
    fetchSessionPack.mockResolvedValue(null);
    render(<MembershipEditClient packId="bogus" />);

    expect(await screen.findByText("Membership not found")).toBeInTheDocument();
  });

  test("requires at least one squad training session before saving", async () => {
    const user = userEvent.setup();
    setupDefaults();
    render(<MembershipEditClient packId="pack1" />);
    await screen.findByText("Alice Bowler · Senior");

    await user.click(screen.getByText("U14 Tuesday Nets")); // deselect the only enrolled one
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(screen.getByText("Please select at least one squad training session.")).toBeInTheDocument();
    expect(upsertSessionPack).not.toHaveBeenCalled();
  });

  test("saving diffs the roster (adds the newly checked session, removes the unchecked one) and navigates back to the view page", async () => {
    const user = userEvent.setup();
    setupDefaults();
    render(<MembershipEditClient packId="pack1" />);
    await screen.findByText("Alice Bowler · Senior");

    await user.click(screen.getByText("U13 Thursday Nets")); // add
    await user.click(screen.getByText("U14 Tuesday Nets")); // remove
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(upsertSessionPack).toHaveBeenCalledWith(expect.objectContaining({
      id: "pack1", academy_id: "academy-1", coach_id: "coach-1", total_sessions: 10,
      fee_per_session: 20, agreed_days: ["Thu"],
    })));
    expect(setGroupSessionRoster).toHaveBeenCalledWith("gs1", []);
    expect(setGroupSessionRoster).toHaveBeenCalledWith("gs2", ["p1"]);
    expect(routerPush).toHaveBeenCalledWith("/session-packs/pack1");
  });
});
