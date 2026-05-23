"""
Generate per-module Tech Specs as Markdown files.

Each spec is a SELF-CONTAINED hand-off brief that can be given to an AI
developer (Claude Code, Cursor, etc.) without any other context. It includes:

  - Purpose and complexity rating
  - Public interface (the port code)
  - Responsibilities and deliverables
  - Relevant data-model tables and API endpoints
  - Definition of Done
  - A ready-to-paste prompt that primes the AI dev correctly

Output: C:\\Users\\vgaka\\Evernotelike\\tech-specs\\*.md
        C:\\Users\\vgaka\\Evernotelike\\reference\\*.md
        C:\\Users\\vgaka\\Evernotelike\\README.md
        C:\\Users\\vgaka\\Evernotelike\\GETTING_STARTED.md

Run:    python build_tech_specs.py
"""

import os
import textwrap

ROOT = os.path.dirname(os.path.abspath(__file__))
SPECS_DIR = os.path.join(ROOT, "tech-specs")
REF_DIR = os.path.join(ROOT, "reference")

os.makedirs(SPECS_DIR, exist_ok=True)
os.makedirs(REF_DIR, exist_ok=True)


# =============================================================================
# MODULE DEFINITIONS
# =============================================================================

MODULES = [

# -----------------------------------------------------------------------------
{
    "id": "M01",
    "name": "Domain Model & Shared Types",
    "slug": "domain-model",
    "complexity": "Sonnet",
    "duration": "2–3 days",
    "depends_on": [],
    "purpose": (
        "Define the canonical domain entities — Note, Notebook, Tag, Attachment, "
        "Event, Embedding, User — as plain data classes with no provider knowledge. "
        "This module is the lingua franca every other module imports."
    ),
    "interface": """// Kotlin — shared types (Android + future KMP)
data class Note(
  val id: NoteId,
  val ownerId: UserId,
  val notebookId: NotebookId?,
  val title: String,
  val bodyJson: String,            // ProseMirror JSON
  val tags: Set<TagId>,
  val createdAt: Instant,
  val updatedAt: Instant,
  val isPinned: Boolean,
  val isTrashed: Boolean,
  val attachmentRefs: List<AttachmentRef>
)

data class AttachmentRef(
  val id: AttachmentId,
  val provider: StorageProviderId, // GOOGLE_DRIVE | ONEDRIVE | ...
  val externalFileId: String,
  val mimeType: String,
  val sizeBytes: Long,
  val displayName: String
)

// All ID types are value classes (Kotlin) / branded types (TS) to prevent
// argument mix-ups at compile time. Example:
@JvmInline value class NoteId(val raw: String)
@JvmInline value class UserId(val raw: String)
""",
    "responsibilities": [
        "Pure data classes / TypeScript types — no I/O, no framework code.",
        "ID types are opaque (value classes / branded types) to prevent mix-ups.",
        "Validation invariants are enforced in constructors (e.g., non-empty title, valid UUID).",
        "All timestamps are `Instant` (Kotlin) / ISO-8601 strings (TS).",
        "Sealed-class enums for: StorageProviderId, CalendarProviderId, AIProviderId, SyncStatus.",
    ],
    "deliverables": [
        "Kotlin module `core-domain` with all entity classes and value-class IDs.",
        "TypeScript package `@app/domain` mirroring the same shapes.",
        "Unit tests for every invariant (e.g., 'Note with empty title throws').",
        "README in each package listing every public type.",
    ],
    "data_tables": [],  # M1 itself doesn't touch DB
    "api_endpoints": [],
    "ready_prompt": """\
You are implementing module M1 (Domain Model & Shared Types) of the Evernote-like
notes app. Read the full spec in `tech-specs/M01-domain-model.md` before starting.

Your job: create two packages that hold the canonical domain types.

  1. Kotlin module `core-domain/` in the Android codebase. Each entity is a
     data class. Each ID is a `@JvmInline value class`. Validation invariants
     are enforced in init blocks.

  2. TypeScript package `@app/domain` in the monorepo (workspace-style). Each
     entity is a TS interface; each ID is a branded type
     (e.g., `type NoteId = string & { __brand: 'NoteId' }`).

For both packages:
  - Include all entities listed in the spec (Note, Notebook, Tag,
    AttachmentRef, CalendarEvent, EmbeddingChunk, User, plus all enum/sealed
    types).
  - Include unit tests for every constructor invariant. Use JUnit 5 (Kotlin)
    and Vitest (TS).
  - Write a README.md in each package that lists every public type.
  - No I/O. No framework dependencies. No DB code. This module is pure types.

Definition of Done is in section 'Definition of Done' of the spec. Run the
tests yourself before reporting back; do not hand off code that fails its
own tests.
""",
},

# -----------------------------------------------------------------------------
{
    "id": "M02",
    "name": "Auth Module",
    "slug": "auth",
    "complexity": "Opus (design) + Sonnet (adapters)",
    "duration": "5–7 days",
    "depends_on": ["M01"],
    "purpose": (
        "Handle sign-in (Google OAuth via Supabase), token storage on Android, "
        "session lifecycle on web. Expose a stable AuthProvider port; "
        "Supabase is the V1 adapter. Also handles refreshing the per-user OAuth "
        "tokens for Google Drive and Google Calendar."
    ),
    "interface": """interface AuthProvider {
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
""",
    "responsibilities": [
        "Initiate OAuth flow on Android via Chrome Custom Tabs.",
        "Initiate OAuth flow on web via Supabase JS client.",
        "Persist session securely: EncryptedSharedPreferences on Android, httpOnly cookie on web.",
        "Refresh provider access tokens (Drive, Calendar) automatically when expired — server-side via Edge Function so refresh tokens never live on clients.",
        "Expose `currentUser` as a reactive Flow (Android) / hook (web).",
        "Request the correct OAuth scopes: `drive.file`, `calendar.events`, `userinfo.email`, `userinfo.profile`.",
        "Handle token revocation cleanly on sign-out.",
    ],
    "deliverables": [
        "Android library `auth-android` with `SupabaseAuthAdapter`.",
        "Android composable `SignInScreen` and `<AuthGate>` wrapper.",
        "Web hook `useAuth()` and `<AuthGate>` component.",
        "Edge Function `auth/refresh-provider-token` that handles Google refresh-token flow server-side.",
        "Integration test that signs in a real test Google account and asserts a valid Drive token is returned.",
        "ADR (Architecture Decision Record) `docs/adr/0001-oauth-scopes.md` explaining the scope choices.",
    ],
    "data_tables": ["users_profile (created on first sign-in)"],
    "api_endpoints": [
        "POST /functions/v1/auth/refresh-provider-token",
    ],
    "ready_prompt": """\
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
""",
},

# -----------------------------------------------------------------------------
{
    "id": "M03",
    "name": "Storage Provider Module",
    "slug": "storage-provider",
    "complexity": "Opus",
    "duration": "5–7 days (V1: Google Drive only)",
    "depends_on": ["M01", "M02"],
    "purpose": (
        "Abstract file storage behind a StorageProvider port. V1 ships Google "
        "Drive only; the port is designed so OneDrive (V2), S3, and Dropbox "
        "are drop-in adapters."
    ),
    "interface": """interface StorageProvider {
  val id: StorageProviderId
  suspend fun upload(file: FileInput, folderHint: String?): RemoteFile
  suspend fun getDownloadUrl(externalId: String, ttlSeconds: Int = 300): String
  suspend fun delete(externalId: String)
  suspend fun ensureAppFolder(): String     // returns root folder ID
}

data class RemoteFile(
  val externalId: String,
  val name: String,
  val mimeType: String,
  val sizeBytes: Long
)

data class FileInput(
  val bytes: ByteArray,                 // for small files
  val stream: () -> InputStream,        // for large files (lazy)
  val name: String,
  val mimeType: String,
  val sizeBytes: Long
)
""",
    "responsibilities": [
        "GoogleDriveAdapter uses Drive v3 REST API with the user's OAuth token.",
        "Create and reuse a single app-scoped folder `/NotesApp/` so the user can audit what we wrote.",
        "Upload returns a `RemoteFile` { externalId, name, mime, size }.",
        "Signed/download URLs are short-lived (default 5 min) and never persisted.",
        "Resumable uploads for files > 5 MB.",
        "Retry with exponential backoff on 5xx and 429.",
        "Graceful handling of quota-exceeded errors with a user-friendly message.",
    ],
    "deliverables": [
        "Library `storage-google-drive` (Kotlin for Android + TS for web).",
        "Integration tests against a real test Google account.",
        "ADR `docs/adr/0002-drive-scopes.md` documenting why we chose `drive.file` (per-file scope) over `drive` (full-Drive scope).",
        "README explaining how to add a future adapter (e.g., OneDrive) — concrete checklist.",
    ],
    "data_tables": ["attachments_refs"],
    "api_endpoints": [
        "POST /functions/v1/storage/sign (returns signed URL for an existing externalId)",
    ],
    "ready_prompt": """\
You are implementing module M3 (Storage Provider — Google Drive only for V1) of
the Evernote-like notes app. Read the full spec in
`tech-specs/M03-storage-provider.md` before starting.

Prerequisites complete:
  - M1 (core-domain), M2 (auth) already implemented.
  - The user is signed in with Google and we have a fresh `drive.file` OAuth
    token via M2's `providerAccessToken(GOOGLE_DRIVE)`.

Your job:
  1. Implement the `StorageProvider` interface in core-domain (TS + Kotlin).
  2. Implement `GoogleDriveAdapter` for web and Android. Use the Drive v3 REST
     API; do NOT use the heavy Google client libraries — fetch/OkHttp is
     enough and keeps bundle size low.
  3. `ensureAppFolder()` should create `/NotesApp/` on first call and return
     the folder ID; subsequent calls return the cached ID.
  4. Implement resumable upload for files > 5 MB per Drive's resumable upload
     protocol.
  5. Implement Supabase Edge Function `storage/sign` that takes an externalId
     and returns a signed download URL (use Drive's `webContentLink` flow or
     a short-lived access-token URL).
  6. Add exponential backoff on 5xx/429 (max 3 retries, jittered).

Tests:
  - Unit-test the adapter with a fake HTTP layer (success, 401, 429, 5xx).
  - One integration test against a real test account: upload a 1KB image,
    download via signed URL, delete, confirm deletion.

Document scope choice in `docs/adr/0002-drive-scopes.md`. Use `drive.file`
(per-file scope) — explain why this is the right tradeoff for user trust.

Definition of Done is in the spec. Run all tests before declaring done.
""",
},

# -----------------------------------------------------------------------------
{
    "id": "M04",
    "name": "Notes Core Service",
    "slug": "notes-core",
    "complexity": "Sonnet",
    "duration": "5–7 days",
    "depends_on": ["M01"],
    "purpose": (
        "CRUD for notes, notebooks, tags. Pure backend logic — does not know "
        "about Drive, Claude, or Calendar. Lives in Supabase (Postgres tables + "
        "RLS + a few Edge Functions for compound operations)."
    ),
    "interface": """interface NotesService {
  suspend fun createNote(input: NewNoteInput): Note
  suspend fun updateNote(id: NoteId, patch: NotePatch): Note
  suspend fun trashNote(id: NoteId)
  suspend fun restoreNote(id: NoteId)
  suspend fun listNotes(filter: NoteFilter, page: Page): PagedResult<Note>
  suspend fun getNote(id: NoteId): Note
  suspend fun searchKeyword(q: String, filter: NoteFilter): List<NoteHit>

  // Notebooks
  suspend fun createNotebook(name: String, color: String?): Notebook
  suspend fun listNotebooks(): List<Notebook>
  suspend fun renameNotebook(id: NotebookId, name: String): Notebook
  suspend fun deleteNotebook(id: NotebookId, moveNotesTo: NotebookId?): Unit

  // Tags
  suspend fun createTag(name: String, color: String?): Tag
  suspend fun listTags(): List<Tag>
  suspend fun mergeTag(from: TagId, into: TagId): Unit
}
""",
    "responsibilities": [
        "Postgres schema for notes, notebooks, tags, note_tags, attachments_refs (see reference/data-model.md).",
        "Row-Level Security policies enforce `owner_id = auth.uid()` on every table — even in single-user V1.",
        "Postgres full-text search index (tsvector) on note title + body; updated by trigger.",
        "Triggers update `updated_at` on every change.",
        "30-day trash retention via pg_cron scheduled SQL job.",
        "All TypeScript SDK code is auto-generated from PostgREST types — do not hand-write CRUD wrappers.",
    ],
    "deliverables": [
        "SQL migration files in `supabase/migrations/` (versioned, idempotent).",
        "Auto-generated TypeScript types via `supabase gen types typescript`.",
        "Thin Kotlin client wrapper for Android (uses Supabase Kotlin SDK).",
        "Edge Function `notes/bulk-update` for atomic multi-note operations (e.g., move N notes to a notebook).",
        "RLS policy tests using pgTAP or a SQL-based test runner.",
        "Seed script that inserts ~50 sample notes for development.",
    ],
    "data_tables": ["notes", "notebooks", "tags", "note_tags", "attachments_refs"],
    "api_endpoints": [
        "GET / POST / PATCH /rest/v1/notes (via PostgREST auto-generated)",
        "GET /rest/v1/notebooks, /rest/v1/tags (PostgREST)",
        "POST /functions/v1/notes/bulk-update",
    ],
    "ready_prompt": """\
You are implementing module M4 (Notes Core Service) of the Evernote-like notes
app. Read `tech-specs/M04-notes-core.md` and `reference/data-model.md` before
starting.

Prerequisites:
  - A Supabase project is already created.
  - M1 (core-domain) is implemented.
  - M2 (auth) is in progress or done — RLS will use `auth.uid()`.

Your job:
  1. Write SQL migrations in `supabase/migrations/`. One migration per logical
     change. Use the schema in reference/data-model.md exactly. Add:
        - notes, notebooks, tags, note_tags, attachments_refs tables
        - RLS policies: `owner_id = auth.uid()` on every table
        - tsvector column `body_tsv` on notes; trigger to maintain it
        - updated_at trigger on every table
        - Index on owner_id+updated_at, body_tsv (GIN), tags(owner_id, name)
        - pg_cron job for 30-day trash retention
  2. Run `supabase db push` to apply migrations to the project.
  3. Generate TS types: `supabase gen types typescript --local > src/types/db.ts`.
  4. Write the Kotlin client wrapper for Android using supabase-kt.
  5. Implement Edge Function `notes/bulk-update` (TypeScript / Deno).
  6. Write RLS policy tests using pgTAP. Verify: another user's notes are
     unreadable; updates to another user's notes fail.
  7. Write a seed script `scripts/seed.ts` that inserts 50 sample notes.

Tests:
  - RLS tests must pass.
  - At least one happy-path test per public NotesService method.
  - A test that confirms keyword search returns expected notes ranked correctly.

Definition of Done is in the spec. Do not skip the RLS tests — they are the
multi-tenant safety net.
""",
},

# -----------------------------------------------------------------------------
{
    "id": "M05",
    "name": "Sync Engine (Android)",
    "slug": "sync-engine",
    "complexity": "Opus",
    "duration": "7–10 days",
    "depends_on": ["M01", "M04"],
    "purpose": (
        "Offline-first sync between Android Room cache and the Supabase "
        "backend. Handles queuing of offline writes, conflict detection, and "
        "realtime push. THIS IS THE HARDEST MODULE — concurrency, idempotency, "
        "and conflict policy all matter."
    ),
    "interface": """interface SyncEngine {
  fun start(scope: CoroutineScope)
  fun syncStatus(): StateFlow<SyncStatus>
  suspend fun forcePull()
  suspend fun forcePush()
}

sealed class SyncStatus {
  object Idle: SyncStatus()
  data class Syncing(val direction: Direction, val itemsRemaining: Int): SyncStatus()
  data class Error(val message: String, val canRetry: Boolean): SyncStatus()
  data class Conflict(val noteId: NoteId): SyncStatus()
}
""",
    "responsibilities": [
        "Outbox table in Room for pending writes; periodic flush via WorkManager.",
        "Pull strategy: server `updated_at > last_sync_at` per table, paged.",
        "Push strategy: outbox row → REST call → on success, remove from outbox.",
        "Conflict policy: last-writer-wins on body; union on tags; flag conflicts in a system note.",
        "Subscribe to Supabase Realtime channel for the user's row updates while app is foregrounded.",
        "Idempotency: every write carries a client-generated UUID; server rejects duplicates.",
        "Resume-safe: kill the app mid-sync, restart, no data loss, no duplicates.",
        "Battery-aware: WorkManager constraints (connected, not low-battery) for non-urgent flushes.",
    ],
    "deliverables": [
        "Kotlin library `sync-android` (clean Coroutines, no Android-specific deps in the core).",
        "Room schema mirroring the server schema (notes, notebooks, tags, note_tags, sync_outbox).",
        "WorkManager workers: PushWorker, PullWorker.",
        "Realtime subscriber that auto-merges incoming rows.",
        "Conflict-handling: on conflict, raw remote body is preserved in a system note named 'Conflicts'.",
        "Documentation: `docs/how-sync-works.md` explainer (state machine, conflict policy, idempotency).",
        "Tests: unit tests for outbox flush, conflict detection, realtime merging. One end-to-end test that uses two Android emulator instances editing the same note offline.",
    ],
    "data_tables": [
        "(Android local) sync_outbox",
        "(Android local) notes, notebooks, tags, note_tags (Room mirror)",
    ],
    "api_endpoints": [
        "PATCH /rest/v1/notes (idempotency-key header)",
        "POST /rest/v1/notes (idempotency-key header)",
    ],
    "ready_prompt": """\
You are implementing module M5 (Sync Engine — Android) of the Evernote-like
notes app. Read `tech-specs/M05-sync-engine.md` before starting. **This is the
hardest module in the system. Do not cut corners on correctness.**

Prerequisites:
  - M1 (core-domain), M4 (notes-core with REST endpoints + Realtime), are done.
  - Supabase Realtime is enabled for tables: notes, notebooks, tags, note_tags.

Your job:
  1. Set up Room schema mirroring the server tables. Add `sync_outbox` table
     for pending writes (op = INSERT/UPDATE/TRASH; payload jsonb; attempts;
     created_at).
  2. Implement `SyncEngine` with three coroutine loops launched by `start`:
       - Outbox flusher (every 30s or on connectivity regained)
       - Periodic puller (every 5 min when foregrounded)
       - Realtime listener (subscribes when app foreground, unsubscribes
         on background)
  3. Every client-side mutation:
       a) Writes to Room IMMEDIATELY (UI never blocks on network)
       b) Inserts a row in sync_outbox with a client-generated UUID
       c) Outbox flusher picks it up; on success removes it; on 409
          (already-applied via idempotency key) treats as success.
  4. Pull: SELECT * FROM <table> WHERE owner_id = me AND updated_at > last_sync_at
     ORDER BY updated_at ASC LIMIT 500; update last_sync_at to max(updated_at)
     of returned page; loop until page < 500.
  5. Conflict detection: if a pulled row's updated_at > local row's updated_at
     AND the local row has an outbox entry for it, that's a conflict. Policy:
       - body: keep remote, store local body in a system note titled
         "[Conflict] <original title>" inside a special "Conflicts" notebook
       - tags: union of remote and local
       - is_pinned/is_trashed: prefer remote (server is source of truth for
         non-content fields)
  6. WorkManager constraints: PushWorker requires CONNECTED;
     PullWorker requires UNMETERED for full pull, CONNECTED for incremental.
  7. Tests are MANDATORY:
       - Outbox flush with intermittent network failures (use a fake
         transport).
       - Conflict creation with two simulated clients.
       - Process-death recovery: kill mid-flush, verify no duplicates after
         restart.

Write a clear `docs/how-sync-works.md` with the state machine diagram and the
conflict-policy decision tree. Future maintainers will thank you.

Definition of Done is in the spec. Test rigorously; sync bugs eat user trust.
""",
},

# -----------------------------------------------------------------------------
{
    "id": "M06",
    "name": "Editor Module (Web + Android)",
    "slug": "editor",
    "complexity": "Opus (Android) + Sonnet (Web)",
    "duration": "10–14 days (split across platforms)",
    "depends_on": ["M01", "M03", "M07", "M09"],
    "purpose": (
        "Rich-text editor with a shared JSON document model (ProseMirror schema) "
        "so notes render identically on both clients."
    ),
    "interface": """// Document model: ProseMirror JSON
// Web: Tiptap editor with custom extensions
// Android: a Compose renderer + editor that reads/writes the same JSON

interface NoteEditor {
  fun load(json: String)
  fun toJson(): String
  fun toMarkdown(): String
  fun insertAttachment(ref: AttachmentRef)
  fun registerAICommand(cmd: AICommand)   // e.g., 'Summarize selection'
  fun onChange(handler: (json: String) -> Unit)
}
""",
    "responsibilities": [
        "Define a frozen ProseMirror schema in a shared file: headings (1-3), paragraphs, bullet/ordered lists, checkbox lists, code (inline + block), image, attachment, internal-link.",
        "Web: implement with Tiptap; ship custom nodes for `attachment` and `internalLink`.",
        "Android: ship a Compose renderer for the schema; for V1, edit-in-Markdown with WYSIWYG render. Full Compose rich-text editor is V1.5.",
        "Inline AI actions: 'Summarize', 'Improve writing', 'Extract action items' as slash-commands (web) and overflow-menu items (Android).",
        "JSON ↔ Markdown converter — shared logic, mirrored across platforms.",
        "Paste handling: paste of HTML (from web) and Markdown (from copies) converted to schema-conformant JSON.",
    ],
    "deliverables": [
        "Frozen schema definition file `packages/editor-schema/schema.ts` (the source of truth).",
        "Web package `editor-web` (Tiptap-based).",
        "Android module `editor-android` (Compose).",
        "Bidirectional JSON ↔ Markdown converter with property-based tests (round-trip preserves content).",
        "Storybook-style demo page for the web editor.",
        "Screenshot tests for the Android renderer.",
    ],
    "data_tables": ["notes (body_json column)"],
    "api_endpoints": [],
    "ready_prompt": """\
You are implementing module M6 (Editor) of the Evernote-like notes app. Read
`tech-specs/M06-editor.md` before starting.

This module spans WEB and ANDROID. Confirm with the human which platform you
are building right now — they should be built in parallel by different
Claude Code sessions to avoid merge conflicts.

Prerequisites:
  - M1 (core-domain) is done.
  - M3 (storage-provider) and M7 (attachment-pipeline) are done OR provide
    stubs; editor needs `insertAttachment(ref)` to work end-to-end.
  - M9 (AI services) is done OR provides stubs for AI slash-commands.

Phase 1 — schema (both platforms share this):
  1. Create `packages/editor-schema/schema.ts`. Define ProseMirror nodes:
     doc, paragraph, heading (1-3), bullet_list, ordered_list, list_item,
     check_list_item, code_block, code_inline, image, attachment,
     internal_link, hard_break.
  2. Write a JSON ↔ Markdown converter in `packages/editor-schema/markdown.ts`.
  3. Write property-based tests: any valid JSON round-trips to Markdown and
     back without loss (use fast-check).

Phase 2 — WEB editor:
  4. `packages/editor-web/` using Tiptap v2. Implement the schema above with
     Tiptap's Node API. Custom nodes: `attachment` (shows file pill with
     click-to-open), `internalLink` (shows `[[Note Title]]` style).
  5. Slash-command menu with three AI actions wired to M9: Summarize selection,
     Improve writing, Extract action items.
  6. Paste handler: detect HTML vs Markdown vs plain text, convert to schema.
  7. Storybook story for each node.

Phase 3 — ANDROID editor (build only if assigned this platform):
  8. `editor-android/` Compose module. For V1 ship a Markdown-edit-with-
     WYSIWYG-preview UX: tap to toggle between edit mode (Markdown text) and
     read mode (rendered Compose).
  9. Render every schema node as a Composable. Use AnnotatedString for
     inline formatting.
  10. Overflow menu in toolbar provides the same three AI actions (Summarize,
      Improve, Action items).

Tests:
  - Round-trip JSON ↔ Markdown property tests (cross-platform).
  - Tiptap unit tests for each custom node.
  - Android screenshot tests using Paparazzi for the renderer.

Definition of Done is in the spec.
""",
},

# -----------------------------------------------------------------------------
{
    "id": "M07",
    "name": "Attachment Pipeline",
    "slug": "attachment-pipeline",
    "complexity": "Sonnet",
    "duration": "3–4 days",
    "depends_on": ["M03", "M04"],
    "purpose": (
        "Bridge between the editor (which knows about an Attachment node) and "
        "the Storage Provider (which doesn't know what a note is). Encapsulates "
        "upload progress, retry, thumbnail generation, and reference persistence."
    ),
    "interface": """interface AttachmentPipeline {
  suspend fun attach(noteId: NoteId, file: FileInput): AttachmentRef
  suspend fun resolveUrl(ref: AttachmentRef): String   // short-lived signed URL
  suspend fun remove(ref: AttachmentRef)
  fun uploadProgress(ref: AttachmentRef): Flow<Progress>
}

data class Progress(val bytesSent: Long, val bytesTotal: Long, val state: State)
sealed class State {
  object Pending: State()
  object Uploading: State()
  object Done: State()
  data class Failed(val cause: Throwable): State()
}
""",
    "responsibilities": [
        "Calls StorageProvider.upload() (M3), gets externalId, writes AttachmentRef to DB (M4) atomically.",
        "Generates thumbnails for images on the client before upload (saves bandwidth + Drive quota).",
        "Handles 'attachment dangling': a scheduled job warns if a note references a missing external file.",
        "Resolves to a signed URL via M3 only on demand; never cache URLs.",
        "Progress reporting for UI (Android upload indicator, web file pill).",
    ],
    "deliverables": [
        "Android library `attachments-android`.",
        "Web library `attachments-web`.",
        "Edge Function `attachments/validate` (periodic dangling-ref check).",
        "Tests for happy path, network failure, and dangling-reference detection.",
    ],
    "data_tables": ["attachments_refs"],
    "api_endpoints": [
        "POST /functions/v1/attachments/validate (cron, internal)",
    ],
    "ready_prompt": """\
You are implementing module M7 (Attachment Pipeline) of the Evernote-like notes
app. Read `tech-specs/M07-attachment-pipeline.md` before starting.

Prerequisites:
  - M3 (storage-google-drive) is done — `StorageProvider.upload()` works.
  - M4 (notes-core) is done — `attachments_refs` table exists.

Your job:
  1. Implement `AttachmentPipeline` for web and Android.
  2. Client-side thumbnail generation for images: max 800px on longest edge,
     JPEG quality 80. Upload thumbnail + original; reference both in
     `attachments_refs.thumbnail_id` and `attachments_refs.external_id`.
  3. Upload is a 3-step transaction:
       a) Call M3 upload (gets externalId)
       b) Insert attachments_refs row (gets attachment id)
       c) If b fails, call M3 delete to avoid orphans
  4. `uploadProgress(ref)` returns a Flow that emits Progress values during
     upload. Wire to the Tiptap attachment node (web) and Compose progress
     indicator (Android).
  5. Edge Function `attachments/validate`: runs daily via pg_cron; for each
     attachments_refs row, attempts M3 metadata fetch; on 404, writes a row
     to a `dangling_attachments` table for user review.

Tests:
  - Unit: upload happy path, upload failure rollback (no orphaned Drive file),
    thumbnail generation produces a correctly-sized JPEG.
  - Integration: attach a real file, retrieve via signed URL, delete, verify
    Drive file is gone.

Definition of Done is in the spec.
""",
},

# -----------------------------------------------------------------------------
{
    "id": "M08",
    "name": "Calendar Integration Module",
    "slug": "calendar-integration",
    "complexity": "Sonnet",
    "duration": "4–5 days",
    "depends_on": ["M01", "M02"],
    "purpose": (
        "Two-way bridge to Google Calendar. V1 ships Google; OutlookCalendarAdapter "
        "is a V2 swap behind the same port."
    ),
    "interface": """interface CalendarProvider {
  val id: CalendarProviderId
  suspend fun listEvents(range: DateRange): List<CalendarEvent>
  suspend fun createEvent(input: NewEventInput): CalendarEvent
  suspend fun updateEvent(id: ExternalEventId, patch: EventPatch): CalendarEvent
  suspend fun deleteEvent(id: ExternalEventId)
  fun watchEvents(range: DateRange): Flow<CalendarChange>  // V1: poll; V2: push channel
}
""",
    "responsibilities": [
        "Use Google Calendar API v3 with the user's OAuth token (granted at sign-in via M2).",
        "Mirror events into Postgres table `events_mirror` for offline read and unified search.",
        "Outbound: from a note, 'Create Calendar event' opens a dialog; on submit, calls createEvent and stores back-reference in `note_event_links`.",
        "Polling cadence: every 15 min while foregrounded; webhook channels (Calendar push) added in V2.",
        "Time-zone correct: store everything in UTC; render in user's local zone.",
    ],
    "deliverables": [
        "Edge Function `calendar/sync` (mirrors events for a date range).",
        "Edge Function `calendar/create-event` (creates from a note).",
        "Android UI: 'Today' view that lists events + notes due today.",
        "Web UI: same Today view.",
        "Tests against a real test calendar account.",
    ],
    "data_tables": ["events_mirror", "note_event_links"],
    "api_endpoints": [
        "POST /functions/v1/calendar/sync",
        "POST /functions/v1/calendar/create-event",
        "GET /rest/v1/events_mirror (PostgREST)",
    ],
    "ready_prompt": """\
You are implementing module M8 (Calendar Integration) of the Evernote-like
notes app. Read `tech-specs/M08-calendar-integration.md` before starting.

Prerequisites:
  - M1 (core-domain), M2 (auth with calendar.events scope) done.
  - SQL migration for `events_mirror` and `note_event_links` applied.

Your job:
  1. Implement `CalendarProvider` interface in core-domain.
  2. Implement `GoogleCalendarAdapter` (TS for Edge Functions + Kotlin for
     Android). Use the Calendar v3 REST API with the user's OAuth token.
  3. Edge Function `calendar/sync`:
       - Input: { rangeStart, rangeEnd }
       - For each event in the user's primary calendar within the range,
         upsert a row in `events_mirror` (UNIQUE on external_event_id).
       - Delete mirror rows for events that no longer exist in Calendar.
  4. Edge Function `calendar/create-event`:
       - Input: { noteId, title, startAt, endAt, reminderMinutes, attendees }
       - POST to Calendar API; on success, insert into `note_event_links`.
  5. Today view (Android + Web): query events_mirror WHERE
     start_at::date = today AND owner_id = me; merge with notes where due_at =
     today; sort by time.
  6. Time zones: store in UTC; render in `Intl.DateTimeFormat` (web) /
     `ZonedDateTime` (Android) using the device's zone.
  7. Polling: WorkManager periodic worker every 15 min when foregrounded
     (Android); SWR with 15-min revalidation (web).

Tests:
  - Unit: mock Calendar API responses; test sync upserts and deletes correctly.
  - Integration: create a real event via API, sync, verify mirror; delete via
    API, sync, verify mirror is updated.

Definition of Done is in the spec.
""",
},

# -----------------------------------------------------------------------------
{
    "id": "M09",
    "name": "Second-Brain AI Services (Ollama V1)",
    "slug": "ai-services",
    "complexity": "Opus",
    "duration": "10–14 days",
    "depends_on": ["M01", "M04", "M10", "M15"],
    "purpose": (
        "The heart of the product. All AI capabilities — summarization, tagging, "
        "Q&A, chat-with-notes, daily briefing, connection discovery — sit behind "
        "a provider-agnostic AIServices facade. V1 ships only the OllamaAdapter; "
        "the port architecture allows V2 to add Claude/OpenAI as one-file additions."
    ),
    "interface": """// Provider-agnostic port — V1 has one impl (OllamaAdapter)
interface AIProvider {
  val id: ProviderId                            // OLLAMA | (V2: CLAUDE, OPENAI, ...)
  val capabilities: Set<Capability>             // STREAMING, EMBEDDINGS, VISION, TOOL_USE
  suspend fun listModels(): List<ModelDescriptor>
  suspend fun chat(messages: List<Message>, opts: AIOptions): AIResponse
  fun streamChat(messages: List<Message>, opts: AIOptions): Flow<AIChunk>
  suspend fun embed(texts: List<String>, model: String): List<FloatArray>?
  suspend fun ping(): ProviderHealth
}

// Domain-facing facade — UI talks only to this
interface AIServices {
  // Per-note (one-shot)
  suspend fun summarize(noteId: NoteId, length: SummaryLength): String
  suspend fun suggestTags(noteId: NoteId): List<String>
  suspend fun suggestTitle(noteId: NoteId): String
  suspend fun extractActionItems(noteId: NoteId): List<String>
  suspend fun rewrite(text: String, instruction: String): String

  // Corpus-wide (the second-brain features)
  fun chat(conversationId: ConversationId?, message: String, scope: NoteScope): Flow<ChatChunk>
  suspend fun relatedNotes(noteId: NoteId, k: Int = 10): List<RelatedNote>
  suspend fun dailyBriefing(date: LocalDate): Briefing

  // Conversation persistence
  suspend fun listConversations(): List<Conversation>
  suspend fun getConversation(id: ConversationId): Conversation
  suspend fun newConversation(seed: String? = null): ConversationId
  suspend fun deleteConversation(id: ConversationId)
}
""",
    "responsibilities": [
        "OllamaAdapter calls the user's Ollama endpoint (Tailscale Funnel URL from M15).",
        "Streaming via Ollama's NDJSON response format; UI gets a Flow of chunks.",
        "Model selection per task is resolved via M15 routing config.",
        "RAG pipeline for chat: vector retrieval (M10) → top-k chunks → prompt assembly → stream answer with [[NoteId:xxx]] citations.",
        "Persistent conversations stored in Postgres (ai_conversations, ai_messages); UI shows a history sidebar.",
        "Conversation compression: when context > 70% of model's window, summarize older turns with the same routed model.",
        "Daily briefing: pg_cron job runs at user's configured time; reads yesterday's notes + today's calendar + open action items; produces Markdown briefing.",
        "Connection discovery (related notes): pure vector similarity, no LLM call, sub-100ms.",
        "All AI calls go through backend Edge Functions which proxy to Ollama via Tailscale. Legion never directly exposed.",
        "Prompt library in `/prompts/*.md` — versioned, neutral templates, per-model overrides ready for V2.",
        "Cost telemetry logged to `ai_usage_log` (in V1 this records latency + tokens but $0 cost).",
    ],
    "deliverables": [
        "Edge Functions: `ai/chat` (SSE streaming), `ai/summarize`, `ai/suggest-tags`, `ai/suggest-title`, `ai/related`, `ai/briefing`, `ai/rewrite`.",
        "OllamaAdapter implementation (TS for Edge, Kotlin reference for direct LAN mode).",
        "Prompt library `/prompts/*.md`.",
        "Conversation persistence: schema migration + Edge Functions for list/get/delete.",
        "Chat UI components (Android + Web) with streaming render.",
        "Integration tests against a real Ollama instance.",
    ],
    "data_tables": [
        "ai_conversations",
        "ai_messages",
        "ai_memory",
        "ai_usage_log",
    ],
    "api_endpoints": [
        "POST /functions/v1/ai/chat (SSE)",
        "POST /functions/v1/ai/summarize",
        "POST /functions/v1/ai/suggest-tags",
        "POST /functions/v1/ai/suggest-title",
        "POST /functions/v1/ai/related",
        "POST /functions/v1/ai/briefing",
        "POST /functions/v1/ai/rewrite",
    ],
    "ready_prompt": """\
You are implementing module M9 (Second-Brain AI Services — Ollama V1) of the
Evernote-like notes app. Read `tech-specs/M09-ai-services.md`,
`reference/ollama-setup.md`, and `tech-specs/M15-ai-settings-routing.md` before
starting. This is the highest-judgment module in the system.

Prerequisites:
  - M1 (core-domain) is done.
  - M4 (notes-core) is done.
  - M10 (embedding-vector) is done; `vector_search(embedding, k, filter)` works.
  - M15 (ai-settings-routing) is done OR provides a stub that returns hard-coded
    routing (chat → llama3.1:8b, tag → llama3.2:3b, embed → nomic-embed-text).
  - The human has Ollama running on the Legion reachable via Tailscale Funnel
    at some URL — they will provide it.

Your job:
  1. Implement `AIProvider` interface in core-domain (TS + Kotlin shapes).
  2. Implement `OllamaAdapter` in TS for Edge Functions:
       - Uses fetch() against the Ollama endpoint
       - Supports /api/chat (streaming via NDJSON), /api/embed, /api/tags,
         /api/generate
       - On 5xx/network error, single retry with 1s backoff, then surface
         actionable error
  3. Implement `AIServices` facade. Each method resolves the routed model via
     M15 then calls OllamaAdapter.
  4. RAG pipeline for `chat`:
       - Embed the user's question (route: embed task)
       - Call M10 vector_search(embedding, k=6, filter by scope)
       - Build prompt with system instructions + retrieved chunks + prior
         conversation turns
       - Stream the answer; on token chunks containing [[NoteId:UUID]],
         pass through to the client as-is
       - Persist user message + assistant message in ai_messages with token
         counts and cost ($0 in V1).
  5. Conversation memory:
       - When `getConversation` is called, return last N messages plus
         conversation.archived_summary if present.
       - Before each chat call, estimate token count; if > 70% of model's
         window, summarize older turns into archived_summary using the same
         routed model (a cheap call to llama3.2:3b for the summarization).
  6. Daily briefing:
       - pg_cron job at user's `users_profile.ai_prefs.briefing_hour`
         (default 8am in user's timezone)
       - Reads notes WHERE updated_at::date = yesterday
       - Reads events_mirror WHERE start_at::date = today
       - Reads notes WHERE has_open_actions = true (you'll need to compute this)
       - Calls `ai/briefing` with structured input; returns Markdown
       - Stores as a system note pinned to today's view
  7. Related notes:
       - `ai/related` takes a noteId; fetches the note's first embedding chunk;
         calls vector_search(k=10, filter: not the same note); returns the hits.
       - No LLM call. Sub-100ms target.
  8. Prompt library `/prompts/*.md` — each file is one task; supports a
     model-override block (commented YAML front-matter) for V2 when multiple
     providers exist.

Tests:
  - Unit test the OllamaAdapter with a mocked fetch.
  - Integration test against a live Ollama instance (use a test Tailscale
    setup; document the env vars needed).
  - Round-trip test: persist a conversation, retrieve it, continue chatting,
    verify history is preserved.

Open-weight prompting note: llama3.1:8b is more sensitive to prompt structure
than Claude. Use explicit role tags, bullet-pointed instructions, and few-shot
examples in /prompts/. When in doubt, test both default and reasoning-style
prompts and keep what works.

Definition of Done is in the spec.
""",
},

# -----------------------------------------------------------------------------
{
    "id": "M10",
    "name": "Embedding & Vector Search Module",
    "slug": "embedding-vector",
    "complexity": "Sonnet",
    "duration": "3–4 days",
    "depends_on": ["M01", "M04"],
    "purpose": (
        "Manage embeddings for every note. Re-embed on update. Provide top-k "
        "retrieval for RAG. V1 uses pgvector inside Supabase Postgres; the "
        "VectorStore port supports swap to Pinecone or Qdrant later without "
        "retrieval-code changes. Embeddings are namespaced by model so multiple "
        "embedding models can coexist during migration."
    ),
    "interface": """interface VectorStore {
  suspend fun upsert(noteId: NoteId, chunks: List<EmbeddingChunk>, namespace: String)
  suspend fun delete(noteId: NoteId, namespace: String? = null)
  suspend fun search(queryEmbedding: FloatArray, k: Int, filter: VectorFilter, namespace: String): List<VectorHit>
}

data class EmbeddingChunk(val text: String, val embedding: FloatArray, val chunkIndex: Int)

data class VectorFilter(
  val notebookIds: Set<NotebookId>? = null,
  val tagIds: Set<TagId>? = null,
  val excludeAi: Boolean = true,
  val dateRange: DateRange? = null
)
""",
    "responsibilities": [
        "Chunk note body into ~500-token windows with 50-token overlap before embedding.",
        "Trigger: on note insert/update, an Edge Function enqueues an embedding job.",
        "pgvector index: HNSW with cosine distance, one index per namespace.",
        "Namespace = `${provider}:${model}` (e.g., `ollama:nomic-embed-text`).",
        "Filter pushdown: VectorFilter → SQL WHERE clauses (notebook_id, tags, date range, ai_excluded flag).",
        "Backfill script that embeds the entire corpus on first run (or on embedding-model switch).",
        "Idempotency: re-embedding the same note version is a no-op.",
    ],
    "deliverables": [
        "Migration adding `note_embeddings` table with vector column, namespace text, GIN/HNSW indexes.",
        "Edge Function `embeddings/index` (idempotent, retryable).",
        "Postgres trigger or pg_cron job that enqueues re-indexing on note update.",
        "Backfill script `scripts/backfill-embeddings.ts` with progress logging.",
        "Tests for chunking, retrieval correctness, namespace isolation.",
    ],
    "data_tables": ["note_embeddings"],
    "api_endpoints": [
        "POST /functions/v1/embeddings/index (internal, called by trigger)",
    ],
    "ready_prompt": """\
You are implementing module M10 (Embedding & Vector Search) of the Evernote-like
notes app. Read `tech-specs/M10-embedding-vector.md` before starting.

Prerequisites:
  - M1, M4 done.
  - Supabase project has `pgvector` extension enabled
    (run `CREATE EXTENSION IF NOT EXISTS vector;`).
  - M9 (ai-services) provides `embed(texts, model)` OR a stub that returns
    deterministic 768-dim vectors for tests.

Your job:
  1. SQL migration:
       CREATE TABLE note_embeddings (
         id uuid primary key default gen_random_uuid(),
         owner_id uuid not null references auth.users(id),
         note_id uuid not null references notes(id) on delete cascade,
         namespace text not null,        -- e.g., 'ollama:nomic-embed-text'
         chunk_index int not null,
         content text not null,
         embedding vector(768) not null, -- 768 for nomic-embed-text
         created_at timestamptz default now(),
         UNIQUE (note_id, namespace, chunk_index)
       );
       -- HNSW index per namespace via partial indexes:
       CREATE INDEX idx_emb_nomic ON note_embeddings
         USING hnsw (embedding vector_cosine_ops)
         WHERE namespace = 'ollama:nomic-embed-text';
       -- RLS:
       ALTER TABLE note_embeddings ENABLE ROW LEVEL SECURITY;
       CREATE POLICY owner_can_all ON note_embeddings FOR ALL
         USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

  2. Chunker: split note body (plaintext extracted from ProseMirror JSON) into
     ~500-token windows with 50-token overlap. Use tiktoken or a simple
     word-based approximation (~750 chars per chunk).

  3. Edge Function `embeddings/index`:
       Input: { noteId, namespace }
       Steps:
         a) Load note from notes table; if is_trashed or ai_excluded, delete
            its embeddings for this namespace and return.
         b) Chunk the body.
         c) Call M9.embed(chunks.map(c => c.text), namespaceModel).
         d) UPSERT rows in note_embeddings (delete old, insert new for this
            namespace + note).

  4. Trigger: AFTER INSERT/UPDATE OF body_json ON notes, enqueue an embedding
     job. Use pg_net.http_post to the Edge Function, OR a pg_cron worker that
     polls a job_queue table.

  5. Vector search function (SQL):
       CREATE FUNCTION vector_search(
         query_embedding vector(768),
         k int,
         filter_namespace text,
         filter_notebooks uuid[] DEFAULT NULL,
         filter_tags uuid[] DEFAULT NULL,
         exclude_ai boolean DEFAULT true
       ) RETURNS TABLE (note_id uuid, chunk_index int, content text, distance float)
       LANGUAGE sql AS $$
         SELECT ne.note_id, ne.chunk_index, ne.content,
                ne.embedding <=> query_embedding AS distance
         FROM note_embeddings ne
         JOIN notes n ON n.id = ne.note_id
         WHERE ne.owner_id = auth.uid()
           AND ne.namespace = filter_namespace
           AND NOT n.is_trashed
           AND (NOT exclude_ai OR NOT n.ai_excluded)
           AND (filter_notebooks IS NULL OR n.notebook_id = ANY(filter_notebooks))
         ORDER BY distance ASC LIMIT k;
       $$;

  6. Backfill script: iterate over all non-trashed notes; for each, call the
     Edge Function. Log progress to stdout.

Tests:
  - Chunker: a 1500-token note produces 3 chunks with correct overlap.
  - Round-trip: insert a note, wait for trigger, search for keywords in the
    note, verify it's returned in top results.
  - Namespace isolation: two namespaces don't see each other's vectors.

Definition of Done is in the spec.
""",
},

# -----------------------------------------------------------------------------
{
    "id": "M11",
    "name": "Notification Module",
    "slug": "notifications",
    "complexity": "Haiku",
    "duration": "2 days",
    "depends_on": ["M01"],
    "purpose": (
        "Push notifications for reminders and (V2) shared-note events. V1 only "
        "sends local reminders for note-attached due dates; V2 adds cross-device "
        "push via FCM."
    ),
    "interface": """interface NotificationProvider {
  suspend fun scheduleLocal(reminder: Reminder)
  suspend fun cancelLocal(reminderId: ReminderId)
  suspend fun sendPush(userId: UserId, payload: PushPayload)   // V2
}
""",
    "responsibilities": [
        "Android: AlarmManager + WorkManager for local reminders.",
        "Web: Web Notifications API for in-tab reminders.",
        "V2: Firebase Cloud Messaging adapter behind the same port.",
    ],
    "deliverables": [
        "Android library `notifications-android`.",
        "Web hook `useNotifications`.",
        "Manifest entries (notification permission, alarm permission).",
    ],
    "data_tables": ["reminders"],
    "api_endpoints": [],
    "ready_prompt": """\
You are implementing module M11 (Notifications) of the Evernote-like notes app.
Read `tech-specs/M11-notifications.md` before starting.

Prerequisites:
  - M1 done.
  - `reminders` table migration applied (see reference/data-model.md).

Your job:
  1. Android:
       - AndroidManifest: add POST_NOTIFICATIONS permission (API 33+),
         SCHEDULE_EXACT_ALARM permission (API 31+).
       - Implement `AlarmReceiver` broadcast receiver.
       - Implement `NotificationProvider` with scheduleLocal using AlarmManager
         setExactAndAllowWhileIdle; for the body, use the reminder payload.
       - On boot, re-schedule unfired reminders (BOOT_COMPLETED receiver).
  2. Web:
       - useNotifications() hook that calls Notification.requestPermission()
         on first use.
       - Schedule via setTimeout for reminders within 24h; for >24h, just rely
         on the daily browser visit to re-check.

Tests:
  - Android: instrumented test that schedules a reminder 5s in the future,
    verifies the BroadcastReceiver fires.
  - Web: jsdom test that mocks Notification API and verifies it's called.

Definition of Done is in the spec.
""",
},

# -----------------------------------------------------------------------------
{
    "id": "M12",
    "name": "Android App Shell",
    "slug": "android-shell",
    "complexity": "Opus (scaffold) + Sonnet (screens)",
    "duration": "10–14 days",
    "depends_on": ["M01", "M02", "M03", "M04", "M05", "M06", "M07", "M08", "M09", "M10", "M11", "M15"],
    "purpose": (
        "Top-level Android app: navigation graph, theme, dependency-injection "
        "wiring (Hilt), splash, sign-in, main shell. This is the composition root "
        "that wires every module together for the Android client."
    ),
    "interface": """@HiltAndroidApp
class NotesApp : Application() {
  // Hilt modules provide each port → concrete adapter binding:
  //   AuthProvider           → SupabaseAuthAdapter
  //   NotesService           → SupabaseNotesAdapter
  //   StorageProvider        → GoogleDriveAdapter
  //   CalendarProvider       → GoogleCalendarAdapter
  //   AIServices             → BackendAIServicesAdapter (calls Edge Functions)
  //   SyncEngine             → SyncEngineImpl
  //   NotificationProvider   → AndroidNotificationProvider
}
""",
    "responsibilities": [
        "Single-activity Compose Navigation with these top-level destinations: Today, Notes, Search, Chat, Settings.",
        "Material 3 theming with dynamic color; dark mode default.",
        "Hilt DI with one module per port for easy mocking and adapter swaps.",
        "Sentry SDK initialized in onCreate.",
        "Splash → Auth → Main shell flow.",
        "Edge-to-edge / predictive back gestures.",
    ],
    "deliverables": [
        "Compiling Android app that runs end-to-end: sign in → note list → editor → AI chat → settings.",
        "Internal-track Play Store build (signed AAB).",
        "Compose Navigation graph documented.",
        "Hilt DI graph documented in `docs/android-di.md`.",
    ],
    "data_tables": [],
    "api_endpoints": [],
    "ready_prompt": """\
You are implementing module M12 (Android App Shell) of the Evernote-like notes
app. Read `tech-specs/M12-android-shell.md` before starting.

Prerequisites: M1, M2, M3, M4, M5, M6, M7, M8, M9, M10, M11, M15 all done.
Each provides a library/module that this app pulls together.

Your job:
  1. Create the Android app module with Compose, Hilt, Compose Navigation.
  2. Targets: minSdk 28, compileSdk 34 (current at time of writing).
  3. Composition root: NotesApp : Application with @HiltAndroidApp.
  4. Hilt modules — one file per port:
       AuthModule, NotesModule, StorageModule, CalendarModule, AIModule,
       SyncModule, NotificationsModule. Each binds the interface to the
       concrete adapter.
  5. Navigation graph (single-activity):
       splash → signIn (if not authed) → main
       main {
         today, notes, search, chat, settings
       }
       editor (modal from notes or today)
  6. Theme: Material 3 with dynamicColor on Android 12+, fallback to a custom
     palette below. Dark theme as default.
  7. Initialize Sentry in onCreate (read DSN from BuildConfig).
  8. On app start, kick off SyncEngine.start() in Application scope.
  9. Wire SignInScreen (from M2) at the gate; on success, navigate to today.
  10. Settings screen embeds M15's AI settings sub-screen.

Build outputs:
  - signed AAB for Play internal track.
  - Document the keystore management approach in
    `docs/android-release.md` — do NOT commit the keystore.

Tests:
  - Macrobenchmark cold-start time < 1.5s on a Pixel 6 / equivalent.
  - Espresso end-to-end test: sign in → create note → see in list.

Definition of Done is in the spec.
""",
},

# -----------------------------------------------------------------------------
{
    "id": "M13",
    "name": "Web App Shell",
    "slug": "web-shell",
    "complexity": "Sonnet",
    "duration": "7–10 days",
    "depends_on": ["M01", "M02", "M03", "M04", "M06", "M07", "M08", "M09", "M10", "M11", "M15"],
    "purpose": (
        "Next.js application that wires the same set of ports to web-appropriate "
        "adapters. Reuses the TypeScript domain package from M1."
    ),
    "interface": """// app/layout.tsx — composition root for providers
// AuthProvider, NotesService (Supabase JS), StorageProvider (chosen per user),
// CalendarProvider, AIServices (fetch to edge functions), NotificationProvider
""",
    "responsibilities": [
        "Next.js 14 App Router; React Server Components for note list pages.",
        "Tiptap editor with the custom schema from M6.",
        "Streaming chat UI for M9's chat-with-notes (SSE).",
        "Responsive layout — tablet-first; phone web is acceptable but Android is the primary mobile target.",
        "shadcn/ui + Tailwind for the design system.",
    ],
    "deliverables": [
        "Web app deployable to Vercel with one env file.",
        "Lighthouse score ≥ 90 on the main editor page.",
        "All screens: Today, Notes list, Editor, Search, Chat, Settings.",
        "Light + dark theme.",
    ],
    "data_tables": [],
    "api_endpoints": [],
    "ready_prompt": """\
You are implementing module M13 (Web App Shell) of the Evernote-like notes app.
Read `tech-specs/M13-web-shell.md` before starting.

Prerequisites: M1, M2, M3, M4, M6, M7, M8, M9, M10, M11, M15 all done.

Your job:
  1. Next.js 14 App Router app in `apps/web`. TypeScript strict mode.
  2. Add shadcn/ui (the CLI: pnpm dlx shadcn-ui@latest init).
  3. Tailwind config with the same color palette as the Android theme for
     consistency. Read palette from `packages/design-tokens/`.
  4. Composition root `app/layout.tsx`: AuthProvider, ThemeProvider, QueryClient.
  5. Routes:
       /              → Today view (server-rendered list of today's events + notes)
       /notes         → Notes list (RSC + Suspense)
       /notes/[id]    → Editor (client component, Tiptap)
       /search        → Search + semantic-search toggle
       /chat          → Conversation list + active chat (SSE streaming)
       /settings/*    → Settings sections (including AI from M15)
  6. Auth gate via middleware.ts checking Supabase session cookie.
  7. Chat UI: streams SSE from ai/chat; renders tokens progressively;
     parses [[NoteId:UUID]] tokens into <a href="/notes/UUID">linked text</a>.
  8. Light/dark theme via shadcn/ui Theme provider.
  9. Lighthouse: aim ≥ 90 on the editor page; lazy-load Tiptap and AI panels.
  10. Deploy: `vercel --prod` with env vars from .env.production.

Tests:
  - Playwright: sign in → create note → search → ask AI → see citation.
  - Component tests for the chat streaming renderer (mock SSE).

Definition of Done is in the spec.
""",
},

# -----------------------------------------------------------------------------
{
    "id": "M14",
    "name": "DevOps, Observability & Release",
    "slug": "devops",
    "complexity": "Haiku",
    "duration": "3–4 days",
    "depends_on": [],
    "purpose": (
        "GitHub Actions pipelines, environment management, Sentry, PostHog, and "
        "Play Store release wiring. The 'unglamorous but mandatory' module."
    ),
    "interface": """// .github/workflows/
//   ci.yml         — lint + test on every push
//   deploy-web.yml — Vercel deploy on main
//   build-apk.yml  — signed AAB to Play internal track
//   db-migrate.yml — supabase db push on tag
""",
    "responsibilities": [
        "Three environments: dev (local), staging (separate Supabase project), prod.",
        "Secrets in GitHub Encrypted Secrets and Vercel/Supabase env config (never in repo).",
        "Sentry source maps uploaded on every web deploy; ProGuard mapping uploaded on every Android build.",
        "PostHog: anonymous product analytics; opt-out toggle in settings.",
    ],
    "deliverables": [
        "All four pipelines green on a sample PR.",
        "Runbook `docs/runbook.md`: How to roll back, How to rotate keys, How to add a new user.",
        "Three Supabase projects: notes-dev, notes-staging, notes-prod.",
    ],
    "data_tables": [],
    "api_endpoints": [],
    "ready_prompt": """\
You are implementing module M14 (DevOps & Release) of the Evernote-like notes
app. Read `tech-specs/M14-devops.md` before starting.

Prerequisites: a GitHub repo exists, the human has created Supabase, Vercel,
and Play Console accounts.

Your job:
  1. `.github/workflows/ci.yml`:
       - On push/PR to main: pnpm install, lint (eslint), test (vitest,
         JUnit for Kotlin), type-check (tsc --noEmit).
       - Cache pnpm and gradle.
  2. `.github/workflows/deploy-web.yml`:
       - On push to main: build Next.js, deploy to Vercel production.
       - Upload Sentry source maps via @sentry/cli.
  3. `.github/workflows/build-apk.yml`:
       - On tag v*: build signed AAB, upload to Play internal track.
       - Use Android Gradle Plugin's release signing via keystore stored as
         a GitHub Encrypted Secret.
       - Upload ProGuard mappings to Sentry.
  4. `.github/workflows/db-migrate.yml`:
       - On tag db-*: run `supabase db push --linked` against prod.
       - Requires SUPABASE_ACCESS_TOKEN secret.
  5. Environment file templates:
       .env.example with all variables documented (do not commit real values).
  6. Sentry: init in both web and Android with separate DSNs.
  7. PostHog: init with opt-out check from users_profile.analytics_optout.
  8. Write `docs/runbook.md` with concrete commands for:
       - Rolling back a web deploy: `vercel rollback`
       - Rolling back an Android release: in Play Console UI
       - Rotating Anthropic key, Google client secret: explicit steps
       - Creating a new user in V1 (since signup may be locked): SQL command.

Tests:
  - Push a tiny PR; all four workflows must show green on the first try.

Definition of Done is in the spec.
""",
},

# -----------------------------------------------------------------------------
{
    "id": "M15",
    "name": "AI Settings, Routing & Endpoint Management",
    "slug": "ai-settings-routing",
    "complexity": "Opus (design) + Sonnet (UI) + Haiku (test-connection func)",
    "duration": "5–7 days",
    "depends_on": ["M01", "M02", "M09"],
    "purpose": (
        "User-facing control plane for the second brain. V1 lets the user "
        "configure the Ollama endpoint URL, pick which model handles which "
        "task, test the connection, and see latency/usage telemetry. The routing "
        "schema is multi-provider-aware so V2's added providers slot in "
        "without redesign."
    ),
    "interface": """interface AIRouting {
  suspend fun providersAvailable(): List<ProviderId>
  suspend fun getRouting(): RoutingConfig
  suspend fun setRouting(config: RoutingConfig)
  suspend fun resolveFor(task: AITask): AdapterBinding
}

data class RoutingConfig(
  val chat:       AdapterBinding,
  val summarize:  AdapterBinding,
  val tagging:    AdapterBinding,
  val titling:    AdapterBinding,
  val embeddings: AdapterBinding,
  val briefing:   AdapterBinding,
  val rewrite:    AdapterBinding,
)
data class AdapterBinding(val provider: ProviderId, val model: String)

// V2: when Claude/OpenAI added, add API-key management:
interface AIKeyStore {
  suspend fun putKey(provider: ProviderId, secret: String)
  suspend fun hasKey(provider: ProviderId): Boolean
  suspend fun deleteKey(provider: ProviderId)
  suspend fun ollamaEndpoint(): String?
  suspend fun setOllamaEndpoint(url: String)
}
""",
    "responsibilities": [
        "Settings → AI screens on Android (Compose) and Web (Next.js): three sections — Endpoint, Routing, Usage.",
        "Endpoint section: single 'Ollama endpoint URL' input; 'Test connection' button that calls Ollama /api/tags and shows installed models.",
        "Routing section: table of tasks × Model dropdown; dropdown options populated from /api/tags response.",
        "Usage section: line chart of latency over time; bar chart of token counts per task per day.",
        "Endpoint URL stored in `users_profile.ai_prefs` jsonb.",
        "ai_keys table is built (encrypted via Supabase Vault) but unused in V1; V2 lights it up.",
        "Re-embed background job triggered when user changes the embedding model.",
    ],
    "deliverables": [
        "Android Settings → AI screens (Compose).",
        "Web Settings → AI pages.",
        "Edge Function `ai/test-connection` (calls Ollama /api/tags).",
        "Edge Function `ai/usage` for the usage dashboard.",
        "DB migration: ai_keys, ai_usage_log, expand users_profile.ai_prefs.",
        "Re-embed background job.",
    ],
    "data_tables": ["users_profile", "ai_keys", "ai_usage_log"],
    "api_endpoints": [
        "POST /functions/v1/ai/test-connection",
        "GET /functions/v1/ai/usage",
    ],
    "ready_prompt": """\
You are implementing module M15 (AI Settings, Routing & Endpoint Management) of
the Evernote-like notes app. Read `tech-specs/M15-ai-settings-routing.md` and
`reference/ollama-setup.md` before starting.

Prerequisites:
  - M1, M2 done.
  - M9 (ai-services) is in progress or done — you need the AIProvider port
    type to reference, even if only OllamaAdapter exists.

Your job:
  1. SQL migration:
       ALTER TABLE users_profile ADD COLUMN IF NOT EXISTS ai_prefs jsonb
         DEFAULT '{}'::jsonb;
       CREATE TABLE ai_keys (
         owner_id uuid primary key references auth.users(id),
         provider text not null,
         encrypted_secret bytea,
         endpoint_url text
       ) ENABLE ROW LEVEL SECURITY; -- policy: owner_id = auth.uid()
       CREATE TABLE ai_usage_log (
         id uuid primary key default gen_random_uuid(),
         owner_id uuid not null,
         provider text not null, model text not null, task text not null,
         prompt_tokens int, completion_tokens int, cost_usd numeric,
         latency_ms int, at timestamptz default now()
       );

  2. Edge Function `ai/test-connection`:
       Input: { endpoint_url }
       Steps: fetch `${endpoint_url}/api/tags`; on success return
       { ok: true, models: [...] }; on failure return { ok: false, error }.

  3. Edge Function `ai/usage`:
       Returns aggregated stats for the user from ai_usage_log (per-day per-task).

  4. Routing config:
       Stored as `users_profile.ai_prefs.routing` jsonb. Shape =
       { chat: {provider, model}, summarize: {...}, ... }.
       Defaults seeded on first sign-in:
         chat       → { ollama, llama3.1:8b }
         summarize  → { ollama, llama3.1:8b }
         tagging    → { ollama, llama3.2:3b }
         titling    → { ollama, llama3.2:3b }
         embeddings → { ollama, nomic-embed-text }
         briefing   → { ollama, llama3.1:8b }
         rewrite    → { ollama, llama3.1:8b }

  5. Android Settings UI (Compose):
       - Endpoint screen: TextField for URL, 'Test connection' button.
       - Routing screen: a list of (task, model dropdown) rows. Dropdown
         is populated from /api/tags. Save button persists to ai_prefs.
       - Usage screen: simple charts using Vico or AndroidX Compose Canvas.

  6. Web Settings UI (Next.js):
       - Same three sections as Android; same logic; shadcn/ui components.

  7. Re-embed job:
       - On routing.embeddings change, kick off a background job that
         iterates all notes and re-calls M10's embedding/index Edge Function
         with the new namespace. Show progress in UI.

Tests:
  - Endpoint test-connection: live test against a real Ollama instance.
  - Routing save + reload: persists correctly.
  - Re-embed trigger: changing embedding model enqueues the right number of
    jobs.

Definition of Done is in the spec.
""",
},

]


