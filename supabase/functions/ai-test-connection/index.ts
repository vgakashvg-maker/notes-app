// Edge Function: POST /functions/v1/ai/test-connection
//
// Probes a user-supplied Ollama endpoint (`/api/tags`) and returns the
// list of installed models. The settings UI calls this before saving a
// new endpoint URL so a bad value never lands in users_profile.ai_prefs.

import { jsonError, resolveUserId } from "../_shared/ai/ollama.ts";

import { corsServe } from "../_shared/cors.ts";

declare const Deno: {
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

interface OllamaTagsResponse {
  readonly models?: ReadonlyArray<{
    readonly name: string;
    readonly model?: string;
    readonly size?: number;
  }>;
}

corsServe(async (req: Request) => {
  if (req.method !== "POST") return jsonError(405, "ERR_METHOD_NOT_ALLOWED", "POST only");
  const userId = await resolveUserId(req);
  if (userId === null) return jsonError(401, "ERR_UNAUTHENTICATED", "Missing JWT");

  let body: { endpoint_url?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "ERR_BAD_REQUEST", "Body must be JSON");
  }
  const url = typeof body.endpoint_url === "string" ? body.endpoint_url.trim() : "";
  if (url.length === 0) {
    return jsonError(400, "ERR_BAD_REQUEST", "endpoint_url required");
  }
  if (!/^https?:\/\//.test(url)) {
    return jsonError(400, "ERR_BAD_REQUEST", "endpoint_url must be http(s)");
  }

  const started = Date.now();
  try {
    const tagsUrl = url.replace(/\/+$/, "") + "/api/tags";
    const resp = await fetch(tagsUrl, {
      // Same Funnel host-check workaround M09/M10 use. The Ollama server
      // rejects unfamiliar Host headers; rewriting to the internal name
      // is harmless for direct connections too.
      headers: { Host: "127.0.0.1:11434" },
    });
    if (!resp.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: "ERR_UPSTREAM", message: `Ollama returned ${resp.status}` },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    const payload = (await resp.json()) as OllamaTagsResponse;
    const models = (payload.models ?? []).map((m) => m.name).filter((s) => s.length > 0);
    return new Response(
      JSON.stringify({
        ok: true,
        models,
        latencyMs: Date.now() - started,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "fetch failed";
    return new Response(
      JSON.stringify({
        ok: false,
        error: { code: "ERR_UPSTREAM_UNREACHABLE", message },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
});
