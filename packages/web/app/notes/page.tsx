import Link from "next/link";
import { Suspense } from "react";
import { listRecentNotes } from "../../lib/notes/queries";

export const dynamic = "force-dynamic";

export default function NotesIndexPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Notes</h1>
        <Link href="/notes/new" className="text-sm text-brand hover:underline">
          New note
        </Link>
      </header>
      <Suspense fallback={<p className="text-sm">Loading…</p>}>
        <NotesList />
      </Suspense>
    </div>
  );
}

async function NotesList() {
  const notes = await listRecentNotes(100);
  if (notes.length === 0) {
    return <p className="text-sm text-ink-muted">No notes yet.</p>;
  }
  return (
    <ul className="divide-y divide-ink/5">
      {notes.map((n) => (
        <li key={n.id}>
          <Link
            href={`/notes/${n.id}`}
            className="flex items-baseline justify-between gap-4 py-3"
          >
            <span className="text-sm font-medium">
              {n.is_pinned ? "📌 " : ""}
              {n.title || "Untitled"}
            </span>
            <span className="shrink-0 text-xs text-ink-muted">
              {new Date(n.updated_at).toLocaleDateString()}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
