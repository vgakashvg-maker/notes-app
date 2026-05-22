// Edge Function: POST /functions/v1/ai/briefing
//
// Either user-triggered (with a bearer JWT) or cron-triggered (with
// the service-role bearer). When cron-triggered the function picks
// the date passed in the body; for V1 the briefing runs only against
// the calling user's data when a user JWT is present, and is a no-op
// when called via service-role (per-user fan-out lands in M15).

// deno-lint-ignore-file no-explicit-any

import {
  briefing as runBriefing,
  composeSystemBlock,
  parsePrompt,
} from "../../../../packages/ai/src/index.ts";
import {
  jsonError,
  logUsage,
  mustEnv,
  ollamaProvider,
  readPrompt,
  resolveUserId,
} from "../_shared/ollama.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(h: (req: Request) => Response | Promise<Response>): void;
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonError(405, "ERR_METHOD_NOT_ALLOWED", "POST only");
  const jwt = req.headers.get("Authorization")?.slice("bearer ".length).trim() ?? "";
  if (jwt === "") return jsonError(401, "ERR_UNAUTHENTICATED", "Missing JWT");

  // Cron path: bearer == service_role. We accept the request but
  // emit a notice and return — per-user fan-out is M15's job.
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (jwt === serviceRole) {
    return new Response(
      JSON.stringify({ ok: true, data: { skipped: "per-user fan-out deferred to M15" } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  const userId = await resolveUserId(req);
  if (userId === null) return jsonError(401, "ERR_UNAUTHENTICATED", "Invalid JWT");

  let body: any;
  try { body = await req.json(); } catch { return jsonError(400, "ERR_BAD_REQUEST", "Body must be JSON"); }
  const date = typeof body?.date === "string" ? body.date : new Date().toISOString().slice(0, 10);

  const SUPABASE_URL = mustEnv("SUPABASE_URL");
  const apikey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
  const auth = `Bearer ${jwt}`;
  const yesterday = priorDay(date);

  const yesterdayResp = await fetch(
    `${SUPABASE_URL}/rest/v1/notes?select=title,body_json&updated_at=gte.${yesterday}&updated_at=lt.${date}&order=updated_at.desc&limit=20`,
    { headers: { Authorization: auth, apikey } },
  );
  const yesterdayNotes = yesterdayResp.ok
    ? ((await yesterdayResp.json()) as Array<{ title: string; body_json: unknown }>)
    : [];

  const todayResp = await fetch(
    `${SUPABASE_URL}/rest/v1/events_mirror?select=title,start_at&start_at=gte.${date}&start_at=lt.${priorDay(date, -1)}&order=start_at.asc&limit=20`,
    { headers: { Authorization: auth, apikey } },
  );
  const todayEvents = todayResp.ok
    ? ((await todayResp.json()) as Array<{ title: string; start_at: string }>)
    : [];

  const prompt = parsePrompt(await readPrompt("briefing"));
  const start = Date.now();
  const markdown = await runBriefing(
    {
      date,
      yesterdayNotes: yesterdayNotes.map((n) => ({
        title: n.title,
        snippet: (typeof n.body_json === "string" ? n.body_json : JSON.stringify(n.body_json)).slice(0, 200),
      })),
      todayEvents: todayEvents.map((e) => ({
        title: e.title,
        startAt: e.start_at.slice(11, 16),
      })),
      openActions: [],
    },
    { system: composeSystemBlock(prompt, false) },
    { provider: ollamaProvider() },
  );
  await logUsage(jwt, {
    task: "briefing",
    model: "qwen2.5:7b",
    promptTokens: 0,
    completionTokens: 0,
    latencyMs: Date.now() - start,
  });
  return new Response(
    JSON.stringify({ ok: true, data: { date, markdown } }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});

function priorDay(iso: string, offsetDays = 1): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - offsetDays);
  return d.toISOString().slice(0, 10);
}
