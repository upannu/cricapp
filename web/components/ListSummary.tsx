/**
 * The compact "N shown · N total · N pending"-style line every list page's header was missing —
 * one shared renderer so the format (dot-separated, only the parts that actually apply) stays
 * identical everywhere instead of each page building its own string. Pass only the parts that are
 * true for this render — falsy entries are dropped rather than rendered as empty segments.
 */
export function ListSummary({ parts }: { parts: (string | false | null | undefined)[] }) {
  const text = parts.filter((p): p is string => !!p).join(" · ");
  if (!text) return null;
  return <p className="text-zinc-400 text-sm mt-1">{text}</p>;
}
