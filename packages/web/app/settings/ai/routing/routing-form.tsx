"use client";

import { useEffect, useMemo, useState } from "react";
import type { AITask, AdapterBinding, RoutingConfig } from "@notes-app/domain";
import { V1_ROUTES } from "@notes-app/ai";
import { getSupabaseBrowserClient } from "../../../../lib/supabase/browser";
import { loadAIPrefs, patchRouting } from "../../../../lib/ai/prefs";

interface Group {
  title: string;
  description: string;
  tasks: { task: AITask; label: string }[];
}

const GROUPS: Group[] = [
  {
    title: "Content",
    description: "Long-form generation and reasoning. Defaults to qwen2.5:7b.",
    tasks: [
      { task: "chat", label: "Chat with notes" },
      { task: "summarize", label: "Summarize note" },
      { task: "rewrite", label: "Rewrite selection" },
      { task: "extract_actions", label: "Extract action items" },
      { task: "briefing", label: "Daily briefing" },
    ],
  },
  {
    title: "Metadata",
    description: "Quick classification tasks. Defaults to llama3.2:3b.",
    tasks: [
      { task: "suggest_tags", label: "Suggest tags" },
      { task: "suggest_title", label: "Suggest title" },
      { task: "compression", label: "Compress conversation" },
    ],
  },
  {
    title: "Embeddings",
    description: "Vector index — changing this re-embeds all notes.",
    tasks: [{ task: "embed", label: "Embed for search" }],
  },
];

export function RoutingForm() {
  const [routing, setRouting] = useState<RoutingConfig>({});
  const [endpoint, setEndpoint] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reindexNote, setReindexNote] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const prefs = await loadAIPrefs();
      setRouting(prefs.routing ?? {});
      setEndpoint(prefs.endpoints?.OLLAMA ?? "");
      if (prefs.endpoints?.OLLAMA) {
        await refreshModels(prefs.endpoints.OLLAMA);
      }
    })();
  }, []);

  async function refreshModels(url: string) {
    const supabase = getSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    try {
      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/functions/v1/ai/test-connection`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token ?? ""}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ endpoint_url: url }),
        },
      );
      const body = (await resp.json()) as { ok: boolean; models?: string[] };
      if (body.ok && body.models) setModels(body.models);
    } catch {
      // Soft fail — the dropdown falls back to defaults below.
    }
  }

  const dropdownModels = useMemo<string[]>(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const m of models) {
      if (!seen.has(m)) {
        out.push(m);
        seen.add(m);
      }
    }
    // Always include the V1 defaults so the user can pick them even when
    // /api/tags hasn't been refreshed.
    for (const r of Object.values(V1_ROUTES)) {
      if (!seen.has(r.model)) {
        out.push(r.model);
        seen.add(r.model);
      }
    }
    return out;
  }, [models]);

  function modelFor(task: AITask): string {
    return routing[task]?.model ?? V1_ROUTES[task].model;
  }

  function setModelFor(task: AITask, model: string): void {
    setRouting((prev) => {
      const next: RoutingConfig = { ...prev };
      const binding: AdapterBinding = { provider: "OLLAMA", model };
      (next as Record<string, AdapterBinding>)[task] = binding;
      return next;
    });
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    setReindexNote(null);
    const before = await loadAIPrefs();
    const beforeEmbed = before.routing?.embed?.model ?? V1_ROUTES.embed.model;
    const out = await patchRouting(before, routing);
    if (!out.ok) {
      setError(out.error ?? "Save failed");
      setSaving(false);
      return;
    }
    setSavedAt(Date.now());
    const afterEmbed = out.payload.routing?.embed?.model ?? V1_ROUTES.embed.model;
    if (afterEmbed !== beforeEmbed) {
      void triggerReindex();
    }
    setSaving(false);
  }

  async function triggerReindex() {
    setReindexing(true);
    setReindexNote("Re-embedding all notes in the background…");
    const supabase = getSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    try {
      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/functions/v1/ai/reindex`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token ?? ""}`,
            "Content-Type": "application/json",
          },
        },
      );
      const body = (await resp.json()) as { ok: boolean; processed?: number };
      if (body.ok) {
        setReindexNote(`Re-embed kicked off — ${body.processed ?? 0} notes touched.`);
      } else {
        setReindexNote("Re-embed failed; visit Endpoint to confirm Ollama is reachable.");
      }
    } catch (cause) {
      setReindexNote(cause instanceof Error ? cause.message : "reindex failed");
    } finally {
      setReindexing(false);
    }
  }

  return (
    <div className="space-y-6">
      {endpoint.length === 0 ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
          Set your Ollama endpoint first — model lists come from{" "}
          <code className="text-[0.85em]">/api/tags</code>.
        </p>
      ) : null}
      {GROUPS.map((group) => (
        <fieldset key={group.title} className="space-y-2">
          <legend className="text-sm font-medium">{group.title}</legend>
          <p className="text-xs text-ink-muted">{group.description}</p>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-ink/5">
              {group.tasks.map((row) => (
                <tr key={row.task}>
                  <td className="py-2 pr-4">{row.label}</td>
                  <td className="py-2">
                    <select
                      value={modelFor(row.task)}
                      onChange={(e) => setModelFor(row.task, e.target.value)}
                      className="rounded-md border border-ink/10 bg-surface px-2 py-1 text-xs dark:bg-surface-inverse/30 dark:border-ink-inverse/10"
                    >
                      {dropdownModels.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </fieldset>
      ))}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-md bg-brand px-3 py-1.5 text-sm text-brand-fg disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save routing"}
        </button>
        {savedAt !== null ? (
          <span className="self-center text-xs text-ink-muted">Saved</span>
        ) : null}
        {reindexing ? (
          <span className="self-center text-xs text-ink-muted">Re-embedding…</span>
        ) : null}
      </div>
      {error !== null ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
      {reindexNote !== null ? (
        <p role="status" className="text-xs text-ink-muted">
          {reindexNote}
        </p>
      ) : null}
    </div>
  );
}
