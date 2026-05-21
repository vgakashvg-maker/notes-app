/**
 * Seed ~50 sample notes into a Supabase project for development.
 *
 * Usage (from the repo root):
 *   pnpm tsx scripts/seed.ts                          # uses .env
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SEED_USER_ID=... \
 *     pnpm tsx scripts/seed.ts
 *
 * The script is idempotent: re-running it skips any row whose deterministic
 * UUID already exists.
 */
import { createHash } from "node:crypto";

interface SeedConfig {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  readonly userId: string;
}

function loadConfig(): SeedConfig {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const userId = process.env.SEED_USER_ID;
  if (!supabaseUrl || !serviceRoleKey || !userId) {
    throw new Error(
      "Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SEED_USER_ID before running this script.",
    );
  }
  return { supabaseUrl, serviceRoleKey, userId };
}

function seededUuid(namespace: string, key: string): string {
  // Stable, deterministic UUIDv5-shaped string so re-running the seed
  // upserts on the same rows.
  const hash = createHash("sha1").update(`${namespace}|${key}`).digest("hex");
  // Force the variant nibble to one of 8/9/a/b per RFC 4122.
  const variantNibble = (((parseInt(hash[16] ?? "8", 16) & 0x3) | 0x8) >>> 0).toString(16);
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    `${variantNibble}${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join("-");
}

const NOTEBOOK_NAMES = ["Inbox", "Work", "Reading", "Ideas", "Personal"] as const;
const TAG_NAMES = ["urgent", "later", "research", "draft", "done"] as const;

const NOTE_SEEDS = Array.from({ length: 50 }, (_, i) => {
  const idx = i + 1;
  return {
    title: `Sample note ${idx}`,
    body: `This is sample note ${idx}. Lorem ipsum dolor sit amet, consectetur adipiscing elit.`,
    notebookKey: NOTEBOOK_NAMES[i % NOTEBOOK_NAMES.length] ?? "Inbox",
    tagKeys: [
      TAG_NAMES[i % TAG_NAMES.length] ?? "draft",
      TAG_NAMES[(i + 2) % TAG_NAMES.length] ?? "later",
    ],
    pin: i < 3,
  };
});

async function upsert<T extends Record<string, unknown>>(
  config: SeedConfig,
  table: string,
  rows: readonly T[],
  conflictTarget = "id",
): Promise<void> {
  if (rows.length === 0) return;
  const resp = await fetch(`${config.supabaseUrl}/rest/v1/${table}?on_conflict=${conflictTarget}`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!resp.ok) {
    throw new Error(`Upsert ${table} failed: ${resp.status} ${await resp.text()}`);
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const { userId } = config;

  const notebookRows = NOTEBOOK_NAMES.map((name, idx) => ({
    id: seededUuid("notebook", `${userId}|${name}`),
    owner_id: userId,
    name,
    color: ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"][idx] ?? "#7c7c7c",
    sort_order: idx,
  }));
  await upsert(config, "notebooks", notebookRows);

  const tagRows = TAG_NAMES.map((name) => ({
    id: seededUuid("tag", `${userId}|${name}`),
    owner_id: userId,
    name,
    color: "#7c7c7c",
  }));
  await upsert(config, "tags", tagRows, "owner_id,name");

  const notebookIdByName = Object.fromEntries(
    notebookRows.map((row) => [row.name, row.id]),
  ) as Record<(typeof NOTEBOOK_NAMES)[number], string>;
  const tagIdByName = Object.fromEntries(tagRows.map((row) => [row.name, row.id])) as Record<
    (typeof TAG_NAMES)[number],
    string
  >;

  const noteRows = NOTE_SEEDS.map((seed) => ({
    id: seededUuid("note", `${userId}|${seed.title}`),
    owner_id: userId,
    notebook_id: notebookIdByName[seed.notebookKey],
    title: seed.title,
    body_json: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: seed.body }] }],
    },
    is_pinned: seed.pin,
    is_trashed: false,
    ai_excluded: false,
  }));
  await upsert(config, "notes", noteRows);

  const noteTagRows = NOTE_SEEDS.flatMap((seed, idx) => {
    const noteId = noteRows[idx]?.id;
    if (noteId === undefined) return [];
    return seed.tagKeys.map((name) => ({
      note_id: noteId,
      tag_id: tagIdByName[name as keyof typeof tagIdByName],
    }));
  });
  await upsert(config, "note_tags", noteTagRows, "note_id,tag_id");

  console.warn(
    `Seeded ${notebookRows.length} notebooks, ${tagRows.length} tags, ${noteRows.length} notes, ${noteTagRows.length} note_tags rows for user ${userId}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
