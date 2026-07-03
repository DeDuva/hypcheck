import { getDb, newId } from "./db";
import { buildReportMd } from "./engine/report";
import { logger } from "./logger";
import type { Cadence, Depth, InsightDirection, MetricScore } from "./types";

interface SeedInsight {
  title: string;
  body: string;
  direction: InsightDirection;
  proposedRevision?: string;
  status?: "new" | "accepted" | "dismissed";
}

interface SeedWeek {
  weeksAgo: number;
  score: number;
  summary: string;
  insights?: SeedInsight[];
  /** Starting this week, runs use this hypothesis version (1-based index into versions). */
  version?: number;
}

interface SeedHypcheck {
  name: string;
  cadence: Cadence;
  depth: Depth;
  watchlist: string[];
  versions: Array<{ statement: string; changeSummary?: string; source: "initial" | "insight" }>;
  metrics: Array<{ name: string; description: string; weight: number }>;
  weeks: SeedWeek[];
}

const METRIC_OFFSETS = [6, -3, 2, -8, 4];
const METRIC_NOTE_POOL = [
  "Public signals this period (search interest, community threads, job postings) support this reading.",
  "Evidence is mixed but consistent with the prior period; no inflection detected.",
  "A soft reading this period — fewer unprompted mentions of the target pain point.",
  "Practitioner discussion directly referencing this workflow strengthened the signal.",
];
const WATCH_NOTE_POOL = [
  "no significant announcements this period; positioning unchanged.",
  "incremental feature activity adjacent to this space — monitoring for direct overlap.",
  "marketing push around a neighboring use case; not yet a direct threat.",
  "hiring and roadmap signals suggest continued investment in the category.",
];

const MOMENTUM_V1 =
  "Enterprise B2B sales teams will pay for an AI copilot that automatically assembles meeting-prep briefs — account history, stakeholder map, open threads, and suggested talking points — because AEs waste 3-5 hours a week on manual prep scattered across CRM, email, and call notes.";
const MOMENTUM_V2 =
  "Enterprise AEs running complex, multi-stakeholder deals (>$50K ACV) will pay for an AI copilot that assembles meeting-prep briefs from CRM, email, and call history. Mid-market reps prep too little for briefs to matter; the wedge is enterprise sales teams where prep quality visibly moves win rates.";

const LOOPWORK_V1 =
  "Distributed engineering teams (10-50 engineers) will replace daily standup meetings with async video updates, because standups across time zones burn focus hours — and team leads will pay per-seat for a tool that makes async updates as engaging as live ones.";
const LOOPWORK_PIVOT =
  "Distributed engineering teams don't want async video — they want the standup gone. Team leads will pay for an AI digest that auto-generates each engineer's daily update from commits, PRs, and ticket activity, replacing the standup with a two-minute read.";

