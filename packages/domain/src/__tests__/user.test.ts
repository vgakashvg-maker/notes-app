import { describe, expect, it } from "vitest";
import { makeUser, type AIPreferences, type User } from "../user.js";
import { UserId } from "../ids.js";

const ID = UserId("550e8400-e29b-41d4-a716-446655440000");

const DEFAULT_AI: AIPreferences = {
  chatProvider: "OLLAMA",
  chatModel: "qwen2.5:7b",
  tagProvider: "OLLAMA",
  tagModel: "llama3.2:3b",
  embeddingProvider: "OLLAMA",
  embeddingModel: "nomic-embed-text",
};

function base(overrides: Partial<User> = {}): User {
  return {
    userId: ID,
    displayName: "Vgaka",
    storageProvider: "GOOGLE_DRIVE",
    calendarProvider: "GOOGLE_CALENDAR",
    aiPrefs: DEFAULT_AI,
    analyticsOptOut: false,
    ...overrides,
  };
}

describe("makeUser", () => {
  it("accepts a valid user", () => {
    expect(makeUser(base()).displayName).toBe("Vgaka");
  });

  it("rejects a blank display name", () => {
    expect(() => makeUser(base({ displayName: "" }))).toThrow(/displayName/);
  });

  it("rejects an unknown storage provider", () => {
    expect(() => makeUser(base({ storageProvider: "DROPBOX" as User["storageProvider"] }))).toThrow(
      /storageProvider/,
    );
  });

  it("rejects an unknown calendar provider", () => {
    expect(() =>
      makeUser(base({ calendarProvider: "FANTASTICAL" as User["calendarProvider"] })),
    ).toThrow(/calendarProvider/);
  });

  it("rejects empty model names", () => {
    expect(() => makeUser(base({ aiPrefs: { ...DEFAULT_AI, chatModel: "" } }))).toThrow(
      /chatModel/,
    );
  });
});
