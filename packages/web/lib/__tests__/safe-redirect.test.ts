import { describe, expect, it } from "vitest";
import { safeRedirectTarget } from "../safe-redirect";

describe("safeRedirectTarget", () => {
  it("returns the input when it's a single-slash path", () => {
    expect(safeRedirectTarget("/")).toBe("/");
    expect(safeRedirectTarget("/notes")).toBe("/notes");
    expect(safeRedirectTarget("/notes/abc-123")).toBe("/notes/abc-123");
    expect(safeRedirectTarget("/search?q=foo&mode=semantic")).toBe("/search?q=foo&mode=semantic");
    expect(safeRedirectTarget("/chat#last")).toBe("/chat#last");
  });

  it("falls back to / when input is missing or empty", () => {
    expect(safeRedirectTarget(null)).toBe("/");
    expect(safeRedirectTarget(undefined)).toBe("/");
    expect(safeRedirectTarget("")).toBe("/");
    expect(safeRedirectTarget("   ")).toBe("/");
  });

  it("rejects protocol-relative URLs (//evil.com)", () => {
    expect(safeRedirectTarget("//evil.com")).toBe("/");
    expect(safeRedirectTarget("//evil.com/path")).toBe("/");
    expect(safeRedirectTarget("///still-evil")).toBe("/");
  });

  it("rejects backslash-smuggle attempts (/\\evil.com)", () => {
    expect(safeRedirectTarget("/\\evil.com")).toBe("/");
    expect(safeRedirectTarget("/\\\\evil.com")).toBe("/");
  });

  it("rejects absolute URLs even on our own origin", () => {
    expect(safeRedirectTarget("https://notes.example.com/notes")).toBe("/");
    expect(safeRedirectTarget("http://localhost:3000/")).toBe("/");
    expect(safeRedirectTarget("javascript:alert(1)")).toBe("/");
    expect(safeRedirectTarget("data:text/html,<script>")).toBe("/");
  });

  it("rejects relative paths that don't start with /", () => {
    expect(safeRedirectTarget("notes")).toBe("/");
    expect(safeRedirectTarget("./notes")).toBe("/");
    expect(safeRedirectTarget("../escape")).toBe("/");
  });
});
