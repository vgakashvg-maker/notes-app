// Edge Function: POST /functions/v1/notes/bulk-update
//
// Thin Deno wrapper around `bulkUpdate` in `@notes-app/notes/edge`.
// Steps:
//   1. Resolve userId from the bearer JWT.
//   2. Parse + validate the request body.
//   3. Execute the operation as the user — by forwarding their JWT to
//      PostgREST so RLS enforces owner_id = auth.uid().
//
// Why forward the user JWT instead of using the service role? RLS is the
// safety net. Using service role here would silently let a misbehaving
// caller (one that lies about its userId) bypass it.

// deno-lint-ignore-file no-explicit-any

import {
  bulkUpdate,
  parseBulkUpdate,
  type BulkOperation,
} from "../../../packages/notes/src/bulk-update.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonError(405, "ERR_METHOD_NOT_ALLOWED", "Only POST is allowed.");
  }
  const jwt = extractBearer(req);
  const userId = jwt === null ? null : await resolveUserId(jwt);
  if (jwt === null || userId === null) {
    return jsonError(401, "ERR_UNAUTHENTICATED", "Missing or invalid bearer token.");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "ERR_BAD_REQUEST", "Body must be valid JSON.");
  }

  const request = parseBulkUpdate(body);
  if (request === null) {
    return jsonError(
      400,
      "ERR_BAD_REQUEST",
      "Body must be { noteIds: uuid[], operation: BulkOperation }.",
    );
  }

  const result = await bulkUpdate(userId, request, {
    execute: (_userId, noteIds, operation) => executeAsUser(jwt, noteIds, operation),
  });

  if (!result.ok) {
    return new Response(JSON.stringify(result), {
      status: result.error.code === "ERR_BULK_UPDATE_FAILED" ? 422 : 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

function mustEnv(name: string): string {
  const value = Deno.env.get(name);
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function extractBearer(req: Request): string | null {
  const header = req.headers.get("Authorization");
  if (header === null || !header.toLowerCase().startsWith("bearer ")) return null;
  const jwt = header.slice("bearer ".length).trim();
  return jwt.length === 0 ? null : jwt;
}

async function resolveUserId(jwt: string): Promise<string | null> {
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: SERVICE_ROLE_KEY,
    },
  });
  if (!resp.ok) return null;
  const body = (await resp.json()) as { id?: unknown };
  return typeof body.id === "string" ? body.id : null;
}

/**
 * Execute the requested mutation as the calling user. RLS on every table
 * means we can simply forward the user JWT and let Postgres do the safety
 * check.
 */
async function executeAsUser(
  jwt: string,
  noteIds: readonly string[],
  operation: BulkOperation,
): Promise<number> {
  const inClause = `in.(${noteIds.join(",")})`;

  switch (operation.kind) {
    case "trash":
    case "restore": {
      const isTrashed = operation.kind === "trash";
      return await patchNotes(jwt, inClause, {
        is_trashed: isTrashed,
        trashed_at: isTrashed ? new Date().toISOString() : null,
      });
    }
    case "move":
      return await patchNotes(jwt, inClause, { notebook_id: operation.notebookId });
    case "addTag": {
      const rows = noteIds.map((id) => ({ note_id: id, tag_id: operation.tagId }));
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/note_tags`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          apikey: SERVICE_ROLE_KEY,
          "Content-Type": "application/json",
          Prefer: "return=representation,resolution=merge-duplicates",
        },
        body: JSON.stringify(rows),
      });
      if (!resp.ok) throw new Error(`PostgREST ${resp.status}`);
      const inserted = (await resp.json()) as unknown[];
      return inserted.length;
    }
    case "removeTag": {
      const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/note_tags?note_id=${inClause}&tag_id=eq.${operation.tagId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${jwt}`,
            apikey: SERVICE_ROLE_KEY,
            Prefer: "return=representation",
          },
        },
      );
      if (!resp.ok) throw new Error(`PostgREST ${resp.status}`);
      const removed = (await resp.json()) as unknown[];
      return removed.length;
    }
  }
}

async function patchNotes(
  jwt: string,
  inClause: string,
  patch: Record<string, unknown>,
): Promise<number> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/notes?id=${inClause}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(patch),
  });
  if (!resp.ok) throw new Error(`PostgREST ${resp.status}`);
  const updated = (await resp.json()) as unknown[];
  return updated.length;
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
