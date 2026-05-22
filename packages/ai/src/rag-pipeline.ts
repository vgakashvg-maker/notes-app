import type {
  AIProvider,
  ChatChunk,
  ConversationId,
  Message,
  NoteId,
  NoteScope,
} from "@notes-app/domain";
import { DEFAULT_NAMESPACE, type OllamaEmbedClient } from "@notes-app/embeddings";
import { staticRouter, type Router } from "./routing.js";

/**
 * RAG chat pipeline. Composes:
 *   embed(query) → vector_search(k) → assemble prompt → stream chat
 *   → strip hallucinated citations → emit ChatChunk events.
 *
 * Persistence (writing user/assistant messages, bumping
 * last_message_at) lives behind a small [ConversationStore] port so
 * the Edge Function can wire PostgREST while tests pass a fake.
 */

export interface RagPipelineDeps {
  readonly provider: AIProvider;
  readonly embedClient: OllamaEmbedClient;
  readonly vectorSearch: (input: VectorSearchInput) => Promise<readonly VectorHit[]>;
  /** Fetches title metadata for each note id in the hits. */
  readonly fetchNoteTitles: (noteIds: readonly NoteId[]) => Promise<Record<string, string>>;
  readonly conversations: ConversationStore;
  readonly chatSystemPrompt: string;
  readonly router?: Router;
  /** Per chat call. Default 6. */
  readonly k?: number;
}

export interface VectorSearchInput {
  readonly queryEmbedding: number[];
  readonly k: number;
  readonly namespace: string;
  readonly filterNotebooks: readonly string[] | null;
  readonly filterTags: readonly string[] | null;
  readonly excludeAi: boolean;
}

export interface VectorHit {
  readonly noteId: NoteId;
  readonly chunkIndex: number;
  readonly content: string;
  readonly distance: number;
}

export interface ConversationStore {
  /** Append a user or assistant message, return the persisted row. */
  appendMessage(input: PersistMessageInput): Promise<PersistedMessage>;
  /** Last N messages (oldest first), excluding system. */
  recentMessages(
    conversationId: ConversationId,
    limit: number,
  ): Promise<readonly PersistedMessage[]>;
  archivedSummary(conversationId: ConversationId): Promise<string | null>;
  newConversation(seed: string | null): Promise<ConversationId>;
}

export interface PersistMessageInput {
  readonly conversationId: ConversationId;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly citations: readonly Citation[];
  readonly model: string | null;
  readonly promptTokens: number;
  readonly completionTokens: number;
}

export interface PersistedMessage {
  readonly id: string;
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
  readonly citations: readonly Citation[];
}

export interface Citation {
  readonly noteId: NoteId;
  readonly title: string;
  readonly chunkIndex: number;
  readonly rank: number;
}

export interface ChatRequest {
  readonly conversationId: ConversationId | null;
  readonly userMessage: string;
  readonly scope: NoteScope;
}

export class RagPipeline {
  private readonly router: Router;
  private readonly k: number;

  constructor(private readonly deps: RagPipelineDeps) {
    this.router = deps.router ?? staticRouter;
    this.k = deps.k ?? 6;
  }

  async *chat(request: ChatRequest): AsyncGenerator<ChatChunk> {
    const trimmed = request.userMessage.trim();
    if (trimmed.length === 0) {
      yield { kind: "warning", warning: "Empty message" };
      return;
    }

    // 1. Resolve / create conversation, persist the user turn.
    const conversationId =
      request.conversationId ?? (await this.deps.conversations.newConversation(trimmed));
    await this.deps.conversations.appendMessage({
      conversationId,
      role: "user",
      content: trimmed,
      citations: [],
      model: null,
      promptTokens: 0,
      completionTokens: 0,
    });

    // 2. Embed the query.
    const embedRoute = this.router.routeFor("embed");
    const [queryEmbedding] = await this.deps.embedClient.embed(embedRoute.model, [trimmed]);
    if (queryEmbedding === undefined || queryEmbedding.length === 0) {
      yield { kind: "warning", warning: "Query embedding failed" };
      yield { kind: "done", conversationId, tokens: { prompt: 0, completion: 0 } };
      return;
    }

    // 3. Vector search with the user's scope filters.
    const hits = await this.deps.vectorSearch({
      queryEmbedding,
      k: this.k,
      namespace: DEFAULT_NAMESPACE,
      filterNotebooks: request.scope.notebookIds?.map((id) => id) ?? null,
      filterTags: request.scope.tagIds?.map((id) => id) ?? null,
      excludeAi: request.scope.excludeAi ?? true,
    });

    // 4. Empty-retrieval short-circuit: skip the LLM entirely.
    if (hits.length === 0) {
      const cannedAnswer = "I don't have a note about that yet.";
      yield { kind: "delta", delta: cannedAnswer };
      await this.deps.conversations.appendMessage({
        conversationId,
        role: "assistant",
        content: cannedAnswer,
        citations: [],
        model: null,
        promptTokens: 0,
        completionTokens: 0,
      });
      yield { kind: "done", conversationId, tokens: { prompt: 0, completion: 0 } };
      return;
    }

    // 5. Look up titles + build the in-prompt context block.
    const noteIds = uniqueNoteIds(hits);
    const titles = await this.deps.fetchNoteTitles(noteIds);
    const contextBlock = buildContextBlock(hits, titles);
    const allowedNoteIds = new Set<string>(noteIds);

    // 6. Fetch conversation memory (archived summary + recent turns).
    const archived = await this.deps.conversations.archivedSummary(conversationId);
    const recent = await this.deps.conversations.recentMessages(conversationId, 10);
    const systemPrompt = this.composeSystemPrompt(contextBlock, archived);
    const messages: Message[] = [{ role: "system", content: systemPrompt }];
    for (const m of recent) {
      if (m.role === "system") continue;
      messages.push({ role: m.role, content: m.content });
    }

    // 7. Stream the answer through the citation guard.
    const chatRoute = this.router.routeFor("chat");
    const guard = new CitationGuard(allowedNoteIds, hits, titles);
    const startedAt = Date.now();
    let promptTokens = 0;
    let completionTokens = 0;
    let assembled = "";
    for await (const chunk of this.deps.provider.streamChat(messages, { model: chatRoute.model })) {
      if (chunk.delta.length > 0) {
        for (const event of guard.consume(chunk.delta)) {
          yield event;
          if (event.kind === "delta" && event.delta !== undefined) assembled += event.delta;
        }
      }
      if (chunk.done) {
        promptTokens = chunk.promptTokens ?? 0;
        completionTokens = chunk.completionTokens ?? 0;
      }
    }
    for (const event of guard.flush()) {
      yield event;
      if (event.kind === "delta" && event.delta !== undefined) assembled += event.delta;
    }

    // 8. Persist the assistant turn + final done event.
    await this.deps.conversations.appendMessage({
      conversationId,
      role: "assistant",
      content: assembled,
      citations: guard.emittedCitations,
      model: chatRoute.model,
      promptTokens,
      completionTokens,
    });
    yield {
      kind: "done",
      conversationId,
      tokens: { prompt: promptTokens, completion: completionTokens },
      model: chatRoute.model,
      latencyMs: Date.now() - startedAt,
    };
  }

