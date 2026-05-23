// Edge Function: POST /functions/v1/calendar/sync
//
// Body: { rangeStart, rangeEnd } (ISO timestamps).
// 1. Fetches events from Google Calendar for the user's primary calendar
//    in the requested range.
// 2. Upserts into events_mirror on (owner_id, provider, external_event_id).
// 3. Deletes mirror rows whose external_event_id no longer appears in
//    the range — same reconciliation rule as @notes-app/calendar's
//    `reconcile()`.

import {
  GoogleCalendarAdapter,
  eventToUpsertRow,
  reconcile,
  type EventMirrorRow,
} from "../../../packages/calendar/src/index.ts";
import type { UserId } from "../../../packages/domain/src/index.ts";
import {
  googleAccessTokenFor,
  jsonError,
  makeGoogleHttp,
  mustEnv,
  resolveUserId,
} from "../_shared/calendar/google.ts";

declare const Deno: {
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonError(405, "ERR_METHOD_NOT_ALLOWED", "POST only");
  const jwt = req.headers.get("Authorization")?.slice("bearer ".length).trim() ?? "";
  const userId = await resolveUserId(req);
  if (jwt === "" || userId === null) return jsonError(401, "ERR_UNAUTHENTICATED", "Missing JWT");

  let body: { rangeStart?: unknown; rangeEnd?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "ERR_BAD_REQUEST", "Body must be JSON");
  }
  const rangeStart = typeof body.rangeStart === "string" ? body.rangeStart : "";
  const rangeEnd = typeof body.rangeEnd === "string" ? body.rangeEnd : "";
  if (rangeStart.length === 0 || rangeEnd.length === 0) {
    return jsonError(400, "ERR_BAD_REQUEST", "rangeStart + rangeEnd required (ISO timestamps)");
  }

  const accessToken = await googleAccessTokenFor(jwt);
  if (accessToken === null) return jsonError(401, "ERR_PROVIDER_TOKEN", "No Google token");

  const adapter = new GoogleCalendarAdapter({
    http: makeGoogleHttp(accessToken),
    ownerId: userId as UserId,
  });

  let fresh;
  try {
    fresh = await adapter.listEvents({ start: rangeStart, end: rangeEnd });
  } catch (cause) {
    const msg = cause instanceof Error ? cause.message : "list failed";
    return jsonError(502, "ERR_UPSTREAM", msg);
  }

  const existing = await fetchMirrorRange(jwt, rangeStart, rangeEnd);
  const { upserts, deletes } = reconcile(fresh, existing, "GOOGLE_CALENDAR");

  const upsertResult = await upsertMirror(jwt, upserts.map(eventToUpsertRow));
  const deleteResult = await deleteMirror(jwt, deletes);

  return new Response(
    JSON.stringify({
      ok: true,
      upserted: upsertResult.count,
      deleted: deleteResult.count,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});

async function fetchMirrorRange(
  jwt: string,
  start: string,
  end: string,
): Promise<EventMirrorRow[]> {
  const url =
    `${mustEnv("SUPABASE_URL")}/rest/v1/events_mirror?select=*` +
    `&start_at=gte.${encodeURIComponent(start)}` +
    `&start_at=lte.${encodeURIComponent(end)}` +
    `&order=start_at.asc&limit=2000`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    },
  });
  if (!resp.ok) return [];
  return (await resp.json()) as EventMirrorRow[];
}

async function upsertMirror(
  jwt: string,
  rows: Array<Record<string, unknown>>,
): Promise<{ count: number }> {
  if (rows.length === 0) return { count: 0 };
  const resp = await fetch(
    `${mustEnv("SUPABASE_URL")}/rest/v1/events_mirror?on_conflict=owner_id,provider,external_event_id`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        apikey: mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    },
  );
  if (!resp.ok) return { count: 0 };
  return { count: rows.length };
}

async function deleteMirror(
  jwt: string,
  externalIds: readonly string[],
): Promise<{ count: number }> {
  if (externalIds.length === 0) return { count: 0 };
  const inClause = `in.(${externalIds.map((id) => `"${id}"`).join(",")})`;
  const url =
    `${mustEnv("SUPABASE_URL")}/rest/v1/events_mirror?provider=eq.GOOGLE_CALENDAR` +
    `&external_event_id=${inClause}`;
  const resp = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
      Prefer: "return=minimal",
    },
  });
  if (!resp.ok) return { count: 0 };
  return { count: externalIds.length };
}
