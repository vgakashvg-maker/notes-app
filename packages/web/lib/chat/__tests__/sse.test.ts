import { describe, expect, it } from "vitest";
import { SseParser } from "../sse";

describe("SseParser", () => {
  it("parses a single chunk event", () => {
    const p = new SseParser();
    const events = p.feed('event: chunk\ndata: {"delta":"hi"}\n\n');
    expect(events).toEqual([{ kind: "chunk", delta: "hi" }]);
  });

  it("survives bytes that split mid-event", () => {
    const p = new SseParser();
    expect(p.feed("event: chunk\ndata: ")).toEqual([]);
    expect(p.feed('{"delta":"ab')).toEqual([]);
    expect(p.feed('"}\n\n')).toEqual([{ kind: "chunk", delta: "ab" }]);
  });

  it("delivers two events arriving in one frame", () => {
    const p = new SseParser();
    const events = p.feed(
      'event: chunk\ndata: {"delta":"a"}\n\nevent: chunk\ndata: {"delta":"b"}\n\n',
    );
    expect(events).toEqual([
      { kind: "chunk", delta: "a" },
      { kind: "chunk", delta: "b" },
    ]);
  });

  it("parses citation events with full payload", () => {
    const p = new SseParser();
    const events = p.feed(
      'event: citation\ndata: {"noteId":"abc-123","title":"Notes","chunkIndex":2,"rank":1}\n\n',
    );
    expect(events).toEqual([
      { kind: "citation", noteId: "abc-123", title: "Notes", chunkIndex: 2, rank: 1 },
    ]);
  });

  it("parses warning + done events", () => {
    const p = new SseParser();
    const events = p.feed(
      'event: warning\ndata: {"message":"truncated"}\n\n' +
        'event: done\ndata: {"conversationId":"c1","tokens":42,"model":"qwen","latencyMs":1200}\n\n',
    );
    expect(events).toEqual([
      { kind: "warning", message: "truncated" },
      {
        kind: "done",
        conversationId: "c1",
        tokens: 42,
        model: "qwen",
        latencyMs: 1200,
      },
    ]);
  });

  it("parses error events", () => {
    const p = new SseParser();
    expect(p.feed('event: error\ndata: {"message":"boom"}\n\n')).toEqual([
      { kind: "error", message: "boom" },
    ]);
  });

  it("ignores SSE comments and unknown events", () => {
    const p = new SseParser();
    const events = p.feed(
      ': keep-alive\n\n' +
        'event: mystery\ndata: {"x":1}\n\n' +
        'event: chunk\ndata: {"delta":"ok"}\n\n',
    );
    expect(events).toEqual([{ kind: "chunk", delta: "ok" }]);
  });

  it("drops frames with malformed JSON rather than throwing", () => {
    const p = new SseParser();
    expect(p.feed("event: chunk\ndata: {not json}\n\n")).toEqual([]);
  });

  it("flush returns a trailing un-terminated event", () => {
    const p = new SseParser();
    expect(p.feed('event: chunk\ndata: {"delta":"a"}')).toEqual([]);
    expect(p.flush()).toEqual([{ kind: "chunk", delta: "a" }]);
  });
});
