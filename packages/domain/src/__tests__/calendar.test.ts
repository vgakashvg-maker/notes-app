import { describe, expect, it } from "vitest";
import { makeCalendarEvent, type CalendarEvent } from "../calendar.js";
import { UserId } from "../ids.js";

const OWNER = UserId("550e8400-e29b-41d4-a716-446655440000");

function base(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    ownerId: OWNER,
    provider: "GOOGLE_CALENDAR",
    externalEventId: "evt-1",
    calendarId: "primary",
    title: "Standup",
    startAt: "2026-05-20T09:00:00.000Z",
    endAt: "2026-05-20T09:30:00.000Z",
    payload: {},
    ...overrides,
  };
}

describe("makeCalendarEvent", () => {
  it("accepts a valid event", () => {
    expect(makeCalendarEvent(base()).title).toBe("Standup");
  });

  it("rejects endAt before startAt", () => {
    expect(() => makeCalendarEvent(base({ endAt: "2026-05-20T08:00:00.000Z" }))).toThrow(/endAt/);
  });

  it("rejects blank externalEventId", () => {
    expect(() => makeCalendarEvent(base({ externalEventId: "" }))).toThrow(/externalEventId/);
  });
});
