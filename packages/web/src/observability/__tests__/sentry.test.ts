import { describe, expect, it } from "vitest";
import { initSentry } from "../sentry.js";

describe("initSentry", () => {
  it("is disabled when no DSN is configured", () => {
    const client = initSentry({ dsn: undefined });
    expect(client.enabled).toBe(false);
    expect(client.environment).toBe("development");
  });

  it("is disabled for blank DSN strings", () => {
    const client = initSentry({ dsn: "   " });
    expect(client.enabled).toBe(false);
  });

  it("is enabled when a DSN and environment are provided", () => {
    const client = initSentry({
      dsn: "https://example@sentry.io/1",
      environment: "production",
      release: "abc123",
    });
    expect(client.enabled).toBe(true);
    expect(client.environment).toBe("production");
    expect(client.release).toBe("abc123");
  });
});
