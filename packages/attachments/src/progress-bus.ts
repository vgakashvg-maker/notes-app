import type { AttachmentId, Progress } from "../../domain/src/index.ts";

/**
 * Tiny pub/sub for upload progress events keyed by attachment id. Each
 * publish() fans out to current subscribers; subscribers can come and
 * go without losing the final state — the bus remembers the last value
 * per id so a late subscriber sees the most recent Progress
 * immediately.
 *
 * Plain TS / no RxJS — this is the only async surface in the
 * attachments package and Observables would be overkill.
 */
export class ProgressBus {
  private readonly latest = new Map<string, Progress>();
  private readonly subscribers = new Map<string, Set<(p: Progress) => void>>();

  publish(id: AttachmentId | string, value: Progress): void {
    this.latest.set(id, value);
    for (const cb of this.subscribers.get(id) ?? []) {
      cb(value);
    }
  }

  current(id: AttachmentId | string): Progress | undefined {
    return this.latest.get(id);
  }

  subscribe(id: AttachmentId | string): AsyncIterable<Progress> {
    const bus = this;
    return {
      [Symbol.asyncIterator](): AsyncIterator<Progress> {
        const queue: Progress[] = [];
        const waiters: Array<(p: IteratorResult<Progress>) => void> = [];
        const cb = (p: Progress) => {
          const w = waiters.shift();
          if (w !== undefined) w({ value: p, done: false });
          else queue.push(p);
        };
        const subs = bus.subscribers.get(id) ?? new Set();
        subs.add(cb);
        bus.subscribers.set(id, subs);
        // Replay the latest value once so a late subscriber sees state immediately.
        const seed = bus.latest.get(id);
        if (seed !== undefined) queue.push(seed);

        let closed = false;

        return {
          async next(): Promise<IteratorResult<Progress>> {
            if (closed) return { value: undefined as never, done: true };
            const q = queue.shift();
            if (q !== undefined) return { value: q, done: false };
            return new Promise<IteratorResult<Progress>>((resolve) => waiters.push(resolve));
          },
          async return(): Promise<IteratorResult<Progress>> {
            closed = true;
            subs.delete(cb);
            while (waiters.length > 0) {
              const w = waiters.shift();
              w?.({ value: undefined as never, done: true });
            }
            return { value: undefined as never, done: true };
          },
        };
      },
    };
  }
}
