import { describe, expect, it } from "vitest";
import {
  DEFAULT_NAMESPACE,
  EMBEDDING_DIMENSION,
  assertNamespace,
  isValidNamespace,
} from "../namespace.js";

describe("namespace", () => {
  it("pins V1 defaults", () => {
    expect(DEFAULT_NAMESPACE).toBe("ollama:nomic-embed-text");
    expect(EMBEDDING_DIMENSION).toBe(768);
  });

  it("accepts well-formed provider:model values", () => {
    expect(isValidNamespace("ollama:nomic-embed-text")).toBe(true);
    expect(isValidNamespace("anthropic:voyage-3")).toBe(true);
    expect(isValidNamespace("openai:text-embedding-3-small")).toBe(true);
  });

  it("rejects malformed namespaces", () => {
    expect(isValidNamespace("")).toBe(false);
    expect(isValidNamespace("ollama")).toBe(false);
    expect(isValidNamespace(":model")).toBe(false);
    expect(isValidNamespace("provider:")).toBe(false);
    expect(isValidNamespace("ollama:has space")).toBe(false);
  });

  it("assertNamespace throws on invalid input", () => {
    expect(() => assertNamespace("bad")).toThrow();
  });
});