# =============================================================================
# REFERENCE DOC CONTENT
# =============================================================================

DATA_MODEL_MD = """\
# Data Model Reference

> Postgres schema for the Evernote-like notes app. All tables include
> `id uuid pk default gen_random_uuid()`, `owner_id uuid not null references
> auth.users(id)`, `created_at`, `updated_at`. **Row-Level Security enforces
> `owner_id = auth.uid()` on every table from day one** — this is what makes
> multi-tenant trivial later.

## Table catalog

| Table | Key columns | Notes |
|---|---|---|
| `users_profile` | user_id pk → auth.users, storage_provider, calendar_provider, ai_prefs jsonb | 1 row per user; per-user provider choices. |
| `notebooks` | id, owner_id, name, color, sort_order | One level deep. |
| `tags` | id, owner_id, name, color | Unique on (owner_id, lower(name)). |
| `notes` | id, owner_id, notebook_id, title, body_json jsonb, body_tsv tsvector, is_pinned, is_trashed, trashed_at, ai_excluded boolean default false | tsvector maintained by trigger for keyword search. |
| `note_tags` | note_id, tag_id (composite pk) | Join table. |
| `attachments_refs` | id, owner_id, note_id, provider, external_id, display_name, mime, size_bytes, thumbnail_id | References Drive/OneDrive; never bytes. |
| `events_mirror` | id, owner_id, external_event_id, calendar_id, title, start_at, end_at, payload jsonb | Read-only mirror of Google Calendar. |
| `note_event_links` | note_id, external_event_id | Tracks events created from a note. |
| `note_embeddings` | id, owner_id, note_id, chunk_index, content text, embedding vector, namespace text | HNSW index per namespace. |
| `ai_conversations` | id, owner_id, title, model_hint, created_at, last_message_at, archived_summary text | Persistent chat threads. |
| `ai_messages` | id, conversation_id, role, content, citations jsonb, provider, model, prompt_tokens, completion_tokens, cost_usd, created_at | One row per turn. |
| `ai_memory` | id, owner_id, fact text, source ('user' \\| 'derived'), confidence, created_at, last_used_at | Long-term facts. |
| `ai_keys` | owner_id, provider, encrypted_secret bytea, endpoint_url text | Encrypted; V1 only stores endpoint_url. |
| `ai_usage_log` | id, owner_id, provider, model, task, prompt_tokens, completion_tokens, cost_usd, latency_ms, at | Powers usage dashboard. |
| `reminders` | id, owner_id, note_id, fire_at, payload jsonb, status | Local + (future) push. |
| `sync_outbox` (Android local only) | id, op, payload jsonb, attempts, created_at | Room table; never synced to backend. |
| `audit_log` | id, owner_id, actor, action, target, at, meta jsonb | Append-only. |

## RLS policy template (apply to every table)

```sql
CREATE POLICY "owner_can_all" ON <table>
  FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
```

Public launch requires zero schema changes; only feature flags.

## Required extensions

```sql
CREATE EXTENSION IF NOT EXISTS vector;       -- for note_embeddings
CREATE EXTENSION IF NOT EXISTS pg_cron;      -- for trash retention, briefing job
CREATE EXTENSION IF NOT EXISTS pg_net;       -- for trigger-driven Edge Function calls
```

## Triggers to implement

1. **`notes_tsv_trigger`** — UPDATE body_tsv = to_tsvector(title || ' ' || extract_plain(body_json)) on INSERT/UPDATE.
2. **`updated_at_trigger`** — UPDATE updated_at = now() on every row change. Apply to all tables.
3. **`notes_embed_trigger`** — AFTER INSERT/UPDATE OF body_json, call pg_net.http_post to embeddings/index Edge Function.

## Scheduled jobs (pg_cron)

| Job | Schedule | What |
|---|---|---|
| `trash_retention` | `0 3 * * *` (daily 3am UTC) | DELETE FROM notes WHERE is_trashed AND trashed_at < now() - interval '30 days'. |
| `daily_briefing` | configurable per user | Calls ai/briefing Edge Function for each user at their chosen hour. |
| `attachment_validate` | `0 4 * * *` | Calls attachments/validate to check for dangling references. |
"""

