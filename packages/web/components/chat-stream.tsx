"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SseParser, type ChatEvent } from "../lib/chat/sse";
import { splitWithCitations, type CitationEntry } from "../lib/chat/citations";

export interface ChatStreamProps {
  /** ReadableStream returned by `fetch('/functions/v1/ai-chat')`. */
  stream: ReadableStream<Uint8Array> | null;
  /** Called on the terminal `done` event. */
  onDone?: (event: Extract<ChatEvent, { kind: "done" }>) => void;
}

interface State {
  text: string;
  citations: Map<string, CitationEntry>;
  warnings: string[];
  error: string | null;
  finished: boolean;
}

const INITIAL: State = {
  text: "",
  citations: new Map(),
  warnings: [],
  error: null,
  finished: false,
};

export function ChatStream({ stream, onDone }: ChatStreamProps) {
  const [state, setState] = useState<State>(INITIAL);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (stream === null) {
      setState(INITIAL);
      return;
    }
    let cancelled = false;
    const parser = new SseParser();
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    function apply(events: ChatEvent[]) {
      if (events.length === 0) return;
      setState((prev) => reduceMany(prev, events, onDoneRef.current));
    }

    async function pump() {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) {
            if (!cancelled) apply(parser.flush());
            return;
          }
          if (cancelled) return;
          apply(parser.feed(decoder.decode(value, { stream: true })));
        }
      } catch (cause) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          error: cause instanceof Error ? cause.message : "stream failed",
          finished: true,
        }));
      }
    }
    void pump();
    return () => {
      cancelled = true;
      reader.cancel().catch(() => {
        /* swallow — happens during cleanup */
      });
    };
  }, [stream]);

  const segments = splitWithCitations(state.text, state.citations);

  return (
    <div className="space-y-3">
      <div className="whitespace-pre-wrap text-sm leading-6" data-testid="chat-stream-body">
        {segments.map((seg, i) =>
          seg.kind === "text" ? (
            <span key={i}>{seg.text}</span>
          ) : (
            <Link
              key={i}
              href={`/notes/${seg.noteId}`}
              className="mx-0.5 inline-flex items-center rounded bg-brand/10 px-1.5 text-xs text-brand"
              aria-label={`Citation ${seg.rank}: ${seg.title}`}
            >
              [{seg.rank}] {seg.title}
            </Link>
          ),
        )}
        {!state.finished && state.text.length > 0 ? (
          <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-ink/60 align-middle" />
        ) : null}
      </div>
      {state.warnings.map((w, i) => (
        <p key={i} role="status" className="text-xs text-amber-700">
          {w}
        </p>
      ))}
      {state.error !== null ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

function reduceMany(
  prev: State,
  events: ChatEvent[],
  onDone: ((e: Extract<ChatEvent, { kind: "done" }>) => void) | undefined,
): State {
  let next = prev;
  for (const event of events) {
    next = reduce(next, event, onDone);
  }
  return next;
}

function reduce(
  state: State,
  event: ChatEvent,
  onDone: ((e: Extract<ChatEvent, { kind: "done" }>) => void) | undefined,
): State {
  switch (event.kind) {
    case "chunk":
      return { ...state, text: state.text + event.delta };
    case "citation": {
      const citations = new Map(state.citations);
      citations.set(event.noteId, {
        noteId: event.noteId,
        title: event.title,
        rank: event.rank,
      });
      return { ...state, citations };
    }
    case "warning":
      return { ...state, warnings: [...state.warnings, event.message] };
    case "done":
      onDone?.(event);
      return { ...state, finished: true };
    case "error":
      return { ...state, error: event.message, finished: true };
  }
}
