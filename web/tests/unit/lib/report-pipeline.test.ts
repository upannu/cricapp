import { describe, expect, test, vi } from "vitest";
import { runReportPipeline } from "@/lib/report-pipeline";
import { makeAcademy, makePlayer, makeSession } from "../../mocks/fixtures";

const { extractPoseSequence } = vi.hoisted(() => ({ extractPoseSequence: vi.fn() }));
vi.mock("@/lib/pose", () => ({ extractPoseSequence }));

const { computeBiomechanics } = vi.hoisted(() => ({ computeBiomechanics: vi.fn() }));
vi.mock("@/lib/biomechanics", () => ({ computeBiomechanics }));

const { renderSkeletonFrame } = vi.hoisted(() => ({ renderSkeletonFrame: vi.fn() }));
vi.mock("@/lib/skeleton-overlay", () => ({ renderSkeletonFrame }));

const { trackBall } = vi.hoisted(() => ({ trackBall: vi.fn() }));
vi.mock("@/lib/ball-tracking", () => ({ trackBall }));

const { renderPitchMap } = vi.hoisted(() => ({ renderPitchMap: vi.fn() }));
vi.mock("@/lib/pitch-map", () => ({ renderPitchMap }));

const { fetchCameraCalibration } = vi.hoisted(() => ({ fetchCameraCalibration: vi.fn() }));
vi.mock("@/lib/db", () => ({ fetchCameraCalibration }));

const originalFetch = global.fetch;

const FRAMES = Array.from({ length: 10 }, (_, i) => ({ tSec: i * 0.1, landmarks: [], worldLandmarks: [] }));
const BIOMECHANICS = {
  phases: { backFootContactSec: 0.1, frontFootContactSec: 0.2, peakLoadSec: null, releaseSec: 0.4, followThroughSec: 0.5 },
  metrics: [], zoneScores: {} as Record<string, number | null>, flags: [], flaggedMetricIds: [],
  overallScore: 80, actionType: "Side-on", injuryRisk: "Low", disclaimer: "",
};

function setupDefaults() {
  extractPoseSequence.mockClear().mockResolvedValue(FRAMES);
  computeBiomechanics.mockClear().mockReturnValue(BIOMECHANICS);
  renderSkeletonFrame.mockClear().mockResolvedValue(new Blob(["x"]));
  trackBall.mockClear().mockResolvedValue({ confidence: "none", speedKmh: null, lengthZone: null, lineApprox: null, note: "not measured" });
  fetchCameraCalibration.mockClear().mockResolvedValue(null);
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }) as unknown as typeof fetch;
}

describe("runReportPipeline", () => {
  test("throws when no analyzable video is on the session", async () => {
    setupDefaults();
    const session = makeSession({ videos: [] });
    const player = makePlayer();

    await expect(runReportPipeline({ session, player, academies: [], onProgress: () => {} }))
      .rejects.toThrow("No analyzable video found on this session.");
  });

  test("throws when too few pose frames are detected", async () => {
    setupDefaults();
    extractPoseSequence.mockResolvedValue(FRAMES.slice(0, 3));
    const session = makeSession({ videos: [{ angle: "side", label: "side.mp4", url: "https://example.test/side.mp4" }] });
    const player = makePlayer();

    await expect(runReportPipeline({ session, player, academies: [], onProgress: () => {} }))
      .rejects.toThrow(/Couldn't confidently detect a bowler/);
  });

  // An independent player with no academy — the case this pipeline was extracted to serve —
  // never triggers a calibration request, and ball tracking still runs with calibration: null.
  test("a player with no academy skips calibration entirely and still runs ball tracking", async () => {
    setupDefaults();
    const requestCalibration = vi.fn();
    const session = makeSession({
      videos: [
        { angle: "side", label: "side.mp4", url: "https://example.test/side.mp4" },
        { angle: "front", label: "front.mp4", url: "https://example.test/front.mp4" },
      ],
    });
    const player = makePlayer({ id: "p1" });

    await runReportPipeline({ session, player, academies: [], onProgress: () => {}, requestCalibration });

    expect(fetchCameraCalibration).not.toHaveBeenCalled();
    expect(requestCalibration).not.toHaveBeenCalled();
    expect(trackBall).toHaveBeenCalledWith("https://example.test/front.mp4", null, expect.any(Function));
  });

  test("a player at an academy with no cached calibration asks the caller for one", async () => {
    setupDefaults();
    const requestCalibration = vi.fn().mockResolvedValue({ id: "cal1" });
    const session = makeSession({
      videos: [{ angle: "front", label: "front.mp4", url: "https://example.test/front.mp4" }],
    });
    const player = makePlayer({ id: "p1" });
    const academy = makeAcademy({ id: "ac1", playerIds: ["p1"] });

    await runReportPipeline({ session, player, academies: [academy], onProgress: () => {}, requestCalibration });

    expect(fetchCameraCalibration).toHaveBeenCalledWith("ac1", "front");
    expect(requestCalibration).toHaveBeenCalledWith("https://example.test/front.mp4", "ac1");
  });

  test("skips ball tracking entirely when there's no front-camera video", async () => {
    setupDefaults();
    const session = makeSession({ videos: [{ angle: "side", label: "side.mp4", url: "https://example.test/side.mp4" }] });
    const player = makePlayer();

    await runReportPipeline({ session, player, academies: [], onProgress: () => {} });

    expect(trackBall).not.toHaveBeenCalled();
  });

  test("posts the computed result to /api/ai-report and resolves on success", async () => {
    setupDefaults();
    const session = makeSession({ id: "s1", playerId: "p1", videos: [{ angle: "side", label: "side.mp4", url: "https://example.test/side.mp4" }] });
    const player = makePlayer({ id: "p1" });

    await runReportPipeline({ session, player, academies: [], onProgress: () => {} });

    expect(global.fetch).toHaveBeenCalledWith("/api/ai-report", expect.objectContaining({ method: "POST" }));
    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body).toMatchObject({ sessionId: "s1", playerId: "p1", angleUsed: "side", useAssessmentCredit: false });
  });

  test("throws with the server's error message when /api/ai-report fails", async () => {
    setupDefaults();
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "AI analysis failed: boom" }) }) as unknown as typeof fetch;
    const session = makeSession({ videos: [{ angle: "side", label: "side.mp4", url: "https://example.test/side.mp4" }] });
    const player = makePlayer();

    await expect(runReportPipeline({ session, player, academies: [], onProgress: () => {} }))
      .rejects.toThrow("AI analysis failed: boom");

    global.fetch = originalFetch;
  });
});
