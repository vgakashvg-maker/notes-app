# auth-android (Kotlin)

The Kotlin port + Supabase adapter for the auth module. Pure-JVM Kotlin so
it's testable without the Android SDK; the Android-specific bindings
(Chrome Custom Tabs intent launching, EncryptedSharedPreferences-backed
`SessionStore`, the real Ktor client behind `SupabaseAuthHttp`) land in M12.

## Public types

- `AuthProvider` — the port. `signInWithGoogle()`, `signOut()`,
  `currentUser()`, `subscribeToUser(...)`, `accessToken()`,
  `providerAccessToken(provider)`.
- `AuthResult` — sealed `Success | Cancelled | Error` with invariants.
- `SupabaseAuthAdapter` — V1 adapter. Constructor:
  `SupabaseAuthAdapter(http: SupabaseAuthHttp, sessions: SessionStore)`.
- `SupabaseAuthHttp` — port for the Supabase HTTP surface. Fake it for
  unit tests; M12 wires Ktor + Chrome Custom Tabs.
- `SessionStore` — port for session persistence. Fake it for unit tests;
  M12 wires EncryptedSharedPreferences.
- `OAuthOutcome` — sealed `Authenticated | Cancelled | Failed`.
- `GoogleScopes` — the V1 OAuth scope list (mirrors `GOOGLE_SCOPES` in
  `@notes-app/auth`).

## Build & test

```powershell
# From notes-app\packages\android
.\gradlew.bat :auth-android:test
```

## Swapping the adapter

Implement `AuthProvider` directly, or implement `SupabaseAuthHttp` /
`SessionStore` to keep the higher-level logic and only swap the wire
format. M12 will pick the concrete bindings at the DI graph.
