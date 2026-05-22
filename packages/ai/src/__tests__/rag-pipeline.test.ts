import { describe, expect, it, vi } from "vitest";
import {
  RagPipeline,
  type ConversationStore,
  type PersistedMessage,
  type RagPipelineDeps,
  type VectorHit,
} from "../rag-pipeline.js";
import type { AIProvider, ChatChunk, ConversationId } from "@notes-app/domain";
import {
  ConversationId as makeConvId,
  NoteId as makeNoteId,
  NotebookId as makeNotebookId,
} from "@notes-app/domain";

const CONV = makeConvId("550e8400-e29b-41d4-a716-446655445001");
const NOTE_A = "550e8400-e29b-41d4-a716-446655440001";

const SYSTEM_PROMPT = "You are Second-Brain. Cite with [[NoteId:xxx]].";

class InMemoryConversationStore implements ConversationStore {
  readonly persisted: Array<{ role: "user" | "assistant"; content: string }> = [];
  readonly recent: PersistedMessage[] = [];
  archived: string | null = null;
  nextConvId: ConversationId | null = null;

  async appendMessage(input: {
    readonly conversationId: ConversationId;
    readonly role: "user" | "assistant";
    readonly content: string;
  }): Promise<PersistedMessage> {
    this.persisted.push({ role: input.role, content: input.content });
    return {
      id: `${this.persisted.length}`,
      role: input.role,
      content: input.content,
      citations: [],
    };
  }

  async recentMessages(): Promise<readonly PersistedMessage[]> {
    return this.recent;
  }

  async archivedSummary(): Promise<string | null> {
    return this.archived;
  }

  async newConversation(): Promise<ConversationId> {
    return this.nextConvId ?? CONV;
  }
}

function hit(id: string, chunkIndex = 0, content = "snippet"): VectorHit {
  return { noteId: makeNoteId(id), chunkIndex, content, distance: 0.1 };
}

function makeStreamingProvider(deltas: string[]): AIProvider {
  return {
    id: "OLLAMA",
    capabilities: new Set(["STREAMING", "EMBEDDINGS"]),
    listModels: vi.fn(),
    chat: vi.fn(),
    embed: vi.fn(),
    ping: vi.fn(),
    streamChat: vi.fn(() => ({
      async *[Symbol.asyncIterator]() {
        for (const d of deltas) {
          yield { delta: d, done: false };
        }
        yield {
          delta: "",
          done: true,
          model: "qwen2.5:7b",
          promptTokens: 100,
          completionTokens: 20,
        };
      },
    })),
  } as unknown as AIProvider;
}

function makeDeps(overrides: Partial<RagPipelineDeps> = {}): RagPipelineDeps {
  return {
    provider: makeStreamingProvider(["Answer "]),
    embedClient: { embed: vi.fn(async () => [Array.from({ length: 768 }, () => 0.1)]) },
    vectorSearch: vi.fn(async () => [hit(NOTE_A)]),
    fetchNoteTitles: vi.fn(async () => ({ [NOTE_A]: "Tax 2026" })),
    conversations: new InMemoryConversationStore(),
    chatSystemPrompt: SYSTEM_PROMPT,
    ...overrides,
  };
}

async function collect(chat: AsyncIterable<ChatChunk>): Promise<ChatChunk[]> {
  const out: ChatChunk[] = [];
  for await (const c of chat) out.push(c);
  return out;
}

