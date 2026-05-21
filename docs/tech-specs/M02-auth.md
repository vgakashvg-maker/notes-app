# M02 — Auth Module

> **Module ID**: `M02`
> **Complexity / Recommended AI dev**: Opus (design) + Sonnet (adapters)
> **Estimated duration**: 5–7 days
> **Depends on**: M01

---

## Purpose

Handle sign-in (Google OAuth via Supabase), token storage on Android, session lifecycle on web. Expose a stable AuthProvider port; Supabase is the V1 adapter. Also handles refreshing the per-user OAuth tokens for Google Drive and Google Calendar.

---

## Public Interface (the port)

```kotlin
interface AuthProvider {
  suspend fun signInWithGoogle(): AuthResult
  suspend fun signOut()
  fun currentUser(): Flow<User?>
  suspend fun accessToken(): String?       // for backend calls (Supabase JWT)
  suspend fun providerAccessToken(provider: ExternalProviderId): String?
  //                                       ^ GOOGLE_DRIVE / GOOGLE_CALENDAR / ...
}

sealed class AuthResult {
  data class Success(val user: User): AuthResult()
  data class Cancelled(val reason: String): AuthResult()
  data class Error(val message: String, val cause: Throwable?): AuthResult()
}
```

---

## Responsibilities

- Initiate OAuth flow on Android via Chrome Custom Tabs.
- Initiate OAuth flow on web via Supabase JS client.
- Persist session securely: EncryptedSharedPreferences on Android, httpOnly cookie on web.
- Refresh provider access tokens (Drive, Calendar) automatically when expired — server-side via Edge Function so refresh tokens never live on clients.
- Expose `currentUser` as a reactive Flow (Android) / hook (web).
- Request the correct OAuth scopes: `drive.file`, `calendar.events`, `userinfo.email`, `userinfo.profile`.
- Handle token revocation cleanly on sign-out.

---

## Deliverables

- Android library `auth-android` with `SupabaseAuthAdapter`.
- Android composable `SignInScreen` and `<AuthGate>` wrapper.
- Web hook `useAuth()` and `<AuthGate>` component.
- Edge Function `auth/refresh-provider-token` that handles Google refresh-token flow server-side.
- Integration test that signs in a real test Google account and asserts a valid Drive token is returned.
- ADR (Architecture Decision Record) `docs/adr/0001-oauth-scopes.md` explaining the scope choices.

---

## Relevant Data Model

- `users_profile (created on first sign-in)`

(Full schema: `reference/data-model.md`)

---

## Relevant API Endpoints

- `POST /functions/v1/auth/refresh-provider-token`

(Full API contract: `reference/api-contract.md`)

---

## Definition of Done

Apply the checklist in `reference/definition-of-done.md` in full. The
module-specific extras are:

- All items in **Deliverables** above are produced and reviewed.
- All items in **Responsibilities** above are demonstrably true (point at the
  code that proves each one).
- The module-specific tests listed in the **Ready-to-Use Prompt** below pass
  in CI.

---

## Ready-to-Use Prompt (paste this into Claude Code / Cursor)

```
You are implementing module M2 (Auth) of the Evernote-like notes app. Read the
full spec in `tech-specs/M02-auth.md` before starting.

Setup prerequisites the human will have completed already:
  - A Supabase project with Google OAuth enabled in Authentication → Providers.
  - A Google Cloud Console project with the OAuth 2.0 Client created.
  - The Supabase URL and anon key in `.env`.
  - M1 (core-domain) already implemented and importable.

Your job:
  1. Implement `AuthProvider` interface in core-domain (TS + Kotlin).
  2. Implement `SupabaseAuthAdapter` for both web and Android.
  3. Wire up sign-in screens on both platforms.
  4. Implement `auth/refresh-provider-token` Supabase Edge Function that takes
     a request like `{ provider: 'google_drive' }`, looks up the user's refresh
     token in `users_profile`, calls Google's token endpoint, returns a fresh
     access token. NEVER return the refresh token to the client.
  5. Request OAuth scopes: drive.file, calendar.events, userinfo.email,
     userinfo.profile.
  6. Persist session: Android = EncryptedSharedPreferences, web = httpOnly
     cookie via Supabase JS.

Tests:
  - Unit-test the adapter's success and failure paths with a fake Supabase
    client.
  - Write one integration test that signs in a real test account (credentials
    in .env.test) and asserts that providerAccessToken('google_drive') returns
    a non-empty string.

Document your scope decisions in `docs/adr/0001-oauth-scopes.md`.

Definition of Done is in the spec. Run all tests before declaring done.
```

---

## Cross-references

- Master architecture: `../NotesApp_Architecture.docx` → §7.2
- Getting-started workflow: `../GETTING_STARTED.md`
- Definition of Done: `../reference/definition-of-done.md`
- Data model: `../reference/data-model.md`
- API contract: `../reference/api-contract.md`
