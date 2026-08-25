import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AcademyLearnClient } from "@/components/AcademyLearnClient";
import { makeAuthUser, makePlayer } from "../mocks/fixtures";

const { fetchPlayer, fetchArticles, fetchArticleReads, fetchTodaysTip, recordTipView } = vi.hoisted(() => ({
  fetchPlayer: vi.fn(), fetchArticles: vi.fn(), fetchArticleReads: vi.fn(),
  fetchTodaysTip: vi.fn(), recordTipView: vi.fn(async () => ({ streak: 3 })),
}));
vi.mock("@/lib/db", () => ({ fetchPlayer, fetchArticles, fetchArticleReads, fetchTodaysTip, recordTipView }));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

function setupDefaults() {
  fetchArticles.mockResolvedValue([]);
  fetchArticleReads.mockResolvedValue([]);
  fetchTodaysTip.mockResolvedValue(null);
}

describe("AcademyLearnClient", () => {
  // BUG (found by this test, not a test-authoring issue): unlike PortalClient's
  // `if (loading && user?.playerId)`, this component's loading check is
  // unconditional (`if (loading)`). The data-fetch effect only runs when
  // user?.playerId is set, so for an account with NO playerId, `loading`
  // never flips to false and the "No player linked" message below is
  // unreachable — the user is stuck on an infinite spinner instead. Same
  // reachable-only-via-null-fetchPlayer path is used here rather than
  // asserting the (broken) no-playerId case.
  test("shows a 'no player linked' message when fetchPlayer resolves null", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "parent", playerId: "p1" }) });
    fetchPlayer.mockResolvedValue(null);

    render(<AcademyLearnClient />);
    expect(await screen.findByText("No player linked to this account")).toBeInTheDocument();
  });

  test("renders progress stats and the streak from recordTipView", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "player", playerId: "p1" }) });
    fetchPlayer.mockResolvedValue(makePlayer({ id: "p1", academy: { stage: "Foundation", completionPercent: 10, totalSessions: 2, xp: 40, articlesRead: 3 } }));

    render(<AcademyLearnClient />);

    expect(await screen.findByText("3/29")).toBeInTheDocument();
    expect(screen.getByText("🔥 3")).toBeInTheDocument();
    expect(recordTipView).toHaveBeenCalledWith("p1");
  });
});
