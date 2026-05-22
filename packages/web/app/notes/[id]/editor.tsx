"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { jsonToMarkdown, markdownToJson, type DocRoot } from "@notes-app/editor-schema";
import { getSupabaseBrowserClient } from "../../../lib/supabase/browser";

export interface EditorProps {
  noteId: string | null;
  initialTitle: string;
  initialBodyJson: string;
}

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Minimal Tiptap mount. Bridges Tiptap's HTML/Markdown surface with the
 * frozen M06 schema via jsonToMarkdown/markdownToJson — load reads the
 * stored DocRoot JSON, converts to Markdown, hands it to Tiptap as a
 * starting state; save reverses the trip. Custom nodes (internal links,
 * attachments) are punted to a follow-up — the StarterKit covers
 * paragraphs, headings, lists, code, bold/italic.
 */
export function Editor({ noteId, initialTitle, initialBodyJson }: EditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const initialMarkdown = initialBodyToMarkdown(initialBodyJson);

  const editor = useEditor({
    extensions: [StarterKit],
    content: initialMarkdown,
    immediatelyRender: false,
  });

  const onSave = useCallback(async () => {
    if (editor === null) return;
    setSaveState("saving");
    setSaveError(null);
    const md = editor.getText({ blockSeparator: "\n\n" });
    let nextJson: DocRoot;
    try {
      nextJson = markdownToJson(md);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "Could not serialise body");
      setSaveState("error");
      return;
    }
    const supabase = getSupabaseBrowserClient();
    const payload = {
      title: title.trim() || "Untitled",
      body_json: JSON.stringify(nextJson),
    };
    if (noteId === null) {
      // owner_id is stamped server-side by the notes_stamp_owner trigger
      // (migration 20260522150000) from auth.uid(); the client never sets it.
      const { data, error } = await supabase.from("notes").insert(payload).select("id").single();
      if (error !== null || data === null) {
        setSaveError(error?.message ?? "Insert returned no row");
        setSaveState("error");
        return;
      }
      setSaveState("saved");
      router.replace(`/notes/${data.id}`);
    } else {
      const { error } = await supabase.from("notes").update(payload).eq("id", noteId);
      if (error !== null) {
        setSaveError(error.message);
        setSaveState("error");
        return;
      }
      setSaveState("saved");
    }
  }, [editor, noteId, router, title]);

  useEffect(() => {
    if (saveState !== "saved") return;
    const t = setTimeout(() => setSaveState("idle"), 1500);
    return () => clearTimeout(t);
  }, [saveState]);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <input
          aria-label="Note title"
          className="w-full border-0 bg-transparent text-2xl font-semibold outline-none focus:ring-0"
          placeholder="Untitled"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button
          type="button"
          onClick={onSave}
          disabled={saveState === "saving"}
          className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-sm text-brand-fg disabled:opacity-60"
        >
          {saveLabel(saveState)}
        </button>
      </div>
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <EditorContent editor={editor} />
      </div>
      {saveError !== null ? (
        <p role="alert" className="text-xs text-red-600">
          {saveError}
        </p>
      ) : null}
    </div>
  );
}

function saveLabel(state: SaveState): string {
  switch (state) {
    case "saving":
      return "Saving…";
    case "saved":
      return "Saved";
    case "error":
      return "Retry";
    case "idle":
    default:
      return "Save";
  }
}

function initialBodyToMarkdown(bodyJson: string): string {
  if (bodyJson.trim().length === 0) return "";
  try {
    const doc = JSON.parse(bodyJson) as DocRoot;
    return jsonToMarkdown(doc);
  } catch {
    return "";
  }
}
