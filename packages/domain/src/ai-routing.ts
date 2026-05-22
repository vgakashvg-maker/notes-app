import type { AIProviderId } from "./enums.js";

/**
 * Canonical task taxonomy for AI routing. Matches the keys M09's
 * `V1_ROUTES` already uses, so the M15 dynamic router replaces the
 * static one without churning consumers.
 */
export type AITask =
  | "chat"
  | "summarize"
  | "suggest_tags"
  | "suggest_title"
  | "extract_actions"
  | "rewrite"
  | "briefing"
  | "compression"
  | "embed";

export const AI_TASKS: readonly AITask[] = [
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

/** A single (provider, model) pair. Provider is the canonical enum. */
export interface AdapterBinding {
  readonly provider: AIProviderId;
  readonly model: string;
}

/**
 * The persisted shape under `users_profile.ai_prefs.routing`. All task
 * keys are optional — missing entries fall back to V1_ROUTES at resolve
 * time so partial overrides are safe to ship.
 */
export interface RoutingConfig {
  readonly chat?: AdapterBinding;
  readonly summarize?: AdapterBinding;
  readonly suggest_tags?: AdapterBinding;
  readonly suggest_title?: AdapterBinding;
  readonly extract_actions?: AdapterBinding;
  readonly rewrite?: AdapterBinding;
  readonly briefing?: AdapterBinding;
  readonly compression?: AdapterBinding;
  readonly embed?: AdapterBinding;
}

/**
 * Endpoint URL per provider, indexed by provider id. Ollama is the only
 * one with a meaningful endpoint in V1 (well-known URLs cover OpenAI /
 * Anthropic in V2). Empty / missing entry → fall back to the
 * `OLLAMA_ENDPOINT_URL` env var that already serves M09.
 */
export type ProviderEndpoints = Partial<Record<AIProviderId, string>>;

/**
 * Full payload stored under `users_profile.ai_prefs`. `version` lets us
 * migrate the shape later; routing + endpoints are independent so a
 * routing-only update doesn't reset the endpoint.
 */
export interface AIPrefsPayload {
  readonly version: 1;
  readonly routing?: RoutingConfig;
  readonly endpoints?: ProviderEndpoints;
}

/**
 * The settings-side port. The M15 adapter (web + Android) reads / writes
 * this; M09's router reads through it to pick the active route.
 */
export interface AIRouting {
  providersAvailable(): Promise<readonly AIProviderId[]>;
  getRouting(): Promise<RoutingConfig>;
  setRouting(config: RoutingConfig): Promise<void>;
  getEndpoint(provider: AIProviderId): Promise<string | null>;
  setEndpoint(provider: AIProviderId, url: string): Promise<void>;
  resolveFor(task: AITask): Promise<AdapterBinding>;
}

/**
 * V2 key store. Built in V1 (table exists, RLS enforced) but unused —
 * lights up when Anthropic / OpenAI providers land.
 */
export interface AIKeyStore {
  putKey(provider: AIProviderId, secret: string): Promise<void>;
  hasKey(provider: AIProviderId): Promise<boolean>;
  deleteKey(provider: AIProviderId): Promise<void>;
}
