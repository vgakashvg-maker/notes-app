import { describe, expect, it } from "vitest";
import { composeSystemBlock, parsePrompt } from "../prompts.js";

const sample = `---
task: chat
version: 3
default_model: qwen2.5:7b
overrides:
  anthropic:claude-haiku-4-5: prompts/overrides/chat.claude.md
---

# system

System content here.

# fewshot

Example block.
`;

describe("parsePrompt", () => {
  it("parses front-matter scalars + overrides + sections", () => {
    const p = parsePrompt(sample);
    expect(p.meta.task).toBe("chat");
    expect(p.meta.version).toBe(3);
    expect(p.meta.default_model).toBe("qwen2.5:7b");
    expect(p.meta.overrides["anthropic:claude-haiku-4-5"]).toBe("prompts/overrides/chat.claude.md");
    expect(p.sections.system).toContain("System content here.");
    expect(p.sections.fewshot).toContain("Example block.");
  });

  it("handles empty overrides ({})", () => {
    const noOverrides = sample.replace(/overrides:\n  anthropic[\s\S]*?\.md/, "overrides: {}");
    const p = parsePrompt(noOverrides);
    expect(p.meta.overrides).toEqual({});
  });

  it("throws when front-matter is missing", () => {
    expect(() => parsePrompt("# system\nhi")).toThrow(/YAML front-matter/);
  });

  it("throws when required keys are absent", () => {
    expect(() => parsePrompt(`---\ntask: chat\nversion: 1\n---\n\nbody`)).toThrow(/default_model/);
  });
});

describe("composeSystemBlock", () => {
  it("returns just the system body when includeFewshot is false", () => {
    const p = parsePrompt(sample);
    expect(composeSystemBlock(p, false)).toBe("System content here.");
  });

  it("appends the fewshot section when includeFewshot is true", () => {
    const p = parsePrompt(sample);
    const out = composeSystemBlock(p, true);
    expect(out).toContain("System content here.");
    expect(out).toContain("# Examples");
    expect(out).toContain("Example block.");
  });
});
