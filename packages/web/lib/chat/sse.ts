/**
 * SSE event stream from `ai/chat`. Mirrors the event shapes emitted by
 * `supabase/functions/ai/chat/index.ts`.
 */
export type ChatEvent =
  | { kind: "chunk"; delta: string }
  | { kind: "citation"; noteId: string; title: string; chunkIndex: number; rank: number }
  | { kind: "warning"; message: string }
  | { kind: "done"; conversationId: string; tokens: number; model: string; latencyMs: number }
  | { kind: "error"; message: string };

/**
 * Stateful parser for a Server-Sent Events stream. Feed it raw text chunks
 * from a `ReadableStream` reader; it yields any complete events and holds
 * onto the remainder until the next call. Survives chunks that split
 * mid-event (network framing has no obligation to align with `\n\n`).
 */
export class SseParser {
  private buffer = "";

  feed(text: string): ChatEvent[] {
    this.buffer += text;
    const events: ChatEvent[] = [];
    let separatorIdx = this.buffer.indexOf("\n\n");
    while (separatorIdx !== -1) {
      const raw = this.buffer.slice(0, separatorIdx);
      this.buffer = this.buffer.slice(separatorIdx + 2);
      const parsed = parseFrame(raw);
      if (parsed !== null) events.push(parsed);
      separatorIdx = this.buffer.indexOf("\n\n");
    }
    return events;
  }

  /**
   * Flushes any trailing event the stream finished without a terminating
   * blank line. SSE servers should always emit `\n\n`, but defensive flushes
   * keep us robust against broken intermediaries.
   */
  flush(): ChatEvent[] {
    const remainder = this.buffer.trim();
    this.buffer = "";
    if (remainder.length === 0) return [];
    const parsed = parseFrame(remainder);
    return parsed === null ? [] : [parsed];
  }
}

function parseFrame(raw: string): ChatEvent | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith(":")) continue; // comment
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trim());
    }
  }
  if (dataLines.length === 0) return null;
  const dataStr = dataLines.join("\n");
  let data: unknown;
  try {
    data = JSON.parse(dataStr);
  } catch {
    return null;
  }
  return toChatEvent(event, data);
}

function toChatEvent(event: string, data: unknown): ChatEvent | null {
  if (typeof data !== "object" || data === null) return null;
  const obj = data as Record<string, unknown>;
  switch (event) {
    case "chunk":
      if (typeof obj.delta !== "string") return null;
      return { kind: "chunk", delta: obj.delta };
    case "citation":
      if (
        typeof obj.noteId !== "string" ||
        typeof obj.title !== "string" ||
        typeof obj.chunkIndex !== "number" ||
        typeof obj.rank !== "number"
      ) {
        return null;
      }
      return {
        kind: "citation",
        noteId: obj.noteId,
        title: obj.title,
        chunkIndex: obj.chunkIndex,
        rank: obj.rank,
      };
    case "warning":
      if (typeof obj.message !== "string") return null;
      return { kind: "warning", message: obj.message };
    case "done":
      if (
        typeof obj.conversationId !== "string" ||
        typeof obj.tokens !== "number" ||
        typeof obj.model !== "string" ||
        typeof obj.latencyMs !== "number"
      ) {
        return null;
      }
      return {
        kind: "done",
        conversationId: obj.conversationId,
        tokens: obj.tokens,
        model: obj.model,
        latencyMs: obj.latencyMs,
      };
    case "error":
      if (typeof obj.message !== "string") return null;
      return { kind: "error", message: obj.message };
    default:
      return null;
  }
}
