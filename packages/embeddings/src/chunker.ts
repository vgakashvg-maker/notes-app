/**
 * Chunk a note body into ~500-"token" windows with 50-"token" overlap.
 *
 * We avoid taking a real tokeniser dependency: tiktoken-cl100k-base
 * disagrees with whatever nomic-embed-text actually uses, and a
 * word-based heuristic is good enough for chunk boundary selection.
 * The actual embedding step lives in the Ollama client and operates
 * on whole chunks — token misalignment never causes a bug, only a
 * slightly different boundary.
 *
 * Words = whitespace-separated runs. Punctuation stays glued to its
 * neighbouring word, which matches the way the editor produces text
 * (Markdown converter from M06).
 */

export const DEFAULT_CHUNK_WORDS = 500;
export const DEFAULT_CHUNK_OVERLAP_WORDS = 50;

export interface Chunk {
  readonly index: number;
  readonly text: string;
}

export interface ChunkOptions {
  readonly chunkWords?: number;
  readonly overlapWords?: number;
}

export function chunkText(input: string, opts: ChunkOptions = {}): readonly Chunk[] {
  const chunkSize = opts.chunkWords ?? DEFAULT_CHUNK_WORDS;
  const overlap = opts.overlapWords ?? DEFAULT_CHUNK_OVERLAP_WORDS;
  if (chunkSize <= 0) throw new Error("chunkWords must be > 0");
  if (overlap < 0) throw new Error("overlapWords must be >= 0");
  if (overlap >= chunkSize) throw new Error("overlapWords must be < chunkWords");

  const text = input.trim();
  if (text.length === 0) return [];

  const words = text.split(/\s+/);
  if (words.length === 0) return [];
  if (words.length <= chunkSize) {
    return [{ index: 0, text: words.join(" ") }];
  }

  const chunks: Chunk[] = [];
  const step = chunkSize - overlap;
  for (let start = 0, idx = 0; start < words.length; start += step, idx += 1) {
    const end = Math.min(start + chunkSize, words.length);
    chunks.push({ index: idx, text: words.slice(start, end).join(" ") });
    if (end === words.length) break;
  }
  return chunks;
}

/**
 * Pull plaintext out of the ProseMirror JSON. Mirrors the SQL
 * `extract_plain_from_prosemirror` function in the M04 migration so
 * the editor → embed pipeline agrees with the FTS pipeline.
 */
export function plainTextFromProseMirror(bodyJson: string): string {
  let node: unknown;
  try {
    node = JSON.parse(bodyJson);
  } catch {
    return "";
  }
  const out: string[] = [];
  walk(node, out);
  return out.join(" ").replace(/\s+/g, " ").trim();
}

function walk(value: unknown, out: string[]): void {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walk(item, out);
    return;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.text === "string") out.push(obj.text);
    if (Array.isArray(obj.content)) walk(obj.content, out);
  }
}
