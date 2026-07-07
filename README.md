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

## Signal quality

Runs enforce an evidence-freshness discipline — phase 1 of the [signal-quality plan](docs/signal-quality-plan.md):

- Each run defines a **freshness window** (the period since the previous run); only evidence published inside it may move a metric's score, and every cited source carries its publication date.
- A metric with no fresh evidence **carries forward** its prior score, flagged in the report, in the metric breakdown, and as hollow points on the PMF chart. "Nothing changed" is a first-class finding, not a gap.
- The PMF score is computed **deterministically in code** as the freshness-gated weighted average of metric scores (the model's own holistic number is only logged as a sanity check), and confidence drops mechanically as fresh coverage drops.
- Every run after the first opens with a **"What changed since <date>"** delta summary, grounded in a structured digest of the previous run (per-metric scores, analyst stance, open insights).

Metrics are **external-only** (phase 2): every metric must be assessable purely from public web sources (press releases, funding news, launches, pricing pages, job postings, search/community trends) — nothing that needs internal data like revenue, deals, or customer calls. Each metric carries `signals` (the public evidence a run looks for) and `direction` (what up vs. down looks like), the AI refinement validates candidates against this bar (rejects are shown with reasons, never dropped silently), and the wizard warns when a hand-written metric looks internal.

Hypothesis authoring is a **grounded studio** (phase 3): "Refine with AI" now researches the current market via web search before critiquing, scores the draft against a five-check rubric (named segment · falsifiable · externally observable · time-bound · differentiated), and may ask up to two clarifying questions that power one refine-again round. The critique + rubric persist with the hypcheck (shown on Settings). Watchlist entries carry a *reason* ("closest incumbent for the same JTBD"), which runs use to target their checks — and runs can propose watchlist adds/removes, accepted or dismissed from the insights feed like hypothesis revisions.

Each run is a **stress test, not a survey** (phase 4): the run persona is the strategy advisor who authored the hypothesis, honestly weighing this period's evidence. Every report names the single strongest piece of fresh evidence **for** and **against** the hypothesis (a compact two-column callout), and makes an explicit revision call — either exactly one insight carries a complete proposed revision, or the summary states why the current framing still stands.

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

### Roles and per-hypcheck access (phase 2)

Every user has a global role — `admin`, `creator`, or `member` — plus, per hypcheck, an optional `editor`/`viewer` grant in `hypcheck_access`. Effective access (`src/lib/authz.ts#effectiveHypcheckRole`):

- **admin** — full access to every hypcheck.
- **owner** — the user who created the hypcheck (`hypchecks.owner_id`).
- **editor** / **viewer** — an explicit grant in `hypcheck_access`.
- Hypchecks created before phase 2 have no owner and are grandfathered as shared/editable, so existing data doesn't change behavior.

Grant matrix: only an owner/admin can grant `editor`; an `editor` can grant `viewer`. `member`s cannot create hypchecks. The sharing UI (phase 3) isn't built yet — grants are made via `grantHypcheckAccessAction`/`revokeHypcheckAccessAction` (`src/lib/actions.ts`).

New signups are bootstrapped as `member` — least-privilege, no ability to create hypchecks — and get exactly what their per-hypcheck grant or pending invitation says. There's no admin console yet, so promoting someone to `creator`/`admin` is a direct SQL update against the `user` table.

Enforcement supports a **shadow mode**: denials are logged (`authz.hypcheck.denied` / `authz.create.denied`) but not blocked unless `HYPCHECK_ENFORCE_ROLES=enforce` is set. Production has `HYPCHECK_ENFORCE_ROLES=enforce` set, so denials are real blocks there.

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
