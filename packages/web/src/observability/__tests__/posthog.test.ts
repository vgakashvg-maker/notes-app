import { describe, expect, it } from "vitest";
import { initPostHog } from "../posthog.js";

describe("initPostHog", () => {
  it("is disabled when the user has opted out", () => {
    const client = initPostHog({ key: "phc_123", analyticsOptOut: true });
    expect(client.enabled).toBe(false);
    expect(client.optedOut).toBe(true);
  });

  it("is disabled when no key is configured", () => {
    const client = initPostHog({ key: undefined, analyticsOptOut: false });
    expect(client.enabled).toBe(false);
    expect(client.optedOut).toBe(false);
  });

  it("is enabled when a key is provided and the user has not opted out", () => {
    const client = initPostHog({
      key: "phc_123",
      host: "https://example.posthog.com",
      analyticsOptOut: false,
    });
    expect(client.enabled).toBe(true);
    expect(client.host).toBe("https://example.posthog.com");
  });

  it("falls back to the default host when none provided", () => {
    const client = initPostHog({ key: "phc_123", analyticsOptOut: false });
    expect(client.host).toBe("https://us.i.posthog.com");
  });
});
