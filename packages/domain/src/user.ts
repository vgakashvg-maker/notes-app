import type { UserId } from "./ids.js";
import type { AIProviderId, CalendarProviderId, StorageProviderId } from "./enums.js";
import { AIProviderIds, CalendarProviderIds, StorageProviderIds } from "./enums.js";

export interface AIPreferences {
  readonly chatProvider: AIProviderId;
  readonly chatModel: string;
  readonly tagProvider: AIProviderId;
  readonly tagModel: string;
  readonly embeddingProvider: AIProviderId;
  readonly embeddingModel: string;
}

export interface User {
  readonly userId: UserId;
  readonly displayName: string;
  readonly storageProvider: StorageProviderId | null;
  readonly calendarProvider: CalendarProviderId | null;
  readonly aiPrefs: AIPreferences;
  readonly analyticsOptOut: boolean;
}

export function makeUser(input: User): User {
  if (input.displayName.trim().length === 0) {
    throw new Error("User.displayName cannot be empty");
  }
  if (input.storageProvider !== null && !StorageProviderIds.includes(input.storageProvider)) {
    throw new Error(`User.storageProvider must be null or one of ${StorageProviderIds.join(", ")}`);
  }
  if (input.calendarProvider !== null && !CalendarProviderIds.includes(input.calendarProvider)) {
    throw new Error(
      `User.calendarProvider must be null or one of ${CalendarProviderIds.join(", ")}`,
    );
  }
  assertProvider("aiPrefs.chatProvider", input.aiPrefs.chatProvider);
  assertProvider("aiPrefs.tagProvider", input.aiPrefs.tagProvider);
  assertProvider("aiPrefs.embeddingProvider", input.aiPrefs.embeddingProvider);
  if (input.aiPrefs.chatModel.trim().length === 0) {
    throw new Error("User.aiPrefs.chatModel cannot be empty");
  }
  if (input.aiPrefs.tagModel.trim().length === 0) {
    throw new Error("User.aiPrefs.tagModel cannot be empty");
  }
  if (input.aiPrefs.embeddingModel.trim().length === 0) {
    throw new Error("User.aiPrefs.embeddingModel cannot be empty");
  }
  return input;
}

function assertProvider(field: string, value: AIProviderId): void {
  if (!AIProviderIds.includes(value)) {
    throw new Error(`User.${field} must be one of ${AIProviderIds.join(", ")}`);
  }
}
