# @notes-app/shared

Shared TypeScript primitives consumed by `@notes-app/web` and (eventually) any
Node-side jobs. Owned by M01 once that module lands; M14 only seeds the
package so CI has something to lint, type-check, and test.

## Responsibilities

- Plain TypeScript helpers that have no runtime dependencies on Next.js,
  Supabase, or Ollama.

## Public interface

- `src/index.ts` — re-exports every public symbol.

## Swapping the adapter

This package has no provider adapter — it is the port layer. To replace it,
publish a package with the same name and `exports` shape, then update
`pnpm-workspace.yaml`.
