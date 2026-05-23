import type { ExternalProviderId } from "../../domain/src/index.ts";
import {
  makeUser,
  UserId,
  type AIPreferences,
  type CalendarProviderId,
  type StorageProviderId,
  type User,
} from "../../domain/src/index.ts";
import { AuthResult, GOOGLE_SCOPES, type AuthProvider, type Unsubscribe } from "./types.js";

/** A minimal, structural mirror of the bits of @supabase/supabase-js we use. */
export interface SupabaseAuthSession {
  readonly user: { readonly id: string };
  readonly access_token: string;
}

export interface SupabaseAuthClient {
  signInWithOAuth(opts: {
    provider: "google";
    options?: { scopes?: string; redirectTo?: string };
  }): Promise<{ data: unknown; error: { message: string; name?: string } | null }>;
  signOut(): Promise<{ error: { message: string } | null }>;
  getSession(): Promise<{
    data: { session: SupabaseAuthSession | null };
    error: { message: string } | null;
  }>;
  onAuthStateChange(
    cb: (event: AuthStateChangeEvent, session: SupabaseAuthSession | null) => void,
  ): { data: { subscription: { unsubscribe: () => void } } };
}

export type AuthStateChangeEvent =
  | "INITIAL_SESSION"
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "TOKEN_REFRESHED"
  | "USER_UPDATED"
  | "PASSWORD_RECOVERY";

/** Raw users_profile row as it arrives from PostgREST. */
export interface UserProfileRow {
  readonly user_id: string;
  readonly display_name: string;
  readonly storage_provider: StorageProviderId | null;
  readonly calendar_provider: CalendarProviderId | null;
  readonly ai_prefs: AIPreferences;
  readonly analytics_optout: boolean;
}

export type UserProfileFetcher = (userId: string, accessToken: string) => Promise<UserProfileRow>;

export interface SupabaseAuthAdapterOptions {
  readonly client: SupabaseAuthClient;
  readonly userProfileFetcher: UserProfileFetcher;
  /** URL of the refresh-provider-token Edge Function. */
  readonly refreshProviderTokenUrl: string;
  /** OAuth callback target — required for the redirect-based browser flow. */
  readonly redirectTo?: string;
  /** Override for testing; defaults to `globalThis.fetch`. */
  readonly fetcher?: typeof fetch;
  /**
   * How long to wait for an auth-state change after kicking off OAuth before
   * giving up. Defaults to 60s — long enough for the user to finish the
   * Google consent screen on a slow connection.
   */
  readonly signInTimeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const CANCELLED_PATTERN = /cancel(l)?ed|popup_closed|user.?denied/i;

interface PendingSignIn {
  resolve(result: AuthResult): void;
}

export class SupabaseAuthAdapter implements AuthProvider {
  private user: User | null = null;
  private readonly listeners = new Set<(user: User | null) => void>();
  private readonly subscription: { unsubscribe: () => void };
  private pendingSignIn: PendingSignIn | null = null;
  private readonly fetcher: typeof fetch;
  private readonly signInTimeoutMs: number;

  constructor(private readonly options: SupabaseAuthAdapterOptions) {
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    this.signInTimeoutMs = options.signInTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    const { data } = options.client.onAuthStateChange((event, session) => {
      void this.handleAuthStateChange(event, session);
    });
    this.subscription = data.subscription;
  }

  async signInWithGoogle(): Promise<AuthResult> {
    const result = await this.options.client.signInWithOAuth({
      provider: "google",
      options: {
        scopes: GOOGLE_SCOPES.join(" "),
        ...(this.options.redirectTo !== undefined ? { redirectTo: this.options.redirectTo } : {}),
      },
    });
    if (result.error) {
      if (CANCELLED_PATTERN.test(result.error.message)) {
        return AuthResult.cancelled(result.error.message);
      }
      return AuthResult.error(result.error.message, result.error);
    }
    return this.awaitNextSignIn();
  }

  async signOut(): Promise<void> {
    const { error } = await this.options.client.signOut();
    if (error) {
      throw new Error(`Sign-out failed: ${error.message}`);
    }
    this.setUser(null);
  }

  currentUser(): User | null {
    return this.user;
  }

  subscribeToUser(listener: (user: User | null) => void): Unsubscribe {
    this.listeners.add(listener);
    // Fire once synchronously so subscribers don't miss the current state.
    listener(this.user);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async accessToken(): Promise<string | null> {
    const { data, error } = await this.options.client.getSession();
    if (error || !data.session) return null;
    return data.session.access_token;
  }

  async providerAccessToken(provider: ExternalProviderId): Promise<string | null> {
    const jwt = await this.accessToken();
    if (jwt === null) return null;
    const response = await this.fetcher(this.options.refreshProviderTokenUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ provider }),
    });
    if (!response.ok) {
      // Never leak the upstream error body — providers can occasionally
      // surface PII in their failure modes. Callers get a typed null.
      return null;
    }
    const parsed = (await response.json()) as { ok?: boolean; data?: { access_token?: string } };
    if (parsed.ok !== true || typeof parsed.data?.access_token !== "string") {
      return null;
    }
    return parsed.data.access_token;
  }

  /** Stop listening to Supabase auth-state changes. Idempotent. */
  dispose(): void {
    this.subscription.unsubscribe();
    this.listeners.clear();
    this.pendingSignIn = null;
  }

  private async handleAuthStateChange(
    event: AuthStateChangeEvent,
    session: SupabaseAuthSession | null,
  ): Promise<void> {
    if (event === "SIGNED_OUT" || session === null) {
      this.setUser(null);
      return;
    }
    if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "USER_UPDATED") {
      try {
        const profile = await this.options.userProfileFetcher(
          session.user.id,
          session.access_token,
        );
        const user = profileToUser(profile);
        this.setUser(user);
        this.resolvePending(AuthResult.success(user));
      } catch (cause) {
        this.resolvePending(
          AuthResult.error(
            cause instanceof Error ? cause.message : "Failed to fetch user profile",
            cause,
          ),
        );
      }
    }
  }

  private awaitNextSignIn(): Promise<AuthResult> {
    return new Promise<AuthResult>((resolve) => {
      const pending: PendingSignIn = {
        resolve: (result) => {
          this.pendingSignIn = null;
          resolve(result);
        },
      };
      this.pendingSignIn = pending;
      // Self-cancellation in case the OAuth flow stalls. The redirect-based
      // browser flow would reload the page anyway, so this timer mostly
      // matters for headless / popup flows.
      setTimeout(() => {
        if (this.pendingSignIn === pending) {
          pending.resolve(AuthResult.cancelled("Sign-in timed out"));
        }
      }, this.signInTimeoutMs).unref?.();
    });
  }

  private resolvePending(result: AuthResult): void {
    if (this.pendingSignIn !== null) {
      this.pendingSignIn.resolve(result);
    }
  }

  private setUser(user: User | null): void {
    if (this.user === user) return;
    this.user = user;
    for (const listener of this.listeners) {
      listener(user);
    }
  }
}

function profileToUser(row: UserProfileRow): User {
  return makeUser({
    userId: UserId(row.user_id),
    displayName: row.display_name,
    storageProvider: row.storage_provider,
    calendarProvider: row.calendar_provider,
    aiPrefs: row.ai_prefs,
    analyticsOptOut: row.analytics_optout,
  });
}