API_CONTRACT_MD = """\
# API Contract Reference

Two API surfaces:

1. **PostgREST (auto-generated)** for CRUD on tables. Clients always
   authenticate with a Supabase JWT.
2. **Custom Edge Functions** for orchestrated operations (AI, calendar sync,
   OAuth token refresh, signed URLs).

## PostgREST (auto-generated)

```
GET    /rest/v1/notes?select=*&order=updated_at.desc&limit=50
POST   /rest/v1/notes                body: { title, body_json, notebook_id }
PATCH  /rest/v1/notes?id=eq.<uuid>   body: { title?, body_json?, is_pinned?, is_trashed? }
DELETE /rest/v1/notes?id=eq.<uuid>   (rare — prefer is_trashed = true)

GET    /rest/v1/notebooks?select=*
GET    /rest/v1/tags?select=*
GET    /rest/v1/events_mirror?start_at=gte.<iso>&start_at=lte.<iso>
GET    /rest/v1/ai_conversations?select=*&order=last_message_at.desc
GET    /rest/v1/ai_messages?conversation_id=eq.<uuid>&order=created_at.asc
```

## Edge Functions

| Endpoint | Method | Purpose | Module |
|---|---|---|---|
| `/functions/v1/ai/chat` | POST (SSE) | Stream chat-with-notes answer | M9 |
| `/functions/v1/ai/summarize` | POST | Summarize a note | M9 |
| `/functions/v1/ai/suggest-tags` | POST | Tag suggestions | M9 |
| `/functions/v1/ai/suggest-title` | POST | Title suggestion | M9 |
| `/functions/v1/ai/related` | POST | Related notes (vector only) | M9 |
| `/functions/v1/ai/briefing` | POST | Daily briefing | M9 |
| `/functions/v1/ai/rewrite` | POST | Inline rewrite | M9 |
| `/functions/v1/ai/test-connection` | POST | Test Ollama endpoint | M15 |
| `/functions/v1/ai/usage` | GET | Usage stats | M15 |
| `/functions/v1/embeddings/index` | POST (internal) | Re-embed a note | M10 |
| `/functions/v1/calendar/sync` | POST | Refresh events_mirror | M8 |
| `/functions/v1/calendar/create-event` | POST | Create calendar event from note | M8 |
| `/functions/v1/storage/sign` | POST | Signed URL for an attachment | M3 |
| `/functions/v1/auth/refresh-provider-token` | POST | Refresh Google tokens server-side | M2 |
| `/functions/v1/notes/bulk-update` | POST | Atomic multi-note ops | M4 |
| `/functions/v1/attachments/validate` | POST (cron) | Check for dangling refs | M7 |
| `/functions/v1/export/full` | POST | Export full corpus as zip | (future) |

## Realtime channels

Per-user channel; postgres_changes on: notes, notebooks, tags, note_tags,
attachments_refs. Clients subscribe on auth and unsubscribe on sign-out.

## Authentication

Every request to PostgREST or an Edge Function must include:

```
Authorization: Bearer <supabase_jwt>
```

The JWT is obtained from Supabase Auth (M2).

## Common response shapes

### Success
```json
{ "ok": true, "data": { ... } }
```

### Error
```json
{ "ok": false, "error": { "code": "ERR_CODE", "message": "...", "hint": "..." } }
```

### SSE event (ai/chat)
```
event: chunk
data: {"delta": "token text"}

event: citation
data: {"noteId": "uuid", "title": "..."}

event: done
data: {"conversation_id": "uuid", "tokens": {"prompt": 1200, "completion": 340}}
```
"""

