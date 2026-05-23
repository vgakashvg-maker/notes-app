import type { ExternalProviderId } from "../../domain/src/index.ts";
import type { User } from "../../domain/src/index.ts";

/**
 * Outcome of an interactive sign-in attempt. The Cancelled / Error split
 * lets UI distinguish "the user backed out of the OAuth flow" (no error
 * banner) from "the OAuth flow exploded" (show an error).
 */
export type AuthResult =
  | { kind: "Success"; user: User }
  | { kind: "Cancelled"; reason: string }
  | { kind: "Error"; message: string; cause?: unknown };

export const AuthResult = {
  success: (user: User): AuthResult => ({ kind: "Success", user }),
  cancelled: (reason: string): AuthResult => {
    if (reason.trim().length === 0) {
      throw new Error("AuthResult.Cancelled.reason cannot be empty");
    }
    return { kind: "Cancelled", reason };
  },
  error: (message: string, cause?: unknown): AuthResult => {
    if (message.trim().length === 0) {
      throw new Error("AuthResult.Error.message cannot be empty");
    }
    return { kind: "Error", message, cause };
  },
} as const;

export type Unsubscribe = () => void;

/**
 * The auth port. Concrete adapters (SupabaseAuthAdapter for V1) live in this
 * package; consumers (sync engine, AI services client) import the port and
 * receive an instance via dependency injection. Swapping providers means
 * writing a new adapter against this interface.
 */
export interface AuthProvider {
  signInWithGoogle(): Promise<AuthResult>;
  signOut(): Promise<void>;
  currentUser(): User | null;
  subscribeToUser(listener: (user: User | null) => void): Unsubscribe;
  /** Supabase JWT — for calls to our own backend (PostgREST / Edge Functions). */
  accessToken(): Promise<string | null>;
  /** Fresh OAuth access token for the requested external provider. */
  providerAccessToken(provider: ExternalProviderId): Promise<string | null>;
}

/**
 * The OAuth scopes we request from Google. The rationale for each scope is
 * captured in `docs/adr/0003-oauth-scopes.md`.
 */
export const GOOGLE_SCOPES: readonly string[] = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
] as const;
