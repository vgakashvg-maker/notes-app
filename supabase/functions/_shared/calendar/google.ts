// Shared helpers for the calendar-* Edge Functions. Mirrors the
// _shared/ai/ollama.ts pattern: env-fetch + JWT resolution + service-role
// PostgREST helpers + a fetch-backed CalendarHttp impl.

import type {
  CalendarHttp,
  ListEventsQuery,
  RawEvent,
  RawEventInput,
  RawEventList,
  RawEventPatch,
} from "../../../../packages/calendar/src/types.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
};

export function mustEnv(name: string): string {
  const v = Deno.env.get(name);
  if (v === undefined || v.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

export function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Verify the bearer JWT belongs to a real user; return the user id. */
export async function resolveUserId(req: Request): Promise<string | null> {
  const header = req.headers.get("Authorization");
  if (header === null || !header.toLowerCase().startsWith("bearer ")) return null;
  const jwt = header.slice("bearer ".length).trim();
  if (jwt.length === 0) return null;
  const resp = await fetch(`${mustEnv("SUPABASE_URL")}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    },
  });
  if (!resp.ok) return null;
  const body = (await resp.json()) as { id?: unknown };
  return typeof body.id === "string" ? body.id : null;
}

/**
 * Fetches a fresh Google access token for the caller via the M02
 * refresh-provider-token Edge Function. Decoupling token refresh from
 * this file lets calendar/* work even when V2 swaps the storage of the
 * refresh token.
 */
export async function googleAccessTokenFor(jwt: string): Promise<string | null> {
  const url = `${mustEnv("SUPABASE_URL")}/functions/v1/auth/refresh-provider-token`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ provider: "GOOGLE" }),
  });
  if (!resp.ok) return null;
  const parsed = (await resp.json()) as {
    ok?: boolean;
    data?: { access_token?: string };
  };
  if (parsed.ok !== true || typeof parsed.data?.access_token !== "string") return null;
  return parsed.data.access_token;
}

/** Builds a CalendarHttp bound to Google Calendar v3 + the user's token. */
export function makeGoogleHttp(accessToken: string): CalendarHttp {
  const BASE = "https://www.googleapis.com/calendar/v3";
  return {
    async listEvents(query: ListEventsQuery): Promise<RawEventList> {
      const u = new URL(`${BASE}/calendars/${encodeURIComponent(query.calendarId)}/events`);
      u.searchParams.set("timeMin", query.timeMin);
      u.searchParams.set("timeMax", query.timeMax);
      u.searchParams.set("singleEvents", String(query.singleEvents ?? true));
      if (query.maxResults !== undefined) {
        u.searchParams.set("maxResults", String(query.maxResults));
      }
      if (query.pageToken !== undefined) u.searchParams.set("pageToken", query.pageToken);
      const resp = await fetch(u.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!resp.ok) throw new Error(`Google events.list ${resp.status}`);
      const body = (await resp.json()) as {
        items?: RawEvent[];
        nextPageToken?: string;
      };
      return {
        items: body.items ?? [],
        ...(body.nextPageToken !== undefined ? { nextPageToken: body.nextPageToken } : {}),
      };
    },
    async insertEvent(input: RawEventInput): Promise<RawEvent> {
      const resp = await fetch(`${BASE}/calendars/primary/events`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });
      if (!resp.ok) throw new Error(`Google events.insert ${resp.status}`);
      return (await resp.json()) as RawEvent;
    },
    async patchEvent(externalEventId: string, patch: RawEventPatch): Promise<RawEvent> {
      const resp = await fetch(
        `${BASE}/calendars/primary/events/${encodeURIComponent(externalEventId)}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(patch),
        },
      );
      if (!resp.ok) throw new Error(`Google events.patch ${resp.status}`);
      return (await resp.json()) as RawEvent;
    },
    async deleteEvent(externalEventId: string): Promise<void> {
      const resp = await fetch(
        `${BASE}/calendars/primary/events/${encodeURIComponent(externalEventId)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      // 410 (already deleted) is treated as success — idempotent delete.
      if (!resp.ok && resp.status !== 410) {
        throw new Error(`Google events.delete ${resp.status}`);
      }
    },
  };
}
