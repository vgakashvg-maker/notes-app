import { describe, expect, it } from "vitest";
import { UserId, makeCalendarEvent, type CalendarEvent } from "@notes-app/domain";
import { eventToUpsertRow, reconcile, type EventMirrorRow } from "../sync.js";

const OWNER = UserId("11111111-1111-4111-8111-111111111111");

function makeEvent(id: string, title = "x"): CalendarEvent {
  return makeCalendarEvent({
    ownerId: OWNER,
    provider: "GOOGLE_CALENDAR",
    externalEventId: id,
    calendarId: "primary",
    title,
    startAt: "2026-05-22T09:00:00Z",
    endAt: "2026-05-22T10:00:00Z",
    payload: { description: null, attendees: [], timeZone: "UTC" },
  });
}

function makeMirror(externalId: string, provider = "GOOGLE_CALENDAR"): EventMirrorRow {
  return {
    id: `mirror-${externalId}`,
    owner_id: OWNER,
    provider,
    external_event_id: externalId,
    calendar_id: "primary",
    title: "stale",
    description: null,
    start_at: "2026-05-22T09:00:00Z",
    end_at: "2026-05-22T10:00:00Z",
    payload: {},
  };
}

describe("reconcile", () => {
  it("upserts every fresh event", () => {
    const result = reconcile([makeEvent("a"), makeEvent("b")], []);
    expect(result.upserts.map((e) => e.externalEventId)).toEqual(["a", "b"]);
    expect(result.deletes).toEqual([]);
  });

  it("marks mirror rows for deletion when they no longer appear in the fresh list", () => {
    const result = reconcile([makeEvent("a")], [makeMirror("a"), makeMirror("orphan")]);
    expect(result.deletes).toEqual(["orphan"]);
  });

  it("never deletes rows from a different provider", () => {
    const result = reconcile([], [makeMirror("a"), makeMirror("b", "MICROSOFT_GRAPH")]);
    expect(result.deletes).toEqual(["a"]);
  });
});

describe("eventToUpsertRow", () => {
  it("snake-cases the row + carries the payload verbatim", () => {
    const event = makeEvent("g-1", "Hi");
    const row = eventToUpsertRow(event);
    expect(row).toEqual({
      provider: "GOOGLE_CALENDAR",
      external_event_id: "g-1",
      calendar_id: "primary",
      title: "Hi",
      description: null,
      start_at: "2026-05-22T09:00:00Z",
      end_at: "2026-05-22T10:00:00Z",
      payload: { description: null, attendees: [], timeZone: "UTC" },
    });
  });
});
