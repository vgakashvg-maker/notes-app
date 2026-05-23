// Edge Function: POST /functions/v1/ai/rewrite

// deno-lint-ignore-file no-explicit-any

import {
  composeSystemBlock,
  parsePrompt,
  rewrite,
} from "../../../packages/ai/src/index.ts";
import {
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
  const text = String(body?.text ?? "");
  const instruction = String(body?.instruction ?? "");
  if (text.length === 0 || instruction.length === 0) {
    return jsonError(400, "ERR_BAD_REQUEST", "text and instruction required");
  }
  const prompt = parsePrompt(readPrompt("rewrite"));
  const start = Date.now();
  const out = await rewrite(
    text,
    instruction,
    { system: composeSystemBlock(prompt, true) },
    { provider: ollamaProvider() },
  );
  await logUsage(jwt, { task: "rewrite", model: "qwen2.5:7b", promptTokens: 0, completionTokens: 0, latencyMs: Date.now() - start });
  return new Response(JSON.stringify({ ok: true, data: { rewritten: out } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
