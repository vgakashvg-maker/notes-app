# Supabase

SQL migrations and Edge Functions.

## Layout

```
supabase/
├── migrations/    # SQL migrations applied via `supabase db push --linked`
└── functions/     # Deno Edge Functions deployed via `supabase functions deploy`
```

## Workflow

```powershell
# One-time, after creating the project in the dashboard:
supabase login
supabase link --project-ref <ref>

# Apply local changes to staging or prod:
supabase db push --linked
supabase functions deploy auth/refresh-provider-token --no-verify-jwt
```

CI does the same on `db-*` and `v*` tags via `.github/workflows/db-migrate.yml`.

## Edge Function authoring

Each function:

1. Lives at `supabase/functions/<group>/<name>/index.ts`.
2. Is a thin Deno wrapper around pure logic in a workspace package
   (e.g. `packages/auth/src/refresh-provider-token.ts`). That keeps the
   business logic unit-testable under Vitest.
3. Reads its config from `Deno.env` — see `.env.example` for the full list.