describe("RagPipeline.chat", () => {
  it("persists the user turn before embedding", async () => {
    const store = new InMemoryConversationStore();
    const deps = makeDeps({ conversations: store });
    const pipeline = new RagPipeline(deps);
    await collect(pipeline.chat({ conversationId: CONV, userMessage: "Hi", scope: {} }));
    expect(store.persisted[0]).toEqual({ role: "user", content: "Hi" });
  });

  it("short-circuits with canned response when retrieval is empty", async () => {
    const store = new InMemoryConversationStore();
    const provider = makeStreamingProvider([]);
    const deps = makeDeps({
      conversations: store,
      vectorSearch: vi.fn(async () => []),
      provider,
    });
    const pipeline = new RagPipeline(deps);
    const events = await collect(
      pipeline.chat({ conversationId: CONV, userMessage: "Nothing here", scope: {} }),
    );
    expect(events.some((e) => e.kind === "delta" && e.delta?.startsWith("I don't have"))).toBe(
      true,
    );
    expect(provider.streamChat).not.toHaveBeenCalled();
    // Both user + assistant turns persisted.
    expect(store.persisted.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("emits delta + citation + done in order", async () => {
    const provider = makeStreamingProvider([
      "Your tax appointment is March 14 ",
      `[[NoteId:${NOTE_A}]]`,
      ".",
    ]);
    const deps = makeDeps({ provider });
    const pipeline = new RagPipeline(deps);
    const events = await collect(
      pipeline.chat({ conversationId: CONV, userMessage: "When is my appointment?", scope: {} }),
    );
    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain("delta");
    expect(kinds).toContain("citation");
    expect(kinds[kinds.length - 1]).toBe("done");
  });

  it("creates a new conversation when conversationId is null", async () => {
    const store = new InMemoryConversationStore();
    store.nextConvId = CONV;
    const deps = makeDeps({ conversations: store });
    const pipeline = new RagPipeline(deps);
    const events = await collect(
      pipeline.chat({ conversationId: null, userMessage: "Hi", scope: {} }),
    );
    const done = events.find((e) => e.kind === "done");
    expect(done?.conversationId).toBe(CONV);
  });

  it("strips hallucinated citations from the stream + warns", async () => {
    const provider = makeStreamingProvider([
      "Made-up fact [[NoteId:550e8400-e29b-41d4-a716-446655449999]].",
    ]);
    const deps = makeDeps({ provider });
    const pipeline = new RagPipeline(deps);
    const events = await collect(
      pipeline.chat({ conversationId: CONV, userMessage: "Tell me a lie", scope: {} }),
    );
    expect(events.some((e) => e.kind === "warning")).toBe(true);
    expect(events.some((e) => e.kind === "citation")).toBe(false);
    const text = events
      .filter((e) => e.kind === "delta")
      .map((e) => e.delta)
      .join("");
    expect(text).not.toContain("449999");
  });

  it("forwards scope filters to vectorSearch", async () => {
    const search = vi.fn<RagPipelineDeps["vectorSearch"]>(async () => [hit(NOTE_A)]);
    const deps = makeDeps({ vectorSearch: search });
    const pipeline = new RagPipeline(deps);
    await collect(
      pipeline.chat({
        conversationId: CONV,
        userMessage: "Q",
        scope: {
          notebookIds: [makeNotebookId("550e8400-e29b-41d4-a716-446655442001")],
          excludeAi: false,
        },
      }),
    );
    expect(search).toHaveBeenCalledTimes(1);
    const callArg = search.mock.calls[0]?.[0];
    expect(callArg?.namespace).toBe("ollama:nomic-embed-text");
    expect(callArg?.excludeAi).toBe(false);
    expect(callArg?.k).toBe(6);
    expect(callArg?.filterNotebooks?.length).toBe(1);
  });

  it("uses both archived summary + recent turns in the system prompt", async () => {
    const store = new InMemoryConversationStore();
    store.archived = "Earlier we discussed taxes.";
    store.recent.push({
      id: "1",
      role: "user",
      content: "Earlier message",
      citations: [],
    });
    let capturedSystem = "";
    const provider = {
      id: "OLLAMA",
      capabilities: new Set(["STREAMING", "EMBEDDINGS"]),
      listModels: vi.fn(),
      chat: vi.fn(),
      embed: vi.fn(),
      ping: vi.fn(),
      streamChat: (messages: readonly { role: string; content: string }[]) => {
        capturedSystem = messages[0]?.content ?? "";
        return {
          async *[Symbol.asyncIterator]() {
            yield { delta: "", done: true };
          },
        };
      },
    } as unknown as AIProvider;
    const deps = makeDeps({ conversations: store, provider });
    const pipeline = new RagPipeline(deps);
    await collect(pipeline.chat({ conversationId: CONV, userMessage: "And now?", scope: {} }));
    expect(capturedSystem).toContain("Earlier we discussed taxes.");
  });
});
