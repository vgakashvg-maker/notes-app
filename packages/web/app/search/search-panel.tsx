"use client";

import { useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "../../lib/supabase/browser";

type Mode = "keyword" | "semantic";

interface Hit {
  id: string;
  title: string;
  snippet: string;
}

/**
 * Two-mode search panel. Keyword goes to PostgREST full-text; semantic
 * posts to the M09 `ai/related` Edge Function. Both render the same
 * Hit shape so the result list stays a single component.
 */
export function SearchPanel() {
  const [mode, setMode] = useState<Mode>("keyword");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length === 0) return;
    setPending(true);
    setError(null);
    try {
      if (mode === "keyword") {
        const supabase = getSupabaseBrowserClient();
        const { data, error: searchError } = await supabase.rpc("search_notes", { q });
        if (searchError !== null) throw new Error(searchError.message);
        setHits(
          ((data ?? []) as Array<{ id: string; title: string; snippet: string }>).map((r) => ({
            id: r.id,
            title: r.title,
            snippet: r.snippet,
          })),
        );
      } else {
        const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/functions/v1/ai/related`;
        const supabase = getSupabaseBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token ?? ""}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: q, k: 10 }),
        });
        if (!res.ok) throw new Error(`Semantic search failed (${res.status})`);
        const payload = (await res.json()) as {
          hits: Array<{ noteId: string; title: string; snippet: string }>;
        };
        setHits(payload.hits.map((h) => ({ id: h.noteId, title: h.title, snippet: h.snippet })));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "search failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="flex items-center gap-2">
        <input
          aria-label="Search query"
          className="flex-1 rounded-md border border-ink/10 bg-surface px-3 py-2 text-sm dark:bg-surface-inverse/30 dark:border-ink-inverse/10"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search notes…"
        />
        <fieldset className="flex items-center gap-1 text-xs">
          <legend className="sr-only">Search mode</legend>
          <ModeToggle mode={mode} setMode={setMode} value="keyword" label="Keyword" />
          <ModeToggle mode={mode} setMode={setMode} value="semantic" label="Semantic" />
        </fieldset>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-3 py-2 text-sm text-brand-fg disabled:opacity-60"
        >
          {pending ? "…" : "Search"}
        </button>
      </form>
      {error !== null ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
      <ul className="divide-y divide-ink/5">
        {hits.map((h) => (
          <li key={h.id} className="py-3">
            <Link href={`/notes/${h.id}`} className="text-sm font-medium hover:underline">
              {h.title || "Untitled"}
            </Link>
            <p
              className="mt-1 text-xs text-ink-muted"
              dangerouslySetInnerHTML={{ __html: h.snippet }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ModeToggle({
  mode,
  setMode,
  value,
  label,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  value: Mode;
  label: string;
}) {
  const isActive = mode === value;
  return (
    <button
      type="button"
      onClick={() => setMode(value)}
      className={
        "rounded px-2 py-1 " +
        (isActive ? "bg-brand text-brand-fg" : "text-ink-muted hover:bg-ink/5")
      }
      aria-pressed={isActive}
    >
      {label}
    </button>
  );
}
