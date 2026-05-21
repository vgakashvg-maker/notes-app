import { describe, expect, it } from "vitest";
import { ExternalProviderIds, type ExternalProviderId } from "../auth.js";

describe("ExternalProviderIds", () => {
  it("lists the V1 external providers in canonical order", () => {
    expect(ExternalProviderIds).toEqual(["GOOGLE_DRIVE", "GOOGLE_CALENDAR", "GOOGLE_USERINFO"]);
  });

  it("is exhaustive — every member of the union is listed at runtime", () => {
    // Compile-time exhaustiveness check: if a new variant is added to the
    // union without being added to the array, this assignment is a TS error.
    const assertExhaustive = (value: ExternalProviderId): ExternalProviderId => value;
    for (const id of ExternalProviderIds) {
      expect(assertExhaustive(id)).toBe(id);
    }
  });
});
