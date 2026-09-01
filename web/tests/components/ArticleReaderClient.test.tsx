import { describe, expect, test, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ArticleReaderClient } from "@/components/ArticleReaderClient";
import { makeAuthUser, makePlayer } from "../mocks/fixtures";
import type { Article } from "@/lib/types";

const { fetchPlayer, fetchArticles, fetchArticleReads, recordArticleRead } = vi.hoisted(() => ({
  fetchPlayer: vi.fn(), fetchArticles: vi.fn(), fetchArticleReads: vi.fn(),
  recordArticleRead: vi.fn(async () => ({ alreadyRead: false, xpAwarded: 0 })),
}));
vi.mock("@/lib/db", () => ({ fetchPlayer, fetchArticles, fetchArticleReads, recordArticleRead }));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

const FOUNDATION_ARTICLE: Article = {
  id: "a1", stage: "Foundation", orderInStage: 1, title: "Front Knee Brace",
  readTimeMinutes: 4, keyTakeaways: [], bodyMd: "## Overview\nBrace the front knee.", published: true,
};
const ELITE_ARTICLE: Article = {
  id: "a2", stage: "Elite", orderInStage: 1, title: "Advanced Seam Position",
  readTimeMinutes: 6, keyTakeaways: [], bodyMd: "Locked content.", published: true,
};

function setupDefaults() {
  useAuth.mockReturnValue({ user: makeAuthUser({ role: "player", playerId: "p1" }) });
  fetchPlayer.mockResolvedValue(makePlayer({ id: "p1" }));
  fetchArticleReads.mockResolvedValue([]);
}

describe("ArticleReaderClient", () => {
  afterEach(() => {
    recordArticleRead.mockClear();
  });

  test("shows 'Article not found' for an unknown id", async () => {
    setupDefaults();
    fetchArticles.mockResolvedValue([]);

    render(<ArticleReaderClient articleId="missing" />);
    expect(await screen.findByText("Article not found")).toBeInTheDocument();
  });

  test("renders a Foundation-stage article (always unlocked) and its body", async () => {
    setupDefaults();
    fetchArticles.mockResolvedValue([FOUNDATION_ARTICLE]);

    render(<ArticleReaderClient articleId="a1" />);

    expect(await screen.findByText("Front Knee Brace")).toBeInTheDocument();
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Brace the front knee.")).toBeInTheDocument();
    expect(recordArticleRead).toHaveBeenCalledWith("p1", FOUNDATION_ARTICLE, [FOUNDATION_ARTICLE]);
  });

  test("shows a locked message for an Elite-stage article on a Free plan", async () => {
    setupDefaults();
    fetchPlayer.mockResolvedValue(makePlayer({ id: "p1", subscription: { plan: "Free", startDate: "2026-01-01", endDate: "2027-01-01", sessionsUsed: 0, sessionsLimit: 4 } }));
    fetchArticles.mockResolvedValue([ELITE_ARTICLE]);

    render(<ArticleReaderClient articleId="a2" />);

    expect(await screen.findByText("Advanced Seam Position is locked")).toBeInTheDocument();
    expect(recordArticleRead).not.toHaveBeenCalled();
  });

  test("shows an XP toast when reading awards XP", async () => {
    setupDefaults();
    fetchArticles.mockResolvedValue([FOUNDATION_ARTICLE]);
    recordArticleRead.mockResolvedValueOnce({ alreadyRead: false, xpAwarded: 25 });

    render(<ArticleReaderClient articleId="a1" />);

    expect(await screen.findByText("⚡ +25 XP earned")).toBeInTheDocument();
  });
});