OLLAMA_SETUP_MD = """\
# Ollama Setup Reference

> Concrete deployment steps for the V1 hardware target: Lenovo Legion desktop,
> Windows, Intel i7, NVIDIA RTX 3060 (12GB VRAM), 16GB system RAM. AI developers
> reading this should assume this hardware exists and is set up by the human
> before any code is run against it.

## Models to expect installed

| Model | Use | VRAM | Speed on RTX 3060 |
|---|---|---|---|
| `llama3.1:8b` | Chat, Q&A, summarization, briefing | ~7GB | 30–60 tok/s |
| `llama3.2:3b` | Tagging, titling, action items | ~3GB | 70–120 tok/s |
| `nomic-embed-text` | Embeddings (768-dim) | ~0.5GB | Batch ~1000 texts/sec |

## Endpoint URL pattern

The user's Ollama is reached via Tailscale Funnel at:

```
https://legion.<tailnet>.ts.net
```

(Replace `<tailnet>` with the user's actual Tailscale tailnet name.)

This URL goes into `users_profile.ai_prefs.ollama_endpoint`.

## Required Ollama API surface

| Endpoint | Use |
|---|---|
| `GET /api/tags` | List installed models. M15 calls this on Test Connection. |
| `POST /api/chat` | Chat (with messages array). Stream=true returns NDJSON. |
| `POST /api/generate` | Single-turn generation. |
| `POST /api/embed` | Generate embeddings. |

## Streaming format (Ollama)

Unlike OpenAI/Anthropic's SSE, Ollama returns NDJSON:

```
{"model":"llama3.1:8b","created_at":"...","message":{"role":"assistant","content":"Hello"},"done":false}
{"model":"llama3.1:8b","created_at":"...","message":{"role":"assistant","content":" world"},"done":false}
{"model":"llama3.1:8b","created_at":"...","done":true,"total_duration":...,"prompt_eval_count":...,"eval_count":...}
```

The OllamaAdapter must:
1. Parse NDJSON line-by-line.
2. Map to provider-neutral `AIChunk` events.
3. Convert the final `done:true` chunk into a Done event with token counts.

## Environment variables on the Legion

| Var | Value | Why |
|---|---|---|
| `OLLAMA_HOST` | `0.0.0.0:11434` | Listen on all interfaces (Tailscale needs this). |
| `OLLAMA_KEEP_ALIVE` | `30m` | Keep models loaded — chat feels instant. |
| `OLLAMA_NUM_PARALLEL` | `2` | Concurrent requests (chat + embed). |
| `OLLAMA_MAX_LOADED_MODELS` | `3` | Keep 3 models warm (fits in 12GB). |
| `OLLAMA_FLASH_ATTENTION` | `1` | Faster inference on RTX 3060. |

## Reachability via Tailscale Funnel

On the Legion:

```
tailscale funnel 11434
```

This exposes Ollama at the HTTPS Tailscale Funnel URL. Funnel auto-handles
TLS termination and only allows traffic from the user's tailnet.

## Prompting notes (open-weight models)

llama3.1:8b is more sensitive to prompt structure than Claude. Tips:

- Use explicit role tags in the system prompt.
- Bullet-pointed instructions; avoid paragraphs of guidance.
- Include 1–2 few-shot examples for tasks that need structured output.
- For tagging/titling, use JSON-mode-style enforcement (literally instruct
  "Respond with only valid JSON. No prose.").
- Lower temperature (0.2–0.5) for structured outputs; higher (0.7) for chat.

## Failure modes the adapter must handle

| Failure | What user sees | Adapter behavior |
|---|---|---|
| Legion off / Tailscale down | "Cannot reach your AI." | Surface actionable error; offer 'Retry' button. |
| Model not pulled | "Model llama3.1:8b not found." | Suggest `ollama pull llama3.1:8b`. |
| Out of VRAM | "Model is loading or VRAM is full." | Retry once after 5s; on second failure, surface to user. |
| Slow first response | "Warming model…" indicator | Show after 1.5s; first-token timeout 30s. |
"""

