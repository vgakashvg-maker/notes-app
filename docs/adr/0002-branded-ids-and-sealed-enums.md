# ADR 0002 — Branded ID types and sealed-class provider enums

Date: 2026-05-20
Status: Accepted

## Context

M01 introduces the cross-cutting domain types every other module imports.
Two related design choices had outsized downstream impact and so warranted a
recorded decision:

1. How to model entity IDs (Note, User, Tag, …) so that swapping two UUIDs
   of different kinds is caught at compile time, not at runtime.
2. How to model the closed-but-extensible provider enumerations
   (`StorageProviderId`, `CalendarProviderId`, `AIProviderId`, plus the
   richer `SyncStatus`) so that adding a new variant later is a
   non-breaking change in TypeScript and forces an exhaustive `when` in
   Kotlin.

## Decision

### IDs

- **TypeScript**: each ID type is a branded string —
  `type NoteId = string & { readonly __brand: "NoteId" }`. The brand exists
  only in the type system; runtime values are plain strings. A
  same-named factory function (e.g. `NoteId("...")`) validates the raw
  input (non-empty UUID v1–v5) and returns the branded value. Passing a
  `UserId` where `NoteId` is required is a compile error.
- **Kotlin**: each ID type is a `@JvmInline value class` wrapping a `String`,
  with the same UUID validation in its `init` block. Erased to `String` at
  runtime — no boxing.

This means we get the typed-IDs property in both languages at zero runtime
cost.

### Provider enums and `SyncStatus`

- **TypeScript**: string-literal union types
  (`type StorageProviderId = "GOOGLE_DRIVE" | "ONEDRIVE"`) plus a
  same-named `*Ids` const array for runtime iteration / validation.
  `SyncStatus` is a tagged union with a smart-constructor namespace
  (`SyncStatus.idle()`, `.syncing()`, `.error()`, `.conflict()`).
- **Kotlin**: `sealed class` hierarchies with `object` variants for
  enum-like cases and `data class` variants where payloads are needed.
  Each variant carries a `wireName: String` so cross-platform serialization
  agrees on the same canonical token. A `companion object.fromWireName()`
  performs the inverse lookup with a descriptive error for unknown values.

## Consequences

- Cross-platform serialization is straightforward: wire-level enum names
  match between TS literals and Kotlin `wireName` strings, and ID raw
  strings are identical in both languages.
- Adding a new provider in M15 is two surgical edits (one per language) and
  any non-exhaustive `when` (Kotlin) or check on `*Ids` (TypeScript) will
  be highlighted at compile / lint time.
- ID misuse (e.g. passing `UserId` where `NoteId` is expected) is caught at
  compile time in both languages.

## Alternatives considered

- **TS: nominal types via opaque classes**: adds runtime cost and prevents
  trivial JSON serialization.
- **Kotlin: regular `enum class`**: cannot carry per-variant payloads
  (needed for `SyncStatus.Syncing`, `.Error`, `.Conflict`).
- **Skipping validation in constructors**: postpones the failure to whoever
  finally tries to use the value. We pay an `init`/factory check upfront so
  invalid data can never enter the domain layer.
