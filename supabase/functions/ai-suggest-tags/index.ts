// Edge Function: POST /functions/v1/ai/suggest-tags

// deno-lint-ignore-file no-explicit-any

import {
  composeSystemBlock,
  parsePrompt,
  suggestTags,
} from "../../../packages/ai/src/index.ts";
import { plainTextFromProseMirror } from "../../../packages/embeddings/src/index.ts";
import {
  fetchNoteSnapshot,
  jsonError,
  logUsage,
  ollamaProvider,
  readPrompt,
  resolveUserId,
} from "../_shared/ai/ollama.ts";

import { corsServe } from "../_shared/cors.ts";

declare const Deno: { serve(h: (req: Request) => Response | Promise<Response>): void };

corsServe(async (req: Request) => {
  if (req.method !== "POST") return jsonError(405, "ERR_METHOD_NOT_ALLOWED", "POST only");
  const jwt = req.headers.get("Authorization")?.slice("bearer ".length).trim() ?? "";
  const userId = await resolveUserId(req);
  if (jwt === "" || userId === null) return jsonError(401, "ERR_UNAUTHENTICATED", "Missing JWT");
  let body: any;
  try { body = await req.json(); } catch { return jsonError(400, "ERR_BAD_REQUEST", "Body must be JSON"); }
  const noteId = String(body?.noteId ?? "");
  if (noteId.length === 0) return jsonError(400, "ERR_BAD_REQUEST", "noteId required");
  const note = await fetchNoteSnapshot(jwt, noteId);
  if (note === null) return jsonError(404, "ERR_NOT_FOUND", "Note not found");
  const prompt = parsePrompt(readPrompt("suggest-tags"));
  const start = Date.now();
  const tags = await suggestTags(
    `${note.title}\n\n${plainTextFromProseMirror(note.bodyJson)}`,
    { system: composeSystemBlock(prompt, true) },
    { provider: ollamaProvider() },
  );
  await logUsage(jwt, { task: "suggest_tags", model: "llama3.2:3b", promptTokens: 0, completionTokens: 0, latencyMs: Date.now() - start });
  return new Response(JSON.stringify({ ok: true, data: { tags } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
