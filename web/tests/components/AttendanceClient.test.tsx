import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AttendanceClient } from "@/components/AttendanceClient";
import { makeAuthUser, makeCoach, makeGroupSession, makePlayer, makeSessionPack } from "../mocks/fixtures";

const {
  fetchGroupSessions, upsertGroupSession, setGroupSessionRoster,
  fetchPlayers, fetchCoaches, fetchSessionPacks, fetchPastOccurrences,
  fetchAttendanceForDate, saveAttendance,
} = vi.hoisted(() => ({
  fetchGroupSessions: vi.fn(),
  upsertGroupSession: vi.fn(),
  setGroupSessionRoster: vi.fn(),
  fetchPlayers: vi.fn(),
  fetchCoaches: vi.fn(),
  fetchSessionPacks: vi.fn(),
  fetchPastOccurrences: vi.fn(),
  fetchAttendanceForDate: vi.fn(),
  saveAttendance: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  fetchGroupSessions, upsertGroupSession, setGroupSessionRoster,
  fetchPlayers, fetchCoaches, fetchSessionPacks, fetchPastOccurrences,
  fetchAttendanceForDate, saveAttendance,
}));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

function setupDefaults() {
  useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
  fetchGroupSessions.mockResolvedValue([]);
  fetchPlayers.mockResolvedValue([]);
  fetchCoaches.mockResolvedValue([makeCoach({ id: "coach-1", name: "Coach Dan" })]);
  fetchPastOccurrences.mockResolvedValue([]);
  fetchAttendanceForDate.mockResolvedValue([]);
  fetchSessionPacks.mockResolvedValue([]);
}

describe("AttendanceClient", () => {
  test("renders an empty state with no groups", async () => {
    setupDefaults();
    render(<AttendanceClient />);
    expect(await screen.findByText("No recurring group sessions yet.")).toBeInTheDocument();
  });

  test("renders an existing group with its schedule summary", async () => {
    setupDefaults();
    fetchGroupSessions.mockResolvedValue([
      makeGroupSession({ id: "gs1", name: "U14 Tuesday Nets", dayOfWeek: 2, time: "16:00", playerIds: ["p1"] }),
    ]);

    render(<AttendanceClient />);

    expect(await screen.findByText("U14 Tuesday Nets")).toBeInTheDocument();
    expect(screen.getByText(/Tuesdays · 16:00 · Net Session · 1 player/)).toBeInTheDocument();
  });

  test("creating a new group calls upsertGroupSession and setGroupSessionRoster", async () => {
    const user = userEvent.setup();
    setupDefaults();
    upsertGroupSession.mockResolvedValue(undefined);
    setGroupSessionRoster.mockResolvedValue(undefined);

    render(<AttendanceClient />);
    await user.click(await screen.findByRole("button", { name: "+ New Group" }));

    await user.type(screen.getByPlaceholderText("e.g. U14 Tuesday Nets"), "U16 Friday Nets");
    // Only one coach exists, so it's already pre-selected by openAdd()'s default.
    await user.click(screen.getByRole("button", { name: "Create Group" }));

    expect(upsertGroupSession).toHaveBeenCalledWith(expect.objectContaining({ name: "U16 Friday Nets", coach_id: "coach-1" }));
    expect(setGroupSessionRoster).toHaveBeenCalled();
  });

  test("taking attendance marks a player present and saves it", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchGroupSessions.mockResolvedValue([makeGroupSession({ id: "gs1", name: "U14 Nets", dayOfWeek: new Date().getUTCDay(), playerIds: ["p1"] })]);
    fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);
    fetchSessionPacks.mockResolvedValue([makeSessionPack({ playerId: "p1", sessionType: "Net Session", sessionsUsed: 2, totalSessions: 10 })]);
    saveAttendance.mockResolvedValue(undefined);

    render(<AttendanceClient />);
    await user.click(await screen.findByText("U14 Nets"));

    const dateButtons = await screen.findAllByRole("button", { name: /\w{3}/ });
    await user.click(dateButtons.find((b) => b.textContent && /^\d{2} \w{3}$/.test(b.textContent))!);

    expect(await screen.findByText("Alice Bowler")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Present" }));
    await user.click(screen.getByRole("button", { name: "Save Attendance" }));

    expect(saveAttendance).toHaveBeenCalledWith(
      "gs1", expect.any(String), "Net Session", expect.any(String),
      [{ playerId: "p1", status: "Present" }],
    );
  });

  test("collapses a long past-attendance history behind Show all", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchGroupSessions.mockResolvedValue([makeGroupSession({ id: "gs1", name: "U14 Nets", playerIds: [] })]);
    // 18 weekly occurrences, all safely in the past — spaced far enough apart that their
    // formatted labels ("dd Mon yyyy") can never collide with each other.
    const past = Array.from({ length: 18 }, (_, i) => {
      const d = new Date(Date.now() - (i + 1) * 7 * 86400000);
      const date = d.toISOString().split("T")[0];
      const label = new Date(date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      return { id: `o${i}`, date, label };
    });
    fetchPastOccurrences.mockResolvedValue(past.map(({ id, date }) => ({ id, date })));

    render(<AttendanceClient />);
    await user.click(await screen.findByText("U14 Nets"));

    expect(await screen.findByText(`${past[0].label} ✓`)).toBeInTheDocument();
    expect(screen.queryByText(`${past[17].label} ✓`)).not.toBeInTheDocument();
    const showAll = screen.getByRole("button", { name: "Show all 18" });

    await user.click(showAll);
    expect(await screen.findByText(`${past[17].label} ✓`)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show less" }));
    expect(screen.queryByText(`${past[17].label} ✓`)).not.toBeInTheDocument();
  });
});
