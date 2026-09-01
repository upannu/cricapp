import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { ArticleBody } from "@/components/ArticleBody";
import type { Article } from "@/lib/types";

const ARTICLES: Article[] = [
  { id: "a1", stage: "Foundation", orderInStage: 1, title: "Front Knee Brace", readTimeMinutes: 3, keyTakeaways: [], bodyMd: "", published: true },
];

describe("ArticleBody", () => {
  test("renders headings, bold text, and bullet lists", () => {
    const md = ["## Key Point", "This drill builds **front knee** stability.", "", "- Step one", "- Step two"].join("\n");

    render(<ArticleBody bodyMd={md} articles={[]} />);

    expect(screen.getByRole("heading", { name: "Key Point" })).toBeInTheDocument();
    expect(screen.getByText("front knee")).toBeInTheDocument();
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  test("renders ordered lists distinctly from unordered lists", () => {
    render(<ArticleBody bodyMd={["1. First", "2. Second"].join("\n")} articles={[]} />);
    expect(screen.getByRole("list").tagName).toBe("OL");
  });

  test("resolves a [Title](#) reference to a real in-app link when the title matches an article", () => {
    render(<ArticleBody bodyMd="See [Front Knee Brace](#) for more." articles={ARTICLES} />);

    const link = screen.getByRole("link", { name: "Front Knee Brace" });
    expect(link).toHaveAttribute("href", "/portal/learn/a1");
  });

  test("falls back to bold text for an unresolvable reference", () => {
    render(<ArticleBody bodyMd="See [Nonexistent Article](#) for more." articles={ARTICLES} />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Nonexistent Article")).toBeInTheDocument();
  });
});
