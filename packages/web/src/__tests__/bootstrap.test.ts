import { describe, expect, it } from "vitest";
import { bootstrap } from "../index.js";

describe("bootstrap", () => {
  it("returns the app identity", () => {
    const result = bootstrap({} as NodeJS.ProcessEnv);
    expect(result.app).toBe("notes-app");
  });

  it("respects the opt-out env flag for analytics", () => {
    const result = bootstrap({
      ANALYTICS_OPTOUT: "true",
      POSTHOG_KEY: "phc_123",
    } as unknown as NodeJS.ProcessEnv);
    expect(result.app).toBe("notes-app");
  });
});
