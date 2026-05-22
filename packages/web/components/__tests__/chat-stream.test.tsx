import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ChatStream } from "../chat-stream";

function streamOf(parts: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const p of parts) controller.enqueue(encoder.encode(p));
      controller.close();
    },
  });
}

describe("ChatStream", () => {
  it("renders streamed deltas progressively", async () => {
    const stream = streamOf([
      'event: chunk\ndata: {"delta":"Hello "}\n\n',
      'event: chunk\ndata: {"delta":"world"}\n\n',
      'event: done\ndata: {"conversationId":"c1","tokens":2,"model":"qwen","latencyMs":10}\n\n',
    ]);
    render(<ChatStream stream={stream} />);
    await waitFor(() => {
      expect(screen.getByTestId("chat-stream-body")).toHaveTextContent("Hello world");
    });
  });

  it("renders citation events as links to /notes/{id}", async () => {
    const stream = streamOf([
      'event: chunk\ndata: {"delta":"See "}\n\n',
      'event: citation\ndata: {"noteId":"abc","title":"Note A","chunkIndex":0,"rank":1}\n\n',
      'event: chunk\ndata: {"delta":"[[NoteId:abc]] for context."}\n\n',
      'event: done\ndata: {"conversationId":"c1","tokens":1,"model":"qwen","latencyMs":5}\n\n',
    ]);
    render(<ChatStream stream={stream} />);
    await waitFor(() => {
      const link = screen.getByRole("link", { name: /Citation 1: Note A/ });
      expect(link).toHaveAttribute("href", "/notes/abc");
    });
  });

  it("surfaces warning events as a status message", async () => {
    const stream = streamOf([
      'event: chunk\ndata: {"delta":"Answer"}\n\n',
      'event: warning\ndata: {"message":"truncated context"}\n\n',
      'event: done\ndata: {"conversationId":"c1","tokens":1,"model":"qwen","latencyMs":5}\n\n',
    ]);
    render(<ChatStream stream={stream} />);
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("truncated context");
    });
  });

  it("displays error events in an alert region", async () => {
    const stream = streamOf(['event: error\ndata: {"message":"upstream down"}\n\n']);
    render(<ChatStream stream={stream} />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("upstream down");
    });
  });

  it("fires onDone with the terminal event payload", async () => {
    const onDone = vi.fn();
    const stream = streamOf([
      'event: chunk\ndata: {"delta":"ok"}\n\n',
      'event: done\ndata: {"conversationId":"convX","tokens":99,"model":"qwen","latencyMs":42}\n\n',
    ]);
    render(<ChatStream stream={stream} onDone={onDone} />);
    await waitFor(() => {
      expect(onDone).toHaveBeenCalledWith({
        kind: "done",
        conversationId: "convX",
        tokens: 99,
        model: "qwen",
        latencyMs: 42,
      });
    });
  });

  it("renders nothing destructive when stream is null", () => {
    render(<ChatStream stream={null} />);
    expect(screen.getByTestId("chat-stream-body")).toBeEmptyDOMElement();
  });
});
