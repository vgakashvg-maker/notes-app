import { describe, expect, it, vi } from "vitest";
import { UserId } from "@notes-app/domain";
import { GoogleCalendarAdapter } from "../google-calendar-adapter.js";
import type {
  CalendarHttp,
  RawEvent,
  RawEventInput,
  RawEventList,
  RawEventPatch,
} from "../types.js";

const OWNER: UserId = UserId("11111111-1111-4111-8111-111111111111");

function fakeHttp(overrides: Partial<CalendarHttp> = {}): CalendarHttp {
  return {
    listEvents: vi.fn(async (): Promise<RawEventList> => ({ items: [] })),
    insertEvent: vi.fn(
      async (input: RawEventInput): Promise<RawEvent> => ({
        id: "g-new",
        status: "confirmed",
        summary: input.summary,
        start: input.start,
        end: input.end,
      }),
    ),
    patchEvent: vi.fn(
      async (id: string, patch: RawEventPatch): Promise<RawEvent> => ({
        id,
        status: "confirmed",
        summary: patch.summary ?? "untouched",
        start: patch.start ?? { dateTime: "2026-05-22T10:00:00Z" },
        end: patch.end ?? { dateTime: "2026-05-22T11:00:00Z" },
      }),
    ),
    deleteEvent: vi.fn(async (): Promise<void> => undefined),
    ...overrides,
  };
}

describe("GoogleCalendarAdapter", () => {
  it("listEvents narrows Google rows to CalendarEvents", async () => {
    const http = fakeHttp({
      listEvents: vi.fn(
        async (): Promise<RawEventList> => ({
          items: [
            {
              id: "g-1",
              status: "confirmed",
              summary: "Standup",
              start: { dateTime: "2026-05-22T09:00:00Z" },
              end: { dateTime: "2026-05-22T09:30:00Z" },
              description: "team sync",
              attendees: [{ email: "a@example.com" }],
            },
          ],
        }),
      ),
    });
    const adapter = new GoogleCalendarAdapter({ http, ownerId: OWNER });
    const events = await adapter.listEvents({
      start: "2026-05-22T00:00:00Z",
      end: "2026-05-23T00:00:00Z",
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.title).toBe("Standup");
    expect(events[0]?.payload.attendees).toEqual(["a@example.com"]);
  });

  it("listEvents pages until nextPageToken is exhausted", async () => {
    const list = vi
      .fn<(q: unknown) => Promise<RawEventList>>()
      .mockResolvedValueOnce({
        items: [
          {
            id: "g-1",
            status: "confirmed",
            summary: "Event 1",
            start: { dateTime: "2026-05-22T09:00:00Z" },
            end: { dateTime: "2026-05-22T10:00:00Z" },
          },
        ],
        nextPageToken: "page2",
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: "g-2",
            status: "confirmed",
            summary: "Event 2",
            start: { dateTime: "2026-05-22T11:00:00Z" },
            end: { dateTime: "2026-05-22T12:00:00Z" },
          },
        ],
      });
    const http = fakeHttp({ listEvents: list });
    const adapter = new GoogleCalendarAdapter({ http, ownerId: OWNER });
    const events = await adapter.listEvents({
      start: "2026-05-22T00:00:00Z",
      end: "2026-05-23T00:00:00Z",
    });
    expect(events).toHaveLength(2);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("listEvents drops all-day events (date-only payloads)", async () => {
    const http = fakeHttp({
      listEvents: vi.fn(
        async (): Promise<RawEventList> => ({
          items: [
            {
              id: "all-day",
              status: "confirmed",
              summary: "Holiday",
              start: { date: "2026-05-22" },
              end: { date: "2026-05-23" },
            },
          ],
        }),
      ),
    });
    const adapter = new GoogleCalendarAdapter({ http, ownerId: OWNER });
    const events = await adapter.listEvents({
      start: "2026-05-22T00:00:00Z",
      end: "2026-05-23T00:00:00Z",
    });
    expect(events).toEqual([]);
  });

  it("listEvents drops cancelled events", async () => {
    const http = fakeHttp({
      listEvents: vi.fn(
        async (): Promise<RawEventList> => ({
          items: [
            {
              id: "cancelled-1",
              status: "cancelled",
              summary: "Skip",
              start: { dateTime: "2026-05-22T09:00:00Z" },
              end: { dateTime: "2026-05-22T09:30:00Z" },
            },
            {
              id: "ok-1",
              status: "confirmed",
              summary: "Keep",
              start: { dateTime: "2026-05-22T10:00:00Z" },
              end: { dateTime: "2026-05-22T10:30:00Z" },
            },
          ],
        }),
      ),
    });
    const adapter = new GoogleCalendarAdapter({ http, ownerId: OWNER });
    const events = await adapter.listEvents({
      start: "2026-05-22T00:00:00Z",
      end: "2026-05-23T00:00:00Z",
    });
    expect(events.map((e) => e.title)).toEqual(["Keep"]);
  });

  it("createEvent threads attendees + popup reminder", async () => {
    const http = fakeHttp();
    const adapter = new GoogleCalendarAdapter({ http, ownerId: OWNER });
    await adapter.createEvent({
      title: "Coffee",
      startAt: "2026-05-22T10:00:00Z",
      endAt: "2026-05-22T10:30:00Z",
      attendees: ["a@example.com"],
      reminderMinutes: 10,
    });
    expect(http.insertEvent).toHaveBeenCalledWith({
      summary: "Coffee",
      description: undefined,
      start: { dateTime: "2026-05-22T10:00:00Z" },
      end: { dateTime: "2026-05-22T10:30:00Z" },
      attendees: [{ email: "a@example.com" }],
      reminders: {
        useDefault: false,
        overrides: [{ method: "popup", minutes: 10 }],
      },
    });
  });

  it("updateEvent only forwards keys that the caller provided", async () => {
    const http = fakeHttp();
    const adapter = new GoogleCalendarAdapter({ http, ownerId: OWNER });
    await adapter.updateEvent("g-existing" as never, { title: "Renamed" });
    expect(http.patchEvent).toHaveBeenCalledWith("g-existing", { summary: "Renamed" });
  });

  it("deleteEvent forwards the id verbatim", async () => {
    const http = fakeHttp();
    const adapter = new GoogleCalendarAdapter({ http, ownerId: OWNER });
    await adapter.deleteEvent("g-existing" as never);
    expect(http.deleteEvent).toHaveBeenCalledWith("g-existing");
  });
});
