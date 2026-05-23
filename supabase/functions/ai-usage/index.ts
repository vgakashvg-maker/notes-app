// Edge Function: GET /functions/v1/ai/usage
//
// Aggregates the caller's ai_usage_log into a per-day, per-task summary
// for the Settings → Usage screen. Service-role hits PostgREST scoped to
// the caller's owner_id via the forwarded JWT (RLS applies).

import { jsonError, mustEnv, resolveUserId } from "../_shared/ai/ollama.ts";

declare const Deno: {
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

interface UsageRow {
  readonly task: string;
  readonly model: string;
  readonly prompt_tokens: number | null;
  readonly completion_tokens: number | null;
  readonly latency_ms: number | null;
  readonly at: string; // timestamptz
}

interface DayBucket {
  date: string;
  byTask: Record<
    string,
    { calls: number; promptTokens: number; completionTokens: number; latencyMsSum: number }
  >;
}

const DEFAULT_DAYS = 14;
const MAX_DAYS = 90;

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return jsonError(405, "ERR_METHOD_NOT_ALLOWED", "GET only");
  const jwt = req.headers.get("Authorization")?.slice("bearer ".length).trim() ?? "";
  const userId = await resolveUserId(req);
  if (jwt === "" || userId === null) return jsonError(401, "ERR_UNAUTHENTICATED", "Missing JWT");

  const url = new URL(req.url);
  const daysParam = Number(url.searchParams.get("days") ?? DEFAULT_DAYS);
  const days = Number.isFinite(daysParam)
    ? Math.max(1, Math.min(MAX_DAYS, Math.floor(daysParam)))
    : DEFAULT_DAYS;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const rows = await fetchUsage(jwt, cutoff);
  const buckets = bucketize(rows);
  return new Response(
    JSON.stringify({ ok: true, days, buckets }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});

async function fetchUsage(jwt: string, cutoffIso: string): Promise<UsageRow[]> {
  const url =
    `${mustEnv("SUPABASE_URL")}/rest/v1/ai_usage_log` +
    `?select=task,model,prompt_tokens,completion_tokens,latency_ms,at` +
    `&at=gte.${encodeURIComponent(cutoffIso)}` +
    `&order=at.asc&limit=10000`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    },
  });
  if (!resp.ok) return [];
  return (await resp.json()) as UsageRow[];
}

function bucketize(rows: UsageRow[]): DayBucket[] {
  const map = new Map<string, DayBucket>();
  for (const row of rows) {
    const date = row.at.slice(0, 10); // YYYY-MM-DD
    let bucket = map.get(date);
    if (bucket === undefined) {
      bucket = { date, byTask: {} };
      map.set(date, bucket);
    }
    const task = row.task;
    const slot = bucket.byTask[task] ?? {
      calls: 0,
      promptTokens: 0,
      completionTokens: 0,
      latencyMsSum: 0,
    };
    slot.calls += 1;
    slot.promptTokens += row.prompt_tokens ?? 0;
    slot.completionTokens += row.completion_tokens ?? 0;
    slot.latencyMsSum += row.latency_ms ?? 0;
    bucket.byTask[task] = slot;
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}
