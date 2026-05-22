import { describe, expect, it, vi } from "vitest";
import type { AIProvider } from "@notes-app/domain";
import {
  briefing,
  compressTurns,
  extractActionItems,
  rewrite,
  suggestTags,
  suggestTitle,
  summarize,
  type PromptSource,
  type TaskDeps,
} from "../tasks.js";

const PROMPT: PromptSource = { system: "system block" };

function provider(content: string): AIProvider {
  return {
    id: "OLLAMA",
    capabilities: new Set(["STREAMING", "EMBEDDINGS"]),
    chat: vi.fn(async () => ({
      content,
      model: "qwen2.5:7b",
      promptTokens: 10,
      completionTokens: 5,
      latencyMs: 1,
    })),
    streamChat: vi.fn(),
    embed: vi.fn(),
    listModels: vi.fn(),
    ping: vi.fn(),
  } as unknown as AIProvider;
}

function deps(p: AIProvider): TaskDeps {
  return { provider: p };
}

describe("summarize", () => {
  it("returns the trimmed model output", async () => {
    const out = await summarize(
      "note body",
      "short",
      PROMPT,
      deps(provider("Two sentences. Here.")),
    );
    expect(out).toBe("Two sentences. Here.");
  });
});

describe("suggestTags", () => {
  it("parses a JSON array and caps to 5", async () => {
    const out = await suggestTags(
      "body",
      PROMPT,
      deps(provider('["tax-2026","schedule-c","accountant","deadline","home-office","extra-tag"]')),
    );
    expect(out).toEqual(["tax-2026", "schedule-c", "accountant", "deadline", "home-office"]);
  });

  it("falls back to comma-separated parsing if JSON fails", async () => {
    const out = await suggestTags(
      "body",
      PROMPT,
      deps(provider("tax-2026, schedule-c, accountant")),
    );
    expect(out).toEqual(["tax-2026", "schedule-c", "accountant"]);
  });

  it("strips Markdown code fences before parsing", async () => {
    const out = await suggestTags("body", PROMPT, deps(provider('```json\n["one","two"]\n```')));
    expect(out).toEqual(["one", "two"]);
  });
});

describe("suggestTitle", () => {
  it("returns the trimmed title without surrounding quotes", async () => {
    const out = await suggestTitle("body", PROMPT, deps(provider('"My Title"')));
    expect(out).toBe("My Title");
  });
});

describe("extractActionItems", () => {
  it("parses a JSON array of actions", async () => {
    const out = await extractActionItems(
      "body",
      PROMPT,
      deps(provider('["Email Pat","Pay the invoice"]')),
    );
    expect(out).toEqual(["Email Pat", "Pay the invoice"]);
  });

  it("returns empty array when the model says []", async () => {
    const out = await extractActionItems("body", PROMPT, deps(provider("[]")));
    expect(out).toEqual([]);
  });
});

describe("rewrite", () => {
  it("threads instruction and text via the user turn", async () => {
    let capturedUser = "";
    const p = {
      id: "OLLAMA",
      capabilities: new Set(["STREAMING", "EMBEDDINGS"]),
      chat: vi.fn(async (messages: readonly { role: string; content: string }[]) => {
        capturedUser = messages[1]?.content ?? "";
        return {
          content: "rewritten",
          model: "m",
          promptTokens: 10,
          completionTokens: 5,
          latencyMs: 1,
        };
      }),
      streamChat: vi.fn(),
      embed: vi.fn(),
      listModels: vi.fn(),
      ping: vi.fn(),
    } as unknown as AIProvider;
    const out = await rewrite("Original text", "Make concise", PROMPT, deps(p));
    expect(out).toBe("rewritten");
    expect(capturedUser).toContain("INSTRUCTION: Make concise");
    expect(capturedUser).toContain("Original text");
  });
});

describe("compressTurns", () => {
  it("emits a compressed paragraph", async () => {
    const out = await compressTurns(
      "user said X / assistant said Y",
      PROMPT,
      deps(provider("Compressed paragraph.")),
    );
    expect(out).toBe("Compressed paragraph.");
  });
});

describe("briefing", () => {
  it("formats the structured input + returns the model output", async () => {
    let capturedUser = "";
    const p = {
      id: "OLLAMA",
      capabilities: new Set(["STREAMING", "EMBEDDINGS"]),
      chat: vi.fn(async (messages: readonly { role: string; content: string }[]) => {
        capturedUser = messages[1]?.content ?? "";
        return {
          content: "## Yesterday\n- foo",
          model: "qwen2.5:7b",
          promptTokens: 200,
          completionTokens: 30,
          latencyMs: 1,
        };
      }),
      streamChat: vi.fn(),
      embed: vi.fn(),
      listModels: vi.fn(),
      ping: vi.fn(),
    } as unknown as AIProvider;
    const out = await briefing(
      {
        date: "2026-05-22",
        yesterdayNotes: [{ title: "Tax", snippet: "filed early" }],
        todayEvents: [{ title: "Standup", startAt: "09:00" }],
        openActions: ["Email Pat"],
      },
      PROMPT,
      deps(p),
    );
    expect(out).toContain("## Yesterday");
    expect(capturedUser).toContain("DATE: 2026-05-22");
    expect(capturedUser).toContain("Tax: filed early");
    expect(capturedUser).toContain("09:00 Standup");
    expect(capturedUser).toContain("Email Pat");
  });

  it("falls back to (no notes) / (no events) / (none) when sections are empty", async () => {
    let capturedUser = "";
    const p = {
      id: "OLLAMA",
      capabilities: new Set(["STREAMING", "EMBEDDINGS"]),
      chat: vi.fn(async (messages: readonly { role: string; content: string }[]) => {
        capturedUser = messages[1]?.content ?? "";
        return { content: "out", model: "m", promptTokens: 1, completionTokens: 1, latencyMs: 1 };
      }),
      streamChat: vi.fn(),
      embed: vi.fn(),
      listModels: vi.fn(),
      ping: vi.fn(),
    } as unknown as AIProvider;
    await briefing(
      { date: "2026-05-22", yesterdayNotes: [], todayEvents: [], openActions: [] },
      PROMPT,
      deps(p),
    );
    expect(capturedUser).toContain("(no notes)");
    expect(capturedUser).toContain("(no events)");
    expect(capturedUser).toContain("(none)");
  });
});
