/**
 * The thin wire-level port the GoogleCalendarAdapter talks to. The real
 * binding (in the Edge Function) wraps `fetch` + the user's OAuth
 * access token; tests pass a fake. Keeping this small lets V2's
 * OutlookHttp / AppleHttp impls mirror the same shape.
 */
export interface CalendarHttp {
  listEvents(query: ListEventsQuery): Promise<RawEventList>;
  insertEvent(input: RawEventInput): Promise<RawEvent>;
  patchEvent(externalEventId: string, patch: RawEventPatch): Promise<RawEvent>;
  deleteEvent(externalEventId: string): Promise<void>;
}

/** Mirrors Google's events.list query params we actually use. */
export interface ListEventsQuery {
  readonly calendarId: string;
  readonly timeMin: string;
  readonly timeMax: string;
  readonly singleEvents?: boolean;
  readonly maxResults?: number;
  readonly pageToken?: string;
}

export interface RawEventList {
  readonly items: readonly RawEvent[];
  readonly nextPageToken?: string;
}

/** A Google Calendar event row, narrowed to what we mirror. */
export interface RawEvent {
  readonly id: string;
  readonly status?: string;
  readonly summary?: string;
  readonly description?: string;
  readonly start: {
    readonly dateTime?: string;
    readonly date?: string;
    readonly timeZone?: string;
  };
  readonly end: { readonly dateTime?: string; readonly date?: string; readonly timeZone?: string };
  readonly attendees?: readonly { readonly email: string }[];
  readonly reminders?: {
    readonly useDefault?: boolean;
    readonly overrides?: readonly { readonly method: string; readonly minutes: number }[];
  };
}

export interface RawEventInput {
  readonly summary: string;
  readonly description?: string;
  readonly start: { readonly dateTime: string; readonly timeZone?: string };
  readonly end: { readonly dateTime: string; readonly timeZone?: string };
  readonly attendees?: readonly { readonly email: string }[];
  readonly reminders?: {
    readonly useDefault: boolean;
    readonly overrides?: readonly {
      readonly method: "popup" | "email";
      readonly minutes: number;
    }[];
  };
}

export interface RawEventPatch {
  readonly summary?: string;
  readonly description?: string;
  readonly start?: { readonly dateTime: string; readonly timeZone?: string };
  readonly end?: { readonly dateTime: string; readonly timeZone?: string };
}
