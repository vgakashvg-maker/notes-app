// Edge Function: POST /functions/v1/ai/chat (SSE streaming)
//
// Streams a chat answer as Server-Sent Events. Each token chunk
// becomes a `chunk` SSE event; each parsed citation becomes a
// `citation` SSE event; the final summary becomes a `done` event.
//
// The pipeline + citation guard live in @notes-app/ai. This file is
// the thin Deno I/O wrapper.

// deno-lint-ignore-file no-explicit-any

import {
  composeSystemBlock,
  parsePrompt,
  RagPipeline,
  type ConversationStore,
  type PersistMessageInput,
  type PersistedMessage,
  type RagPipelineDeps,
  type VectorHit,
} from "../../../packages/ai/src/index.ts";
import { createOllamaApiClient } from "../../../packages/ai/src/ollama-adapter.ts";
import { DEFAULT_NAMESPACE } from "../../../packages/embeddings/src/index.ts";
import {
  jsonError,
  mustEnv,
  ollamaProvider,
  readPrompt,
  resolveUserId,
} from "../_shared/ai/ollama.ts";

declare const Deno: {
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonError(405, "ERR_METHOD_NOT_ALLOWED", "POST only");
  const jwt = req.headers.get("Authorization")?.slice("bearer ".length).trim() ?? "";
  const userId = await resolveUserId(req);
  if (jwt === "" || userId === null) return jsonError(401, "ERR_UNAUTHENTICATED", "Missing JWT");
  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "ERR_BAD_REQUEST", "Body must be JSON");
  }
  const message = typeof body?.message === "string" ? body.message : "";
  const conversationId = typeof body?.conversationId === "string" ? body.conversationId : null;
  if (message.trim().length === 0) {
    return jsonError(400, "ERR_BAD_REQUEST", "message required");
  }

  // Prompt + provider + dep wiring.
  const promptSrc = readPrompt("chat");
  const parsed = parsePrompt(promptSrc);
  const chatSystemPrompt = composeSystemBlock(parsed, true);
  const provider = ollamaProvider();
  const embedClient = createOllamaApiClient({
    endpoint: mustEnv("OLLAMA_ENDPOINT_URL"),
    hostOverride: "127.0.0.1:11434",
  });
  const conversations = makeConversationStore(jwt);
  const deps: RagPipelineDeps = {
    provider,
    embedClient: { embed: (model, inputs) => embedClient.embed(model, inputs) },
    vectorSearch: (input) => callVectorSearch(jwt, input),
    fetchNoteTitles: (ids) => fetchNoteTitles(jwt, ids),
    conversations,
    chatSystemPrompt,
  };
  const pipeline = new RagPipeline(deps);

  // SSE stream.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of pipeline.chat({
          conversationId: conversationId as any,
          userMessage: message,
          scope: body?.scope ?? {},
        })) {
          const event = sseEvent(chunk);
          if (event !== null) controller.enqueue(encoder.encode(event));
        }
      } catch (cause) {
        const msg = cause instanceof Error ? cause.message : "stream failed";
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ message: msg })}\n\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

function sseEvent(chunk: any): string | null {
  switch (chunk.kind) {
    case "delta":
      return `event: chunk\ndata: ${JSON.stringify({ delta: chunk.delta })}\n\n`;
    case "citation":
      return `event: citation\ndata: ${JSON.stringify({
        noteId: chunk.noteId,
        title: chunk.title,
        chunkIndex: chunk.chunkIndex,
        rank: chunk.rank,
      })}\n\n`;
    case "warning":
      return `event: warning\ndata: ${JSON.stringify({ message: chunk.warning })}\n\n`;
    case "done":
      return `event: done\ndata: ${JSON.stringify({
        conversationId: chunk.conversationId,
        tokens: chunk.tokens,
        model: chunk.model,
        latencyMs: chunk.latencyMs,
      })}\n\n`;
    default:
      return null;
  }
}

