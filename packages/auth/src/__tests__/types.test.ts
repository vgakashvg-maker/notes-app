import { describe, expect, it } from "vitest";
import { AuthResult, GOOGLE_SCOPES } from "../types.js";
import { makeUser, UserId, type AIPreferences, type User } from "@notes-app/domain";

const PREFS: AIPreferences = {
  chatProvider: "OLLAMA",
  chatModel: "qwen2.5:7b",
  tagProvider: "OLLAMA",
  tagModel: "llama3.2:3b",
  embeddingProvider: "OLLAMA",
  embeddingModel: "nomic-embed-text",
};

const USER: User = makeUser({
  userId: UserId("550e8400-e29b-41d4-a716-446655440000"),
  displayName: "Vgaka",
  storageProvider: "GOOGLE_DRIVE",
  calendarProvider: "GOOGLE_CALENDAR",
  aiPrefs: PREFS,
  analyticsOptOut: false,
});

describe("AuthResult", () => {
  it("Success carries the user", () => {
    expect(AuthResult.success(USER)).toEqual({ kind: "Success", user: USER });
  });

  it("Cancelled rejects a blank reason", () => {
    expect(() => AuthResult.cancelled(" ")).toThrow(/cannot be empty/);
  });

  it("Error rejects a blank message", () => {
    expect(() => AuthResult.error("")).toThrow(/cannot be empty/);
  });

  it("Error preserves an optional cause", () => {
    const cause = new Error("network down");
    const result = AuthResult.error("Sign-in failed", cause);
    expect(result.kind).toBe("Error");
    if (result.kind === "Error") {
      expect(result.cause).toBe(cause);
    }
  });
});

describe("GOOGLE_SCOPES", () => {
  it("requests Drive, Calendar, and userinfo scopes only", () => {
    expect(GOOGLE_SCOPES).toEqual([
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ]);
  });
});
