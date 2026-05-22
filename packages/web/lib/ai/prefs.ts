import type {
  AIPrefsPayload,
  AdapterBinding,
  ProviderEndpoints,
  RoutingConfig,
} from "@notes-app/domain";
import { getSupabaseBrowserClient } from "../supabase/browser";

/**
 * Client-side helpers for reading and writing the M15 AI prefs payload
 * under `users_profile.ai_prefs`. RLS scopes everything to the caller;
 * the payload is jsonb so partial updates are cheap.
 */

export async function loadAIPrefs(): Promise<AIPrefsPayload> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.from("users_profile").select("ai_prefs").maybeSingle();
  if (error !== null || data === null) {
    return { version: 1 };
  }
  return normalize((data as { ai_prefs: unknown }).ai_prefs);
}

export async function saveAIPrefs(next: AIPrefsPayload): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from("users_profile")
    .update({ ai_prefs: next })
    .neq("user_id", "00000000-0000-0000-0000-000000000000");
  if (error !== null) return { ok: false, error: error.message };
  return { ok: true };
}

export async function patchRouting(
  current: AIPrefsPayload,
  patch: RoutingConfig,
): Promise<{ ok: boolean; payload: AIPrefsPayload; error?: string }> {
  const next: AIPrefsPayload = {
    ...current,
    version: 1,
    routing: { ...(current.routing ?? {}), ...patch },
  };
  const result = await saveAIPrefs(next);
  return { ok: result.ok, payload: next, error: result.error };
}

export async function patchEndpoint(
  current: AIPrefsPayload,
  endpoints: ProviderEndpoints,
): Promise<{ ok: boolean; payload: AIPrefsPayload; error?: string }> {
  const next: AIPrefsPayload = {
    ...current,
    version: 1,
    endpoints: { ...(current.endpoints ?? {}), ...endpoints },
  };
  const result = await saveAIPrefs(next);
  return { ok: result.ok, payload: next, error: result.error };
}

/**
 * Coerces whatever PostgREST returned (legacy {} or a v1 payload) into
 * the typed shape. Unknown keys are dropped — the routing dropdown only
 * knows about the canonical task list.
 */
function normalize(raw: unknown): AIPrefsPayload {
  if (raw === null || typeof raw !== "object") return { version: 1 };
  const r = raw as Record<string, unknown>;
  const routing =
    r.routing !== null && typeof r.routing === "object"
      ? normalizeRouting(r.routing as Record<string, unknown>)
      : undefined;
  const endpoints =
    r.endpoints !== null && typeof r.endpoints === "object"
      ? normalizeEndpoints(r.endpoints as Record<string, unknown>)
      : undefined;
  return {
    version: 1,
    ...(routing !== undefined ? { routing } : {}),
    ...(endpoints !== undefined ? { endpoints } : {}),
  };
}

function normalizeRouting(raw: Record<string, unknown>): RoutingConfig {
  const TASKS = [
    "chat",
    "summarize",
    "suggest_tags",
    "suggest_title",
    "extract_actions",
    "rewrite",
    "briefing",
    "compression",
    "embed",
  ] as const;
  const out: Record<string, AdapterBinding> = {};
  for (const t of TASKS) {
    const v = raw[t];
    if (v !== null && typeof v === "object") {
      const obj = v as Record<string, unknown>;
      if (typeof obj.provider === "string" && typeof obj.model === "string") {
        out[t] = { provider: obj.provider as AdapterBinding["provider"], model: obj.model };
      }
    }
  }
  return out as RoutingConfig;
}

function normalizeEndpoints(raw: Record<string, unknown>): ProviderEndpoints {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") out[k] = v;
  }
  return out as ProviderEndpoints;
}