DEFINITION_OF_DONE_MD = """\
# Definition of Done (per module)

> Apply this checklist to **every** module before declaring it complete. If
> any item is unchecked, the module is NOT done — regardless of how much code
> was written.

## Code

- [ ] All public functions on the port interface are implemented.
- [ ] No code outside the module's adapter files references the underlying
      provider by name. (`grep -r "ollama" --include="*.kt" --include="*.ts"`
      should return only the adapter file.)
- [ ] No `TODO`, `FIXME`, or `XXX` comments outside the module's own
      "future-work" notes.
- [ ] No commented-out code.
- [ ] Public APIs have KDoc / TSDoc comments.

## Tests

- [ ] Unit tests cover happy path + one failure path per public function.
- [ ] At least one integration test exercises the module end-to-end against a
      real adapter (or a documented fake).
- [ ] Tests run in CI and pass.
- [ ] Test coverage isn't a goal in itself but **critical paths must be
      covered** — sync, RLS, AI streaming, auth flow.

## Documentation

- [ ] README in the module folder explaining:
        - Responsibilities (2–3 sentences)
        - Public interface (link to port file)
        - How to swap the adapter (concrete checklist)
- [ ] If the module makes a non-obvious architecture decision, an ADR exists
      in `docs/adr/NNNN-decision.md`.

## Security

- [ ] No secrets in code or in committed files. Use environment variables.
- [ ] If the module touches user data, RLS policies are tested.
- [ ] If the module calls an external API, error messages don't leak provider
      details to end users.

## Modularity (the critical test)

- [ ] The module can be deleted and replaced by a stub implementing the same
      port without compile errors in any other module.
- [ ] If this fails, the boundary is wrong — refactor before declaring done.

## Operational

- [ ] If the module has a scheduled job, it's registered in pg_cron with a
      sensible cadence.
- [ ] If the module emits telemetry, it's wired to Sentry / PostHog with
      no PII in payloads.
- [ ] Manual smoke test passed: I followed the module's README from scratch
      and it worked.

## Hand-back

- [ ] Pull request opened with a concise description: what was built, what
      tests were run, anything the reviewer should look at twice.
- [ ] Branch is up-to-date with main.
- [ ] CI is green.
"""


