import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionsClient } from "@/components/SessionsClient";
import { makeAuthUser, makeCoach, makePlayer, makeSession } from "../mocks/fixtures";

// SessionsClient embeds the full video-upload -> pose -> biomechanics pipeline
// behind its "Generate Report" button (extractPoseSequence/computeBiomechanics/
// renderSkeletonFrame/trackBall/renderPitchMap) — per the test plan, that real
// pipeline is exercised only by the @slow E2E spec in Batch 6, on a real fixture
// video. None of these tests click "Generate Report", so the heavy libs below
// are mocked purely defensively (they're not jsdom-safe) rather than exercised.
vi.mock("@/lib/pose", () => ({ extractPoseSequence: vi.fn() }));
vi.mock("@/lib/biomechanics", () => ({ computeBiomechanics: vi.fn() }));
vi.mock("@/lib/skeleton-overlay", () => ({ renderSkeletonFrame: vi.fn() }));
vi.mock("@/lib/ball-tracking", () => ({ trackBall: vi.fn() }));
vi.mock("@/lib/pitch-map", () => ({ renderPitchMap: vi.fn() }));
vi.mock("@/components/CameraCalibrationModal", () => ({ CameraCalibrationModal: () => null }));
vi.mock("@/components/VideoAnnotator", () => ({ VideoAnnotator: () => null }));
vi.mock("@/components/VoiceNoteRecorder", () => ({ VoiceNoteRecorder: () => null }));
vi.mock("@/components/AssessmentForm", () => ({ AssessmentForm: () => null }));

const {
  fetchSessions, fetchPlayers, fetchCoaches, fetchReports, fetchAcademies, fetchActivePlans,
  fetchCameraCalibration, fetchVideoAnnotations, fetchVoiceNotes, fetchAssessments, updateSessionRpe,
} = vi.hoisted(() => ({
  fetchSessions: vi.fn(), fetchPlayers: vi.fn(), fetchCoaches: vi.fn(), fetchReports: vi.fn(),
  fetchAcademies: vi.fn(), fetchActivePlans: vi.fn(), fetchCameraCalibration: vi.fn(),
  fetchVideoAnnotations: vi.fn(), fetchVoiceNotes: vi.fn(), fetchAssessments: vi.fn(), updateSessionRpe: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  fetchSessions, fetchPlayers, fetchCoaches, fetchReports, fetchAcademies, fetchActivePlans,
  fetchCameraCalibration, fetchVideoAnnotations, fetchVoiceNotes, fetchAssessments, updateSessionRpe,
}));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

function setupDefaults() {
  useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
  fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);
  fetchCoaches.mockResolvedValue([]);
  fetchAcademies.mockResolvedValue([]);
  fetchActivePlans.mockResolvedValue([]);
  fetchReports.mockResolvedValue([]);
  // Only fetched once a row is expanded, but mocked unconditionally so any test that expands one
  // doesn't hit an unmocked-fetch crash — see the coach/time test below.
  fetchVideoAnnotations.mockResolvedValue([]);
  fetchVoiceNotes.mockResolvedValue([]);
  fetchAssessments.mockResolvedValue([]);
}

