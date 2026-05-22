// Edge Function: POST /functions/v1/ai/summarize
//
// Body: { noteId: uuid, length: "short"|"medium"|"long" }

// deno-lint-ignore-file no-explicit-any

import {
  composeSystemBlock,
  parsePrompt,
  summarize as runSummarize,
} from "../../../../packages/ai/src/index.ts";
import { plainTextFromProseMirror } from "../../../../packages/embeddings/src/index.ts";
import {
  fetchNoteSnapshot,
  jsonError,
  logUsage,
  ollamaProvider,
  readPrompt,
  resolveUserId,
} from "../_shared/ollama.ts";

declare const Deno: { serve(h: (req: Request) => Response | Promise<Response>): void };

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonError(405, "ERR_METHOD_NOT_ALLOWED", "POST only");
  const jwt = req.headers.get("Authorization")?.slice("bearer ".length).trim() ?? "";
  const userId = await resolveUserId(req);
  if (jwt === "" || userId === null) return jsonError(401, "ERR_UNAUTHENTICATED", "Missing JWT");
  let body: any;
  try { body = await req.json(); } catch { return jsonError(400, "ERR_BAD_REQUEST", "Body must be JSON"); }
  const noteId = String(body?.noteId ?? "");
  const length = body?.length ?? "medium";
  if (noteId.length === 0) return jsonError(400, "ERR_BAD_REQUEST", "noteId required");
  if (!["short", "medium", "long"].includes(length)) {
    return jsonError(400, "ERR_BAD_REQUEST", "length must be short|medium|long");
  }
  const note = await fetchNoteSnapshot(jwt, noteId);
  if (note === null) return jsonError(404, "ERR_NOT_FOUND", "Note not found");
  const prompt = parsePrompt(await readPrompt("summarize"));
  const provider = ollamaProvider();
  const start = Date.now();
  const out = await runSummarize(
    `${note.title}\n\n${plainTextFromProseMirror(note.bodyJson)}`,
    length,
    { system: composeSystemBlock(prompt, true) },
    { provider },
  );
  await logUsage(jwt, {
    task: "summarize",
    model: "qwen2.5:7b",
    promptTokens: 0,
    completionTokens: 0,
    latencyMs: Date.now() - start,
  });
  return new Response(JSON.stringify({ ok: true, data: { summary: out } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