# =============================================================================
# RENDERING
# =============================================================================

SPEC_TEMPLATE = """\
# {id} — {name}

> **Module ID**: `{id}`
> **Complexity / Recommended AI dev**: {complexity}
> **Estimated duration**: {duration}
> **Depends on**: {depends_on}

---

## Purpose

{purpose}

---

## Public Interface (the port)

```kotlin
{interface}
```

---

## Responsibilities

{responsibilities}

---

## Deliverables

{deliverables}

---

## Relevant Data Model

{data_tables_section}

(Full schema: `reference/data-model.md`)

---

## Relevant API Endpoints

{api_endpoints_section}

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
{ready_prompt}
```

---

## Cross-references

- Master architecture: `../NotesApp_Architecture.docx` → §7.{id_no_zero}
- Getting-started workflow: `../GETTING_STARTED.md`
- Definition of Done: `../reference/definition-of-done.md`
- Data model: `../reference/data-model.md`
- API contract: `../reference/api-contract.md`
"""


def render_list(items):
    if not items:
        return "_(none)_"
    return "\n".join(f"- {x}" for x in items)


def render_spec(m):
    deps = ", ".join(m["depends_on"]) if m["depends_on"] else "(nothing)"

    dt = m["data_tables"]
    if dt:
        dt_section = "\n".join(f"- `{t}`" for t in dt)
    else:
        dt_section = "_(none — this module doesn't directly own DB tables)_"

    ep = m["api_endpoints"]
    if ep:
        ep_section = "\n".join(f"- `{e}`" for e in ep)
    else:
        ep_section = "_(none — this module is internal-facing)_"

    # Strip leading zero from ID for §7 reference (M01 -> 1)
    id_no_zero = m["id"].lstrip("M").lstrip("0") or "0"

    return SPEC_TEMPLATE.format(
        id=m["id"],
        name=m["name"],
        complexity=m["complexity"],
        duration=m["duration"],
        depends_on=deps,
        purpose=m["purpose"],
        interface=m["interface"].rstrip(),
        responsibilities=render_list(m["responsibilities"]),
        deliverables=render_list(m["deliverables"]),
        data_tables_section=dt_section,
        api_endpoints_section=ep_section,
        ready_prompt=m["ready_prompt"].rstrip(),
        id_no_zero=id_no_zero,
    )


