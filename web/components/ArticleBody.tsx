import Link from "next/link";
import type { Article } from "@/lib/types";

/**
 * Minimal markdown renderer for Academy articles — just the subset the content actually uses
 * (## headings, **bold**, "- " bullet lists, paragraphs, and [text](#) cross-references). Pulling in
 * a full markdown library for headings/bold/lists/links felt like overkill for one fixed content set.
 * Links are resolved against the sibling article list so "Related content" mentions become real
 * in-app navigation instead of dead "#" hrefs.
 */
export function ArticleBody({ bodyMd, articles, linkBase = "/portal/learn" }: { bodyMd: string; articles: Article[]; linkBase?: string }) {
  const titleToId = new Map(articles.map((a) => [a.title.toLowerCase(), a.id]));
  const lines = bodyMd.split("\n");
  const blocks: React.ReactNode[] = [];
  let listItems: string[] = [];
  let listOrdered = false;
  let paragraphLines: string[] = [];

  function flushList() {
    if (listItems.length === 0) return;
    const items = listItems.map((item, i) => <li key={i}>{renderInline(item, titleToId, linkBase)}</li>);
    blocks.push(
      listOrdered ? (
        <ol key={`ol-${blocks.length}`} className="list-decimal pl-5 space-y-1.5 mb-4 text-zinc-300 text-sm leading-relaxed">
          {items}
        </ol>
      ) : (
        <ul key={`ul-${blocks.length}`} className="list-disc pl-5 space-y-1.5 mb-4 text-zinc-300 text-sm leading-relaxed">
          {items}
        </ul>
      )
    );
    listItems = [];
  }

  function flushParagraph() {
    if (paragraphLines.length === 0) return;
    const text = paragraphLines.join(" ").trim();
    if (text) {
      blocks.push(
        <p key={`p-${blocks.length}`} className="mb-4 text-zinc-300 text-sm leading-relaxed">
          {renderInline(text, titleToId, linkBase)}
        </p>
      );
    }
    paragraphLines = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith("## ")) {
      flushList();
      flushParagraph();
      blocks.push(
        <h2 key={`h-${blocks.length}`} className="text-white font-bold text-base mt-6 mb-2 first:mt-0">
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith("- ")) {
      flushParagraph();
      if (listItems.length === 0) listOrdered = false;
      listItems.push(line.slice(2));
    } else if (/^\d+\.\s+/.test(line)) {
      flushParagraph();
      if (listItems.length === 0) listOrdered = true;
      listItems.push(line.replace(/^\d+\.\s+/, ""));
    } else if (line === "") {
      flushList();
      flushParagraph();
    } else {
      flushList();
      paragraphLines.push(line);
    }
  }
  flushList();
  flushParagraph();

  return <div>{blocks}</div>;
}

function renderInline(text: string, titleToId: Map<string, string>, linkBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*(.+?)\*\*)|(\[(.+?)\]\(#\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[2]) {
      nodes.push(<strong key={key++} className="text-white font-semibold">{match[2]}</strong>);
    } else if (match[4]) {
      const id = titleToId.get(match[4].toLowerCase());
      nodes.push(
        id ? (
          <Link key={key++} href={`${linkBase}/${id}`} className="text-pace-green font-semibold hover:underline">
            {match[4]}
          </Link>
        ) : (
          <strong key={key++} className="text-white font-semibold">{match[4]}</strong>
        )
      );
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}
