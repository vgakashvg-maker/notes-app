"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../lib/supabase/browser";

const STORAGE_KEY = "notes.last_calendar_sync_at";
const STALE_AFTER_MS = 60 * 60 * 1000; // 1 hour

/**
 * "Sync now" link in the Today header. Also auto-syncs on mount when
 * the stored `last_sync_at` (localStorage) is null or older than
 * STALE_AFTER_MS so a fresh sign-in / first-visit gets events without
 * waiting for the 15-min poll the spec calls for.
 */
export function SyncNowButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const autoRanRef = useRef(false);

  async function sync(opts?: { silent?: boolean }) {
    if (pending) return;
    setPending(true);
    if (!opts?.silent) setNote(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/functions/v1/calendar-sync`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token ?? ""}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            rangeStart: start.toISOString(),
            rangeEnd: end.toISOString(),
          }),
        },
      );
      const body = (await resp.json().catch(() => null)) as {
        ok?: boolean;
        upserted?: number;
        deleted?: number;
        error?: { message?: string };
      } | null;
      if (resp.ok && body?.ok) {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
        }
        if (!opts?.silent) {
          setNote(`Synced — ${body.upserted ?? 0} added/updated, ${body.deleted ?? 0} removed.`);
        }
        router.refresh();
      } else if (!opts?.silent) {
        setNote(body?.error?.message ?? `Sync failed (${resp.status})`);
      }
    } catch (cause) {
      if (!opts?.silent) {
        setNote(cause instanceof Error ? cause.message : "Sync failed");
      }
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    if (autoRanRef.current) return;
    autoRanRef.current = true;
    if (typeof window === "undefined") return;
    const last = Number(window.localStorage.getItem(STORAGE_KEY) ?? 0);
    if (!Number.isFinite(last) || Date.now() - last > STALE_AFTER_MS) {
      void sync({ silent: true });
    }
    // One-shot on mount; `autoRanRef` enforces single-fire without
    // needing `sync` as a dep. eslint-plugin-react-hooks isn't loaded
    // in this config, so no disable directive is needed.
  }, []);

  return (
    <div className="flex items-baseline gap-3">
      <button
        type="button"
        onClick={() => sync()}
        disabled={pending}
        className="text-xs text-brand hover:underline disabled:opacity-60"
      >
        {pending ? "Syncing…" : "Sync now"}
      </button>
      {note !== null ? <span className="text-xs text-ink-muted">{note}</span> : null}
    </div>
  );
}
