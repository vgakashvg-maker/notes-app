/**
 * Pure-logic backing for the `notes/bulk-update` Edge Function.
 * Validates the request shape and delegates the actual SQL UPDATE to a
 * caller-provided executor. The Deno entry under
 * supabase/functions/notes/bulk-update/index.ts wires the executor to the
 * Supabase service-role client; tests pass a fake.
 */

export type BulkOperation =
  | { kind: "move"; notebookId: string | null }
  | { kind: "addTag"; tagId: string }
  | { kind: "removeTag"; tagId: string }
  | { kind: "trash" }
  | { kind: "restore" };

export interface BulkUpdateRequest {
  readonly noteIds: readonly string[];
  readonly operation: BulkOperation;
}

export interface BulkUpdateSuccess {
  readonly ok: true;
  readonly data: { readonly updated: number };
}

export interface BulkUpdateFailure {
  readonly ok: false;
  readonly error: { readonly code: string; readonly message: string };
}

export type BulkUpdateResponse = BulkUpdateSuccess | BulkUpdateFailure;

export interface BulkUpdateDeps {
  /**
   * Execute the operation against the user's notes inside a single
   * transaction. Returns the number of rows that actually changed. The
   * implementation must enforce owner_id = userId (RLS handles this when
   * a user JWT is used; the service-role implementation must add it).
   */
  readonly execute: (
    userId: string,
    noteIds: readonly string[],
    operation: BulkOperation,
  ) => Promise<number>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseBulkUpdate(body: unknown): BulkUpdateRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const noteIds = (body as { noteIds?: unknown }).noteIds;
  if (!Array.isArray(noteIds) || noteIds.length === 0 || noteIds.length > 500) return null;
  for (const id of noteIds) {
    if (typeof id !== "string" || !UUID_RE.test(id)) return null;
  }
  const op = parseOperation((body as { operation?: unknown }).operation);
  if (op === null) return null;
  return { noteIds: noteIds as string[], operation: op };
}

function parseOperation(value: unknown): BulkOperation | null {
  if (typeof value !== "object" || value === null) return null;
  const kind = (value as { kind?: unknown }).kind;
  switch (kind) {
    case "move": {
      const nb = (value as { notebookId?: unknown }).notebookId;
      if (nb !== null && (typeof nb !== "string" || !UUID_RE.test(nb))) return null;
      return { kind: "move", notebookId: nb as string | null };
    }
    case "addTag":
    case "removeTag": {
      const tag = (value as { tagId?: unknown }).tagId;
      if (typeof tag !== "string" || !UUID_RE.test(tag)) return null;
      return { kind, tagId: tag };
    }
    case "trash":
    case "restore":
      return { kind };
    default:
      return null;
  }
}

export async function bulkUpdate(
  userId: string,
  request: BulkUpdateRequest,
  deps: BulkUpdateDeps,
): Promise<BulkUpdateResponse> {
  if (userId.trim().length === 0) {
    return failure("ERR_UNAUTHENTICATED", "Caller is not authenticated.");
  }
  try {
    const updated = await deps.execute(userId, request.noteIds, request.operation);
    return { ok: true, data: { updated } };
  } catch (cause) {
    return failure(
      "ERR_BULK_UPDATE_FAILED",
      cause instanceof Error ? cause.message : "Bulk update failed",
    );
  }
}

function failure(code: string, message: string): BulkUpdateFailure {
  return { ok: false, error: { code, message } };
}
