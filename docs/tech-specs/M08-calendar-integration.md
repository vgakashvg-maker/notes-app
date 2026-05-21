# M08 — Calendar Integration Module

> **Module ID**: `M08`
> **Complexity / Recommended AI dev**: Sonnet
> **Estimated duration**: 4–5 days
> **Depends on**: M01, M02

---

## Purpose

Two-way bridge to Google Calendar. V1 ships Google; OutlookCalendarAdapter is a V2 swap behind the same port.

---

## Public Interface (the port)

```kotlin
interface CalendarProvider {
  val id: CalendarProviderId
  suspend fun listEvents(range: DateRange): List<CalendarEvent>
  suspend fun createEvent(input: NewEventInput): CalendarEvent
  suspend fun updateEvent(id: ExternalEventId, patch: EventPatch): CalendarEvent
  suspend fun deleteEvent(id: ExternalEventId)
  fun watchEvents(range: DateRange): Flow<CalendarChange>  // V1: poll; V2: push channel
}
```

---

## Responsibilities

- Use Google Calendar API v3 with the user's OAuth token (granted at sign-in via M2).
- Mirror events into Postgres table `events_mirror` for offline read and unified search.
- Outbound: from a note, 'Create Calendar event' opens a dialog; on submit, calls createEvent and stores back-reference in `note_event_links`.
- Polling cadence: every 15 min while foregrounded; webhook channels (Calendar push) added in V2.
- Time-zone correct: store everything in UTC; render in user's local zone.

---

## Deliverables

- Edge Function `calendar/sync` (mirrors events for a date range).
- Edge Function `calendar/create-event` (creates from a note).
- Android UI: 'Today' view that lists events + notes due today.
- Web UI: same Today view.
- Tests against a real test calendar account.

---

## Relevant Data Model

- `events_mirror`
- `note_event_links`

(Full schema: `reference/data-model.md`)

---

## Relevant API Endpoints

- `POST /functions/v1/calendar/sync`
- `POST /functions/v1/calendar/create-event`
- `GET /rest/v1/events_mirror (PostgREST)`

(Full API contract: `reference/api-contract.md`)

---

## Definition of Done

Apply the checklist in `reference/definition-of-done.md` in full. The
module-specific extras are:

- All items in **Deliverables** above are produced and reviewed.
- All items in **Responsibilities** above are demonstrably true (point at the
  code that proves each one).
- The module-specific tests listed in the **Ready-to-Use Prompt** below pass
  in CI.

---

## Ready-to-Use Prompt (paste this into Claude Code / Cursor)

```
You are implementing module M8 (Calendar Integration) of the Evernote-like
notes app. Read `tech-specs/M08-calendar-integration.md` before starting.

Prerequisites:
  - M1 (core-domain), M2 (auth with calendar.events scope) done.
  - SQL migration for `events_mirror` and `note_event_links` applied.

Your job:
  1. Implement `CalendarProvider` interface in core-domain.
  2. Implement `GoogleCalendarAdapter` (TS for Edge Functions + Kotlin for
     Android). Use the Calendar v3 REST API with the user's OAuth token.
  3. Edge Function `calendar/sync`:
       - Input: { rangeStart, rangeEnd }
       - For each event in the user's primary calendar within the range,
         upsert a row in `events_mirror` (UNIQUE on external_event_id).
       - Delete mirror rows for events that no longer exist in Calendar.
  4. Edge Function `calendar/create-event`:
       - Input: { noteId, title, startAt, endAt, reminderMinutes, attendees }
       - POST to Calendar API; on success, insert into `note_event_links`.
  5. Today view (Android + Web): query events_mirror WHERE
     start_at::date = today AND owner_id = me; merge with notes where due_at =
     today; sort by time.
  6. Time zones: store in UTC; render in `Intl.DateTimeFormat` (web) /
     `ZonedDateTime` (Android) using the device's zone.
  7. Polling: WorkManager periodic worker every 15 min when foregrounded
     (Android); SWR with 15-min revalidation (web).

Tests:
  - Unit: mock Calendar API responses; test sync upserts and deletes correctly.
  - Integration: create a real event via API, sync, verify mirror; delete via
    API, sync, verify mirror is updated.

Definition of Done is in the spec.
```

---

## Cross-references

- Master architecture: `../NotesApp_Architecture.docx` → §7.8
- Getting-started workflow: `../GETTING_STARTED.md`
- Definition of Done: `../reference/definition-of-done.md`
- Data model: `../reference/data-model.md`
- API contract: `../reference/api-contract.md`
