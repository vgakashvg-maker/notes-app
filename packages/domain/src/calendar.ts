import type { UserId } from "./ids.ts";
import type { CalendarProviderId } from "./enums.ts";
import { CalendarProviderIds } from "./enums.ts";
import { assertIsoTimestamp } from "./notebook.ts";

export interface CalendarEvent {
  readonly ownerId: UserId;
  readonly provider: CalendarProviderId;
  readonly externalEventId: string;
  readonly calendarId: string;
  readonly title: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export function makeCalendarEvent(input: CalendarEvent): CalendarEvent {
  if (!CalendarProviderIds.includes(input.provider)) {
    throw new Error(`CalendarEvent.provider must be one of ${CalendarProviderIds.join(", ")}`);
  }
  if (input.externalEventId.trim().length === 0) {
    throw new Error("CalendarEvent.externalEventId cannot be empty");
  }
  if (input.calendarId.trim().length === 0) {
    throw new Error("CalendarEvent.calendarId cannot be empty");
  }
  if (input.title.trim().length === 0) {
    throw new Error("CalendarEvent.title cannot be empty");
  }
  assertIsoTimestamp("CalendarEvent.startAt", input.startAt);
  assertIsoTimestamp("CalendarEvent.endAt", input.endAt);
  if (Date.parse(input.endAt) < Date.parse(input.startAt)) {
    throw new Error("CalendarEvent.endAt must be >= startAt");
  }
  return input;
}