  private composeSystemPrompt(contextBlock: string, archived: string | null): string {
    const archivedBlock =
      archived !== null && archived.length > 0
        ? `\n\n<conversation_summary>\n${archived}\n</conversation_summary>`
        : "";
    return `${this.deps.chatSystemPrompt}\n\n<context>\n${contextBlock}\n</context>${archivedBlock}`;
  }
}

function uniqueNoteIds(hits: readonly VectorHit[]): NoteId[] {
  const seen = new Set<string>();
  const out: NoteId[] = [];
  for (const h of hits) {
    if (!seen.has(h.noteId)) {
      seen.add(h.noteId);
      out.push(h.noteId);
    }
  }
  return out;
}

function buildContextBlock(hits: readonly VectorHit[], titles: Record<string, string>): string {
  return hits
    .map((h) => {
      const title = titles[h.noteId] ?? "(untitled)";
      return `[Note id=${h.noteId}, title="${title}"] (chunk ${h.chunkIndex})\n${h.content}`;
    })
    .join("\n\n");
}

/**
 * Streaming citation parser. Reads token deltas, looks for the
 * `[[NoteId:<uuid>]]` marker, and either:
 *   - passes it through and emits a `citation` event (when the UUID
 *     is in the allowed set), or
 *   - strips it (when the UUID is not in the allowed set) and emits a
 *     `warning` event.
 *
 * Buffers up to the longest possible partial marker so we don't emit
 * half-tokens to the client when the model interleaves text with the
 * marker characters.
 */
export class CitationGuard {
  private buffer = "";
  private readonly seen = new Set<string>();
  readonly emittedCitations: Citation[] = [];

  constructor(
    private readonly allowed: ReadonlySet<string>,
    private readonly hits: readonly VectorHit[],
    private readonly titles: Record<string, string>,
  ) {}

  *consume(delta: string): Generator<ChatChunk> {
    this.buffer += delta;
    yield* this.drain(false);
  }

  *flush(): Generator<ChatChunk> {
    yield* this.drain(true);
    if (this.buffer.length > 0) {
      yield { kind: "delta", delta: this.buffer };
      this.buffer = "";
    }
  }

  private *drain(final: boolean): Generator<ChatChunk> {
    while (this.buffer.length > 0) {
      const openIdx = this.buffer.indexOf("[[NoteId:");
      if (openIdx === -1) {
        // No partial marker possible if the buffer doesn't end in `[`.
        const safeUntil = final
          ? this.buffer.length
          : Math.max(0, this.buffer.length - "[[NoteId:".length + 1);
        if (safeUntil > 0) {
          yield { kind: "delta", delta: this.buffer.slice(0, safeUntil) };
          this.buffer = this.buffer.slice(safeUntil);
        } else {
          return;
        }
        continue;
      }
      if (openIdx > 0) {
        yield { kind: "delta", delta: this.buffer.slice(0, openIdx) };
        this.buffer = this.buffer.slice(openIdx);
      }
      const closeIdx = this.buffer.indexOf("]]");
      if (closeIdx === -1) {
        if (final) {
          // Incomplete marker at flush time — drop it; nothing to cite.
          this.buffer = "";
        }
        return;
      }
      const inside = this.buffer.slice("[[NoteId:".length, closeIdx);
      const uuid = inside.trim();
      this.buffer = this.buffer.slice(closeIdx + 2);
      if (this.allowed.has(uuid)) {
        yield { kind: "delta", delta: `[[NoteId:${uuid}]]` };
        if (!this.seen.has(uuid)) {
          this.seen.add(uuid);
          const hit = this.hits.find((h) => h.noteId === uuid);
          if (hit !== undefined) {
            const citation: Citation = {
              noteId: hit.noteId,
              title: this.titles[hit.noteId] ?? "(untitled)",
              chunkIndex: hit.chunkIndex,
              rank: this.emittedCitations.length,
            };
            this.emittedCitations.push(citation);
            yield {
              kind: "citation",
              noteId: citation.noteId,
              title: citation.title,
              chunkIndex: citation.chunkIndex,
              rank: citation.rank,
            };
          }
        }
      } else {
        yield {
          kind: "warning",
          warning: `Hallucinated citation stripped: ${uuid.slice(0, 8)}…`,
        };
      }
    }
  }
}
