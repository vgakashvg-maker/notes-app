# ADR 0003 — OAuth scopes requested at sign-in

Date: 2026-05-20
Status: Accepted

> Note on the file name: the M02 spec text suggests `0001-oauth-scopes.md`,
> but `0001-*.md` was already taken by [`0001-monorepo-and-pipelines.md`](0001-monorepo-and-pipelines.md).
> ADRs are numbered sequentially in this repo, so this one is `0003`.

## Context

The auth module requests a single, fixed bundle of OAuth scopes when the
user signs in with Google. The choice is load-bearing:

- Too few scopes → we cannot read calendar events or write attachments,
  forcing a second, jarring consent screen later in the flow.
- Too many scopes → we trigger Google's "unverified app" warning and our
  OAuth verification application gets larger and slower.
- The wrong scopes → Google can rescope tokens silently, which is hard to
  debug after the fact.

## Decision

V1 requests exactly four scopes:

| Scope | Used by | Why this one |
|------|--------|--------------|
| `https://www.googleapis.com/auth/drive.file` | M03 Storage adapter | Per-file scope — Drive only exposes files the app itself created. No browse access to the user's pre-existing Drive. Avoids the "unverified app" gate that `drive` and `drive.readonly` trigger. |
| `https://www.googleapis.com/auth/calendar.events` | M08 Calendar adapter | Read + write events on calendars the user authorises. Avoids the broader `calendar` scope, which also exposes calendar settings + ACLs we don't need. |
| `https://www.googleapis.com/auth/userinfo.email` | M02 Auth | Confirms the email Supabase already has matches the Google account. |
| `https://www.googleapis.com/auth/userinfo.profile` | M02 Auth | Populates `users_profile.display_name` from `raw_user_meta_data.full_name`. |

The scope strings live in two places, deliberately:

- TS — `packages/auth/src/types.ts`'s `GOOGLE_SCOPES`.
- Kotlin — `packages/android/auth-android/.../AuthProvider.kt`'s
  `GoogleScopes.REQUIRED`.

The two arrays are asserted equal in unit tests on both sides so they
cannot silently drift.

## Refresh tokens

Refresh tokens never live on the client. They are stored encrypted in
`users_profile.<provider>_refresh_token` (`bytea`, pgsodium-encrypted),
and the `auth/refresh-provider-token` Edge Function exchanges them for a
short-lived access token. Clients only ever hold the access token, in
memory.

The migration that creates the columns + the on-sign-in trigger lives at
`supabase/migrations/20260520120000_users_profile.sql`.

## Consequences

- We are committed to `drive.file` semantics. If a future feature needs
  to read user files we didn't create, we'll have to migrate to a broader
  scope, re-consent every user, and re-submit for Google verification.
- Calendar import (M08) reads via `calendar.events`. That means we cannot
  read calendar metadata (colors, default reminders) — fine for V1 since
  we mirror events into our own `events_mirror` table.
- The userinfo scopes are tiny and stable; no expected migration risk.

## Alternatives considered

- **`drive` + `calendar`** (broader scopes): rejected. Triggers Google's
  app verification flow and exposes more user data than we need.
- **No `userinfo.*` scopes**: rejected. The first-sign-in profile insert
  would not have a sensible `display_name` and we'd fall back to the
  email local-part for every new user.
- **Per-feature consent**: ask for Drive when the user first attaches a
  file. Rejected for V1 because it doubles the number of OAuth screens
  and the sign-in is already gated by the same Google account.