describe("SessionsClient", () => {
  test("renders an empty state with no sessions", async () => {
    setupDefaults();
    fetchSessions.mockResolvedValue([]);

    render(<SessionsClient />);
    expect(await screen.findByText("No sessions match your filters.")).toBeInTheDocument();
  });

  test("renders fetched sessions with computed stats", async () => {
    setupDefaults();
    fetchSessions.mockResolvedValue([
      makeSession({ id: "s1", playerId: "p1", type: "Net Session", ballSpeedKmh: 120 }),
      makeSession({ id: "s2", playerId: "p1", type: "Match Practice", ballSpeedKmh: 130 }),
    ]);

    render(<SessionsClient />);

    await screen.findByText("Showing 1–2 of 2 sessions");
    expect(screen.getAllByText("Net Session").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Match Practice").length).toBeGreaterThan(0);
    expect(screen.getByText("125.0 km/h")).toBeInTheDocument(); // avg of 120/130
  });

  test("shows the coach recorded on the session and its start time / duration", async () => {
    setupDefaults();
    fetchCoaches.mockResolvedValue([makeCoach({ id: "coach1", name: "Coach Dan" })]);
    fetchSessions.mockResolvedValue([
      makeSession({ id: "s1", playerId: "p1", type: "Net Session", coachId: "coach1", time: "16:00", durationMins: 45 }),
    ]);

    const user = userEvent.setup();
    render(<SessionsClient />);
    await screen.findByText("Showing 1–1 of 1 sessions");

    expect(screen.getAllByText(/Coach Dan/).length).toBeGreaterThan(0);

    // Time/duration is only shown in the expanded metrics panel, not the collapsed row.
    await user.click(screen.getByRole("button", { name: /Alice Bowler/ }));
    expect(await screen.findByText(/16:00 · 45 min/)).toBeInTheDocument();
  });

  test("filtering by session type narrows the list", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchSessions.mockResolvedValue([
      makeSession({ id: "s1", playerId: "p1", type: "Net Session" }),
      makeSession({ id: "s2", playerId: "p1", type: "Match Practice" }),
    ]);

    render(<SessionsClient />);
    await screen.findByText("Showing 1–2 of 2 sessions");

    await user.selectOptions(screen.getByDisplayValue("All Types"), "Match Practice");

    expect(await screen.findByText("Showing 1–1 of 1 sessions")).toBeInTheDocument();
    expect(screen.getAllByText("Match Practice").length).toBeGreaterThan(0);
  });

  test("paginates past the first 10 sessions and resets to page 1 on search", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchSessions.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) =>
        makeSession({ id: `s${i}`, playerId: "p1", type: "Net Session", notes: `session-${i}` })
      )
    );

    render(<SessionsClient />);
    await screen.findByText("Showing 1–10 of 12 sessions");
    expect(screen.getByRole("button", { name: "1" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("session-0")).toBeInTheDocument();
    expect(screen.queryByText("session-11")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next →" }));

    expect(await screen.findByText("Showing 11–12 of 12 sessions")).toBeInTheDocument();
    expect(screen.getByText("session-11")).toBeInTheDocument();
    expect(screen.queryByText("session-0")).not.toBeInTheDocument();

    // A new search can land fewer results than the page you were on — search resets to page 1.
    await user.type(screen.getByPlaceholderText("Search player, notes or type…"), "session-11");
    expect(await screen.findByText("Showing 1–1 of 1 sessions")).toBeInTheDocument();
  });

  test("sorting by fastest ball speed reorders the session list", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchSessions.mockResolvedValue([
      makeSession({ id: "s1", playerId: "p1", type: "Net Session", ballSpeedKmh: 100 }),
      makeSession({ id: "s2", playerId: "p1", type: "Match Practice", ballSpeedKmh: 140 }),
    ]);

    render(<SessionsClient />);
    await screen.findByText("Showing 1–2 of 2 sessions");

    // Per-row speed cells are plain integers ("100 km/h") — excludes the "Avg ball speed" stat
    // card above the table, which always renders with one decimal place ("120.0 km/h").
    const speedOrder = () => screen.getAllByText(/^\d+ km\/h$/).map((el) => el.textContent);
    // Default sort (Date, newest first) — same date on both, so insertion order is preserved.
    expect(speedOrder()[0]).toBe("100 km/h");

    // Clicking an inactive column defaults to ascending.
    await user.click(screen.getByRole("button", { name: /Ball Speed/ }));
    expect(speedOrder()[0]).toBe("100 km/h");

    // Clicking the already-active column flips direction.
    await user.click(screen.getByRole("button", { name: /Ball Speed/ }));
    expect(speedOrder()[0]).toBe("140 km/h");
  });

  test("selecting a row shows the bulk action bar with the right count, and Clear deselects everything", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchSessions.mockResolvedValue([makeSession({ id: "s1", playerId: "p1" })]);

    render(<SessionsClient />);
    await screen.findByText("Showing 1–1 of 1 sessions");
    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();

    await user.click(screen.getByTitle("Select for bulk actions"));
    expect(screen.getByText("1 session selected")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
  });

  test("select-all selects every session currently matching the filters/search", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchSessions.mockResolvedValue([
      makeSession({ id: "s1", playerId: "p1" }),
      makeSession({ id: "s2", playerId: "p1" }),
    ]);

    render(<SessionsClient />);
    await screen.findByText("Showing 1–2 of 2 sessions");

    await user.click(screen.getByTitle("Select all"));
    expect(screen.getByText("2 sessions selected")).toBeInTheDocument();

    await user.click(screen.getByTitle("Select all"));
    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
  });

  test("deleting a session from its ⋮ menu removes it after confirming", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchSessions.mockResolvedValue([makeSession({ id: "s1", playerId: "p1", notes: "delete-me" })]);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

    render(<SessionsClient />);
    await screen.findByText("delete-me");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByText("Delete Session"));
    expect(await screen.findByText("Delete this session?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.queryByText("delete-me")).not.toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith("/api/sessions/delete", expect.objectContaining({
      body: JSON.stringify({ sessionId: "s1", playerId: "p1" }),
    }));
  });

  test("bulk delete removes every selected session after confirming", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchSessions.mockResolvedValue([
      makeSession({ id: "s1", playerId: "p1", notes: "first" }),
      makeSession({ id: "s2", playerId: "p1", notes: "second" }),
    ]);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

    render(<SessionsClient />);
    await screen.findByText("Showing 1–2 of 2 sessions");
    await user.click(screen.getByTitle("Select all"));

    await user.click(screen.getByRole("button", { name: "Delete (2)" }));
    expect(await screen.findByText("Delete selected sessions?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.queryByText("Showing 1–2 of 2 sessions")).not.toBeInTheDocument());
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
  });

  test("Export CSV downloads a CSV of the selected sessions", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchSessions.mockResolvedValue([makeSession({ id: "s1", playerId: "p1", notes: "export-me" })]);

    const createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<SessionsClient />);
    await screen.findByText("export-me");
    await user.click(screen.getByTitle("Select for bulk actions"));

    await user.click(screen.getByRole("button", { name: "Export CSV" }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const [blob] = createObjectURL.mock.calls[0];
    const csvText = await (blob as Blob).text();
    expect(csvText).toContain("export-me");
    expect(clickSpy).toHaveBeenCalledTimes(1);

    clickSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  test("the Report column offers Generate for an eligible session with video and no report yet", async () => {
    setupDefaults();
    // Free tier (the fixture default) has no AI report access with no Plan rows configured —
    // needs a paid tier to reach the "Generate" branch rather than "Upgrade".
    fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler", subscription: {
      plan: "Player Pro", startDate: "2026-01-01", endDate: "2027-01-01", sessionsUsed: 0, sessionsLimit: null,
    } })]);
    fetchSessions.mockResolvedValue([
      makeSession({ id: "s1", playerId: "p1", videos: [{ angle: "front", label: "Front", url: "https://example.test/v.mp4" }] }),
    ]);

    render(<SessionsClient />);
    await screen.findByText("Showing 1–1 of 1 sessions");

    expect(screen.getByRole("button", { name: "✨ Generate" })).toBeInTheDocument();
  });

  test("the Report column shows a View link once a report exists for the session", async () => {
    setupDefaults();
    fetchSessions.mockResolvedValue([
      makeSession({ id: "s1", playerId: "p1", videos: [{ angle: "front", label: "Front", url: "https://example.test/v.mp4" }] }),
    ]);
    fetchReports.mockResolvedValue([{ id: "r1", sessionId: "s1", playerId: "p1" }]);

    render(<SessionsClient />);
    await screen.findByText("Showing 1–1 of 1 sessions");

    expect(await screen.findByRole("link", { name: /View/ })).toBeInTheDocument();
  });
});
