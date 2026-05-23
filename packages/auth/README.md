# @notes-app/auth

The auth port + Supabase adapter + the pure-logic half of the
`auth/refresh-provider-token` Edge Function.

## Public types

### `AuthProvider` port (`src/types.ts`)

```ts
interface AuthProvider {
  signInWithGoogle(): Promise<AuthResult>;
  signOut(): Promise<void>;
  currentUser(): User | null;
  subscribeToUser(listener: (user: User | null) => void): Unsubscribe;
  accessToken(): Promise<string | null>;
  providerAccessToken(provider: ExternalProviderId): Promise<string | null>;
}
```

`AuthResult` is a tagged union (`Success | Cancelled | Error`) with smart
constructors on the `AuthResult` namespace value. `ExternalProviderId` lives
in `@notes-app/domain`.

### `SupabaseAuthAdapter` (`src/supabase-auth-adapter.ts`)

The V1 adapter. Constructed against a structural `SupabaseAuthClient`
interface — the real `@supabase/supabase-js` `auth` namespace satisfies it
shape-wise. The adapter never imports the SDK directly so this package can
be tested without it.

```ts
const adapter = new SupabaseAuthAdapter({
  client: supabase.auth,            // SupabaseAuthClient — structural
  userProfileFetcher,               // (userId, jwt) => Promise<UserProfileRow>
  refreshProviderTokenUrl: `${SUPABASE_URL}/functions/v1/auth-refresh-provider-token`,
  redirectTo: `${WEB_ORIGIN}/auth/callback`,
});
```

Token refresh: `providerAccessToken("GOOGLE_DRIVE")` calls the Edge Function
with the user's Supabase JWT in the `Authorization` header. The refresh
token itself never leaves the database.

### `refreshProviderToken` (`src/refresh-provider-token.ts`)

Pure-logic backing for the Edge Function. Injects `fetch` and a refresh-token
lookup function so the same code is unit-tested under Vitest and deployed to
Deno from `supabase/functions/auth/refresh-provider-token/index.ts`.

## Conventions

- `currentUser()` / `subscribeToUser()` are synchronous so callers can render
  the gate without an extra render pass.
- `providerAccessToken()` returns `null` rather than throwing on backend
  failure — the caller surfaces the failure (e.g. "Reconnect Google Drive"
  in Settings).
- The adapter calls `subscription.unsubscribe()` and clears listeners in
  `dispose()` — call it from the React effect cleanup once M06 wires this
  up.

## Where the UI bits live

- `<AuthGate>` and `useAuth()` (web) — M06 (Editor / Web shell).
- `SignInScreen` (Compose) and the `<AuthGate>` Composable — M12
  (Android shell).

## Swapping the adapter

A new auth provider needs:

1. A new class that implements `AuthProvider`.
2. A new entry in the DI graph (M06 web shell, M12 Android shell).
3. If it stores refresh tokens, a new branch in the `auth/refresh-provider-token`
   Edge Function plus the matching row(s) in `users_profile`.

Nothing else.