# =============================================================================
# README + GETTING_STARTED
# =============================================================================

README_MD = """\
# Evernote-like Notes App — Project Directory

This folder contains the complete technical documentation for building a
personal Evernote replacement with a local AI second brain (Ollama on a
Lenovo Legion desktop, reached via Tailscale).

## Files in this folder

| File | Purpose |
|---|---|
| `NotesApp_Architecture.docx` | The master technical architecture document. Read this first. |
| `GETTING_STARTED.md` | The step-by-step process to go from zero to a working app. Start here if you're new to the project. |
| `build_architecture_doc.py` | Regenerates the .docx if you edit the source. |
| `build_tech_specs.py` | Regenerates everything in `tech-specs/` and `reference/`. |
| `tech-specs/M*.md` | One self-contained brief per module. Hand any of these to an AI developer and they have everything they need. |
| `reference/data-model.md` | Postgres schema reference. |
| `reference/api-contract.md` | REST + Edge Function endpoint reference. |
| `reference/ollama-setup.md` | What an AI dev needs to know about the Ollama setup. |
| `reference/definition-of-done.md` | The checklist every module must satisfy before being declared done. |

## Module index

| Module | Name | Recommended AI dev |
|---|---|---|
| [M01](tech-specs/M01-domain-model.md) | Domain Model & Shared Types | Sonnet |
| [M02](tech-specs/M02-auth.md) | Auth Module | Opus (design) + Sonnet (adapters) |
| [M03](tech-specs/M03-storage-provider.md) | Storage Provider Module | Opus |
| [M04](tech-specs/M04-notes-core.md) | Notes Core Service | Sonnet |
| [M05](tech-specs/M05-sync-engine.md) | Sync Engine (Android) | Opus |
| [M06](tech-specs/M06-editor.md) | Editor Module (Web + Android) | Opus (Android) + Sonnet (Web) |
| [M07](tech-specs/M07-attachment-pipeline.md) | Attachment Pipeline | Sonnet |
| [M08](tech-specs/M08-calendar-integration.md) | Calendar Integration | Sonnet |
| [M09](tech-specs/M09-ai-services.md) | Second-Brain AI Services (Ollama V1) | Opus |
| [M10](tech-specs/M10-embedding-vector.md) | Embedding & Vector Search | Sonnet |
| [M11](tech-specs/M11-notifications.md) | Notification Module | Haiku |
| [M12](tech-specs/M12-android-shell.md) | Android App Shell | Opus + Sonnet |
| [M13](tech-specs/M13-web-shell.md) | Web App Shell | Sonnet |
| [M14](tech-specs/M14-devops.md) | DevOps, Observability & Release | Haiku |
| [M15](tech-specs/M15-ai-settings-routing.md) | AI Settings, Routing & Endpoint Management | Opus + Sonnet + Haiku |

## How to use these specs

1. Read `GETTING_STARTED.md` once.
2. Pick a module from the table above following the dependency order
   (the GETTING_STARTED.md flow lays out the right sequence).
3. Open the module's spec file. The last section is a **Ready-to-Use Prompt**.
4. Copy that prompt into Claude Code (or Cursor, or any AI dev tool).
5. Review what the AI produces against the Definition of Done.
6. Merge when green; move on.

## Regenerating the docs

If you edit any spec source in `build_tech_specs.py`:

```
python build_tech_specs.py
```

If you edit the master architecture in `build_architecture_doc.py`:

```
python build_architecture_doc.py
```

Both scripts are idempotent — they overwrite the outputs cleanly.
"""


