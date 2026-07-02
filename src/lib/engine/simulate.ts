import type { Hypcheck, HypothesisVersion, Metric, RunResult } from "../types";
import { buildReportMd } from "./report";

// Deterministic PRNG so simulated runs are stable for a given hypcheck + date.
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

const METRIC_NOTES_POS = [
  "Search interest and community discussion around this problem grew this period, with several unprompted mentions of the exact workflow the hypothesis targets.",
  "New public signals (job postings, changelog activity, forum threads) suggest buyers are actively allocating budget to this category.",
  "Qualitative signal is strong: practitioners describe the current workaround as painful and time-consuming, which supports willingness to adopt.",
  "Adoption proxies trended up — comparable tools in the category reported growth, and category keywords show rising volume.",
];

const METRIC_NOTES_MID = [
  "Signal held roughly flat this period. The problem remains visible in practitioner communities but urgency indicators did not move.",
  "Mixed evidence: interest exists but budget signals are ambiguous — several buyers describe this as a 'nice to have' rather than a burning need.",
  "Category activity was steady with no major inflection. Competitive noise makes attribution harder this period.",
];

const METRIC_NOTES_NEG = [
  "Signal softened: fewer public mentions of the target pain point, and one comparable product reported slowing growth.",
  "Buyers increasingly describe existing tools as 'good enough,' which pressures the differentiation assumption in the hypothesis.",
  "Budget scrutiny in the segment appears to be pushing this category down the priority list this period.",
];

const WATCH_NOTES = [
  "no significant announcements this period; positioning unchanged.",
  "shipped incremental features adjacent to this space — worth monitoring, not yet a direct overlap.",
  "increased marketing activity around a neighboring use case; messaging does not directly target this hypothesis yet.",
  "hiring signals suggest continued investment in the category.",
  "announced a feature that partially overlaps with the hypothesis; differentiation narrative needs sharpening.",
];

const SUMMARY_OPENERS_UP = [
  "Evidence this period leans in favor of the hypothesis.",
  "The signal picture improved this period.",
  "This period strengthened the case for the hypothesis.",
];
const SUMMARY_OPENERS_FLAT = [
  "Evidence this period was mixed, and the overall picture is largely unchanged.",
  "The signal picture held steady this period.",
];
const SUMMARY_OPENERS_DOWN = [
  "Evidence this period challenges parts of the hypothesis.",
  "The signal picture weakened this period.",
];

export interface SimOverride {
  pmfScore?: number;
  execSummary?: string;
  insights?: RunResult["insights"];
  metricNudge?: Record<string, number>; // metric name -> +/- adjustment
}

