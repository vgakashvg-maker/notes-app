import type { NoteId } from "./ids.js";

export type StorageProviderId = "GOOGLE_DRIVE" | "ONEDRIVE";
export const StorageProviderIds: readonly StorageProviderId[] = ["GOOGLE_DRIVE", "ONEDRIVE"];

export type CalendarProviderId = "GOOGLE_CALENDAR" | "MICROSOFT_GRAPH";
export const CalendarProviderIds: readonly CalendarProviderId[] = [
  "GOOGLE_CALENDAR",
  "MICROSOFT_GRAPH",
];

// V1 ships OLLAMA only; the union is open to additions in M15 without
// breaking older clients (they just won't match the new variant).
export type AIProviderId = "OLLAMA" | "ANTHROPIC" | "OPENAI" | "GROQ";
export const AIProviderIds: readonly AIProviderId[] = ["OLLAMA", "ANTHROPIC", "OPENAI", "GROQ"];

export type SyncDirection = "UP" | "DOWN" | "BOTH";

export type SyncStatus =
  | { kind: "Idle" }
  | { kind: "Syncing"; direction: SyncDirection; itemsRemaining: number }
  | { kind: "Error"; message: string; canRetry: boolean }
  | { kind: "Conflict"; noteId: NoteId };

export const SyncStatus = {
  idle: (): SyncStatus => ({ kind: "Idle" }),
  syncing: (direction: SyncDirection, itemsRemaining: number): SyncStatus => {
    if (itemsRemaining < 0) {
      throw new Error("SyncStatus.Syncing.itemsRemaining must be >= 0");
    }
    return { kind: "Syncing", direction, itemsRemaining };
  },
  error: (message: string, canRetry: boolean): SyncStatus => {
    if (message.trim().length === 0) {
      throw new Error("SyncStatus.Error.message cannot be empty");
    }
    return { kind: "Error", message, canRetry };
  },
  conflict: (noteId: NoteId): SyncStatus => ({ kind: "Conflict", noteId }),
} as const;
