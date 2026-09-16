import { describe, expect, test, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AttendanceClient } from "@/components/AttendanceClient";
import { makeAuthUser, makeAcademy, makeCoach, makeGroupSession, makePlayer, makeSessionPack } from "../mocks/fixtures";

const {
  fetchGroupSessions, upsertGroupSession, setGroupSessionRoster,
  fetchPlayers, fetchCoaches, fetchAcademies, fetchSessionPacks, fetchPastOccurrences,
  fetchAttendanceForDate, fetchOccurrenceNotes, saveAttendance, cancelOccurrence,
  fetchGroupSessionVideos, insertGroupSessionVideo, deleteGroupSessionVideo, tagPlayerInVideo, deleteVideoTag,
} = vi.hoisted(() => ({
  fetchGroupSessions: vi.fn(),
  upsertGroupSession: vi.fn(),
  setGroupSessionRoster: vi.fn(),
  fetchPlayers: vi.fn(),
  fetchCoaches: vi.fn(),
  fetchAcademies: vi.fn(),
  fetchSessionPacks: vi.fn(),
  fetchPastOccurrences: vi.fn(),
  fetchAttendanceForDate: vi.fn(),
  fetchOccurrenceNotes: vi.fn(),
  saveAttendance: vi.fn(),
  cancelOccurrence: vi.fn(),
  fetchGroupSessionVideos: vi.fn(),
  insertGroupSessionVideo: vi.fn(),
  deleteGroupSessionVideo: vi.fn(),
  tagPlayerInVideo: vi.fn(),
  deleteVideoTag: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  fetchGroupSessions, upsertGroupSession, setGroupSessionRoster,
  fetchPlayers, fetchCoaches, fetchAcademies, fetchSessionPacks, fetchPastOccurrences,
  fetchAttendanceForDate, fetchOccurrenceNotes, saveAttendance, cancelOccurrence,
  fetchGroupSessionVideos, insertGroupSessionVideo, deleteGroupSessionVideo, tagPlayerInVideo, deleteVideoTag,
}));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

const { uploadGroupSessionVideo } = vi.hoisted(() => ({ uploadGroupSessionVideo: vi.fn() }));
vi.mock("@/lib/group-session-video-upload", () => ({ uploadGroupSessionVideo }));

