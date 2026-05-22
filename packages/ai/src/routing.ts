/**
 * AI routing — the V1 default map (`V1_ROUTES`) plus the M15
 * settings-driven router (`dynamicRouter`). Consumers (M09 RAG pipeline,
 * the per-task functions, Edge Functions) call `routeFor(task)` and stay
 * unaware of which router is active.
 *
 * Per CLAUDE.md (`Hardware / runtime AI` section) the chat model is
 * `qwen2.5:7b` (not the spec's llama3.1:8b suggestion). Tagging /
 * compression run on `llama3.2:3b` (cheap, fast). Embedding stays on
 * `nomic-embed-text` to match the M10 namespace.
 */

import type { AIProviderId, AITask, AdapterBinding, RoutingConfig } from "@notes-app/domain";

export type { AITask } from "@notes-app/domain";

export interface Route {
  readonly provider: AIProviderId;
  readonly model: string;
  /** Approximate context window of the routed model — used for compression heuristics. */
  readonly contextTokens: number;
}

export const V1_ROUTES: Readonly<Record<AITask, Route>> = {
  chat: { provider: "OLLAMA", model: "qwen2.5:7b", contextTokens: 32_768 },
  summarize: { provider: "OLLAMA", model: "qwen2.5:7b", contextTokens: 32_768 },
  suggest_tags: { provider: "OLLAMA", model: "llama3.2:3b", contextTokens: 8_192 },
  suggest_title: { provider: "OLLAMA", model: "llama3.2:3b", contextTokens: 8_192 },
  extract_actions: { provider: "OLLAMA", model: "qwen2.5:7b", contextTokens: 32_768 },
  rewrite: { provider: "OLLAMA", model: "qwen2.5:7b", contextTokens: 32_768 },
  briefing: { provider: "OLLAMA", model: "qwen2.5:7b", contextTokens: 32_768 },
  compression: { provider: "OLLAMA", model: "llama3.2:3b", contextTokens: 8_192 },
  embed: { provider: "OLLAMA", model: "nomic-embed-text", contextTokens: 0 },
};

/**
 * Lightweight in-package model registry. Adding a new model to the
 * dropdown that isn't here gets a conservative context-token default at
 * resolve time. Callers that care about exactness (e.g. compression
 * heuristics) should consult this directly.
 */
export const MODEL_REGISTRY: Readonly<Record<string, number>> = {
  "qwen2.5:7b": 32_768,
  "llama3.2:3b": 8_192,
  "llama3.1:8b": 8_192,
  "nomic-embed-text": 0,
};

const FALLBACK_CONTEXT_TOKENS = 8_192;

export interface Router {
  routeFor(task: AITask): Route;
}

export const staticRouter: Router = {
  routeFor(task: AITask): Route {
    return V1_ROUTES[task];
  },
};

/**
 * Routes from a user-supplied `RoutingConfig`. Per-key fallback to
 * `V1_ROUTES` keeps partial overrides safe — the user can pin only
 * `chat` and leave the rest alone. `contextTokens` is looked up from
 * `MODEL_REGISTRY` so a custom model id from `/api/tags` doesn't
 * require a code change.
 */
export function dynamicRouter(config: RoutingConfig | null | undefined): Router {
  return {
    routeFor(task: AITask): Route {
      const override = (config ?? {})[task];
      if (override === undefined) return V1_ROUTES[task];
      return materialize(override);
    },
  };
}

function materialize(binding: AdapterBinding): Route {
  if (binding.model === "nomic-embed-text") {
    return { provider: binding.provider, model: binding.model, contextTokens: 0 };
  }
  const ctx = MODEL_REGISTRY[binding.model] ?? FALLBACK_CONTEXT_TOKENS;
  return { provider: binding.provider, model: binding.model, contextTokens: ctx };
}
