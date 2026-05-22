import type { NoteId } from "./ids.js";
import type { CalendarEvent } from "./calendar.js";
import type { CalendarProviderId } from "./enums.js";

/** Opaque id for an event on the external provider (e.g. Google's event.id). */
export type ExternalEventId = string & { readonly __brand: "ExternalEventId" };

export function ExternalEventId(value: string): ExternalEventId {
  if (value.trim().length === 0) {
    throw new Error("ExternalEventId cannot be empty");
  }
  return value as ExternalEventId;
}

/** Inclusive date range, ISO-8601 timestamps. */
export interface DateRange {
  readonly start: string;
  readonly end: string;
}

export interface NewEventInput {
  readonly title: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly description?: string;
  readonly attendees?: readonly string[];
  /** Pop-up minutes before the start; the adapter maps to provider semantics. */
  readonly reminderMinutes?: number;
  /** Optional source note for back-reference (M08 note_event_links). */
  readonly noteId?: NoteId;
}

export interface EventPatch {
  readonly title?: string;
  readonly startAt?: string;
  readonly endAt?: string;
  readonly description?: string;
}

/** A single change emitted by `CalendarProvider.watchEvents`. */
export type CalendarChange =
  | { readonly kind: "Upsert"; readonly event: CalendarEvent }
  | { readonly kind: "Delete"; readonly externalEventId: ExternalEventId };

/**
 * The calendar port. V1 implementation is `GoogleCalendarAdapter`; V2 swaps
 * in Outlook/Microsoft 365 behind the same shape. UI code (Android + Web)
 * never imports the adapter; the Edge Functions own all server-side
 * calls.
 */
export interface CalendarProvider {
  readonly id: CalendarProviderId;
  listEvents(range: DateRange): Promise<readonly CalendarEvent[]>;
  createEvent(input: NewEventInput): Promise<CalendarEvent>;
  updateEvent(id: ExternalEventId, patch: EventPatch): Promise<CalendarEvent>;
  deleteEvent(id: ExternalEventId): Promise<void>;
  /**
   * Polled in V1 (15-min cadence while foregrounded); the Push channel
   * binding is V2. The shape is a Flow-equivalent so the V2 swap is a
   * one-file change.
   */
  watchEvents(range: DateRange): AsyncIterable<CalendarChange>;
}
