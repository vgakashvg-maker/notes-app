import Link from "next/link";
import { Suspense } from "react";
import { listRecentNotes } from "../lib/notes/queries";

export const dynamic = "force-dynamic";

export default function TodayPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Today</h1>
        <p className="text-sm text-ink-muted">
          Calendar events surface here once M08 lands. Until then, recent notes.
        </p>
      </header>
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
