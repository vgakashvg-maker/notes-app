/**
 * Pure-logic backing for the `storage/sign` Edge Function. Generates a
 * short-lived download URL for a Drive file. The Deno entry under
 * supabase/functions/storage/sign/index.ts wires the dependencies.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface SignRequest {
  readonly externalId: string;
  readonly ttlSeconds?: number;
}

export interface SignSuccess {
  readonly ok: true;
  readonly data: { readonly url: string; readonly expires_at: string };
}

export interface SignFailure {
  readonly ok: false;
  readonly error: { readonly code: string; readonly message: string };
}

export type SignResponse = SignSuccess | SignFailure;

export interface SignDeps {
  /**
   * Verify the caller owns the attachment via PostgREST + the user's
   * JWT. Returns true iff a row exists in attachments_refs with the
   * given external_id owned by the user.
   */
  readonly userOwnsAttachment: (userId: string, externalId: string) => Promise<boolean>;
  /** Mint a Drive download URL embedding a short-lived OAuth token. */
  readonly mintDriveUrl: (externalId: string, ttlSeconds: number) => Promise<string>;
  readonly now: () => Date;
}

const MIN_TTL = 60;
const MAX_TTL = 3600;
const DEFAULT_TTL = 300;

export function parseSignRequest(body: unknown): SignRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const externalId = (body as { externalId?: unknown }).externalId;
  if (typeof externalId !== "string" || externalId.length === 0) return null;
  const ttlRaw = (body as { ttlSeconds?: unknown }).ttlSeconds;
  if (ttlRaw !== undefined) {
    if (typeof ttlRaw !== "number" || !Number.isInteger(ttlRaw)) return null;
    if (ttlRaw < MIN_TTL || ttlRaw > MAX_TTL) return null;
  }
  return {
    externalId,
    ...(typeof ttlRaw === "number" ? { ttlSeconds: ttlRaw } : {}),
  };
}

export async function sign(
  userId: string,
  request: SignRequest,
  deps: SignDeps,
): Promise<SignResponse> {
  if (userId.trim().length === 0 || !UUID_RE.test(userId)) {
    return failure("ERR_UNAUTHENTICATED", "Caller is not authenticated.");
  }
  const owned = await deps.userOwnsAttachment(userId, request.externalId);
  if (!owned) {
    // Same response shape for "doesn't exist" and "exists but not yours"
    // so the endpoint doesn't leak attachment existence to other users.
    return failure("ERR_NOT_FOUND", "Attachment not found.");
  }
  const ttl = request.ttlSeconds ?? DEFAULT_TTL;
  let url: string;
  try {
    url = await deps.mintDriveUrl(request.externalId, ttl);
  } catch (cause) {
    return failure("ERR_UPSTREAM", cause instanceof Error ? cause.message : "Drive mint failed");
  }
  const expiresAt = new Date(deps.now().getTime() + ttl * 1000).toISOString();
  return { ok: true, data: { url, expires_at: expiresAt } };
}

function failure(code: string, message: string): SignFailure {
  return { ok: false, error: { code, message } };
}