function setupDefaults() {
  useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
  fetchGroupSessions.mockResolvedValue([]);
  fetchPlayers.mockResolvedValue([]);
  fetchCoaches.mockResolvedValue([makeCoach({ id: "coach-1", name: "Coach Dan" })]);
  fetchAcademies.mockResolvedValue([]);
  fetchPastOccurrences.mockResolvedValue([]);
  fetchAttendanceForDate.mockResolvedValue([]);
  fetchOccurrenceNotes.mockResolvedValue(null);
  fetchSessionPacks.mockResolvedValue([]);
  cancelOccurrence.mockClear().mockResolvedValue(undefined);
  fetchGroupSessionVideos.mockResolvedValue([]);
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

    expect(upsertGroupSession).toHaveBeenCalledWith(expect.objectContaining({ name: "U16 Friday Nets", coach_id: "coach-1", session_type: "Net Session" }));
    expect(setGroupSessionRoster).toHaveBeenCalled();
  });

  // A Group Session's roster is funded by Session Packs, and every pack is a Net Session pack —
  // offering other types here was a dead end (no matching pack could ever be created).
  test("the Group Session type picker only offers Net Session", async () => {
    const user = userEvent.setup();
    setupDefaults();

    render(<AttendanceClient />);
    await user.click(await screen.findByRole("button", { name: "+ New Group" }));

    const typeSelect = screen.getByDisplayValue("Net Session");
    expect([...typeSelect.querySelectorAll("option")].map((o) => o.textContent)).toEqual(["Net Session"]);
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

    await screen.findAllByText("Upcoming");
    const dateRow = screen.getAllByText("Upcoming")[0].closest("tr")!;
    await user.click(dateRow);

    expect(await screen.findByText("Alice Bowler")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Present" }));
    await user.click(screen.getByRole("button", { name: "Save Attendance" }));

    expect(saveAttendance).toHaveBeenCalledWith(
      "gs1", expect.any(String), "Net Session", expect.any(String),
      [{ playerId: "p1", status: "Present" }], "manual", "",
    );
  });

  test("writing a session note saves it alongside attendance, in the same action", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchGroupSessions.mockResolvedValue([makeGroupSession({ id: "gs1", name: "U14 Nets", dayOfWeek: new Date().getUTCDay(), playerIds: ["p1"] })]);
    fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);
    saveAttendance.mockResolvedValue(undefined);

    render(<AttendanceClient />);
    await user.click(await screen.findByText("U14 Nets"));
    await screen.findAllByText("Upcoming");
    const dateRow = screen.getAllByText("Upcoming")[0].closest("tr")!;
    await user.click(dateRow);

    expect(await screen.findByText("Alice Bowler")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/Death bowling/), "Focus on death bowling execution");
    await user.click(screen.getByRole("button", { name: "Save Attendance" }));

    expect(saveAttendance).toHaveBeenCalledWith(
      "gs1", expect.any(String), "Net Session", expect.any(String),
      [{ playerId: "p1", status: "Absent" }], "manual", "Focus on death bowling execution",
    );
  });

  test("opening attendance for a date with an existing note pre-fills it", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchGroupSessions.mockResolvedValue([makeGroupSession({ id: "gs1", name: "U14 Nets", dayOfWeek: new Date().getUTCDay(), playerIds: ["p1"] })]);
    fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);
    fetchOccurrenceNotes.mockResolvedValue("Great intensity today, work on yorkers next.");

    render(<AttendanceClient />);
    await user.click(await screen.findByText("U14 Nets"));
    await screen.findAllByText("Upcoming");
    const dateRow = screen.getAllByText("Upcoming")[0].closest("tr")!;
    await user.click(dateRow);

    expect(await screen.findByDisplayValue("Great intensity today, work on yorkers next.")).toBeInTheDocument();
  });

  function dateCellLabel(dateStr: string): string {
    return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  }

  test("a session row with saved notes shows a notes indicator in its own column", async () => {
    setupDefaults();
    fetchGroupSessions.mockResolvedValue([makeGroupSession({ id: "gs1", name: "U14 Nets", playerIds: [] })]);
    fetchPastOccurrences.mockResolvedValue([
      { id: "o1", date: "2026-08-04", status: "recorded", hasNotes: true },
      { id: "o2", date: "2026-08-11", status: "recorded", hasNotes: false },
    ]);

    render(<AttendanceClient />);
    await userEvent.setup().click(await screen.findByText("U14 Nets"));

    const notedRow = (await screen.findByText(dateCellLabel("2026-08-04"))).closest("tr")!;
    const plainRow = screen.getByText(dateCellLabel("2026-08-11")).closest("tr")!;
    expect(within(notedRow).getByText("📝")).toBeInTheDocument();
    expect(within(plainRow).getByText("—")).toBeInTheDocument();
  });

  test("collapses a long past-attendance history behind Show all", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchGroupSessions.mockResolvedValue([makeGroupSession({ id: "gs1", name: "U14 Nets", playerIds: [] })]);
    // 18 weekly occurrences, all safely in the past — spaced far enough apart that their
    // formatted labels ("Weekday, dd Mon yyyy") can never collide with each other.
    const past = Array.from({ length: 18 }, (_, i) => {
      const d = new Date(Date.now() - (i + 1) * 7 * 86400000);
      const date = d.toISOString().split("T")[0];
      return { id: `o${i}`, date, label: dateCellLabel(date) };
    });
    fetchPastOccurrences.mockResolvedValue(past.map(({ id, date }) => ({ id, date, status: "recorded" })));

    render(<AttendanceClient />);
    await user.click(await screen.findByText("U14 Nets"));

    expect(await screen.findByText(past[0].label)).toBeInTheDocument();
    expect(screen.queryByText(past[17].label)).not.toBeInTheDocument();
    const showAll = screen.getByRole("button", { name: "Show all 18 past dates" });

    await user.click(showAll);
    expect(await screen.findByText(past[17].label)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show less" }));
    expect(screen.queryByText(past[17].label)).not.toBeInTheDocument();
  });

  test("a canceled session's row is visually distinct from a normally-recorded one", async () => {
    setupDefaults();
    fetchGroupSessions.mockResolvedValue([makeGroupSession({ id: "gs1", name: "U14 Nets", playerIds: [] })]);
    const recordedDate = "2026-08-04";
    const canceledDate = "2026-08-11";
    fetchPastOccurrences.mockResolvedValue([
      { id: "o1", date: recordedDate, status: "recorded" },
      { id: "o2", date: canceledDate, status: "canceled" },
    ]);

    render(<AttendanceClient />);
    await userEvent.setup().click(await screen.findByText("U14 Nets"));

    const recordedRow = (await screen.findByText(dateCellLabel(recordedDate))).closest("tr")!;
    const canceledRow = screen.getByText(dateCellLabel(canceledDate)).closest("tr")!;
    const recordedBadge = within(recordedRow).getByText("✓ Recorded");
    const canceledBadge = within(canceledRow).getByText("⊘ Canceled");
    expect(recordedBadge).toHaveClass("text-pace-green");
    expect(canceledBadge).toHaveClass("text-amber");
    expect(canceledBadge).not.toHaveClass("text-pace-green");
  });

  test("rejecting a roster-add for a player with no membership offers a 'Create a membership' shortcut to that player", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);
    fetchSessionPacks.mockResolvedValue([]); // no active membership for anyone

    render(<AttendanceClient />);
    await user.click(await screen.findByRole("button", { name: "+ New Group" }));

    await user.click(screen.getByRole("button", { name: /Alice Bowler/ }));

    expect(screen.getByText(/Alice Bowler has no active membership/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Create a membership/ });
    expect(link).toHaveAttribute("href", "/session-packs?playerId=p1");
  });

  test("attributes a CSV-imported attendance record as csv-import, distinct from a manual mark", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchGroupSessions.mockResolvedValue([makeGroupSession({ id: "gs1", name: "U14 Nets", playerIds: ["p1"] })]);
    fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler", email: "alice@example.com" })]);
    saveAttendance.mockResolvedValue(undefined);

    render(<AttendanceClient />);
    await user.click(await screen.findByText("U14 Nets")); // expand the group
    await user.click(await screen.findByRole("button", { name: "Import Attendance CSV" }));

    const csv = "date,player,status\n2026-01-06,Alice Bowler,Present\n";
    const file = new File([csv], "attendance.csv", { type: "text/csv" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);

    await user.click(await screen.findByRole("button", { name: "Import 1 Record" }));

    expect(saveAttendance).toHaveBeenCalledWith(
      "gs1", "2026-01-06", "Net Session", "academy-1",
      [{ playerId: "p1", status: "Present" }], "csv-import",
    );
  });

  test("searches groups by name", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchGroupSessions.mockResolvedValue([
      makeGroupSession({ id: "gs1", name: "U14 Tuesday Nets", dayOfWeek: 2 }),
      makeGroupSession({ id: "gs2", name: "U16 Friday Nets", dayOfWeek: 4 }),
    ]);

    render(<AttendanceClient />);
    await screen.findByText("U14 Tuesday Nets");

    await user.type(screen.getByPlaceholderText("Search groups by name…"), "Friday");
    expect(await screen.findByText("U16 Friday Nets")).toBeInTheDocument();
    expect(screen.queryByText("U14 Tuesday Nets")).not.toBeInTheDocument();
  });

  // Lets an academy pre-create several squad training sessions (e.g. one per age group) in one
  // upload instead of the New Group form one at a time.
  test("bulk-imports group sessions from a CSV, resolving each row's academy from its matched coach", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoaches.mockResolvedValue([
      makeCoach({ id: "coach-1", name: "Coach Dan", email: "dan@example.com", academyId: "academy-1" }),
      makeCoach({ id: "coach-2", name: "Jane Coach", email: "jane@example.com", academyId: "academy-2" }),
    ]);
    upsertGroupSession.mockResolvedValue(undefined);

    render(<AttendanceClient />);
    await user.click(await screen.findByRole("button", { name: "Bulk Import Groups" }));

    const csv = "name,dayOfWeek,time,coach,location,durationMins\n"
      + "U14 Tuesday Nets,Tuesday,16:00,dan@example.com,Main Oval,60\n"
      + "U13 Thursday Nets,Thu,17:00,Jane Coach,,45\n";
    const file = new File([csv], "groups.csv", { type: "text/csv" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);

    await user.click(await screen.findByRole("button", { name: "Create 2 Groups" }));

    expect(upsertGroupSession).toHaveBeenCalledWith(expect.objectContaining({
      academy_id: "academy-1", coach_id: "coach-1", name: "U14 Tuesday Nets",
      session_type: "Net Session", day_of_week: 2, time: "16:00",
      duration_mins: 60, location: "Main Oval", active: true,
    }));
    expect(upsertGroupSession).toHaveBeenCalledWith(expect.objectContaining({
      academy_id: "academy-2", coach_id: "coach-2", name: "U13 Thursday Nets",
      day_of_week: 4, time: "17:00", duration_mins: 45, location: null,
    }));
    expect(await screen.findByText(/Created 2 group sessions/)).toBeInTheDocument();
    expect(await screen.findByText("U14 Tuesday Nets")).toBeInTheDocument();
    expect(screen.getByText("U13 Thursday Nets")).toBeInTheDocument();
  });

  test("flags an unmatched coach and an invalid day without blocking the rest of the file", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoaches.mockResolvedValue([makeCoach({ id: "coach-1", name: "Coach Dan", academyId: "academy-1" })]);

    render(<AttendanceClient />);
    await user.click(await screen.findByRole("button", { name: "Bulk Import Groups" }));

    const csv = "name,dayOfWeek,time,coach\n"
      + "U14 Tuesday Nets,Tuesday,16:00,Coach Dan\n"
      + "Unknown Coach Session,Tuesday,16:00,Nobody\n"
      + "Bad Day Session,Notaday,16:00,Coach Dan\n";
    const file = new File([csv], "groups.csv", { type: "text/csv" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);

    expect(await screen.findByText("Coach not found")).toBeInTheDocument();
    expect(screen.getByText(/Invalid day/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create 1 Group" })).toBeInTheDocument();
  });

  // The coach is away and the session never happened — nobody should be charged, unlike marking
  // everyone Absent (which would draw down a session per player).
  test("cancels a session for the whole roster after confirming, and closes the modal", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchGroupSessions.mockResolvedValue([makeGroupSession({ id: "gs1", name: "U14 Nets", dayOfWeek: new Date().getUTCDay(), playerIds: ["p1", "p2"] })]);
    fetchPlayers.mockResolvedValue([
      makePlayer({ id: "p1", name: "Alice Bowler" }),
      makePlayer({ id: "p2", name: "Bob Seamer" }),
    ]);

    render(<AttendanceClient />);
    await user.click(await screen.findByText("U14 Nets"));
    await screen.findAllByText("Upcoming");
    const dateRow = screen.getAllByText("Upcoming")[0].closest("tr")!;
    await user.click(dateRow);
    await screen.findByText("Alice Bowler");

    await user.click(screen.getByRole("button", { name: "Cancel Session (coach unavailable)" }));
    expect(screen.getByText(/Cancel this session for all 2 players\?/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Yes, cancel session" }));

    expect(cancelOccurrence).toHaveBeenCalledWith("gs1", expect.any(String), ["p1", "p2"]);
    expect(screen.queryByText("Alice Bowler")).not.toBeInTheDocument();
  });

  test("backing out of the cancel confirmation leaves the session untouched", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchGroupSessions.mockResolvedValue([makeGroupSession({ id: "gs1", name: "U14 Nets", dayOfWeek: new Date().getUTCDay(), playerIds: ["p1"] })]);
    fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);

    render(<AttendanceClient />);
    await user.click(await screen.findByText("U14 Nets"));
    await screen.findAllByText("Upcoming");
    const dateRow = screen.getAllByText("Upcoming")[0].closest("tr")!;
    await user.click(dateRow);
    await screen.findByText("Alice Bowler");

    await user.click(screen.getByRole("button", { name: "Cancel Session (coach unavailable)" }));
    await user.click(screen.getByRole("button", { name: "Never mind" }));

    expect(screen.queryByText(/Cancel this session for all/)).not.toBeInTheDocument();
    expect(cancelOccurrence).not.toHaveBeenCalled();
    expect(screen.getByText("Alice Bowler")).toBeInTheDocument();
  });

  // Session Recordings — only visible at all when the group's academy has opted in.
  test("Session Recordings is hidden for an academy that hasn't opted in to video sharing", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchGroupSessions.mockResolvedValue([makeGroupSession({ id: "gs1", name: "U14 Nets", academyId: "ac1", dayOfWeek: new Date().getUTCDay(), playerIds: ["p1"] })]);
    fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "ac1", squadVideoSharingEnabled: false })]);

    render(<AttendanceClient />);
    await user.click(await screen.findByText("U14 Nets"));
    await screen.findAllByText("Upcoming");
    await user.click(screen.getAllByText("Upcoming")[0].closest("tr")!);
    await screen.findByText("Alice Bowler");

    expect(screen.queryByText("Session Recordings")).not.toBeInTheDocument();
    expect(fetchGroupSessionVideos).not.toHaveBeenCalled();
  });

  test("Session Recordings is visible and lists existing videos for an opted-in academy", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchGroupSessions.mockResolvedValue([makeGroupSession({ id: "gs1", name: "U14 Nets", academyId: "ac1", dayOfWeek: new Date().getUTCDay(), playerIds: ["p1"] })]);
    fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "ac1", squadVideoSharingEnabled: true })]);
    fetchGroupSessionVideos.mockResolvedValue([{
      id: "v1", occurrenceId: "o1", uploadedBy: "coach-1", videoUrl: "https://example.com/clip.mp4",
      angle: null, durationSec: 120, width: 1920, height: 1080, createdAt: "2026-01-01T00:00:00Z",
      tags: [{ id: "t1", videoId: "v1", playerId: "p1", timestampSec: 12, note: "Good yorker", taggedBy: "coach-1", createdAt: "2026-01-01T00:00:00Z" }],
    }]);

    render(<AttendanceClient />);
    await user.click(await screen.findByText("U14 Nets"));
    await screen.findAllByText("Upcoming");
    await user.click(screen.getAllByText("Upcoming")[0].closest("tr")!);
    await screen.findByRole("button", { name: "Present" }); // modal open

    expect(await screen.findByText("Session Recordings")).toBeInTheDocument();
    expect(screen.getAllByText(/Alice Bowler/).length).toBeGreaterThan(0);
    expect(screen.getByText(/at 0:12/)).toBeInTheDocument();
    expect(screen.getByText(/Good yorker/)).toBeInTheDocument();
  });

  test("uploading a video calls uploadGroupSessionVideo and insertGroupSessionVideo for the open date", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchGroupSessions.mockResolvedValue([makeGroupSession({ id: "gs1", name: "U14 Nets", academyId: "ac1", dayOfWeek: new Date().getUTCDay(), playerIds: ["p1"] })]);
    fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "ac1", squadVideoSharingEnabled: true })]);
    uploadGroupSessionVideo.mockResolvedValue({ videoUrl: "https://example.com/clip.mp4", durationSec: 60, width: 1280, height: 720 });
    insertGroupSessionVideo.mockResolvedValue({
      id: "v1", occurrenceId: "o1", uploadedBy: "user-1", videoUrl: "https://example.com/clip.mp4",
      angle: null, durationSec: 60, width: 1280, height: 720, createdAt: "2026-01-01T00:00:00Z",
    });

    render(<AttendanceClient />);
    await user.click(await screen.findByText("U14 Nets"));
    await screen.findAllByText("Upcoming");
    await user.click(screen.getAllByText("Upcoming")[0].closest("tr")!);
    await screen.findByText("Alice Bowler");
    await screen.findByText("Session Recordings");

    const file = new File(["clip"], "clip.mp4", { type: "video/mp4" });
    const fileInput = document.querySelector('input[type="file"][accept*="video"]') as HTMLInputElement;
    await user.upload(fileInput, file);

    expect(uploadGroupSessionVideo).toHaveBeenCalledWith(expect.objectContaining({ file, groupSessionId: "gs1" }));
    expect(await screen.findByText("+ Tag a player at current time")).toBeInTheDocument();
    expect(insertGroupSessionVideo).toHaveBeenCalledWith("gs1", expect.any(String), expect.objectContaining({
      videoUrl: "https://example.com/clip.mp4", durationSec: 60, width: 1280, height: 720,
    }));
  });

  test("tagging a player in a video calls tagPlayerInVideo and shows the new tag", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchGroupSessions.mockResolvedValue([makeGroupSession({ id: "gs1", name: "U14 Nets", academyId: "ac1", dayOfWeek: new Date().getUTCDay(), playerIds: ["p1"] })]);
    fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "ac1", squadVideoSharingEnabled: true })]);
    fetchGroupSessionVideos.mockResolvedValue([{
      id: "v1", occurrenceId: "o1", uploadedBy: "coach-1", videoUrl: "https://example.com/clip.mp4",
      angle: null, durationSec: 120, width: 1920, height: 1080, createdAt: "2026-01-01T00:00:00Z", tags: [],
    }]);
    tagPlayerInVideo.mockResolvedValue({
      id: "t1", videoId: "v1", playerId: "p1", timestampSec: 0, note: "Nice line", taggedBy: "user-1", createdAt: "2026-01-01T00:00:00Z",
    });

    render(<AttendanceClient />);
    await user.click(await screen.findByText("U14 Nets"));
    await screen.findAllByText("Upcoming");
    await user.click(screen.getAllByText("Upcoming")[0].closest("tr")!);
    await screen.findByText("Session Recordings");

    await user.click(await screen.findByText("+ Tag a player at current time"));
    await user.selectOptions(screen.getByRole("combobox"), "p1");
    await user.type(screen.getByPlaceholderText("Optional note"), "Nice line");
    await user.click(screen.getByRole("button", { name: "Save Tag" }));

    expect(tagPlayerInVideo).toHaveBeenCalledWith("v1", "p1", expect.any(Number), "Nice line", expect.any(String));
    expect(await screen.findByText(/Nice line/)).toBeInTheDocument();
  });

  test("deleting a video calls deleteGroupSessionVideo and removes it from the list", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchGroupSessions.mockResolvedValue([makeGroupSession({ id: "gs1", name: "U14 Nets", academyId: "ac1", dayOfWeek: new Date().getUTCDay(), playerIds: ["p1"] })]);
    fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "ac1", squadVideoSharingEnabled: true })]);
    fetchGroupSessionVideos.mockResolvedValue([{
      id: "v1", occurrenceId: "o1", uploadedBy: "coach-1", videoUrl: "https://example.com/clip.mp4",
      angle: null, durationSec: 120, width: 1920, height: 1080, createdAt: "2026-01-01T00:00:00Z", tags: [],
    }]);
    deleteGroupSessionVideo.mockResolvedValue(undefined);

    render(<AttendanceClient />);
    await user.click(await screen.findByText("U14 Nets"));
    await screen.findAllByText("Upcoming");
    await user.click(screen.getAllByText("Upcoming")[0].closest("tr")!);
    await screen.findByText("Session Recordings");

    await user.click(await screen.findByText("Delete video"));

    expect(deleteGroupSessionVideo).toHaveBeenCalledWith("v1");
    await waitFor(() => expect(screen.queryByText("Delete video")).not.toBeInTheDocument());
    expect(screen.getByText("No recordings for this date yet.")).toBeInTheDocument();
  });
});
