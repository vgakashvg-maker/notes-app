import { describe, expect, it } from "vitest";
import type { AIChunk, ChatChunk, Citation, Message, ProviderHealth } from "../ai.js";
import { NoteId } from "../ids.js";

describe("AI domain shapes", () => {
  it("Message accepts every role variant", () => {
    const msgs: Message[] = [
      { role: "system", content: "you are a helper" },
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];
    expect(msgs.map((m) => m.role)).toEqual(["system", "user", "assistant"]);
  });

  it("ChatChunk discriminates on kind", () => {
    const deltaChunk: ChatChunk = { kind: "delta", delta: "Your tax appointment" };
    const citationChunk: ChatChunk = {
      kind: "citation",
      noteId: NoteId("550e8400-e29b-41d4-a716-446655440001"),
      title: "Tax 2026",
      chunkIndex: 2,
      rank: 0,
    };
    const doneChunk: ChatChunk = {
      kind: "done",
      tokens: { prompt: 1200, completion: 340 },
      model: "qwen2.5:7b",
      latencyMs: 4200,
    };
    const warnChunk: ChatChunk = { kind: "warning", warning: "hallucinated citation stripped" };
    expect(deltaChunk.kind).toBe("delta");
    expect(citationChunk.chunkIndex).toBe(2);
    expect(doneChunk.tokens?.completion).toBe(340);
    expect(warnChunk.warning).toMatch(/hallucinated/);
  });

  it("AIChunk on the last token carries done + metrics", () => {
    const final: AIChunk = {
      delta: "",
      done: true,
      model: "qwen2.5:7b",
      promptTokens: 1000,
      completionTokens: 200,
    };
    expect(final.done).toBe(true);
    expect(final.completionTokens).toBe(200);
  });

  it("ProviderHealth carries optional latency on success", () => {
    const ok: ProviderHealth = { ok: true, latencyMs: 25 };
    expect(ok.ok).toBe(true);
  });

  it("Citation references a NoteId branded value", () => {
    const c: Citation = {
      noteId: NoteId("550e8400-e29b-41d4-a716-446655440001"),
      title: "Tax 2026",
      chunkIndex: 2,
      rank: 0,
    };
    expect(typeof c.noteId).toBe("string");
  });
});