const SEEDS: SeedHypcheck[] = [
  {
    name: "Momentum — AI meeting-prep copilot for sales",
    cadence: "weekly",
    depth: "standard",
    watchlist: ["Gong", "Clari", "Salesforce Einstein Copilot", "Attention"],
    versions: [
      { statement: MOMENTUM_V1, source: "initial" },
      {
        statement: MOMENTUM_V2,
        changeSummary:
          "Narrowed the target from all B2B sales teams to enterprise AEs on complex deals, after consecutive weak willingness-to-pay readings traced to mid-market reps who don't prep enough to value briefs.",
        source: "insight",
      },
    ],
    metrics: [
      { name: "Demand signal", description: "Search volume, community discussion, and inbound interest in meeting-prep pain.", weight: 5 },
      { name: "Willingness to pay", description: "Budget evidence: sales-tool spend, procurement chatter, pricing of adjacent tools.", weight: 4 },
      { name: "Competitive whitespace", description: "How directly Gong/Clari/Einstein cover automated meeting-prep briefs.", weight: 4 },
      { name: "Adoption friction", description: "Integration burden (CRM, email, calendar) and rep behavior change required.", weight: 3 },
      { name: "Market timing", description: "AI-in-sales category momentum and enterprise appetite for copilots.", weight: 3 },
    ],
    weeks: [
      { weeksAgo: 15, score: 44, summary: "Baseline run. The prep-time pain is real and quantified in practitioner communities, but the space is crowded with adjacent revenue-intelligence tools. Differentiation is the open question." },
      { weeksAgo: 14, score: 47, summary: "Demand signal ticked up: multiple sales-community threads this week describing manual prep as the worst part of the AE week. Competitive picture unchanged." },
      {
        weeksAgo: 13, score: 51,
        summary: "Strongest demand reading so far. Prep pain is not just felt — it's quantified: AEs self-report 4+ hours weekly, and sales leaders cite prep quality in win/loss reviews.",
        insights: [{ title: "Prep time is a quantified, budgeted pain", body: "Sales leadership doesn't just acknowledge prep pain — several public win/loss teardowns this period attribute lost deals to poor stakeholder mapping. Quantified pain with revenue attribution is the strongest possible demand signal for this hypothesis.", direction: "supporting", status: "new" }],
      },
      { weeksAgo: 12, score: 53, summary: "Steady improvement. Willingness-to-pay evidence firmed slightly: two adjacent tools raised prices without visible churn backlash." },
      {
        weeksAgo: 11, score: 50,
        summary: "Gong announced an AI deal-brief feature in beta. It targets post-call summaries rather than pre-meeting prep, but the messaging overlaps and will compress perceived whitespace.",
        insights: [{ title: "Gong moves adjacent to the brief", body: "Gong's beta deal-brief feature is post-call oriented today, but their account-data position makes pre-meeting prep a natural extension. The hypothesis's differentiation clause now depends on speed and prep-specific workflow depth.", direction: "watch", status: "new" }],
      },
      { weeksAgo: 10, score: 46, summary: "Willingness-to-pay softened. Mid-market voices in the communities we track describe prep tools as 'nice to have' — a phrase that showed up three separate times this period." },
      {
        weeksAgo: 9, score: 43,
        summary: "Weakest run to date. The soft willingness-to-pay readings now have a pattern: they come from mid-market reps with simple, single-stakeholder deals. Enterprise AEs with complex deals remain enthusiastic.",
        insights: [{
          title: "The pain is real but not evenly distributed",
          body: "Three consecutive periods of weak willingness-to-pay decompose cleanly by segment: mid-market reps don't prep enough to value briefs, while enterprise AEs on multi-stakeholder deals describe prep as make-or-break. The hypothesis as written targets both — and is being dragged down by the half that doesn't care.",
          direction: "challenging",
          proposedRevision: MOMENTUM_V2,
          status: "accepted",
        }],
      },
      { weeksAgo: 8, score: 48, summary: "First run against the narrowed v2 hypothesis. Scoring the enterprise-only segment removes the mid-market drag: willingness-to-pay rebounds immediately while demand signal holds.", version: 2 },
      { weeksAgo: 7, score: 53, summary: "The narrowed hypothesis is holding. Enterprise-specific signals (RevOps job postings mentioning 'meeting readiness', sales-kickoff budget lines) are now the dominant input." },
      {
        weeksAgo: 6, score: 58,
        summary: "Clear budget evidence: two public RFPs this period name pre-meeting intelligence as a line item. That's procurement language — the strongest willingness-to-pay evidence so far.",
        insights: [{ title: "Pre-meeting intelligence is entering procurement language", body: "When a pain point starts appearing as an RFP line item, the category is forming. Two enterprise RFPs this period named pre-meeting intelligence explicitly. Early category formation favors focused specialists over suite add-ons — for roughly 12-18 months.", direction: "supporting", status: "new" }],
      },
      { weeksAgo: 5, score: 61, summary: "Momentum continues. Demand and willingness-to-pay both firmed; competitive whitespace stable as Gong's beta stays post-call focused." },
      {
        weeksAgo: 4, score: 64,
        summary: "Strong run, with one flag: Clari's earnings-call language ('full revenue cadence coverage') hints at expansion toward meeting workflows. No product yet — a watch item, not a threat.",
        insights: [{ title: "Clari signals cadence-wide ambitions", body: "Clari's 'full revenue cadence' framing suggests eventual expansion into meeting-adjacent workflows. Their strength is forecasting, not rep-level workflow — but their enterprise footprint means even a mediocre prep feature would compress whitespace.", direction: "watch", status: "new" }],
      },
      { weeksAgo: 3, score: 67, summary: "Best run to date. Enterprise demand signal at its strongest reading, and adoption-friction concerns eased as more buyers report CRM-integration fatigue tolerance for tools with clear ROI." },
      { weeksAgo: 2, score: 66, summary: "Effectively flat at a strong level. No new competitive moves; demand steady. The hypothesis is behaving like one that has found its segment." },
      { weeksAgo: 1, score: 69, summary: "New high. A widely-shared practitioner post this period ('the prep doc is the deal') generated exactly the demand language the hypothesis predicts." },
      {
        weeksAgo: 0, score: 71,
        summary: "Strongest reading in the series. Demand, willingness to pay, and timing are all at series highs. The open risk has shifted from 'does the market want this' to 'who else will build it' — Salesforce bundling is now the most credible threat.",
        insights: [
          {
            title: "Salesforce bundling is now the primary threat vector",
            body: "Einstein Copilot's roadmap language this period moved closer to meeting preparation. A bundled good-enough brief could undercut a specialist tool on price. The hypothesis currently says nothing about why a specialist wins against a bundled incumbent — that clause is now load-bearing.",
            direction: "challenging",
            proposedRevision: `${MOMENTUM_V2} The specialist wins on cross-system depth: briefs that fuse CRM, email, and call history — data Salesforce alone doesn't see — beat bundled single-source summaries.`,
            status: "new",
          },
          { title: "Prep-quality language is spreading organically", body: "The 'prep doc is the deal' framing is being repeated across sales communities without prompting. Organic language adoption around the exact pain point is a leading indicator of category pull.", direction: "supporting", status: "new" },
        ],
      },
    ],
  },
  {
    name: "Loopwork — async video standups",
    cadence: "weekly",
    depth: "brief",
    watchlist: ["Loom", "Slack Clips", "Linear", "Range"],
    versions: [{ statement: LOOPWORK_V1, source: "initial" }],
    metrics: [
      { name: "Demand signal", description: "Evidence that teams actively seek standup alternatives (not just complain about standups).", weight: 5 },
      { name: "Engagement viability", description: "Evidence that engineers will actually record and watch async video updates.", weight: 4 },
      { name: "Willingness to pay", description: "Per-seat budget evidence for standup-replacement tooling.", weight: 4 },
      { name: "Competitive whitespace", description: "Coverage by Loom, Slack Clips, and status-update tools like Range.", weight: 3 },
    ],
    weeks: [
      { weeksAgo: 11, score: 58, summary: "Baseline. Standup fatigue is well documented and emotionally charged in engineering communities — strong demand signal. Engagement viability of video specifically is the untested assumption." },
      { weeksAgo: 10, score: 56, summary: "Demand holds, but early engagement evidence is thin: async-video advocates are mostly managers, not the engineers who would record them." },
      {
        weeksAgo: 9, score: 57,
        summary: "Slight recovery on a strong week of standup-fatigue discussion. Slack Clips adoption anecdotes suggest the distribution channel for async video already exists inside the target teams.",
        insights: [{ title: "Slack may be the good-enough incumbent", body: "Teams experimenting with async updates largely do it with Slack Clips or plain threads — free, already deployed. The hypothesis's per-seat pricing assumption competes against 'free and already installed.'", direction: "watch", status: "new" }],
      },
      { weeksAgo: 8, score: 54, summary: "Engagement viability weakened: multiple practitioner threads this period describe recording daily videos as more effortful than attending the standup." },
      { weeksAgo: 7, score: 51, summary: "The effort asymmetry is repeating: engineers describe watching peers' videos at 2x and skipping most of them. Consumption-side engagement looks worse than production-side." },
      {
        weeksAgo: 6, score: 52,
        summary: "Flat. Demand for killing the standup remains high — but the evidence increasingly separates 'want the meeting gone' from 'want to make videos instead.'",
        insights: [{ title: "Video fatigue: engineers don't watch each other's updates", body: "Across the threads tracked this period, engineers consistently report skipping peers' async videos. If neither recording nor watching is engaging, the core mechanism of the hypothesis — video as the async medium — is the weak link, not the async-first premise.", direction: "challenging", status: "dismissed" }],
      },
      { weeksAgo: 5, score: 49, summary: "Engagement viability at a new low. Willingness to pay follows it down: leads won't pay per-seat for a medium their engineers avoid." },
      { weeksAgo: 4, score: 47, summary: "Continued slide. Linear's public musings about workflow-generated status signals point at a different answer to the same pain: derive the update, don't record it." },
      { weeksAgo: 3, score: 45, summary: "The category conversation is visibly shifting from 'async video' to 'automated status.' Demand for standup replacement is intact; the medium hypothesis is what's failing." },
      {
        weeksAgo: 2, score: 44,
        summary: "Evidence now consistently supports standup replacement and consistently rejects video as the medium. The strongest engagement anecdotes all involve auto-generated digests from commits and tickets.",
        insights: [{
          title: "The market wants the standup gone — not video",
          body: "Twelve weeks of evidence separate cleanly: standup fatigue (validated, strong) vs. async video as the replacement medium (repeatedly contradicted). The engaged alternative in every strong anecdote is an auto-generated digest from work artifacts — commits, PRs, tickets. The hypothesis should follow the evidence.",
          direction: "challenging",
          proposedRevision: LOOPWORK_PIVOT,
          status: "new",
        }],
      },
      { weeksAgo: 1, score: 42, summary: "No reversal. Video-based engagement signals weakened again; auto-digest chatter grew. The pending pivot proposal remains consistent with this period's evidence." },
      {
        weeksAgo: 0, score: 41,
        summary: "Series low. Range and two smaller tools shipped AI digest features this period — the pivot window is open but beginning to close as the auto-digest category forms without us.",
        insights: [{ title: "The auto-digest category is forming — without us", body: "Range shipped commit-aware AI summaries this period, and two smaller entrants launched similar features. The evidence that killed the video hypothesis is the same evidence validating the digest pivot — but the whitespace for it is now shrinking quarter by quarter.", direction: "challenging", status: "new" }],
      },
    ],
  },
];

