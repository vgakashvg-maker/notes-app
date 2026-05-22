import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { ReminderId, UserId, type Reminder } from "@notes-app/domain";
import { useNotifications } from "../use-notifications";

const OWNER = UserId("11111111-1111-4111-8111-111111111111");

function reminder(fireAt: string): Reminder {
  return {
    id: ReminderId("r-1"),
    ownerId: OWNER,
    fireAt,
    title: "Standup",
    body: "9am sync",
    status: "scheduled",
  };
}

class FakeNotification {
  static permission: NotificationPermission = "default";
  static requestPermission = vi.fn(async () => FakeNotification.permission);
  static instances: FakeNotification[] = [];

  constructor(
    public title: string,
    public options?: NotificationOptions,
  ) {
    FakeNotification.instances.push(this);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeNotification.permission = "default";
  FakeNotification.requestPermission = vi.fn(async () => FakeNotification.permission);
  FakeNotification.instances = [];
  (globalThis as unknown as { Notification: typeof FakeNotification }).Notification =
    FakeNotification;
});

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as { Notification?: unknown }).Notification;
});

describe("useNotifications", () => {
  it("requests permission and propagates the result", async () => {
    FakeNotification.permission = "granted";
    FakeNotification.requestPermission.mockResolvedValueOnce("granted");
    const { result } = renderHook(() => useNotifications());
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.requestPermission();
    });
    expect(outcome).toBe("granted");
    expect(FakeNotification.requestPermission).toHaveBeenCalledOnce();
  });

  it("schedules a Notification when the firing is inside the 24h window", async () => {
    FakeNotification.permission = "granted";
    vi.setSystemTime(new Date("2026-05-22T12:00:00Z"));
    const { result } = renderHook(() => useNotifications());
    await act(async () => {
      await result.current.schedule(reminder("2026-05-22T12:00:10Z"));
    });
    expect(FakeNotification.instances).toHaveLength(0);
    await act(async () => {
      vi.advanceTimersByTime(11_000);
    });
    expect(FakeNotification.instances).toHaveLength(1);
    expect(FakeNotification.instances[0]?.title).toBe("Standup");
    expect(FakeNotification.instances[0]?.options?.body).toBe("9am sync");
  });

  it("does not schedule reminders past the 24h window", async () => {
    vi.setSystemTime(new Date("2026-05-22T12:00:00Z"));
    const { result } = renderHook(() => useNotifications());
    await act(async () => {
      await result.current.schedule(reminder("2026-05-25T12:00:00Z"));
    });
    await act(async () => {
      vi.advanceTimersByTime(60 * 60 * 1000);
    });
    expect(FakeNotification.instances).toHaveLength(0);
  });

  it("cancel() prevents a scheduled timer from firing", async () => {
    FakeNotification.permission = "granted";
    vi.setSystemTime(new Date("2026-05-22T12:00:00Z"));
    const { result } = renderHook(() => useNotifications());
    const r = reminder("2026-05-22T12:00:10Z");
    await act(async () => {
      await result.current.schedule(r);
    });
    await act(async () => {
      await result.current.cancel(r.id);
    });
    await act(async () => {
      vi.advanceTimersByTime(11_000);
    });
    expect(FakeNotification.instances).toHaveLength(0);
  });

  it("reports `unsupported` when the Notification API is missing", async () => {
    delete (globalThis as { Notification?: unknown }).Notification;
    const { result } = renderHook(() => useNotifications());
    expect(result.current.permission).toBe("unsupported");
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.requestPermission();
    });
    expect(outcome).toBe("unsupported");
  });
});
