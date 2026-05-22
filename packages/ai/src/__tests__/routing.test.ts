import { describe, expect, it } from "vitest";
import { V1_ROUTES, staticRouter } from "../routing.js";

describe("V1 routing", () => {
  it("routes chat / summarize / extract / rewrite / briefing to qwen2.5:7b", () => {
    for (const task of ["chat", "summarize", "extract_actions", "rewrite", "briefing"] as const) {
      expect(V1_ROUTES[task].model).toBe("qwen2.5:7b");
      expect(V1_ROUTES[task].provider).toBe("OLLAMA");
    }
  });

  it("routes tagging / title / compression to llama3.2:3b", () => {
    for (const task of ["suggest_tags", "suggest_title", "compression"] as const) {
      expect(V1_ROUTES[task].model).toBe("llama3.2:3b");
    }
  });

  it("routes embed to nomic-embed-text", () => {
    expect(V1_ROUTES.embed.model).toBe("nomic-embed-text");
  });

  it("staticRouter.routeFor proxies V1_ROUTES", () => {
    expect(staticRouter.routeFor("chat").model).toBe("qwen2.5:7b");
  });
});
