# M11 — Notification Module

> **Module ID**: `M11`
> **Complexity / Recommended AI dev**: Haiku
> **Estimated duration**: 2 days
> **Depends on**: M01

---

## Purpose

Push notifications for reminders and (V2) shared-note events. V1 only sends local reminders for note-attached due dates; V2 adds cross-device push via FCM.

---

## Public Interface (the port)

```kotlin
interface NotificationProvider {
  suspend fun scheduleLocal(reminder: Reminder)
  suspend fun cancelLocal(reminderId: ReminderId)
  suspend fun sendPush(userId: UserId, payload: PushPayload)   // V2
}
```

---

## Responsibilities

- Android: AlarmManager + WorkManager for local reminders.
- Web: Web Notifications API for in-tab reminders.
- V2: Firebase Cloud Messaging adapter behind the same port.

---

## Deliverables

- Android library `notifications-android`.
- Web hook `useNotifications`.
- Manifest entries (notification permission, alarm permission).

---

## Relevant Data Model

- `reminders`

(Full schema: `reference/data-model.md`)

---

## Relevant API Endpoints

_(none — this module is internal-facing)_

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
You are implementing module M11 (Notifications) of the Evernote-like notes app.
Read `tech-specs/M11-notifications.md` before starting.

Prerequisites:
  - M1 done.
  - `reminders` table migration applied (see reference/data-model.md).

Your job:
  1. Android:
       - AndroidManifest: add POST_NOTIFICATIONS permission (API 33+),
         SCHEDULE_EXACT_ALARM permission (API 31+).
       - Implement `AlarmReceiver` broadcast receiver.
       - Implement `NotificationProvider` with scheduleLocal using AlarmManager
         setExactAndAllowWhileIdle; for the body, use the reminder payload.
       - On boot, re-schedule unfired reminders (BOOT_COMPLETED receiver).
  2. Web:
       - useNotifications() hook that calls Notification.requestPermission()
         on first use.
       - Schedule via setTimeout for reminders within 24h; for >24h, just rely
         on the daily browser visit to re-check.

Tests:
  - Android: instrumented test that schedules a reminder 5s in the future,
    verifies the BroadcastReceiver fires.
  - Web: jsdom test that mocks Notification API and verifies it's called.

Definition of Done is in the spec.
```

---

## Cross-references

- Master architecture: `../NotesApp_Architecture.docx` → §7.11
- Getting-started workflow: `../GETTING_STARTED.md`
- Definition of Done: `../reference/definition-of-done.md`
- Data model: `../reference/data-model.md`
- API contract: `../reference/api-contract.md`
