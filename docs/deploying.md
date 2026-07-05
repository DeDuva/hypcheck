# Deploying safely

How changes reach production without downtime, and how the access-control
phases roll out. Production: https://hypcheck-xi.vercel.app (deploys from
`main`).

## The lanes

| Lane | Branch | URL | Database |
|---|---|---|---|
| Local | any | localhost:3000 | `data/hypcheck.db` (file) |
| Staging | `staging` | stable branch alias `hypcheck-git-staging-<scope>.vercel.app` | `hypcheck-staging` (Turso) |
| Production | `main` | hypcheck-xi.vercel.app | production Turso DB |

Flow per change: feature branch → PR (auto preview deploy: build + review)
→ merge to `staging` → click through the real flows on the staging URL →
merge to `main`.

Per-PR preview URLs are ephemeral, so full Google sign-in only works on the
staging alias (OAuth requires exact, pre-registered redirect URIs). PR
previews are for build/UI review; staging is where auth flows get exercised.

## One-time setup (dashboard side)

1. **Turso**: create `hypcheck-staging`; optionally load a prod dump for
   realistic data (`turso db shell <prod> .dump | turso db shell hypcheck-staging`).
2. **Google Cloud** ([credentials console](https://console.cloud.google.com/apis/credentials)):
   one OAuth client with three authorized redirect URIs:
   - `https://hypcheck-xi.vercel.app/api/auth/callback/google`
   - `https://hypcheck-git-staging-<scope>.vercel.app/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google`
3. **Vercel → Settings → Environment Variables**, scoped to **Preview**:
   - `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` → the staging database
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
   - `BETTER_AUTH_SECRET` (generate separately from prod: `openssl rand -hex 32`)
   - `BETTER_AUTH_URL` → the staging alias URL
   - `ALLOWED_EMAILS` → testers
   - `HYPCHECK_DEMO=1` if you want demo data
   - **No `ANTHROPIC_API_KEY`** — staging uses the free simulated engine.
     Auth/roles work never needs live research to test.
4. Vercel cron only fires on production, so staging accrues no scheduled
   spend. Test the cron path manually:
   `curl -H "Authorization: Bearer $CRON_SECRET" https://<staging-alias>/api/cron`
5. Preview deployments sit behind Vercel Deployment Protection by default
   (a Vercel login screen). Fine solo; disable it or share a bypass link if
   non-team testers need staging.

## Cutting production over to auth (phase 1, PR #19)

PR #19 is **fail-closed**: merged without env vars, production locks everyone
out (including you) rather than staying open. Sequence so there's no window
where prod is either open or bricked:

1. Set **Production**-scoped env vars first — the code currently on `main`
   ignores them, so this is a no-op until the merge:
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`,
   `ALLOWED_EMAILS` (and `BETTER_AUTH_URL` if on a custom domain).
2. Verify sign-in end-to-end on staging.
3. Merge. Production comes up with the wall on and your email allowed.
4. Sign in and spot-check. If anything is off: Vercel → Deployments →
   promote the previous deployment (instant). The new auth tables sit unused
   under the old code — harmless.

## Rules that keep every later phase zero-downtime

- **Additive-only migrations.** `CREATE TABLE IF NOT EXISTS` and
  `ADD COLUMN` only (the existing `db.ts` pattern). Never rename or drop
  while old code might still run — this is what makes Vercel's instant
  rollback safe, because rolling back code never requires rolling back the
  database.
- **Backward-compatible access defaults.** A deploy must never strip the
  people already using the app: when roles land (phase 2), everyone on
  `ALLOWED_EMAILS` bootstraps as admin; only newly invited users start at
  least-privilege.
- **Shadow mode before enforcement.** New permission checks ship behind
  `HYPCHECK_ENFORCE_ROLES=log` first: would-be denials are logged but
  allowed. Watch prod logs for a few days, confirm nothing legitimate would
  break, then flip to `enforce`. Deny-by-default authorization is exactly
  the kind of change you want to observe before you trust it.
- **Cost-affecting code paths get tested simulated.** Anything touching run
  scheduling, cadence, or budgets is verified on staging (simulated engine,
  no API key) before it can spend a token in prod.