function seededMetricScores(metrics: Array<{ id: string; name: string; weight: number }>, weekScore: number, weekIdx: number): MetricScore[] {
  return metrics.map((m, i) => {
    const wiggle = ((weekIdx * 7 + i * 13) % 9) - 4;
    const score = Math.max(12, Math.min(95, Math.round(weekScore + METRIC_OFFSETS[i % METRIC_OFFSETS.length] + wiggle)));
    return { metricId: m.id, name: m.name, score, note: METRIC_NOTE_POOL[(weekIdx + i) % METRIC_NOTE_POOL.length] };
  });
}

export async function seedDemoData(): Promise<void> {
  const db = await getDb();

  for (const seed of SEEDS) {
    const hypcheckId = newId();
    const oldest = Math.max(...seed.weeks.map((w) => w.weeksAgo));
    const createdAt = new Date(Date.now() - (oldest + 1) * 7 * 24 * 3600 * 1000);
    const lastRunAt = new Date(Date.now() - 3 * 24 * 3600 * 1000 - seed.weeks[0].weeksAgo); // most recent run ~3 days ago
    const nextRunAt = new Date(lastRunAt.getTime() + 7 * 24 * 3600 * 1000);

    await db.execute({
      sql: `INSERT INTO hypchecks (id, name, status, cadence, depth, watchlist, created_at, next_run_at)
            VALUES (?, ?, 'active', ?, ?, ?, ?, ?)`,
      args: [hypcheckId, seed.name, seed.cadence, seed.depth, JSON.stringify(seed.watchlist), createdAt.toISOString(), nextRunAt.toISOString()],
    });

    // Versions — v2 (if any) is created at the week its first run happens.
    const versionIds: string[] = [];
    for (let v = 0; v < seed.versions.length; v++) {
      const versionWeek = seed.weeks.find((w) => (w.version ?? 1) === v + 1);
      const vCreated = v === 0 ? createdAt : new Date(Date.now() - ((versionWeek?.weeksAgo ?? 0) * 7 + 3.5) * 24 * 3600 * 1000);
      const id = newId();
      versionIds.push(id);
      await db.execute({
        sql: `INSERT INTO hypothesis_versions (id, hypcheck_id, version, statement, change_summary, source, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [id, hypcheckId, v + 1, seed.versions[v].statement, seed.versions[v].changeSummary ?? null, seed.versions[v].source, vCreated.toISOString()],
      });
    }

    const metricRows = seed.metrics.map((m) => ({ id: newId(), ...m }));
    for (const m of metricRows) {
      await db.execute({
        sql: "INSERT INTO metrics (id, hypcheck_id, name, description, weight) VALUES (?, ?, ?, ?, ?)",
        args: [m.id, hypcheckId, m.name, m.description, m.weight],
      });
    }

    let currentVersionIdx = 0;
    for (let i = 0; i < seed.weeks.length; i++) {
      const week = seed.weeks[i];
      if (week.version) currentVersionIdx = week.version - 1;
      const version = seed.versions[currentVersionIdx];
      const runAt = new Date(lastRunAt.getTime() - week.weeksAgo * 7 * 24 * 3600 * 1000);
      const metricScores = seededMetricScores(metricRows, week.score, i);
      const insights = (week.insights ?? []).map((ins) => ({
        title: ins.title,
        body: ins.body,
        direction: ins.direction,
        proposedRevision: ins.proposedRevision ?? null,
      }));

      const watchlistNotes: Record<string, string> = {};
      seed.watchlist.forEach((w, wi) => {
        watchlistNotes[w] = WATCH_NOTE_POOL[(i + wi) % WATCH_NOTE_POOL.length];
      });

      const reportMd = buildReportMd({
        name: seed.name,
        statement: version.statement,
        version: currentVersionIdx + 1,
        runDate: runAt,
        mode: "simulated",
        depth: seed.depth,
        pmfScore: week.score,
        confidence: 0.62 + ((i * 3) % 5) * 0.04,
        execSummary: week.summary,
        metricScores,
        watchlist: seed.watchlist,
        watchlistNotes,
        insights,
        risks: [
          "Simulated demo data — trends are illustrative of the product experience, not real market research.",
        ],
        actions: [
          week.insights?.some((x) => x.proposedRevision)
            ? "Review the proposed hypothesis revision in the insights panel."
            : "Hold the current hypothesis; re-evaluate after the next scheduled run.",
        ],
      });

      const runId = newId();
      await db.execute({
        sql: `INSERT INTO runs (id, hypcheck_id, hypothesis_version_id, hypothesis_version, run_at, mode,
                pmf_score, confidence, exec_summary, report_md, metric_scores)
              VALUES (?, ?, ?, ?, ?, 'simulated', ?, ?, ?, ?, ?)`,
        args: [
          runId, hypcheckId, versionIds[currentVersionIdx], currentVersionIdx + 1, runAt.toISOString(),
          week.score, 0.62 + ((i * 3) % 5) * 0.04, week.summary, reportMd, JSON.stringify(metricScores),
        ],
      });

      for (const ins of week.insights ?? []) {
        await db.execute({
          sql: `INSERT INTO insights (id, run_id, hypcheck_id, title, body, direction, proposed_revision, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [newId(), runId, hypcheckId, ins.title, ins.body, ins.direction, ins.proposedRevision ?? null, ins.status ?? "new", runAt.toISOString()],
        });
      }
    }
  }
}

let seedPromise: Promise<void> | null = null;

/** Seed demo data once, if the database is empty and demo mode isn't disabled. */
export function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      if (process.env.HYPCHECK_DEMO === "0") return;
      const db = await getDb();
      const res = await db.execute("SELECT COUNT(*) AS c FROM hypchecks");
      const count = Number((res.rows[0] as Record<string, unknown>).c ?? 0);
      if (count === 0) {
        const start = Date.now();
        await seedDemoData();
        logger.info("seed.demo", { ms: Date.now() - start });
      }
    })();
  }
  return seedPromise;
}