GETTING_STARTED_MD = """\
# Getting Started

This is the systematic process to go from zero to a working Evernote-like app
with a local AI second brain. Follow it stage by stage. **Do not skip stages.**

---

## Top-level flow

```
STAGE 0  → Prepare (accounts, tools, Ollama on Legion)        ~5 hours
STAGE 1  → Foundation (repos, auth, notes CRUD)               2–3 weeks
STAGE 2  → Editor & Sync                                      3–4 weeks
STAGE 3  → Attachments                                         1 week
STAGE 4  → Second Brain AI (Ollama)                           3 weeks
STAGE 5  → Advanced AI (briefing, related, memory)            2 weeks
STAGE 6  → Calendar & Reminders                               1–2 weeks
STAGE 7  → Polish & Personal Cutover                           2 weeks
```

Each stage ends with a **gate** — a small, real, end-to-end thing that
works. Don't proceed until the gate passes.

---

## Weekly inner loop

```
Monday morning
  • Pick the next module from the index in README.md
  • Open its spec at tech-specs/MNN-*.md

Brief the AI developer
  • Copy the "Ready-to-Use Prompt" from the bottom of the spec
  • Paste into Claude Code (or Cursor)
  • Add any prerequisite confirmation ("M1 and M2 are done; here's the repo")

AI writes code
  • Review each file
  • Push back on anything unclear ("section X of the spec says do Y; you did Z, redo")

Run it locally
  • Does it actually work end-to-end?
  • Does it pass the Definition of Done checklist?

If yes:
  • Commit, push, PR, merge
  • Move to the next module
If no:
  • Tell the AI what failed; loop back
```

---

## Stage 0 — Prepare (~5 hours, do this week)

### Day 1 — Create accounts (~2 hours)

| # | Task | Where | Cost |
|---|---|---|---|
| 1 | GitHub account | github.com | Free |
| 2 | Supabase account | supabase.com | Free |
| 3 | Anthropic Console (for AI dev assistance during build) | console.anthropic.com | ~$10 to start |
| 4 | Google Cloud Console project | console.cloud.google.com | Free |
| 5 | Vercel account (link to GitHub) | vercel.com | Free |
| 6 | Tailscale account | tailscale.com | Free |

### Day 2 — Install tools on the Legion (~2 hours)

| # | Tool | Source |
|---|---|---|
| 7 | Git for Windows | git-scm.com/download/win |
| 8 | Node.js LTS (20.x) | nodejs.org |
| 9 | pnpm | `npm install -g pnpm` |
| 10 | Android Studio | developer.android.com/studio |
| 11 | VS Code | code.visualstudio.com |
| 12 | Claude Code | claude.com/claude-code |
| 13 | Supabase CLI | `npm install -g supabase` |

### Day 3 — Get Ollama running (~1 hour)

Follow `../NotesApp_Architecture.docx` Section 17 step by step:

1. Install Ollama on the Legion.
2. `ollama pull llama3.1:8b llama3.2:3b nomic-embed-text`
3. Set the env vars (`OLLAMA_HOST`, `OLLAMA_KEEP_ALIVE=30m`, etc.).
4. Install Tailscale on the Legion + Android phone + laptop.
5. `tailscale funnel 11434` on the Legion.
6. Run the §17.8 validation checklist (6 commands).

If all 6 pass, your AI infrastructure is done. You won't touch it again.

### Day 4 — Empty project skeleton (~30 minutes)

```
1. On GitHub, create a private repo: notes-app
2. Clone locally: git clone https://github.com/<you>/notes-app.git
3. Open in VS Code; open a terminal; run: claude
4. First prompt to Claude Code:

   "Read the architecture at C:\\Users\\vgaka\\Evernotelike\\NotesApp_Architecture.docx
    and the README at C:\\Users\\vgaka\\Evernotelike\\README.md.
    Then scaffold the repo per §7: a pnpm monorepo with packages for each
    module (M1–M15), empty stubs only. No implementation yet. Add a root
    README and a basic .gitignore."

5. Review what Claude creates; commit; push.
```

---

## Stage 1 — Foundation (Weeks 1–3)

| Week | Module | Spec | AI dev |
|---|---|---|---|
| 1 | M14 DevOps basics | tech-specs/M14-devops.md | Haiku |
| 1 | M1 Domain Model | tech-specs/M01-domain-model.md | Sonnet |
| 2 | M2 Auth | tech-specs/M02-auth.md | Opus + Sonnet |
| 2–3 | M4 Notes Core | tech-specs/M04-notes-core.md | Sonnet |
| 3 | Wire-up | (small task to integrate M1+M2+M4 into one demo screen) | Sonnet |

**Gate**: You can sign in with Google on web AND Android, create a plain-text
note, and see it on the other client. Done? Proceed to Stage 2.

---

## Stage 2 — Editor & Sync (Weeks 4–7)

| Week | Module | Spec | AI dev |
|---|---|---|---|
| 4–5 | M6 Editor (web) | tech-specs/M06-editor.md | Sonnet |
| 4–5 | M6 Editor (Android) | tech-specs/M06-editor.md | Opus |
| 5–7 | M5 Sync Engine | tech-specs/M05-sync-engine.md | Opus |

**Gate**: Edit a note offline on Android. Re-open web later. The note is
there with all edits. Make conflicting edits on both clients while offline;
the system creates a conflict note instead of silently dropping data.

---

## Stage 3 — Attachments (Week 8)

| Week | Module | Spec | AI dev |
|---|---|---|---|
| 8 | M3 Storage Provider (Google Drive) | tech-specs/M03-storage-provider.md | Opus |
| 8 | M7 Attachment Pipeline | tech-specs/M07-attachment-pipeline.md | Sonnet |

**Gate**: Attach a PDF on web. Open it on Android. Delete it; re-open web; gone.

---

## Stage 4 — Second-Brain AI (Weeks 9–11)

| Week | Module | Spec | AI dev |
|---|---|---|---|
| 9 | M10 Embedding & Vector Search | tech-specs/M10-embedding-vector.md | Sonnet |
| 9–11 | M9 AI Services (Ollama adapter, chat, summarize, tag, title) | tech-specs/M09-ai-services.md | Opus |
| 10–11 | M15 AI Settings & Routing | tech-specs/M15-ai-settings-routing.md | Opus + Sonnet |

**Gate**: Ask the AI "what did I write about <topic>?" — get a cited answer
that links to actual notes. Switch the chat model from llama3.1:8b to
qwen2.5:7b in Settings; chat keeps working.

---

## Stage 5 — Advanced AI (Weeks 12–13)

(Extensions to M9 — no new module IDs)

- Related-notes panel in the editor (vector only)
- Daily briefing job (pg_cron)
- AI memory extraction (long-term facts)
- Cost/usage dashboard in Settings

**Gate**: You wake up Tuesday and your phone has a Markdown briefing of what
you wrote Monday and what's on today's calendar.

---

## Stage 6 — Calendar & Reminders (Week 14)

| Module | Spec | AI dev |
|---|---|---|
| M8 Calendar Integration | tech-specs/M08-calendar-integration.md | Sonnet |
| M11 Notifications | tech-specs/M11-notifications.md | Haiku |

**Gate**: Today view shows today's Calendar events + notes due today, merged
and sorted by time. From a note, you can create a Calendar event.

---

## Stage 7 — Polish & Personal Cutover (Week 15)

- Export your Evernote .enex; write a one-off importer (or hand to Sonnet).
- Use the app exclusively for a week. Note every annoyance.
- Fix the top 10 annoyances.
- Cancel Evernote.

---

## The single most important rule

**You are not coding this. You are directing AI to code this.** Your real job:

1. Read the architecture doc and module specs carefully.
2. Paste the right module's "Ready-to-Use Prompt" into Claude Code.
3. Review what comes back; push back when wrong.
4. Test the gates at the end of each stage.

If you treat the specs as the contract, this works. If you treat them as
optional reading, the AI will hallucinate plausible-but-wrong code and you'll
waste weeks.

---

## When to stop and ask for help

- A module is over schedule by more than 50%. Re-scope or split.
- The AI keeps producing code that fails its own tests. The spec is probably
  ambiguous — rewrite the spec, not the prompt.
- A gate's success condition is fuzzy. Stop and make it concrete before
  proceeding.
"""


# =============================================================================
# WRITE EVERYTHING
# =============================================================================

# Per-module specs
for m in MODULES:
    filename = f"{m['id']}-{m['slug']}.md"
    path = os.path.join(SPECS_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        f.write(render_spec(m))
    print(f"  wrote {path}")

# Reference docs
for name, content in [
    ("data-model.md", DATA_MODEL_MD),
    ("api-contract.md", API_CONTRACT_MD),
    ("ollama-setup.md", OLLAMA_SETUP_MD),
    ("definition-of-done.md", DEFINITION_OF_DONE_MD),
]:
    path = os.path.join(REF_DIR, name)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"  wrote {path}")

# Top-level
for name, content in [
    ("README.md", README_MD),
    ("GETTING_STARTED.md", GETTING_STARTED_MD),
]:
    path = os.path.join(ROOT, name)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"  wrote {path}")

print("\nDONE.")
print(f"  {len(MODULES)} module specs")
print(f"  4 reference docs")
print(f"  2 top-level guides (README, GETTING_STARTED)")
