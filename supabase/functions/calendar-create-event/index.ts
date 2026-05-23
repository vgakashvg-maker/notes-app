// Edge Function: POST /functions/v1/calendar/create-event
//
// Body: { noteId, title, startAt, endAt, reminderMinutes?, attendees? }.
// 1. Creates the event in Google Calendar (primary).
// 2. Upserts into events_mirror.
// 3. Inserts a back-reference into note_event_links so the note shows
//    the linked event.

import {
  GoogleCalendarAdapter,
  eventToUpsertRow,
} from "../../../packages/calendar/src/index.ts";
import type { NoteId, UserId } from "../../../packages/domain/src/index.ts";
import {
  googleAccessTokenFor,
  jsonError,
  makeGoogleHttp,
  mustEnv,
  resolveUserId,
} from "../_shared/calendar/google.ts";

import { corsServe } from "../_shared/cors.ts";

declare const Deno: {
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

corsServe(async (req: Request) => {
  if (req.method !== "POST") return jsonError(405, "ERR_METHOD_NOT_ALLOWED", "POST only");
  const jwt = req.headers.get("Authorization")?.slice("bearer ".length).trim() ?? "";
  const userId = await resolveUserId(req);
  if (jwt === "" || userId === null) return jsonError(401, "ERR_UNAUTHENTICATED", "Missing JWT");

  let body: {
    noteId?: unknown;
    title?: unknown;
    startAt?: unknown;
    endAt?: unknown;
    reminderMinutes?: unknown;
    attendees?: unknown;
    description?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "ERR_BAD_REQUEST", "Body must be JSON");
  }
  const noteId = typeof body.noteId === "string" ? body.noteId : null;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const startAt = typeof body.startAt === "string" ? body.startAt : "";
  const endAt = typeof body.endAt === "string" ? body.endAt : "";
  if (title.length === 0 || startAt.length === 0 || endAt.length === 0) {
    return jsonError(400, "ERR_BAD_REQUEST", "title, startAt, endAt required");
  }
  const reminderMinutes =
    typeof body.reminderMinutes === "number" ? body.reminderMinutes : undefined;
  const attendees = Array.isArray(body.attendees)
    ? body.attendees.filter((a): a is string => typeof a === "string")
    : undefined;
  const description = typeof body.description === "string" ? body.description : undefined;

  const accessToken = await googleAccessTokenFor(jwt);
  if (accessToken === null) return jsonError(401, "ERR_PROVIDER_TOKEN", "No Google token");

  const adapter = new GoogleCalendarAdapter({
    http: makeGoogleHttp(accessToken),
    ownerId: userId as UserId,
  });

  let event;
  try {
    event = await adapter.createEvent({
      title,
      startAt,
      endAt,
      ...(description !== undefined ? { description } : {}),
      ...(attendees !== undefined ? { attendees } : {}),
      ...(reminderMinutes !== undefined ? { reminderMinutes } : {}),
      ...(noteId !== null ? { noteId: noteId as NoteId } : {}),
    });
  } catch (cause) {
    const msg = cause instanceof Error ? cause.message : "create failed";
    return jsonError(502, "ERR_UPSTREAM", msg);
  }

  const mirrorId = await upsertMirrorRow(jwt, eventToUpsertRow(event));
  if (mirrorId === null) {
    return jsonError(500, "ERR_MIRROR_WRITE", "events_mirror upsert failed");
  }

  if (noteId !== null) {
    await linkNoteToEvent(jwt, noteId, mirrorId);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      externalEventId: event.externalEventId,
      mirrorId,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});

async function upsertMirrorRow(
  jwt: string,
  row: Record<string, unknown>,
): Promise<string | null> {
  const resp = await fetch(
    `${mustEnv("SUPABASE_URL")}/rest/v1/events_mirror?on_conflict=owner_id,provider,external_event_id`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        apikey: mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify([row]),
    },
  );
  if (!resp.ok) return null;
  const rows = (await resp.json()) as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

async function linkNoteToEvent(jwt: string, noteId: string, eventMirrorId: string): Promise<void> {
  await fetch(`${mustEnv("SUPABASE_URL")}/rest/v1/note_event_links`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
      "Content-Type": "application/json",
      Prefer: "return=minimal,resolution=merge-duplicates",
    },
    body: JSON.stringify({ note_id: noteId, event_mirror_id: eventMirrorId }),
  });
}
