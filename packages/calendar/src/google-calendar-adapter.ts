import type {
  CalendarChange,
  CalendarEvent,
  CalendarProvider,
  CalendarProviderId,
  DateRange,
  EventPatch,
  ExternalEventId,
  NewEventInput,
  UserId,
} from "../../domain/src/index.ts";
import { makeCalendarEvent } from "../../domain/src/index.ts";
import type { CalendarHttp, RawEvent } from "./types.ts";

export interface GoogleCalendarAdapterOptions {
  readonly http: CalendarHttp;
  readonly ownerId: UserId;
  /** Primary calendar id; Google's reserved literal is "primary". */
  readonly calendarId?: string;
}

/**
 * V1 calendar adapter. Pure logic over the structural `CalendarHttp`
 * port; the Edge Function binds it to `fetch` with the user's Google
 * OAuth access token. UI code never imports this — Edge Functions own
 * server-side calls.
 */
export class GoogleCalendarAdapter implements CalendarProvider {
  readonly id: CalendarProviderId = "GOOGLE_CALENDAR";
  private readonly calendarId: string;

  constructor(private readonly options: GoogleCalendarAdapterOptions) {
    this.calendarId = options.calendarId ?? "primary";
  }

  async listEvents(range: DateRange): Promise<readonly CalendarEvent[]> {
    const events: CalendarEvent[] = [];
    let pageToken: string | undefined;
    do {
      const page = await this.options.http.listEvents({
        calendarId: this.calendarId,
        timeMin: range.start,
        timeMax: range.end,
        singleEvents: true,
        maxResults: 250,
        ...(pageToken !== undefined ? { pageToken } : {}),
      });
      for (const raw of page.items) {
        const event = this.toEvent(raw);
        if (event !== null) events.push(event);
      }
      pageToken = page.nextPageToken;
    } while (pageToken !== undefined);
    return events;
  }

  async createEvent(input: NewEventInput): Promise<CalendarEvent> {
    const raw = await this.options.http.insertEvent({
      summary: input.title,
      description: input.description,
      start: { dateTime: input.startAt },
      end: { dateTime: input.endAt },
      attendees: input.attendees?.map((email) => ({ email })),
      reminders:
        input.reminderMinutes === undefined
          ? undefined
          : {
              useDefault: false,
              overrides: [{ method: "popup", minutes: input.reminderMinutes }],
            },
    });
    const event = this.toEvent(raw);
    if (event === null) {
      throw new Error("createEvent: Google response missing start/end dateTime");
    }
    return event;
  }

  async updateEvent(id: ExternalEventId, patch: EventPatch): Promise<CalendarEvent> {
    const raw = await this.options.http.patchEvent(id, {
      ...(patch.title !== undefined ? { summary: patch.title } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.startAt !== undefined ? { start: { dateTime: patch.startAt } } : {}),
      ...(patch.endAt !== undefined ? { end: { dateTime: patch.endAt } } : {}),
    });
    const event = this.toEvent(raw);
    if (event === null) {
      throw new Error("updateEvent: Google response missing start/end dateTime");
    }
    return event;
  }

  async deleteEvent(id: ExternalEventId): Promise<void> {
    await this.options.http.deleteEvent(id);
  }

  async *watchEvents(range: DateRange): AsyncIterable<CalendarChange> {
    // V1 polling: a single pass that emits an Upsert for every event in
    // the range. The caller is responsible for the cadence (every 15 min
    // when foregrounded). Server-side reconciliation (which mirror rows
    // to delete) lives in calendar/sync — this iterator just surfaces
    // current state.
    const events = await this.listEvents(range);
    for (const event of events) {
      yield { kind: "Upsert", event };
    }
  }

  /**
   * Narrows a Google event row to our CalendarEvent. Returns null for
   * all-day events (date-only, no dateTime) since the mirror schema
   * requires a timestamptz; surfacing those is a V2 nice-to-have.
   * `cancelled` events return null too — calendar/sync handles deletes
   * by absence, not by status.
   */
  private toEvent(raw: RawEvent): CalendarEvent | null {
    if (raw.status === "cancelled") return null;
    const startAt = raw.start.dateTime;
    const endAt = raw.end.dateTime;
    if (startAt === undefined || endAt === undefined) return null;
    if (raw.summary === undefined || raw.summary.trim().length === 0) return null;
    return makeCalendarEvent({
      ownerId: this.options.ownerId,
      provider: "GOOGLE_CALENDAR",
      externalEventId: raw.id,
      calendarId: this.calendarId,
      title: raw.summary,
      startAt,
      endAt,
      payload: {
        description: raw.description ?? null,
        attendees: raw.attendees?.map((a) => a.email) ?? [],
        timeZone: raw.start.timeZone ?? null,
      },
    });
  }
}
