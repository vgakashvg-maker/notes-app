"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Reminder, ReminderId } from "@notes-app/domain";
import { decideSchedule, reminderDelayMs } from "./schedule";

export type NotificationPermissionState = "default" | "granted" | "denied" | "unsupported";

/**
 * Browser-side hook for scheduling local reminders via the Web
 * Notifications API. Reminders inside the 24h window get a real
 * `setTimeout`; further-out ones are surfaced as "deferred" and rely
 * on the next page visit to re-check.
 *
 * Provider-agnostic on purpose: the same hook will sit in front of an
 * FCM swap (V2) by routing through a different `scheduleLocal` impl.
 */
export function useNotifications(): {
  permission: NotificationPermissionState;
  requestPermission: () => Promise<NotificationPermissionState>;
  schedule: (reminder: Reminder) => Promise<void>;
  cancel: (reminderId: ReminderId) => Promise<void>;
} {
  const [permission, setPermission] = useState<NotificationPermissionState>(() =>
    currentPermission(),
  );
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const captured = timers.current;
    return () => {
      for (const handle of captured.values()) clearTimeout(handle);
      captured.clear();
    };
  }, []);

  const requestPermission = useCallback(async (): Promise<NotificationPermissionState> => {
    if (typeof Notification === "undefined") {
      setPermission("unsupported");
      return "unsupported";
    }
    const result = (await Notification.requestPermission()) as NotificationPermission;
    const mapped: NotificationPermissionState = result;
    setPermission(mapped);
    return mapped;
  }, []);

  const schedule = useCallback(async (reminder: Reminder): Promise<void> => {
    if (typeof Notification === "undefined") return;
    const decision = decideSchedule(reminder);
    if (decision.kind === "defer-to-revisit") return;
    const delay = reminderDelayMs(reminder);
    const prev = timers.current.get(reminder.id);
    if (prev !== undefined) clearTimeout(prev);
    const handle = setTimeout(() => {
      try {
        new Notification(reminder.title, {
          body: reminder.body,
          tag: reminder.id,
        });
      } catch {
        // Notification constructor throws when permission is denied —
        // swallow rather than surface, the caller already saw `denied`.
      }
      timers.current.delete(reminder.id);
    }, delay);
    timers.current.set(reminder.id, handle);
  }, []);

  const cancel = useCallback(async (reminderId: ReminderId): Promise<void> => {
    const handle = timers.current.get(reminderId);
    if (handle !== undefined) {
      clearTimeout(handle);
      timers.current.delete(reminderId);
    }
  }, []);

  return { permission, requestPermission, schedule, cancel };
}

function currentPermission(): NotificationPermissionState {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}
