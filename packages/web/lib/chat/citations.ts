/**
 * The streaming `chunk.delta` text contains validated `[[NoteId:UUID]]`
 * markers (hallucinated ones are stripped server-side by M09's
 * CitationGuard). This module owns the rendering of those markers as
 * links into the corresponding citation event payloads.
 */
export interface CitationEntry {
  noteId: string;
  title: string;
  rank: number;
}

export type RenderSegment =
  | { kind: "text"; text: string }
  | { kind: "citation"; noteId: string; title: string; rank: number };

// Matches whatever NoteId content the server-side CitationGuard forwarded;
// validation is the guard's job — we just split text + emit links.
const CITATION_RE = /\[\[NoteId:([^\]]+)\]\]/g;

/**
 * Splits a message body into ordered text + citation segments. Citations
 * not present in the lookup table fall through as plain text — they're
 * exceptionally rare since the server-side guard only forwards valid
 * markers, but we treat their absence as a soft failure rather than a
 * 500.
 */
export function splitWithCitations(
  text: string,
  citations: ReadonlyMap<string, CitationEntry>,
): RenderSegment[] {
  const segments: RenderSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(CITATION_RE)) {
    const start = match.index ?? 0;
    const noteId = match[1] ?? "";
    const entry = citations.get(noteId);
    if (entry === undefined) continue;
    if (start > cursor) {
      segments.push({ kind: "text", text: text.slice(cursor, start) });
    }
    segments.push({
      kind: "citation",
      noteId: entry.noteId,
      title: entry.title,
      rank: entry.rank,
    });
    cursor = start + match[0].length;
  }
  if (cursor < text.length) {
    segments.push({ kind: "text", text: text.slice(cursor) });
  }
  return segments;
}