export function simulateRun(
  hypcheck: Hypcheck,
  version: HypothesisVersion,
  metrics: Metric[],
  runDate: Date = new Date(),
  prevScore: number | null = null,
  override: SimOverride = {}
): RunResult {
  const seed = hashString(`${hypcheck.id}:${version.version}:${runDate.toISOString().slice(0, 10)}`);
  const rand = mulberry32(seed);

  const base = prevScore ?? 45 + rand() * 20;
  const drift = (rand() - 0.48) * 8; // slight upward bias
  const targetScore = override.pmfScore ?? Math.max(15, Math.min(92, base + drift));

  const totalWeight = metrics.reduce((s, m) => s + m.weight, 0) || 1;
  const metricScores = metrics.map((m) => {
    const nudge = override.metricNudge?.[m.name] ?? 0;
    const raw = Math.max(10, Math.min(95, targetScore + (rand() - 0.5) * 22 + nudge));
    const note =
      raw >= targetScore + 5
        ? pick(rand, METRIC_NOTES_POS)
        : raw <= targetScore - 5
          ? pick(rand, METRIC_NOTES_NEG)
          : pick(rand, METRIC_NOTES_MID);
    return { metricId: m.id, name: m.name, score: Math.round(raw), note };
  });

  // Recompute the headline as the weighted metric average nudged toward target.
  const weighted =
    metricScores.reduce((s, ms, i) => s + ms.score * metrics[i].weight, 0) / totalWeight;
  const pmfScore = Math.round((override.pmfScore ?? (weighted * 0.6 + targetScore * 0.4)) * 10) / 10;

  const delta = prevScore == null ? 0 : pmfScore - prevScore;
  const opener =
    delta > 1.5 ? pick(rand, SUMMARY_OPENERS_UP) : delta < -1.5 ? pick(rand, SUMMARY_OPENERS_DOWN) : pick(rand, SUMMARY_OPENERS_FLAT);
  const strongest = [...metricScores].sort((a, b) => b.score - a.score)[0];
  const weakest = [...metricScores].sort((a, b) => a.score - b.score)[0];
  const execSummary =
    override.execSummary ??
    `${opener} The strongest signal is ${strongest?.name.toLowerCase() ?? "demand"} (${strongest ? Math.round(strongest.score) : "-"}), while ${weakest?.name.toLowerCase() ?? "differentiation"} (${weakest ? Math.round(weakest.score) : "-"}) remains the weakest link. ${
      hypcheck.watchlist.length
        ? `Watchlist activity from ${hypcheck.watchlist[0]} and peers was ${delta < -1.5 ? "a headwind" : "not a major factor"} this period.`
        : ""
    }`.trim();

  let insights = override.insights;
  if (!insights) {
    insights = [];
    if (rand() < 0.4) {
      if (delta < -2 && rand() < 0.5) {
        insights.push({
          title: `${weakest?.name ?? "Differentiation"} signal is eroding`,
          body: `Repeated soft readings on ${weakest?.name.toLowerCase() ?? "this signal"} suggest the hypothesis may be too broad for the current market. Narrowing the target segment could concentrate the strongest demand signals.`,
          direction: "challenging",
          proposedRevision:
            hypcheck.watchlist.length && rand() < 0.6
              ? `${version.statement} Initial focus narrows to teams already evaluating ${hypcheck.watchlist[0]}-class tools, where the pain is most acute.`
              : null,
        });
      } else if (delta > 2) {
        insights.push({
          title: `${strongest?.name ?? "Demand"} momentum is compounding`,
          body: `Consecutive positive readings on ${strongest?.name.toLowerCase() ?? "demand"} indicate this part of the hypothesis is validated at current depth. Consider promoting it to a core positioning pillar.`,
          direction: "supporting",
          proposedRevision: null,
        });
      } else {
        insights.push({
          title: "Category noise is rising",
          body: `Several adjacent products are moving toward this space. No direct overlap yet, but the differentiation clause of the hypothesis will be tested within a few cycles.`,
          direction: "watch",
          proposedRevision: null,
        });
      }
    }
  }

  const watchlistNotes: Record<string, string> = {};
  for (const w of hypcheck.watchlist) watchlistNotes[w] = pick(rand, WATCH_NOTES);

  const confidence = Math.round((0.55 + rand() * 0.25) * 100) / 100;

  const reportMd = buildReportMd({
    name: hypcheck.name,
    statement: version.statement,
    version: version.version,
    runDate,
    mode: "simulated",
    depth: hypcheck.depth,
    pmfScore,
    confidence,
    execSummary,
    metricScores,
    watchlist: hypcheck.watchlist,
    watchlistNotes,
    insights,
    risks: [
      `Weakest current signal: ${weakest?.name.toLowerCase() ?? "n/a"} — a second consecutive soft reading should trigger a hypothesis review.`,
      "Simulated-mode data is illustrative; treat trends, not absolute values, as the decision input.",
    ],
    actions: [
      delta < -1.5
        ? "Review the pending insights and consider tightening the hypothesis before the next run."
        : "Hold the current hypothesis; re-evaluate after the next scheduled run.",
      hypcheck.watchlist.length ? `Keep ${hypcheck.watchlist[0]} under close watch for direct feature overlap.` : "Consider adding competitors to the watchlist for sharper competitive signal.",
    ],
  });

  return { pmfScore, confidence, execSummary, reportMd, metricScores, insights };
}
