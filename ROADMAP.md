# hypcheck — Roadmap

**This file is the repo's status ledger.** A PR that completes, starts, pauses, or
supersedes a milestone updates it in the same PR. How to run and deploy lives in
[`README.md`](README.md) and [`docs/deploying.md`](docs/deploying.md); the signal-quality
design in [`docs/signal-quality-plan.md`](docs/signal-quality-plan.md).

## Mission

Track a product hypothesis's product-market-fit signal over time: scheduled Claude +
web-search research scores it 0–100 against chosen signal metrics, writes a report per
run, and proposes revisions to the hypothesis.

## Where this fits

One of the maintained repos in the DeDuva portfolio (registry: `PORTFOLIO.md` in the
private `DeDuva/duva-lab-tpm`). It is the portfolio's only unattended spender of Anthropic
tokens besides `hamsa-analyst`'s weekly report.

## Milestone ledger

| Milestone | Status | Evidence / detail |
|---|---|---|
| App, wizard, reports, scheduled runs, run-latency work | complete 2026-07-05 | #1–#18 |
| Invite-only access, roles, sharing, admin console | complete 2026-07-09 | #19–#25, #35–#47; `HYPCHECK_ENFORCE_ROLES=enforce` in production |
| Signal quality, phases 1–4 | complete 2026-07-07 | plan #26; phases #27, #29, #31, #33 |
| API-call profiling | complete 2026-07-11 | #48–#51 |
| Model selection and tier ladder | complete 2026-07-11 | #52–#56 |
| UX redesign, About page | complete 2026-07-13 | #57–#63 |
| CI (lint, typecheck, test, build on every PR) | complete 2026-11-15 | #64 |
| **Research on GitHub Actions — runs on Vercel Hobby** | **complete 2026-11-15, one check open** | #65. Vercel Pro was cancelled; Hobby rejects `maxDuration` > 300 (`invalid_max_duration`), so research moved to `.github/workflows/research.yml`, dispatched by the cron and "Run now". Verified on production: CI green; Hobby deploy Ready; a dispatched run completed **live** end to end (run `50f22f4d90be435c`, 91 s, shown in the UI). **Open: a cron-triggered run** — see Now |

## Now / Next / Later

- **Now — stopped here 2026-11-15.** The Actions research runner is live in production.
  One verification is open: a run started by **Vercel's own cron**. The cron is registered
  and enabled on the new deployment (`/api/cron`, `0 9 * * *`; Hobby fires it some time
  in 09:00–09:59 UTC). It only dispatches hypchecks that are *due*, so the first
  cron-triggered run is whichever day the next one comes due. **Next step:** at the next
  wake-up, check Actions → Research for a run whose title is a hypcheck id and that
  started 09:xx UTC, and that the run shows in the UI. If none appeared on a day a
  hypcheck was due, read Vercel's cron log for `/api/cron` — it returns 502 when a
  dispatch fails.
- **Expiring credentials — renew before these dates or runs stop silently:**
  - GitHub fine-grained token `HYPCHECK_DISPATCH_TOKEN` (Vercel, Production) — expires
    **2027-11-14**. Without it the cron and "Run now" can't dispatch.
  - Anthropic key `hypcheck` (GitHub Actions secret `ANTHROPIC_API_KEY`, and Vercel
    Production `ANTHROPIC_API_KEY`) — expires **2027-11-22**. Without it runs fall back
    to the simulated engine (flagged as a warning in the Actions log).
- **Next:** nothing scheduled. `staging` is behind `main` (it predates #64/#65); merge
  `main` into it before the next change that goes through the staging lane. Research
  can't run on staging any more (the dispatch token is Production-only by design —
  `docs/deploying.md` step 4 says how to exercise the engine against staging locally).
- **Later:** nothing recorded.
