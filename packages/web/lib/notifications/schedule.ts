import type { Reminder } from "@notes-app/domain";

/**
 * Pure scheduling brain. Decides whether a given reminder is eligible
 * for an in-tab `setTimeout` firing right now: the firing must be
 * within `WINDOW_MS` (24h) of the current clock so we don't camp on a
 * stale timer; missed reminders (already past) fire immediately. The
 * Web Notifications API call lives in the React hook — keeping the
 * decision pure makes it cheaply testable in vitest.
 */

export const WINDOW_MS = 24 * 60 * 60 * 1000;

export type ScheduleDecision =
  | { readonly kind: "fire-now"; readonly reason: "in-window" | "missed" }
  | { readonly kind: "defer-to-revisit"; readonly delayMs: number };

export function decideSchedule(reminder: Reminder, now: number = Date.now()): ScheduleDecision {
  if (reminder.status !== "scheduled") {
    return { kind: "defer-to-revisit", delayMs: 0 };
  }
  const fireMs = Date.parse(reminder.fireAt);
  if (Number.isNaN(fireMs)) {
    throw new Error("Reminder.fireAt is not an ISO timestamp");
  }
  const delay = fireMs - now;
  if (delay <= 0) {
    return { kind: "fire-now", reason: "missed" };
  }
  if (delay <= WINDOW_MS) {
    return { kind: "fire-now", reason: "in-window" };
  }
  return { kind: "defer-to-revisit", delayMs: delay };
}

export function reminderDelayMs(reminder: Reminder, now: number = Date.now()): number {
  const decision = decideSchedule(reminder, now);
  if (decision.kind === "defer-to-revisit") return decision.delayMs;
  return Math.max(0, Date.parse(reminder.fireAt) - now);
}
