/**
 * Hard-coded routing map for V1 — M15 will replace this with a
 * settings-driven version. The keys are the task names; values are the
 * routed model id (Ollama models for V1).
 *
 * Per CLAUDE.md (`Hardware / runtime AI` section) the chat model is
 * `qwen2.5:7b` (not the spec's llama3.1:8b suggestion). Tagging /
 * compression run on `llama3.2:3b` (cheap, fast). Embedding stays on
 * `nomic-embed-text` to match the M10 namespace.
 */

import type { AIProviderId } from "@notes-app/domain";

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

export interface Router {
  routeFor(task: AITask): Route;
}

export const staticRouter: Router = {
  routeFor(task: AITask): Route {
    return V1_ROUTES[task];
  },
};
