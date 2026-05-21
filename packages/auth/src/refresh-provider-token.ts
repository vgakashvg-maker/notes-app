import { ExternalProviderIds, type ExternalProviderId } from "@notes-app/domain";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface RefreshProviderTokenRequest {
  readonly provider: ExternalProviderId;
}

export interface RefreshProviderTokenSuccess {
  readonly ok: true;
  readonly data: { readonly access_token: string; readonly expires_in: number };
}

export interface RefreshProviderTokenFailure {
  readonly ok: false;
  readonly error: { readonly code: string; readonly message: string };
}

export type RefreshProviderTokenResponse =
  | RefreshProviderTokenSuccess
  | RefreshProviderTokenFailure;

export interface RefreshTokenRecord {
  readonly refreshToken: string;
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface RefreshProviderTokenDeps {
  /**
   * Decrypts and returns the user's stored refresh token for the requested
   * provider, or null if the user has never granted it.
   * Must enforce RLS — never return another user's token.
   */
  readonly lookupRefreshToken: (
    userId: string,
    provider: ExternalProviderId,
  ) => Promise<RefreshTokenRecord | null>;
  readonly fetcher: typeof fetch;
}

/**
 * Parse an incoming JSON body into a RefreshProviderTokenRequest, returning
 * `null` on malformed input. The caller (Deno entry) is responsible for
 * turning `null` into a 400.
 */
export function parseRequest(body: unknown): RefreshProviderTokenRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const raw = (body as { provider?: unknown }).provider;
  if (typeof raw !== "string") return null;
  if (!ExternalProviderIds.includes(raw as ExternalProviderId)) return null;
  return { provider: raw as ExternalProviderId };
}

/**
 * Server-side token refresh. The refresh token never crosses the network to
 * the client — it lives in the database, gets exchanged here, and only the
 * short-lived access token comes back.
 */
export async function refreshProviderToken(
  userId: string,
  request: RefreshProviderTokenRequest,
  deps: RefreshProviderTokenDeps,
): Promise<RefreshProviderTokenResponse> {
  if (userId.trim().length === 0) {
    return failure("ERR_UNAUTHENTICATED", "Caller is not authenticated.");
  }

  const record = await deps.lookupRefreshToken(userId, request.provider);
  if (record === null) {
    return failure(
      "ERR_NO_REFRESH_TOKEN",
      "No refresh token stored for that provider; ask the user to re-link the account.",
    );
  }

  const params = new URLSearchParams({
    client_id: record.clientId,
    client_secret: record.clientSecret,
    refresh_token: record.refreshToken,
    grant_type: "refresh_token",
  });

  let response: Response;
  try {
    response = await deps.fetcher(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
  } catch {
    return failure("ERR_UPSTREAM_NETWORK", "Could not reach the provider's token endpoint.");
  }

  if (!response.ok) {
    return failure(
      "ERR_UPSTREAM_REJECTED",
      `Provider rejected the refresh request (HTTP ${response.status}).`,
    );
  }

  const parsed = (await response.json()) as {
    access_token?: unknown;
    expires_in?: unknown;
  };
  if (typeof parsed.access_token !== "string" || typeof parsed.expires_in !== "number") {
    return failure("ERR_UPSTREAM_SHAPE", "Provider returned an unexpected response shape.");
  }

  return {
    ok: true,
    data: { access_token: parsed.access_token, expires_in: parsed.expires_in },
  };
}

function failure(code: string, message: string): RefreshProviderTokenFailure {
  return { ok: false, error: { code, message } };
}
