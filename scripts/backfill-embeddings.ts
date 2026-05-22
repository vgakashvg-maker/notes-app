/**
 * Backfill embeddings for every non-trashed note. Run on first deploy
 * and after any embedding-model switch (a new namespace lands +
 * existing notes need re-indexing).
 *
 * Usage (from the repo root):
 *
 *   pnpm tsx scripts/backfill-embeddings.ts
 *
 * Reads SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY from .env (passed via
 * the shell). Calls the embeddings/index Edge Function once per note
 * with concurrency = BACKFILL_CONCURRENCY (default 4). Logs progress
 * every PROGRESS_EVERY notes (default 25).
 */

interface Config {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  readonly namespace: string;
  readonly concurrency: number;
  readonly progressEvery: number;
}

function loadConfig(): Config {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.");
  }
  return {
    supabaseUrl,
    serviceRoleKey,
    namespace: process.env.BACKFILL_NAMESPACE ?? "ollama:nomic-embed-text",
    concurrency: Number(process.env.BACKFILL_CONCURRENCY ?? 4),
    progressEvery: Number(process.env.BACKFILL_PROGRESS_EVERY ?? 25),
  };
}

interface NoteRow {
  readonly id: string;
}

async function listNotePage(
  config: Config,
  cursor: string | null,
  pageSize: number,
): Promise<{ rows: NoteRow[]; nextCursor: string | null }> {
  const filter = cursor === null ? "" : `&id=gt.${encodeURIComponent(cursor)}`;
  const resp = await fetch(
    `${config.supabaseUrl}/rest/v1/notes?select=id&is_trashed=is.false${filter}&order=id.asc&limit=${pageSize}`,
    {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
      },
    },
  );
  if (!resp.ok) {
    throw new Error(`backfill listNotePage HTTP ${resp.status}`);
  }
  const rows = (await resp.json()) as NoteRow[];
  if (rows.length < pageSize) return { rows, nextCursor: null };
  return { rows, nextCursor: rows[rows.length - 1]?.id ?? null };
}

async function indexOne(config: Config, noteId: string): Promise<void> {
  const resp = await fetch(`${config.supabaseUrl}/functions/v1/embeddings/index`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ noteId, namespace: config.namespace }),
  });
  if (!resp.ok) {
    throw new Error(`embeddings/index HTTP ${resp.status} for ${noteId}`);
  }
}

async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
  onProgress: (done: number) => void,
): Promise<void> {
  let cursor = 0;
  let done = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (cursor < items.length) {
      const i = cursor;
      cursor += 1;
      const item = items[i];
      if (item === undefined) continue;
      try {
        await fn(item);
      } catch (err) {
        console.error(`backfill error on item ${i}:`, err);
      } finally {
        done += 1;
        onProgress(done);
      }
    }
  });
  await Promise.all(workers);
}

async function main(): Promise<void> {
  const config = loadConfig();
  console.warn(
    `Backfilling embeddings into namespace ${config.namespace} (concurrency=${config.concurrency})…`,
  );
  let cursor: string | null = null;
  let pageNumber = 0;
  let totalDone = 0;
  do {
    const { rows, nextCursor } = await listNotePage(config, cursor, 500);
    pageNumber += 1;
    console.warn(`Page ${pageNumber}: ${rows.length} notes`);
    await runWithConcurrency(
      rows,
      config.concurrency,
      (row) => indexOne(config, row.id),
      (done) => {
        if (done % config.progressEvery === 0) {
          console.warn(`  …${totalDone + done} notes embedded`);
        }
      },
    );
    totalDone += rows.length;
    cursor = nextCursor;
  } while (cursor !== null);
  console.warn(`Done. Embedded ${totalDone} notes.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