async function callVectorSearch(jwt: string, input: any): Promise<readonly VectorHit[]> {
  const resp = await fetch(`${mustEnv("SUPABASE_URL")}/rest/v1/rpc/vector_search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query_embedding: input.queryEmbedding,
      k: input.k,
      filter_namespace: input.namespace,
      filter_notebooks: input.filterNotebooks,
      filter_tags: input.filterTags,
      exclude_ai: input.excludeAi,
    }),
  });
  if (!resp.ok) return [];
  const rows = (await resp.json()) as Array<{
    note_id: string;
    chunk_index: number;
    content: string;
    distance: number;
  }>;
  return rows.map((r) => ({
    noteId: r.note_id as any,
    chunkIndex: r.chunk_index,
    content: r.content,
    distance: r.distance,
  }));
}

async function fetchNoteTitles(jwt: string, ids: readonly string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const inClause = `in.(${ids.map((id) => `"${id}"`).join(",")})`;
  const resp = await fetch(
    `${mustEnv("SUPABASE_URL")}/rest/v1/notes?select=id,title&id=${inClause}`,
    {
      headers: {
        Authorization: `Bearer ${jwt}`,
        apikey: mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
      },
    },
  );
  if (!resp.ok) return {};
  const rows = (await resp.json()) as Array<{ id: string; title: string }>;
  const out: Record<string, string> = {};
  for (const r of rows) out[r.id] = r.title;
  return out;
}

function makeConversationStore(jwt: string): ConversationStore {
  const SUPABASE_URL = mustEnv("SUPABASE_URL");
  const apikey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
  const auth = `Bearer ${jwt}`;
  return {
    async appendMessage(input: PersistMessageInput): Promise<PersistedMessage> {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/ai_messages`, {
        method: "POST",
        headers: {
          Authorization: auth,
          apikey,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          conversation_id: input.conversationId,
          role: input.role,
          content: input.content,
          citations: input.citations,
          provider: "OLLAMA",
          model: input.model,
          prompt_tokens: input.promptTokens,
          completion_tokens: input.completionTokens,
        }),
      });
      if (!resp.ok) throw new Error(`appendMessage HTTP ${resp.status}`);
      const rows = (await resp.json()) as Array<{ id: string; role: PersistedMessage["role"]; content: string }>;
      const row = rows[0]!;
      return {
        id: row.id,
        role: row.role,
        content: row.content,
        citations: input.citations,
      };
    },
    async recentMessages(conversationId, limit) {
      const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/ai_messages?select=id,role,content,citations&conversation_id=eq.${conversationId}&order=created_at.desc&limit=${limit}`,
        { headers: { Authorization: auth, apikey } },
      );
      if (!resp.ok) return [];
      const rows = (await resp.json()) as Array<{
        id: string;
        role: PersistedMessage["role"];
        content: string;
        citations: PersistedMessage["citations"];
      }>;
      return rows
        .map((r) => ({ id: r.id, role: r.role, content: r.content, citations: r.citations ?? [] }))
        .reverse();
    },
    async archivedSummary(conversationId) {
      const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/ai_conversations?select=archived_summary&id=eq.${conversationId}`,
        { headers: { Authorization: auth, apikey } },
      );
      if (!resp.ok) return null;
      const rows = (await resp.json()) as Array<{ archived_summary: string | null }>;
      return rows[0]?.archived_summary ?? null;
    },
    async newConversation(seed) {
      const title = seed && seed.trim().length > 0 ? seed.trim().slice(0, 80) : "New conversation";
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/ai_conversations`, {
        method: "POST",
        headers: {
          Authorization: auth,
          apikey,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({ title }),
      });
      if (!resp.ok) throw new Error(`newConversation HTTP ${resp.status}`);
      const rows = (await resp.json()) as Array<{ id: string }>;
      return rows[0]!.id as any;
    },
  };
}

// Suppress unused import warnings for the namespace constant — it's
// re-exported so the prompt loader knows which package owns it.
const _kept = DEFAULT_NAMESPACE;
void _kept;
