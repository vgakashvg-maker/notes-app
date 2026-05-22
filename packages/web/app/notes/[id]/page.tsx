import dynamicImport from "next/dynamic";
import { notFound } from "next/navigation";
import { getNoteById } from "../../../lib/notes/queries";

export const dynamic = "force-dynamic";

// Tiptap is heavy; lazy-load on the client. Lighthouse improvement.
const Editor = dynamicImport(() => import("./editor").then((m) => m.Editor), {
  ssr: false,
  loading: () => <p className="text-sm text-ink-muted">Loading editor…</p>,
});

export default async function NotePage({ params }: { params: { id: string } }) {
  if (params.id === "new") {
    return (
      <div className="mx-auto max-w-3xl">
        <Editor noteId={null} initialTitle="" initialBodyJson="" />
      </div>
    );
  }
  const note = await getNoteById(params.id);
  if (note === null) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <Editor noteId={note.id} initialTitle={note.title} initialBodyJson={note.body_json} />
    </div>
  );
}
