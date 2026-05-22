"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "../../../../lib/supabase/browser";
import { loadAIPrefs, patchEndpoint } from "../../../../lib/ai/prefs";

interface TestResult {
  ok: boolean;
  models?: string[];
  error?: string;
  latencyMs?: number;
}

export function EndpointForm() {
  const [url, setUrl] = useState("");
  const [original, setOriginal] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    void loadAIPrefs().then((prefs) => {
      const existing = prefs.endpoints?.OLLAMA ?? "";
      setUrl(existing);
      setOriginal(existing);
    });
  }, []);

  async function onTest() {
    if (!validUrl(url)) {
      setResult({ ok: false, error: "URL must start with http:// or https://" });
      return;
    }
    setTesting(true);
    setResult(null);
    const supabase = getSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const target = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/functions/v1/ai/test-connection`;
    try {
      const resp = await fetch(target, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ endpoint_url: url }),
      });
      const body = (await resp.json()) as {
        ok: boolean;
        models?: string[];
        latencyMs?: number;
        error?: { code: string; message: string };
      };
      if (body.ok) {
        setResult({ ok: true, models: body.models ?? [], latencyMs: body.latencyMs });
      } else {
        setResult({ ok: false, error: body.error?.message ?? "Test failed" });
      }
    } catch (cause) {
      setResult({ ok: false, error: cause instanceof Error ? cause.message : "fetch failed" });
    } finally {
      setTesting(false);
    }
  }

  async function onSave() {
    setSaving(true);
    setSaveError(null);
    const current = await loadAIPrefs();
    const out = await patchEndpoint(current, { OLLAMA: url });
    if (!out.ok) {
      setSaveError(out.error ?? "Save failed");
    } else {
      setOriginal(url);
      setSavedAt(Date.now());
    }
    setSaving(false);
  }

  const dirty = url !== original;

  return (
    <div className="space-y-4">
      <label className="block text-sm">
        <span className="mb-1 block text-ink-muted">Ollama URL</span>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-tailscale-funnel.ts.net"
          className="w-full rounded-md border border-ink/10 bg-surface px-3 py-2 dark:bg-surface-inverse/30 dark:border-ink-inverse/10"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onTest}
          disabled={testing || url.trim().length === 0}
          className="rounded-md border border-ink/10 px-3 py-1.5 text-sm hover:bg-ink/5 disabled:opacity-60"
        >
          {testing ? "Testing…" : "Test connection"}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !dirty}
          className="rounded-md bg-brand px-3 py-1.5 text-sm text-brand-fg disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {savedAt !== null ? (
          <span className="self-center text-xs text-ink-muted">Saved</span>
        ) : null}
      </div>
      {result !== null ? (
        result.ok ? (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
            <p className="font-medium text-emerald-700 dark:text-emerald-300">
              Connected — {result.latencyMs ?? 0} ms
            </p>
            {result.models && result.models.length > 0 ? (
              <ul className="mt-2 list-disc pl-5 text-xs text-ink-muted">
                {result.models.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-ink-muted">No models installed.</p>
            )}
          </div>
        ) : (
          <p role="alert" className="text-sm text-red-600">
            {result.error}
          </p>
        )
      ) : null}
      {saveError !== null ? (
        <p role="alert" className="text-sm text-red-600">
          {saveError}
        </p>
      ) : null}
    </div>
  );
}

function validUrl(s: string): boolean {
  return /^https?:\/\//.test(s.trim());
}
