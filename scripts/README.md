# scripts

One-off operational scripts. Run with `pnpm tsx`.

## seed.ts

Seeds a Supabase project with 5 notebooks, 5 tags, 50 notes (some pinned),
and 2 tags per note. Idempotent — re-running upserts on stable UUIDs.

```powershell
$env:SUPABASE_URL = "https://<ref>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service role key>"
$env:SEED_USER_ID = "<user uuid from the users_profile row>"
pnpm tsx scripts/seed.ts
```

The script uses the service role key, so RLS is bypassed; `owner_id` is set
explicitly on every row.
