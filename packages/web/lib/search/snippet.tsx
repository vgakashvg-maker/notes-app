import { Fragment, type ReactElement, type ReactNode } from "react";

/**
 * BUG-013 — search snippets arrive as a string that may contain
 * `<mark>` highlight tags around match terms, but the surrounding
 * content is user-controlled (note title / body fragments). Rendering
 * via `dangerouslySetInnerHTML` lets a note title with `<script>`
 * payload execute when anyone searches. This renderer treats only
 * `<mark>` as a structural element; everything else is rendered as
 * React children, which React HTML-escapes automatically.
 *
 * Why not DOMPurify: it'd be a new client dep + still has a
 * configuration surface area. A single-purpose parser is ~15 lines
 * and provably allows nothing else through.
 */

const MARK_RE = /<mark>([\s\S]*?)<\/mark>/g;

export function renderSnippet(snippet: string): ReactNode[] {
  const out: ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  for (const match of snippet.matchAll(MARK_RE)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      out.push(<Fragment key={key++}>{snippet.slice(cursor, start)}</Fragment>);
    }
    out.push(<mark key={key++}>{match[1] ?? ""}</mark>);
    cursor = start + match[0].length;
  }
  if (cursor < snippet.length) {
    out.push(<Fragment key={key++}>{snippet.slice(cursor)}</Fragment>);
  }
  return out;
}

export function SnippetText({
  snippet,
  className,
}: {
  snippet: string;
  className?: string;
}): ReactElement {
  return <p className={className}>{renderSnippet(snippet)}</p>;
}
