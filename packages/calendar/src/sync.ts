import type { CalendarEvent, CalendarProviderId } from "../../domain/src/index.ts";

/**
 * A row from `events_mirror` as it arrives from PostgREST. Snake-cased
 * to match the SQL column names — the Edge Function does its own
 * upsert/delete via PostgREST.
 */
export interface EventMirrorRow {
  readonly id: string;
  readonly owner_id: string;
  readonly provider: string;
  readonly external_event_id: string;
  readonly calendar_id: string;
  readonly title: string;
  readonly description: string | null;
  readonly start_at: string;
  readonly end_at: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * Diff between the current Google events and the mirror state. Pure
 * function — Edge Function tests pass synthetic inputs; the function
 * itself just executes the resulting upserts and deletes.
 */
export interface ReconcileResult {
  readonly upserts: readonly CalendarEvent[];
  /** external_event_id values that should be deleted from the mirror. */
  readonly deletes: readonly string[];
}

export function reconcile(
  fresh: readonly CalendarEvent[],
  existingMirror: readonly EventMirrorRow[],
  provider: CalendarProviderId = "GOOGLE_CALENDAR",
): ReconcileResult {
  const freshIds = new Set(fresh.map((e) => e.externalEventId));
  const deletes = existingMirror
    .filter((row) => row.provider === provider && !freshIds.has(row.external_event_id))
    .map((row) => row.external_event_id);
  return { upserts: fresh, deletes };
}

/**
 * Translates a CalendarEvent → the PostgREST upsert payload.
 * `on conflict (owner_id, provider, external_event_id) do update`
 * is the SQL contract; the schema's stamp-owner trigger fills owner_id
 * for inserts so we don't include it here.
 */
export function eventToUpsertRow(event: CalendarEvent): Record<string, unknown> {
  return {
    provider: event.provider,
    external_event_id: event.externalEventId,
    calendar_id: event.calendarId,
    title: event.title,
    description: (event.payload.description as string | null | undefined) ?? null,
    start_at: event.startAt,
    end_at: event.endAt,
    payload: event.payload,
  };
}
