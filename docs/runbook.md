# notes-app runbook

Short, concrete commands. Anything that requires a UI is captured by an
explicit step-by-step.

---

## Environments

| Name | Supabase project | Vercel target | Sentry env | Branch / trigger |
|------|------------------|---------------|------------|------------------|
| dev | local supabase | localhost | `development` | local workstation |
| staging | `notes-staging` | Vercel preview | `staging` | non-`main` branches |
| prod | `notes-prod` | Vercel production | `production` | push to `main`, tag `db-*` for schema |

All three Supabase projects are created via the Supabase dashboard (Settings →
General → New project). Store their refs/passwords as GitHub secrets:
`SUPABASE_PROJECT_REF_STAGING`, `SUPABASE_PROJECT_REF_PROD`,
`SUPABASE_DB_PASSWORD_STAGING`, `SUPABASE_DB_PASSWORD_PROD`.

---

## Rolling back a web deploy

```bash
# Find the previous good deployment.
vercel ls notes-app --token "$VERCEL_TOKEN" --scope "$VERCEL_ORG_ID"

# Promote it to production.
vercel rollback <previous-deployment-url> --token "$VERCEL_TOKEN"
```

If `vercel rollback` is unavailable for the plan, re-deploy the previous
commit instead:

```bash
git revert <bad-sha>
git push origin main   # triggers deploy-web.yml
```

---

## Rolling back an Android release

`build-apk.yml` always promotes to Play **internal** track. To halt a rollout
or roll back to a prior build:

1. Open Play Console → notes-app → Release → Internal testing.
2. On the latest release row click `…` → **Halt rollout**.
3. To re-promote a previous good build: open that build's release row →
   **Create new release using this build** → submit.

If the bad AAB has already been promoted to production:

1. Production → Releases overview → select the previous good release.
2. **Create new release using existing AAB** → Roll out to 100%.

---

## Rotating the Anthropic API key

1. https://console.anthropic.com → Settings → API Keys → **Create key**.
2. GitHub repo → Settings → Secrets and variables → Actions →
   `ANTHROPIC_API_KEY` → **Update secret** with the new value.
3. Vercel → notes-app project → Settings → Environment Variables →
   `ANTHROPIC_API_KEY` → set the new value for all environments → **Save**.
4. Trigger a rebuild: `git commit --allow-empty -m "rotate anthropic key" && git push`.
5. Revoke the old key on console.anthropic.com.

(In V1 the runtime is Ollama only, so this key rotation only matters for
build-time AI dev assistance until M15 introduces cloud routing.)

---

## Rotating the Google OAuth client secret

1. https://console.cloud.google.com → APIs & Services → Credentials.
2. Open the **notes-app** OAuth 2.0 client → **Reset Secret**.
3. Update the new value in:
   - GitHub Encrypted Secrets: `GOOGLE_CLIENT_SECRET`
   - Vercel env vars: `GOOGLE_CLIENT_SECRET` (all environments)
   - Supabase Auth: Authentication → Providers → Google → Client secret
4. Redeploy: `git commit --allow-empty -m "rotate google secret" && git push`.
5. Once you have verified sign-in still works, click **Confirm** on the
   credentials page to invalidate the previous secret.

---

## Rotating the Supabase service-role key

The service-role key cannot be rotated independently — Supabase regenerates it
along with the JWT secret.

1. Supabase dashboard → Project Settings → API → **Reset JWT secret**.
2. Copy the new `service_role` and `anon` keys.
3. Update in GitHub Encrypted Secrets, Vercel env vars, and any Edge Function
   secrets: `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
4. Redeploy web; reissue any Edge Functions: `supabase functions deploy --no-verify-jwt`.
5. All active user sessions are invalidated; clients re-authenticate.

---

## Creating a new user in V1

In V1 sign-up is locked (single-user). To add a user manually, run as
service-role against the target Supabase project (SQL editor):

```sql
-- 1. Invite via Auth (sends a magic-link email).
select auth.email_invite('person@example.com');

-- OR 2. Create directly without email (dev/staging only).
insert into auth.users (id, email, encrypted_password, email_confirmed_at)
values (
  gen_random_uuid(),
  'person@example.com',
  crypt('temporary-password', gen_salt('bf')),
  now()
);

-- 3. Seed the users_profile row (M01 will create the table).
insert into users_profile (user_id, display_name, analytics_optout)
values ((select id from auth.users where email = 'person@example.com'), 'Person', false);
```

The `users_profile` table and exact column names are owned by M01 — update
this snippet once that module lands.

---

## Adding a new GitHub secret

Repo Settings → Secrets and variables → Actions → **New repository secret**.
Re-run the relevant workflow:

```bash
gh workflow run deploy-web.yml
gh workflow run db-migrate.yml -f target=staging
```

---

## AI infrastructure (Ollama on the home box)

`OLLAMA_ENDPOINT_URL` points at the Tailscale Funnel URL of the Legion. To
restart or change models:

```powershell
# On the Legion (PowerShell):
ollama pull qwen2.5:7b llama3.2:3b nomic-embed-text
$env:OLLAMA_HOST = "0.0.0.0:11434"
$env:OLLAMA_KEEP_ALIVE = "30m"
ollama serve
tailscale funnel 11434
```

Validation: see `../NotesApp_Architecture.docx` §17.8.
