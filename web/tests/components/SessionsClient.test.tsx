import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionsClient } from "@/components/SessionsClient";
import { makeAuthUser, makePlayer, makeSession } from "../mocks/fixtures";

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

function setupDefaults() {
  useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
  fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);
  fetchCoaches.mockResolvedValue([]);
  fetchAcademies.mockResolvedValue([]);
  fetchActivePlans.mockResolvedValue([]);
  fetchReports.mockResolvedValue([]);
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

    await screen.findByText("Showing 2 of 2 sessions");
    expect(screen.getAllByText("Net Session").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Match Practice").length).toBeGreaterThan(0);
    expect(screen.getByText("125.0 km/h")).toBeInTheDocument(); // avg of 120/130
  });

  test("filtering by session type narrows the list", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchSessions.mockResolvedValue([
      makeSession({ id: "s1", playerId: "p1", type: "Net Session" }),
      makeSession({ id: "s2", playerId: "p1", type: "Match Practice" }),
    ]);

    render(<SessionsClient />);
    await screen.findByText("Showing 2 of 2 sessions");

    await user.selectOptions(screen.getByDisplayValue("All Types"), "Match Practice");

    expect(await screen.findByText("Showing 1 of 2 sessions")).toBeInTheDocument();
    expect(screen.getAllByText("Match Practice").length).toBeGreaterThan(0);
  });

  test("shows a shown/total/this-week summary line under the page title", async () => {
    setupDefaults();
    fetchSessions.mockResolvedValue([
      makeSession({ id: "s1", playerId: "p1" }),
      makeSession({ id: "s2", playerId: "p1" }),
    ]);

    render(<SessionsClient />);
    await screen.findByText("Showing 2 of 2 sessions");

    // Both fixture sessions date back to 2026-01-01 — well outside "this week".
    expect(screen.getByText("2 shown · 2 total · 0 this week")).toBeInTheDocument();
  });

  test("sorting by fastest ball speed reorders the session list", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchSessions.mockResolvedValue([
      makeSession({ id: "s1", playerId: "p1", type: "Net Session", ballSpeedKmh: 100 }),
      makeSession({ id: "s2", playerId: "p1", type: "Match Practice", ballSpeedKmh: 140 }),
    ]);

    render(<SessionsClient />);
    await screen.findByText("Showing 2 of 2 sessions");

    // Per-card speed badges are plain integers ("100 km/h") — excludes the "Avg ball speed" stat
    // card above the list, which always renders with one decimal place ("120.0 km/h").
    const speedOrder = () => screen.getAllByText(/^\d+ km\/h$/).map((el) => el.textContent);
    // Default sort (Newest First) — same date on both, so insertion order is preserved.
    expect(speedOrder()[0]).toBe("100 km/h");

    await user.selectOptions(screen.getByDisplayValue("Sort: Newest First"), "Sort: Fastest Ball Speed");
    expect(speedOrder()[0]).toBe("140 km/h");
  });
});
