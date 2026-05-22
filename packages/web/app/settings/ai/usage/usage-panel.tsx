"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../../../../lib/supabase/browser";

interface TaskTotals {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  latencyMsSum: number;
}

interface DayBucket {
  date: string;
  byTask: Record<string, TaskTotals>;
}

interface UsagePayload {
  ok: boolean;
  days: number;
  buckets: DayBucket[];
}

export function UsagePanel() {
  const [payload, setPayload] = useState<UsagePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      try {
        const resp = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/functions/v1/ai/usage?days=14`,
          {
            headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
          },
        );
        if (!resp.ok) {
          setError(`Usage fetch failed (${resp.status})`);
        } else {
          setPayload((await resp.json()) as UsagePayload);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "fetch failed");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const aggregates = useMemo(() => aggregate(payload?.buckets ?? []), [payload]);
  const latencyPoints = useMemo(() => latencySeries(payload?.buckets ?? []), [payload]);

  if (loading) return <p className="text-sm text-ink-muted">Loading usage…</p>;
  if (error !== null)
    return (
      <p role="alert" className="text-sm text-red-600">
        {error}
      </p>
    );
  if (payload === null || payload.buckets.length === 0)
    return <p className="text-sm text-ink-muted">No usage logged yet.</p>;

  return (
    <div className="space-y-6">
      <Sparkline label="Avg latency (ms) per day" points={latencyPoints} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="py-2 pr-4">Task</th>
              <th className="py-2 pr-4">Calls</th>
              <th className="py-2 pr-4">Prompt tokens</th>
              <th className="py-2 pr-4">Completion tokens</th>
              <th className="py-2">Avg latency (ms)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {Object.entries(aggregates)
              .sort((a, b) => b[1].calls - a[1].calls)
              .map(([task, row]) => (
                <tr key={task}>
                  <td className="py-2 pr-4 font-medium">{task}</td>
                  <td className="py-2 pr-4">{row.calls}</td>
                  <td className="py-2 pr-4">{row.promptTokens.toLocaleString()}</td>
                  <td className="py-2 pr-4">{row.completionTokens.toLocaleString()}</td>
                  <td className="py-2">
                    {row.calls === 0 ? "—" : Math.round(row.latencyMsSum / row.calls)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function aggregate(buckets: DayBucket[]): Record<string, TaskTotals> {
  const out: Record<string, TaskTotals> = {};
  for (const day of buckets) {
    for (const [task, row] of Object.entries(day.byTask)) {
      const slot = out[task] ?? {
        calls: 0,
        promptTokens: 0,
        completionTokens: 0,
        latencyMsSum: 0,
      };
      slot.calls += row.calls;
      slot.promptTokens += row.promptTokens;
      slot.completionTokens += row.completionTokens;
      slot.latencyMsSum += row.latencyMsSum;
      out[task] = slot;
    }
  }
  return out;
}

function latencySeries(buckets: DayBucket[]): Array<{ x: string; y: number }> {
  return buckets.map((b) => {
    let calls = 0;
    let sum = 0;
    for (const row of Object.values(b.byTask)) {
      calls += row.calls;
      sum += row.latencyMsSum;
    }
    return { x: b.date.slice(5), y: calls === 0 ? 0 : Math.round(sum / calls) };
  });
}

function Sparkline({ label, points }: { label: string; points: Array<{ x: string; y: number }> }) {
  if (points.length === 0) return null;
  const W = 480;
  const H = 80;
  const PAD = 16;
  const maxY = Math.max(1, ...points.map((p) => p.y));
  const step = points.length > 1 ? (W - 2 * PAD) / (points.length - 1) : 0;
  const path = points
    .map((p, i) => {
      const x = PAD + step * i;
      const y = H - PAD - (p.y / maxY) * (H - 2 * PAD);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <figure className="space-y-2">
      <figcaption className="text-xs text-ink-muted">{label}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-md">
        <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brand" />
      </svg>
      <p className="text-[10px] text-ink-muted">
        {points[0]?.x} → {points[points.length - 1]?.x}, max {maxY.toLocaleString()} ms
      </p>
    </figure>
  );
}
