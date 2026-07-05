# Hypcheck

Establish a product hypothesis, then track its product-market-fit signal over time. Hypcheck re-tests the market on a schedule (weekly by default), scores PMF 0–100 against your chosen signal metrics, writes a research report per run, and surfaces insights — some of which propose revisions you can fold back into the hypothesis. Version changes are annotated on the time-series chart so you can see whether a reframe bent the curve.

## What's inside

- **Dashboard** — every hypcheck with current score, trend band, sparkline, delta, cadence, and pending-proposal badges.
- **Creation wizard** — write the hypothesis, get an AI critique + sharper framing, pick weighted signal metrics, set cadence (weekly default), research depth, and a competitive watchlist.
- **Hypcheck overview** — interactive PMF time-series (hover a point for the run's exec summary, click to pin it and open the full report), hypothesis version history with word-level diffs, insights feed with **Accept / Dismiss** on proposed revisions, run history, and metric breakdown.
- **Full reports** — markdown research report per run.
- **Scheduled runs** — `/api/cron` + Vercel Cron re-tests due hypchecks automatically.
- **Invite-only access** — Google sign-in (Better Auth); only emails on the `ALLOWED_EMAILS` list get in. Every page and server action is gated server-side.

## Two engines

| Mode | When | What happens |
|---|---|---|
| **Live research** | `ANTHROPIC_API_KEY` set | Each run performs web research via the Claude API (web search tool), scores the metrics, writes the report, and extracts structured insights. |
| **Simulated** | no key | A deterministic demo engine generates coherent runs so the product works out of the box. Every run is labeled "Simulated" vs "Live research" in the UI. |

A fresh database is seeded with two demo hypchecks (~4 months of weekly history, a mid-timeline hypothesis revision, and pending insight proposals). Disable with `HYPCHECK_DEMO=0`.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. No configuration needed — the local SQLite database is created at `data/hypcheck.db` and demo data is seeded on first load. Without Google OAuth config, local dev runs **open** (no sign-in wall, a synthetic "Local dev" user); set `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` in `.env.local` to exercise the real sign-in flow.

To enable live research, copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY`.

## Access control

Production is **invite-only by construction**:

1. Create a Google OAuth client ([console](https://console.cloud.google.com/apis/credentials)) with redirect URI `https://<your-domain>/api/auth/callback/google`, and set `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`.
2. Set `BETTER_AUTH_SECRET` (`openssl rand -hex 32`).
3. Set `ALLOWED_EMAILS` to the comma-separated invite list. Signups from any other email are rejected, and removing an email revokes access on the next request. An empty list in production means nobody can sign in.

Auth data (users, sessions) lives in the same libSQL/Turso database as everything else. The middleware redirect is a convenience; the actual enforcement is `requireUser()` in every page and server action (`src/lib/authz.ts`). `/api/health` returns a bare liveness ping unless the caller is signed in; `/api/cron` keeps its own `CRON_SECRET`.

Per-hypcheck roles (admin / editor / creator / viewer) are the next phase — today every signed-in user has full access.

## Deploy to Vercel

1. Push the repo and import it into Vercel.
2. Create a [Turso](https://turso.tech) database (SQLite doesn't persist on serverless) and set:
   - `TURSO_DATABASE_URL` — `libsql://<db>-<org>.turso.io`
   - `TURSO_AUTH_TOKEN`
3. Set the access-control env vars (see **Access control** above): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, `ALLOWED_EMAILS`.
4. Optionally set `ANTHROPIC_API_KEY` (live research), `CRON_SECRET` (protects `/api/cron`; Vercel sends it automatically as a Bearer token), and `HYPCHECK_DEMO=1` if you want the demo data seeded (in production it's opt-in).
5. Deploy. `vercel.json` schedules the cron daily at 09:00 UTC; each hit runs every hypcheck whose `nextRunAt` has passed, so per-hypcheck cadence (daily/weekly/biweekly/monthly) is respected.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS v4 · Recharts · libSQL (local file / Turso) · Anthropic SDK (`claude-sonnet-4-6` research + `claude-haiku-4-5` extraction, web search + structured outputs).
