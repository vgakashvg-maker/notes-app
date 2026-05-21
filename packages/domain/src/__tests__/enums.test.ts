import { describe, expect, it } from "vitest";
import { AIProviderIds, CalendarProviderIds, StorageProviderIds, SyncStatus } from "../enums.js";
import { NoteId } from "../ids.js";

const NOTE_ID = NoteId("550e8400-e29b-41d4-a716-446655440000");

describe("provider catalogues", () => {
  it("lists the V1 storage providers", () => {
    expect(StorageProviderIds).toEqual(["GOOGLE_DRIVE", "ONEDRIVE"]);
  });

  it("lists the V1 calendar providers", () => {
    expect(CalendarProviderIds).toEqual(["GOOGLE_CALENDAR", "MICROSOFT_GRAPH"]);
  });

  it("lists OLLAMA among the AI providers", () => {
    expect(AIProviderIds).toContain("OLLAMA");
  });
});

describe("SyncStatus", () => {
  it("Idle has no payload", () => {
    expect(SyncStatus.idle()).toEqual({ kind: "Idle" });
  });

  it("Syncing accepts a non-negative item count", () => {
    expect(SyncStatus.syncing("UP", 5)).toEqual({
      kind: "Syncing",
      direction: "UP",
      itemsRemaining: 5,
    });
  });

  it("Syncing rejects a negative item count", () => {
    expect(() => SyncStatus.syncing("DOWN", -1)).toThrow(/itemsRemaining/);
  });

  it("Error rejects a blank message", () => {
    expect(() => SyncStatus.error("   ", true)).toThrow(/cannot be empty/);
  });

  it("Conflict carries the offending NoteId", () => {
    const status = SyncStatus.conflict(NOTE_ID);
    expect(status).toEqual({ kind: "Conflict", noteId: NOTE_ID });
  });
});
