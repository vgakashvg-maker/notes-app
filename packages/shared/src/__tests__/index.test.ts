import { describe, expect, it } from "vitest";
import { APP_NAME, isBlank } from "../index.js";

describe("shared", () => {
  it("exposes the app name", () => {
    expect(APP_NAME).toBe("notes-app");
  });

  it("treats empty, whitespace, null, and undefined as blank", () => {
    expect(isBlank("")).toBe(true);
    expect(isBlank("   ")).toBe(true);
    expect(isBlank(null)).toBe(true);
    expect(isBlank(undefined)).toBe(true);
  });

  it("treats non-empty strings as not blank", () => {
    expect(isBlank("hello")).toBe(false);
  });
});
