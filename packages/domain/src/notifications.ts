import type { NoteId, UserId } from "./ids.ts";

/** Opaque id for a scheduled reminder row in `public.reminders`. */
export type ReminderId = string & { readonly __brand: "ReminderId" };

export function ReminderId(value: string): ReminderId {
  if (value.trim().length === 0) {
    throw new Error("ReminderId cannot be empty");
  }
  return value as ReminderId;
}

export type ReminderStatus = "scheduled" | "fired" | "cancelled";

export const REMINDER_STATUSES: readonly ReminderStatus[] = [
  "scheduled",
  "fired",
  "cancelled",
] as const;

/**
 * A scheduled reminder. V1 wires this to a local alarm (AlarmManager on
 * Android, `setTimeout` + Web Notifications API on web). V2's FCM swap
 * lights up `sendPush` through the same port.
 */
export interface Reminder {
  readonly id: ReminderId;
  readonly ownerId: UserId;
  /** Optional source note for the reminder body / deep link. */
  readonly noteId?: NoteId;
  readonly fireAt: string;
  readonly title: string;
  readonly body?: string;
  readonly status: ReminderStatus;
}

/** V2 push payload — placeholder shape until FCM lands. */
export interface PushPayload {
  readonly title: string;
  readonly body: string;
  readonly data?: Readonly<Record<string, string>>;
}

/**
 * The notifications port. V1 implementations:
 *  - Android: `AndroidNotificationProvider` (AlarmManager + BroadcastReceiver).
 *  - Web: `WebNotificationProvider` (`Notification` + `setTimeout` for <24h).
 * V2: a single `FcmNotificationProvider` replaces both at the binding
 * layer — domain code stays unchanged.
 */
export interface NotificationProvider {
  scheduleLocal(reminder: Reminder): Promise<void>;
  cancelLocal(reminderId: ReminderId): Promise<void>;
  /** V2 only — V1 impls reject with NotImplementedError. */
  sendPush(userId: UserId, payload: PushPayload): Promise<void>;
}
