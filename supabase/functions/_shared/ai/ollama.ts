// Shared helpers for the ai/* Edge Functions. Deno-flavoured imports
// from the workspace packages. The Funnel + host-check workaround is
// the same one M10 uses — see ADR 0008.

// deno-lint-ignore-file no-explicit-any

import {
  createOllamaApiClient,
  OllamaProviderAdapter,
} from "../../../../packages/ai/src/ollama-adapter.ts";
import { staticRouter } from "../../../../packages/ai/src/routing.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
};

export function mustEnv(name: string): string {
  const v = Deno.env.get(name);
  if (v === undefined || v.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

export function ollamaProvider(): OllamaProviderAdapter {
  const client = createOllamaApiClient({
    endpoint: mustEnv("OLLAMA_ENDPOINT_URL"),
    hostOverride: "127.0.0.1:11434",
  });
  return new OllamaProviderAdapter({ client });
}

export const router = staticRouter;

export function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Verify the bearer JWT is a real user; return their id. */
export async function resolveUserId(req: Request): Promise<string | null> {
  const header = req.headers.get("Authorization");
  if (header === null || !header.toLowerCase().startsWith("bearer ")) return null;
  const jwt = header.slice("bearer ".length).trim();
  if (jwt.length === 0) return null;
  const resp = await fetch(`${mustEnv("SUPABASE_URL")}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    },
  });
  if (!resp.ok) return null;
  const body = (await resp.json()) as { id?: unknown };
  return typeof body.id === "string" ? body.id : null;
}

import { PROMPTS } from "./prompts.bundle.ts";

/**
 * Read a prompt by name. Prompts ship as a TS bundle because the
 * Supabase deployer's static-import scan does not pick up .md assets —
 * embedding the markdown as a TS constant guarantees the deployer
 * always ships it with each function. The .md files in
 * `_shared/ai/prompts/` stay as the human-editable source.
 */
export function readPrompt(name: string): string {
  const text = PROMPTS[name];
  if (text === undefined) throw new Error(`prompt ${name}.md not found`);
  return text;
}

/** Log usage to ai_usage_log. Fire-and-forget; failures don't block the answer. */
export async function logUsage(
  jwt: string,
  entry: {
    readonly task: string;
    readonly model: string;
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly latencyMs: number;
  },
): Promise<void> {
  try {
    await fetch(`${mustEnv("SUPABASE_URL")}/rest/v1/ai_usage_log`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        apikey: mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        provider: "OLLAMA",
        model: entry.model,
        task: entry.task,
        prompt_tokens: entry.promptTokens,
        completion_tokens: entry.completionTokens,
        cost_usd: 0,
        latency_ms: entry.latencyMs,
      }),
    });
  } catch (_err) {
    // Swallow.
  }
}

/** Fetch a single note (caller's RLS scope) and return null if missing. */
export async function fetchNoteSnapshot(
  jwt: string,
  noteId: string,
): Promise<{ title: string; bodyJson: string } | null> {
  const resp = await fetch(
    `${mustEnv("SUPABASE_URL")}/rest/v1/notes?select=title,body_json&id=eq.${encodeURIComponent(noteId)}`,
    {
      headers: {
        Authorization: `Bearer ${jwt}`,
        apikey: mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
      },
    },
  );
  if (!resp.ok) return null;
  const rows = (await resp.json()) as Array<{ title: string; body_json: unknown }>;
  const row = rows[0];
  if (row === undefined) return null;
  return {
    title: row.title,
    bodyJson: typeof row.body_json === "string" ? row.body_json : JSON.stringify(row.body_json),
  };
}
