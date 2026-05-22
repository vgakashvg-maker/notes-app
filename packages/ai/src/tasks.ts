import type { AIProvider, Message, SummaryLength } from "@notes-app/domain";
import { staticRouter, type Router, type AITask } from "./routing.js";

/**
 * Per-task one-shot functions. Each takes a prompt source (as a parsed
 * Markdown file via [PromptSource]) plus the dynamic user input and
 * returns the assistant's plain text. The Edge Functions wrap each of
 * these.
 */

export interface PromptSource {
  /** The composed system block (from parsePrompt + composeSystemBlock). */
  readonly system: string;
}

export interface TaskDeps {
  readonly provider: AIProvider;
  readonly router?: Router;
}

export async function summarize(
  noteBody: string,
  length: SummaryLength,
  prompt: PromptSource,
  deps: TaskDeps,
): Promise<string> {
  return runOneShot(
    "summarize",
    [
      { role: "system", content: prompt.system },
      { role: "user", content: `LENGTH: ${length}\n\nNOTE:\n${noteBody}` },
    ],
    deps,
  );
}

export async function suggestTags(
  noteBody: string,
  prompt: PromptSource,
  deps: TaskDeps,
): Promise<readonly string[]> {
  const raw = await runOneShot(
    "suggest_tags",
    [
      { role: "system", content: prompt.system },
      { role: "user", content: noteBody },
    ],
    deps,
  );
  return parseStringArray(raw, "suggest_tags").slice(0, 5);
}

export async function suggestTitle(
  noteBody: string,
  prompt: PromptSource,
  deps: TaskDeps,
): Promise<string> {
  const raw = await runOneShot(
    "suggest_title",
    [
      { role: "system", content: prompt.system },
      { role: "user", content: noteBody },
    ],
    deps,
  );
  return raw.trim().replace(/^["']|["']$/g, "");
}

export async function extractActionItems(
  noteBody: string,
  prompt: PromptSource,
  deps: TaskDeps,
): Promise<readonly string[]> {
  const raw = await runOneShot(
    "extract_actions",
    [
      { role: "system", content: prompt.system },
      { role: "user", content: noteBody },
    ],
    deps,
  );
  return parseStringArray(raw, "extract_actions");
}

export async function rewrite(
  text: string,
  instruction: string,
  prompt: PromptSource,
  deps: TaskDeps,
): Promise<string> {
  return runOneShot(
    "rewrite",
    [
      { role: "system", content: prompt.system },
      { role: "user", content: `INSTRUCTION: ${instruction}\n\nTEXT:\n${text}` },
    ],
    deps,
  );
}

export async function compressTurns(
  turnsToCompress: string,
  prompt: PromptSource,
  deps: TaskDeps,
): Promise<string> {
  return runOneShot(
    "compression",
    [
      { role: "system", content: prompt.system },
      { role: "user", content: turnsToCompress },
    ],
    deps,
  );
}

export interface BriefingInput {
  readonly date: string;
  readonly yesterdayNotes: readonly { readonly title: string; readonly snippet: string }[];
  readonly todayEvents: readonly { readonly title: string; readonly startAt: string }[];
  readonly openActions: readonly string[];
}

export async function briefing(
  input: BriefingInput,
  prompt: PromptSource,
  deps: TaskDeps,
): Promise<string> {
  const body = formatBriefingInput(input);
  return runOneShot(
    "briefing",
    [
      { role: "system", content: prompt.system },
      { role: "user", content: body },
    ],
    deps,
  );
}

function formatBriefingInput(input: BriefingInput): string {
  const yesterday =
    input.yesterdayNotes.length === 0
      ? "(no notes)"
      : input.yesterdayNotes.map((n) => `- ${n.title}: ${n.snippet}`).join("\n");
  const today =
    input.todayEvents.length === 0
      ? "(no events)"
      : input.todayEvents.map((e) => `- ${e.startAt} ${e.title}`).join("\n");
  const actions =
    input.openActions.length === 0 ? "(none)" : input.openActions.map((a) => `- ${a}`).join("\n");
  return [
    `DATE: ${input.date}`,
    "",
    "YESTERDAY:",
    yesterday,
    "",
    "TODAY (calendar):",
    today,
    "",
    "OPEN ACTION ITEMS:",
    actions,
  ].join("\n");
}

async function runOneShot(
  task: AITask,
  messages: readonly Message[],
  deps: TaskDeps,
): Promise<string> {
  const router = deps.router ?? staticRouter;
  const route = router.routeFor(task);
  const resp = await deps.provider.chat(messages, { model: route.model, temperature: 0.2 });
  return resp.content.trim();
}

function parseStringArray(raw: string, task: AITask): string[] {
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(stripped);
    if (!Array.isArray(parsed)) throw new Error("not an array");
    return parsed
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => v.trim());
  } catch (_err) {
    void _err;
    // Fallback for models that ignore the JSON-only instruction: parse
    // comma- or newline-separated lists.
    const items = stripped
      .split(/[\n,]+/)
      .map((s) => s.replace(/^[\s\-*"`]+|[\s\-*"`]+$/g, ""))
      .filter((s) => s.length > 0);
    if (items.length === 0) {
      throw new Error(`${task}: model output is not a parseable list`);
    }
    return items;
  }
}
