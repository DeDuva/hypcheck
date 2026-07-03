# Hypcheck

Establish a product hypothesis, then track its product-market-fit signal over time. Hypcheck re-tests the market on a schedule (weekly by default), scores PMF 0–100 against your chosen signal metrics, writes a research report per run, and surfaces insights — some of which propose revisions you can fold back into the hypothesis. Version changes are annotated on the time-series chart so you can see whether a reframe bent the curve.

## What's inside

- **Dashboard** — every hypcheck with current score, trend band, sparkline, delta, cadence, and pending-proposal badges.
- **Creation wizard** — write the hypothesis, get an AI critique + sharper framing, pick weighted signal metrics, set cadence (weekly default), research depth, and a competitive watchlist.
- **Hypcheck overview** — interactive PMF time-series (hover a point for the run's exec summary, click to pin it and open the full report), hypothesis version history with word-level diffs, insights feed with **Accept / Dismiss** on proposed revisions, run history, and metric breakdown.
- **Full reports** — markdown research report per run.
- **Scheduled runs** — `/api/cron` + Vercel Cron re-tests due hypchecks automatically.

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

Open http://localhost:3000. No configuration needed — the local SQLite database is created at `data/hypcheck.db` and demo data is seeded on first load.

To enable live research, copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY`.

## Deploy to Vercel

1. Push the repo and import it into Vercel.
2. Create a [Turso](https://turso.tech) database (SQLite doesn't persist on serverless) and set:
   - `TURSO_DATABASE_URL` — `libsql://<db>-<org>.turso.io`
   - `TURSO_AUTH_TOKEN`
3. Optionally set `ANTHROPIC_API_KEY` (live research) and `CRON_SECRET` (protects `/api/cron`; Vercel sends it automatically as a Bearer token).
4. Deploy. `vercel.json` schedules the cron daily at 09:00 UTC; each hit runs every hypcheck whose `nextRunAt` has passed, so per-hypcheck cadence (daily/weekly/biweekly/monthly) is respected.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS v4 · Recharts · libSQL (local file / Turso) · Anthropic SDK (`claude-sonnet-4-6` research + `claude-haiku-4-5` extraction, web search + structured outputs).
