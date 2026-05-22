import { describe, expect, it } from "vitest";
import { progress, UploadState } from "@notes-app/domain";
import { ProgressBus } from "../progress-bus.js";

describe("ProgressBus", () => {
  it("publishes the latest value to current subscribers", async () => {
    const bus = new ProgressBus();
    const received: number[] = [];
    const iter = bus.subscribe("att-1")[Symbol.asyncIterator]();
    bus.publish("att-1", progress(0, 100, UploadState.uploading()));
    bus.publish("att-1", progress(50, 100, UploadState.uploading()));
    bus.publish("att-1", progress(100, 100, UploadState.done()));
    for (let i = 0; i < 3; i += 1) {
      const next = await iter.next();
      if (next.done) break;
      received.push(next.value.bytesSent);
    }
    await iter.return?.();
    expect(received).toEqual([0, 50, 100]);
  });

  it("replays the latest value to a late subscriber", async () => {
    const bus = new ProgressBus();
    bus.publish("att-1", progress(50, 100, UploadState.uploading()));
    const iter = bus.subscribe("att-1")[Symbol.asyncIterator]();
    const first = await iter.next();
    await iter.return?.();
    if (first.done) throw new Error("expected a value");
    expect(first.value.bytesSent).toBe(50);
  });

  it("exposes the current snapshot synchronously", () => {
    const bus = new ProgressBus();
    expect(bus.current("att-1")).toBeUndefined();
    bus.publish("att-1", progress(10, 100, UploadState.uploading()));
    expect(bus.current("att-1")?.bytesSent).toBe(10);
  });

  it("subscriber returns iterator-done after .return()", async () => {
    const bus = new ProgressBus();
    const iter = bus.subscribe("att-1")[Symbol.asyncIterator]();
    const after = iter.return?.();
    const r = await after;
    expect(r?.done).toBe(true);
  });
});
