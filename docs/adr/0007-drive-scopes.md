# ADR 0007 — Use `drive.file` (per-file scope) for storage

Date: 2026-05-22
Status: Accepted

> Note on file name: the M03 spec text suggests `0002-drive-scopes.md`,
> but ADR slots 0001–0006 are taken. ADRs are sequential here, so this
> is `0007`. ADR 0003 already explained the four OAuth scopes the auth
> module requests; this ADR drills into the Drive-specific decision.

## Context

V1 stores all user attachments in Google Drive. Two scopes were
candidates:

- `https://www.googleapis.com/auth/drive` — full read/write across the
  user's entire Drive. Triggers Google's "unverified app" warning and
  pulls our OAuth verification into the broader "restricted scope"
  bucket (longer queue, more review).
- `https://www.googleapis.com/auth/drive.file` — read/write only on
  files **the app itself created or the user explicitly granted via
  the Drive picker**. Does NOT trigger the unverified-app warning.

The M03 spec asked for an ADR explaining the choice.

## Decision

We request **`drive.file` only**. The auth module's `GOOGLE_SCOPES`
constant (M02) bundles it together with `calendar.events`,
`userinfo.email`, and `userinfo.profile`.

## Implications

- The `/NotesApp/` folder we create via `ensureAppFolder()` is fully
  visible and writeable to us because we created it. Files we upload
  into that folder inherit the same per-file ownership token.
- The user can revoke our access at any time from
  https://myaccount.google.com/permissions; doing so does NOT delete
  the files (they remain in the user's Drive under the user's quota).
  This is by design — user trust beats convenience here.
- We cannot see anything else the user has in Drive. A user who
  manually moves an attachment out of `/NotesApp/` makes it invisible
  to us (no other-file scope). The attachment validator (M07
  `attachments/validate`) catches these as dangling refs.
- Refresh-token rotation: the existing `auth/refresh-provider-token`
  Edge Function handles renewal. Drive access tokens are ~1h; we mint
  download URLs that embed the token directly (no extra signing
  infrastructure required).

## Consequences

- We are committed to `drive.file` semantics. If a future feature
  needs to read user files we did not create (e.g. "import this
  PDF from my Drive"), we will need:
  - Migrate to a broader scope (`drive.readonly` for read-only browse,
    or full `drive`).
  - Re-consent every user (the new scope is not granted retroactively).
  - Submit for Google's app verification under the new scope category.
- Quota: Drive uploads land in the user's quota, not ours. Quota
  errors come back as `403 storageQuotaExceeded`; the
  `GoogleDriveAdapter` maps these to `StorageError.QuotaExceeded` with
  a user-readable hint ("Free up space in your Google Drive").

## Alternatives considered

- **`drive.readonly`**: rejected — read-only kills the entire upload
  use case.
- **`drive` (full Drive)**: rejected — see Context above. The cost
  (verification queue + user trust) is real, and we don't need
  cross-Drive read.
- **App-data folder (`drive.appdata`)**: rejected. The hidden app-data
  folder is invisible to the user, which violates the "user can audit
  what we wrote" responsibility called out in the M03 spec. We
  deliberately want `/NotesApp/` to be browsable.
- **Self-hosted storage (e.g. Supabase Storage)**: deferred to V2.
  Avoids the Drive scope question entirely but loses "user owns their
  bytes" — a deliberate trade we're not making in V1.

## Validation

- The `GoogleDriveAdapter` unit tests cover the 401 / 429 / 5xx /
  TransportError paths and the per-file metadata fetch in
  `getDownloadUrl()`.
- The integration test (deferred until a real Drive test account
  exists) will verify the round trip: upload → sign → download →
  delete → 404.
