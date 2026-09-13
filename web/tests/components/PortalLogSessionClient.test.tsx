import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PortalLogSessionClient } from "@/components/PortalLogSessionClient";
import { makeAuthUser, makePlayer } from "../mocks/fixtures";

const { fetchPlayer, fetchAcademies } = vi.hoisted(() => ({ fetchPlayer: vi.fn(), fetchAcademies: vi.fn() }));
vi.mock("@/lib/db", () => ({ fetchPlayer, fetchAcademies }));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const { probeVideoQuality } = vi.hoisted(() => ({ probeVideoQuality: vi.fn() }));
vi.mock("@/lib/video-quality", () => ({
  probeVideoQuality, MIN_LONG_EDGE_PX: 1920, MIN_SHORT_EDGE_PX: 1080, MIN_FPS: 30,
}));

const { uploadSessionVideo } = vi.hoisted(() => ({ uploadSessionVideo: vi.fn() }));
vi.mock("@/lib/session-video-upload", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/session-video-upload")>();
  return { ...actual, uploadSessionVideo };
});

const { runReportPipeline } = vi.hoisted(() => ({ runReportPipeline: vi.fn() }));
vi.mock("@/lib/report-pipeline", () => ({ runReportPipeline }));

const originalFetch = global.fetch;

function setupDefaults() {
  useAuth.mockReturnValue({ user: makeAuthUser({ role: "player", playerId: "p1" }) });
  fetchPlayer.mockResolvedValue(makePlayer({ id: "p1", name: "Alice Bowler" }));
  fetchAcademies.mockResolvedValue([]);
  probeVideoQuality.mockClear().mockResolvedValue({ width: 1920, height: 1080, durationSec: 4, fps: 30, meetsResolution: true, meetsFps: true });
  uploadSessionVideo.mockClear().mockResolvedValue({ angle: "side", label: "clip.mp4", url: "https://example.test/clip.mp4" });
  runReportPipeline.mockClear().mockResolvedValue(undefined);
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, sessionId: "self_1", xpEarned: 70, selfLogRemaining: 3 }) }) as unknown as typeof fetch;
}

async function selectSideAngle(user: ReturnType<typeof userEvent.setup>) {
  const file = new File(["x"], "clip.mp4", { type: "video/mp4" });
  const sideCard = screen.getByText("Side Camera").closest("div")!.parentElement!;
  const input = sideCard.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(input, file);
  await screen.findByText(/Uploaded|clip\.mp4/);
}

describe("PortalLogSessionClient", () => {
  test("shows 'no player linked' for an account with no playerId", () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "player", playerId: undefined }) });

    render(<PortalLogSessionClient />);
    expect(screen.getByText("No player linked to this account")).toBeInTheDocument();
  });

  test("renders the three camera angle pickers once loaded", async () => {
    setupDefaults();
    render(<PortalLogSessionClient />);

    expect(await screen.findByText("Front Camera")).toBeInTheDocument();
    expect(screen.getByText("Side Camera")).toBeInTheDocument();
    expect(screen.getByText("Back Camera")).toBeInTheDocument();
  });

  test("blocks submitting with no video selected", async () => {
    const user = userEvent.setup();
    setupDefaults();
    render(<PortalLogSessionClient />);
    await screen.findByText("Side Camera");

    await user.click(screen.getByRole("button", { name: "Save Session" }));

    expect(screen.getByText("Select at least one camera angle.")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("uploads the selected angle, saves the session, runs the report pipeline, and shows the result", async () => {
    const user = userEvent.setup();
    setupDefaults();
    render(<PortalLogSessionClient />);
    await screen.findByText("Side Camera");

    await selectSideAngle(user);
    await user.click(screen.getByRole("button", { name: "Save Session" }));

    expect(await screen.findByText("Session saved")).toBeInTheDocument();
    expect(uploadSessionVideo).toHaveBeenCalledWith(expect.objectContaining({ playerId: "p1", angle: "side" }));
    expect(global.fetch).toHaveBeenCalledWith("/api/portal/log-session", expect.objectContaining({ method: "POST" }));
    expect(runReportPipeline).toHaveBeenCalled();
    expect(screen.getByText(/70 XP/)).toBeInTheDocument();
    expect(screen.getByText(/3 self-logged sessions left/)).toBeInTheDocument();
    expect(screen.getByText(/AI biomechanics report is ready/)).toBeInTheDocument();
  });

  test("still shows the session as saved when report generation fails, with a warning instead", async () => {
    const user = userEvent.setup();
    setupDefaults();
    runReportPipeline.mockRejectedValue(new Error("Couldn't detect a bowler in this clip."));
    render(<PortalLogSessionClient />);
    await screen.findByText("Side Camera");

    await selectSideAngle(user);
    await user.click(screen.getByRole("button", { name: "Save Session" }));

    expect(await screen.findByText("Session saved")).toBeInTheDocument();
    expect(screen.getByText(/did not complete: Couldn't detect a bowler in this clip\./)).toBeInTheDocument();
  });

  test("surfaces the server's error (e.g. the self-log limit reached) without running the report pipeline", async () => {
    const user = userEvent.setup();
    setupDefaults();
    global.fetch = vi.fn().mockResolvedValue({
      ok: false, json: async () => ({ error: "You've used all 4 of your self-logged sessions this month." }),
    }) as unknown as typeof fetch;
    render(<PortalLogSessionClient />);
    await screen.findByText("Side Camera");

    await selectSideAngle(user);
    await user.click(screen.getByRole("button", { name: "Save Session" }));

    expect(await screen.findByText("You've used all 4 of your self-logged sessions this month.")).toBeInTheDocument();
    expect(runReportPipeline).not.toHaveBeenCalled();
    expect(screen.queryByText("Session saved")).not.toBeInTheDocument();

    global.fetch = originalFetch;
  });
});
