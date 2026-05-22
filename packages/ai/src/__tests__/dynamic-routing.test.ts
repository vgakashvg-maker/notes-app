import { describe, expect, it } from "vitest";
import { dynamicRouter, V1_ROUTES } from "../routing.js";

describe("dynamicRouter", () => {
  it("returns V1_ROUTES when no config is supplied", () => {
    const r = dynamicRouter(null);
    expect(r.routeFor("chat")).toEqual(V1_ROUTES.chat);
    expect(r.routeFor("embed")).toEqual(V1_ROUTES.embed);
  });

  it("applies a single-key override", () => {
    const r = dynamicRouter({
      chat: { provider: "OLLAMA", model: "qwen2.5:7b" },
    });
    expect(r.routeFor("chat").model).toBe("qwen2.5:7b");
    // Untouched keys fall through to V1.
    expect(r.routeFor("summarize")).toEqual(V1_ROUTES.summarize);
  });

  it("resolves contextTokens via MODEL_REGISTRY for known models", () => {
    const r = dynamicRouter({
      chat: { provider: "OLLAMA", model: "llama3.2:3b" },
    });
    expect(r.routeFor("chat").contextTokens).toBe(8_192);
  });

  it("uses a conservative contextTokens fallback for unknown models", () => {
    const r = dynamicRouter({
      chat: { provider: "OLLAMA", model: "fictional:42b" },
    });
    // Fallback is 8_192; the route itself still surfaces the model id.
    expect(r.routeFor("chat").contextTokens).toBe(8_192);
    expect(r.routeFor("chat").model).toBe("fictional:42b");
  });

  it("forces embed's contextTokens to zero regardless of the registry value", () => {
    const r = dynamicRouter({
      embed: { provider: "OLLAMA", model: "nomic-embed-text" },
    });
    expect(r.routeFor("embed").contextTokens).toBe(0);
  });

  it("handles every task key", () => {
    const r = dynamicRouter({});
    const keys = Object.keys(V1_ROUTES) as Array<keyof typeof V1_ROUTES>;
    for (const k of keys) {
      expect(r.routeFor(k)).toEqual(V1_ROUTES[k]);
    }
  });
});
