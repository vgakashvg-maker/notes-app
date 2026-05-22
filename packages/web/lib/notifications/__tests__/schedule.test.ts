import { describe, expect, it } from "vitest";
import { ReminderId, UserId, type Reminder } from "@notes-app/domain";
import { WINDOW_MS, decideSchedule, reminderDelayMs } from "../schedule";

const OWNER = UserId("11111111-1111-4111-8111-111111111111");

function reminder(fireAt: string, status: Reminder["status"] = "scheduled"): Reminder {
  return {
    id: ReminderId("r-1"),
    ownerId: OWNER,
    fireAt,
    title: "Standup",
    status,
  };
}

describe("decideSchedule", () => {
  it("fires immediately for missed reminders", () => {
    const now = Date.parse("2026-05-22T12:00:00Z");
    const decision = decideSchedule(reminder("2026-05-22T11:00:00Z"), now);
    expect(decision).toEqual({ kind: "fire-now", reason: "missed" });
  });

  it("schedules in-window reminders for a setTimeout firing", () => {
    const now = Date.parse("2026-05-22T12:00:00Z");
    const decision = decideSchedule(reminder("2026-05-22T15:30:00Z"), now);
    expect(decision).toEqual({ kind: "fire-now", reason: "in-window" });
  });

  it("defers reminders past the 24h window", () => {
    const now = Date.parse("2026-05-22T12:00:00Z");
    const future = "2026-05-25T12:00:00Z";
    const decision = decideSchedule(reminder(future), now);
    expect(decision.kind).toBe("defer-to-revisit");
    if (decision.kind === "defer-to-revisit") {
      expect(decision.delayMs).toBeGreaterThan(WINDOW_MS);
    }
  });

  it("defers non-scheduled reminders without inspecting the timestamp", () => {
    const now = Date.parse("2026-05-22T12:00:00Z");
    const decision = decideSchedule(reminder("2026-05-22T13:00:00Z", "fired"), now);
    expect(decision).toEqual({ kind: "defer-to-revisit", delayMs: 0 });
  });

  it("rejects malformed fireAt timestamps", () => {
    const now = Date.parse("2026-05-22T12:00:00Z");
    expect(() => decideSchedule(reminder("not-a-date"), now)).toThrow();
  });
});

describe("reminderDelayMs", () => {
  it("returns zero for missed reminders", () => {
    const now = Date.parse("2026-05-22T12:00:00Z");
    expect(reminderDelayMs(reminder("2026-05-22T11:00:00Z"), now)).toBe(0);
  });

  it("returns the exact delay for in-window reminders", () => {
    const now = Date.parse("2026-05-22T12:00:00Z");
    const fire = "2026-05-22T12:15:30Z";
    expect(reminderDelayMs(reminder(fire), now)).toBe(Date.parse(fire) - now);
  });
});
