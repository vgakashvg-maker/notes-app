import Link from "next/link";
import { Suspense } from "react";
import { listRecentNotes } from "../lib/notes/queries";
import { listEventsInRange, todayRange } from "../lib/calendar/queries";

export const dynamic = "force-dynamic";

export default function TodayPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Today</h1>
        <p className="text-sm text-ink-muted">Calendar events and recent notes.</p>
      </header>
      <section aria-labelledby="today-events">
        <h2 id="today-events" className="mb-3 text-sm font-medium text-ink-muted">
          Events
        </h2>
        <Suspense fallback={<p className="text-sm">Loading…</p>}>
          <TodayEvents />
        </Suspense>
      </section>
      <section aria-labelledby="today-notes">
        <h2 id="today-notes" className="mb-3 text-sm font-medium text-ink-muted">
          Recent notes
        </h2>
        <Suspense fallback={<p className="text-sm">Loading…</p>}>
          <TodayNotes />
        </Suspense>
      </section>
    </div>
  );
}

async function TodayEvents() {
  const { startIso, endIso } = todayRange();
  const events = await listEventsInRange(startIso, endIso);
  if (events.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Nothing on the calendar today. Sync runs via{" "}
        <code className="text-[0.85em]">calendar/sync</code>.
      </p>
    );
  }
  return (
    <ul className="space-y-1">
      {events.map((e) => (
        <li key={e.id} className="flex items-baseline gap-3 rounded-md px-2 py-1">
          <time className="w-20 shrink-0 text-xs tabular-nums text-ink-muted">
            {formatTime(e.start_at)} – {formatTime(e.end_at)}
          </time>
          <span className="text-sm font-medium">{e.title}</span>
        </li>
      ))}
    </ul>
  );
}

async function TodayNotes() {
  const notes = await listRecentNotes(10);
  if (notes.length === 0) {
    return <p className="text-sm text-ink-muted">No notes yet.</p>;
  }
  return (
    <ul className="space-y-1">
      {notes.map((n) => (
        <li key={n.id}>
          <Link
            href={`/notes/${n.id}`}
            className="block rounded-md px-2 py-1 hover:bg-ink/5 dark:hover:bg-ink-inverse/10"
          >
            <span className="text-sm font-medium">{n.title || "Untitled"}</span>
            <span className="ml-2 text-xs text-ink-muted">
              {new Date(n.updated_at).toLocaleDateString()}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
