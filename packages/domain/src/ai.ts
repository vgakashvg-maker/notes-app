import type { AIProviderId } from "./enums.js";
import type { ConversationId, NoteId, NotebookId, TagId } from "./ids.js";

/**
 * Provider-agnostic AI port. V1 has one implementation
 * (OllamaProviderAdapter). The facade layer (`AIServices`) is what UI
 * code talks to — never this port directly.
 */
export interface AIProvider {
  readonly id: AIProviderId;
  readonly capabilities: ReadonlySet<Capability>;
  listModels(): Promise<readonly ModelDescriptor[]>;
  chat(messages: readonly Message[], opts: AIOptions): Promise<AIResponse>;
  streamChat(messages: readonly Message[], opts: AIOptions): AsyncIterable<AIChunk>;
  embed(texts: readonly string[], model: string): Promise<readonly number[][]>;
  ping(): Promise<ProviderHealth>;
}

export type Capability = "STREAMING" | "EMBEDDINGS" | "VISION" | "TOOL_USE";

export interface ModelDescriptor {
  readonly id: string;
  readonly contextTokens: number;
  readonly supports: ReadonlySet<Capability>;
}

export type MessageRole = "system" | "user" | "assistant";

export interface Message {
  readonly role: MessageRole;
  readonly content: string;
}

export interface AIOptions {
  readonly model: string;
  readonly temperature?: number;
  /** Hard ceiling so a runaway model doesn't blow the context budget. */
  readonly maxTokens?: number;
  /** Pass-through for provider-specific stop sequences. */
  readonly stop?: readonly string[];
}

export interface AIResponse {
  readonly content: string;
  readonly model: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly latencyMs: number;
}

/**
 * Each token chunk from a streaming chat. The pipeline emits structured
 * `citation` and `done` events separately — those are not part of this
 * shape. Pipelines that just want raw token text can collect `delta`s.
 */
export interface AIChunk {
  readonly delta: string;
  /** True on the final chunk; carries the same metrics as AIResponse. */
  readonly done: boolean;
  readonly model?: string;
  readonly promptTokens?: number;
  readonly completionTokens?: number;
}

export interface ProviderHealth {
  readonly ok: boolean;
  readonly message?: string;
  readonly latencyMs?: number;
}

// ---------------------------------------------------------------------------
// AIServices facade types
// ---------------------------------------------------------------------------

export type SummaryLength = "short" | "medium" | "long";

export interface NoteScope {
  readonly notebookIds?: readonly NotebookId[];
  readonly tagIds?: readonly TagId[];
  readonly excludeAi?: boolean;
}

export interface ChatChunk {
  readonly kind: "delta" | "citation" | "done" | "warning";
  /** delta */
  readonly delta?: string;
  /** citation */
  readonly noteId?: NoteId;
  readonly title?: string;
  readonly chunkIndex?: number;
  readonly rank?: number;
  /** done */
  readonly conversationId?: ConversationId;
  readonly tokens?: { readonly prompt: number; readonly completion: number };
  readonly model?: string;
  readonly latencyMs?: number;
  /** warning */
  readonly warning?: string;
}

export interface RelatedNote {
  readonly noteId: NoteId;
  readonly title: string;
  readonly snippet: string;
  /** Cosine distance — smaller is closer. */
  readonly distance: number;
}

export interface Briefing {
  readonly date: string; // YYYY-MM-DD
  readonly markdown: string;
  readonly model: string;
  readonly tokens: { readonly prompt: number; readonly completion: number };
}

export interface Conversation {
  readonly id: ConversationId;
  readonly title: string;
  readonly modelHint: string | null;
  readonly createdAt: string;
  readonly lastMessageAt: string;
  readonly archivedSummary: string | null;
  readonly messages: readonly ConversationMessage[];
}

export interface ConversationMessage {
  readonly id: string;
  readonly role: MessageRole;
  readonly content: string;
  readonly citations: readonly Citation[];
  readonly provider: AIProviderId | null;
  readonly model: string | null;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly createdAt: string;
}

export interface Citation {
  readonly noteId: NoteId;
  readonly title: string;
  readonly chunkIndex: number;
  readonly rank: number;
}

/**
 * The domain facade. UI code (M12 / M13) talks to this. Implementations
 * compose `AIProvider` + the M10 vector store + the M04 notes service.
 */
export interface AIServices {
  // Per-note (one-shot)
  summarize(noteId: NoteId, length: SummaryLength): Promise<string>;
  suggestTags(noteId: NoteId): Promise<readonly string[]>;
  suggestTitle(noteId: NoteId): Promise<string>;
  extractActionItems(noteId: NoteId): Promise<readonly string[]>;
  rewrite(text: string, instruction: string): Promise<string>;

  // Corpus-wide (the second-brain features)
  chat(
    conversationId: ConversationId | null,
    message: string,
    scope?: NoteScope,
  ): AsyncIterable<ChatChunk>;
  relatedNotes(noteId: NoteId, k?: number): Promise<readonly RelatedNote[]>;
  dailyBriefing(date: string): Promise<Briefing>;

  // Conversation persistence
  listConversations(): Promise<readonly Conversation[]>;
  getConversation(id: ConversationId): Promise<Conversation>;
  newConversation(seed?: string): Promise<ConversationId>;
  deleteConversation(id: ConversationId): Promise<void>;
}
