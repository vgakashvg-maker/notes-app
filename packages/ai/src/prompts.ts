/**
 * Prompt loader. Each prompt is a Markdown file with YAML front-matter
 * declaring the task name, version, default model, and a map of
 * per-provider:model overrides. Sections in the body are introduced
 * by `# system`, `# fewshot`, etc. — the loader returns them as a
 * dictionary so the per-task functions can stitch them together.
 *
 * Prompts are bundled as plain strings (imported once at package load
 * time) so the Edge Function doesn't have to read the filesystem at
 * request time.
 */

export interface PromptFrontMatter {
  readonly task: string;
  readonly version: number;
  readonly default_model: string;
  readonly overrides: Readonly<Record<string, string>>;
}

export interface ParsedPrompt {
  readonly meta: PromptFrontMatter;
  readonly sections: Readonly<Record<string, string>>;
}

export function parsePrompt(source: string): ParsedPrompt {
  const fmMatch = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source);
  if (fmMatch === null) {
    throw new Error("Prompt must start with --- YAML front-matter --- block");
  }
  const fmBody = fmMatch[1] ?? "";
  const body = fmMatch[2] ?? "";
  const meta = parseFrontMatter(fmBody);
  const sections = parseSections(body);
  return { meta, sections };
}

function parseFrontMatter(raw: string): PromptFrontMatter {
  let task: string | null = null;
  let version: number | null = null;
  let defaultModel: string | null = null;
  let overrides: Record<string, string> = {};
  // Tiny line-based YAML parser — sufficient for the small surface
  // we use (task, version, default_model, overrides: {} or kv pairs).
  const lines = raw.split("\n");
  let inOverrides = false;
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    if (inOverrides) {
      if (!line.startsWith("  ")) {
        inOverrides = false;
      } else {
        // Override keys can contain a `:` (e.g. `anthropic:claude-haiku-4-5`)
        // so we split on the LAST `: ` (colon + space) separator rather
        // than the first `:`.
        const sepIdx = line.lastIndexOf(": ");
        if (sepIdx !== -1) {
          const k = line.slice(0, sepIdx).trim();
          const v = line.slice(sepIdx + 2).trim();
          overrides[k] = stripQuotes(v);
        }
        continue;
      }
    }
    const [keyPart, ...rest] = line.split(":");
    if (keyPart === undefined) continue;
    const key = keyPart.trim();
    const value = rest.join(":").trim();
    if (value === "{}") {
      if (key === "overrides") overrides = {};
      continue;
    }
    if (key === "overrides" && value.length === 0) {
      inOverrides = true;
      continue;
    }
    switch (key) {
      case "task":
        task = stripQuotes(value);
        break;
      case "version":
        version = Number.parseInt(value, 10);
        break;
      case "default_model":
        defaultModel = stripQuotes(value);
        break;
    }
  }
  if (task === null) throw new Error("Prompt front-matter is missing `task`");
  if (version === null) throw new Error("Prompt front-matter is missing `version`");
  if (defaultModel === null) throw new Error("Prompt front-matter is missing `default_model`");
  return { task, version, default_model: defaultModel, overrides };
}

function parseSections(body: string): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  // Sections are introduced by `# name` lines. Anything before the
  // first section is the implicit "preamble" section.
  const lines = body.split("\n");
  let current = "preamble";
  let buf: string[] = [];
  for (const line of lines) {
    const heading = /^#\s+(\S+)\s*$/.exec(line);
    if (heading !== null) {
      out[current] = buf.join("\n").trim();
      current = heading[1]!.toLowerCase();
      buf = [];
      continue;
    }
    buf.push(line);
  }
  out[current] = buf.join("\n").trim();
  return out;
}

function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/**
 * Read a prompt source string and return the system block, optionally
 * concatenated with the fewshot block. The Edge Function passes
 * `includeFewshot=true` for chat; per-task functions use false where
 * a strict output format makes the example block redundant.
 */
export function composeSystemBlock(prompt: ParsedPrompt, includeFewshot: boolean): string {
  const system = prompt.sections.system?.trim() ?? "";
  if (!includeFewshot) return system;
  const fewshot = prompt.sections.fewshot?.trim() ?? "";
  if (fewshot.length === 0) return system;
  return `${system}\n\n# Examples\n\n${fewshot}`;
}
