import type { AnalystStance, Conviction, IndustryAnalysis } from "./types";

// ---------------------------------------------------------------------------
// Deterministic PRNG (shared by the simulated engine and the demo seed so
// industry analyses are stable for a given run).
// ---------------------------------------------------------------------------

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function makeRng(seed: string): () => number {
  let a = hashString(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)] ?? arr[0];
}

// ---------------------------------------------------------------------------
// Stance derivation
// ---------------------------------------------------------------------------

type Climate = "hostile" | "mixed" | "favorable" | "strong";

function climateOf(score: number): Climate {
  if (score >= 70) return "strong";
  if (score >= 55) return "favorable";
  if (score >= 40) return "mixed";
  return "hostile";
}

export function deriveStance(score: number, delta: number): { stance: AnalystStance; conviction: Conviction } {
  let stance: AnalystStance;
  if (score >= 70) stance = delta > 2 ? "accelerate" : "advance";
  else if (score >= 55) stance = delta < -3 ? "hold" : "advance";
  else if (score >= 40) stance = delta < -1.5 ? "reposition" : "hold";
  else stance = delta < -1.5 ? "retreat" : "reposition";

  const extreme = score >= 72 || score <= 38;
  const moving = Math.abs(delta) >= 4;
  const conviction: Conviction = extreme || moving ? "high" : Math.abs(delta) < 1.5 && score > 45 && score < 65 ? "low" : "moderate";
  return { stance, conviction };
}

// ---------------------------------------------------------------------------
// Prose pools (analyst voice). Kept broadly applicable; watchlist names and
// the strongest/weakest signal are woven in for specificity.
// ---------------------------------------------------------------------------

const LANDSCAPE: Record<Climate, string[]> = {
  strong: [
    "The category has crossed from experimentation into early adoption: the problem is widely acknowledged, budget lines are appearing, and buying language is standardizing. Windows like this — proven demand before any incumbent has locked in the workflow — are the most fertile for a focused entrant and historically last four to six quarters before consolidation sets the terms.",
    "Momentum is compounding. Demand indicators, budget formation, and unprompted practitioner discussion are all pointing the same direction, which is rare and usually self-reinforcing. The market is past the question of whether the problem matters and onto who will own the solution.",
  ],
  favorable: [
    "The category is in an early-growth phase: demand is real and budgets are forming, but ownership of the specific workflow is still unsettled. That combination is favorable for a specialist, though the window is not indefinite — expect the terms to harden as larger players notice the pull.",
    "Conditions are constructive. The underlying need is validated and interest is trending up, even if willingness-to-pay signals remain uneven across segments. The shape of the market rewards a sharp wedge over broad positioning right now.",
  ],
  mixed: [
    "The category is unsettled. The problem is visible and discussed, but urgency and budget signals are inconsistent — a sign the market has not yet decided this is a must-solve rather than a nice-to-have. Direction over the next few cycles matters more than the current level.",
    "The market is in a show-me phase: real interest, but buyers are hedging and incumbents' 'good enough' options exert gravity. Whether this tips toward a genuine category or stays a feature is the open question.",
  ],
  hostile: [
    "The category faces structural headwinds. Enthusiasm is thin, incumbents' bundled options are absorbing the demand that exists, and budget scrutiny is pushing this down the priority list. Absent a sharper wedge or a change in conditions, the market is working against the thesis as framed.",
    "Signals are soft and softening. The problem is real for a narrow slice, but the broad market is treating existing tooling as sufficient — the hardest environment in which to build category pull.",
  ],
};

const CATALYSTS_GENERIC = [
  "Category funding and hiring activity ticked up this period — a leading indicator of new entrants and intensifying competition for the same buyer.",
  "Buyer language is beginning to standardize around this problem, an early marker of category formation that favors focused specialists over suite add-ons.",
  "Procurement signals (RFP line items, budget reallocations) suggest the workflow is moving from discretionary to planned spend in at least part of the market.",
  "Macro budget scrutiny in the segment is raising the ROI bar every new tool must clear to win a slot.",
  "Platform vendors are signaling roadmap interest adjacent to this workflow, which would compress differentiation if it materializes.",
];

const IMPLICATIONS: Record<AnalystStance, string[]> = {
  accelerate: [
    "The strategic risk has shifted from 'is there a market' to 'who else builds it first.' The right response is to press: deepen the wedge where the moat is defensible, and treat speed to a referenceable customer as the primary objective before the window narrows.",
  ],
  advance: [
    "The thesis is supported by the current context. Proceed, but keep the wedge narrow — the fastest path to durable position is dominating one acute segment rather than chasing the broad market the incumbents will defend.",
  ],
  hold: [
    "The context neither confirms nor breaks the thesis. Hold the current framing, instrument the two or three signals most likely to move, and let the next cycles adjudicate before committing further resources.",
  ],
  reposition: [
    "The context is pressuring the thesis as written. The move is not to abandon it but to sharpen it — concentrate on the segment where the pain is most acute and the incumbent story is weakest, and revisit the differentiation claim explicitly.",
  ],
  retreat: [
    "The industry backdrop is working against this thesis in its current form. Absent a materially sharper wedge, the disciplined call is to deprioritize and reallocate attention to a problem with more favorable structure.",
  ],
};

const HEADLINE: Record<Climate, string[]> = {
  strong: [
    "The market has decided the problem matters; the only open question is ownership — and the window to claim it is open now.",
    "Demand, budget, and timing are aligned. This is a land-grab phase, and the primary threat is a faster competitor rather than a skeptical market.",
  ],
  favorable: [
    "The category is forming in the thesis's favor, but the differentiation window is finite — specialists win here for the next few quarters, not forever.",
    "Conditions favor a focused entrant: validated demand, unsettled ownership, and incumbents still looking elsewhere.",
  ],
  mixed: [
    "The market hasn't decided whether this is a category or a feature — direction over the next cycles matters more than today's level.",
    "Real interest, hedging buyers, and 'good enough' incumbents leave the thesis unproven but alive.",
  ],
  hostile: [
    "The industry backdrop is working against the thesis as framed; a sharper wedge is required before the market will pull.",
    "Soft and softening signals plus absorbing incumbents make this the hardest environment in which to build category pull.",
  ],
};

export interface SynthParams {
  hypcheckName: string;
  watchlist: string[];
  score: number;
  delta: number;
  strongest: string | null;
  weakest: string | null;
  rand: () => number;
}

/** Deterministically synthesize an analyst-style industry analysis. */
export function synthIndustryAnalysis(p: SynthParams): IndustryAnalysis {
  const climate = climateOf(p.score);
  const { stance, conviction } = deriveStance(p.score, p.delta);
  const [w0, w1] = p.watchlist;

  const competitiveDynamics = w0
    ? `${w0} remains the reference point buyers anchor to, but its strength sits adjacent to the specific job-to-be-done rather than on it — leaving the exact workflow underserved.${
        w1 ? ` ${w1} and newer entrants are circling the same space, which validates the opportunity even as it narrows the differentiation window.` : ""
      } The defensible position is depth in the workflow the incumbents treat as a feature, anchored on ${
        p.strongest ? p.strongest.toLowerCase() : "the strongest demand signal"
      } where the pull is clearest.`
    : `No dominant incumbent owns this workflow yet, which is both the opportunity and the risk: whitespace invites entrants. Differentiation should concentrate on ${
        p.strongest ? p.strongest.toLowerCase() : "the strongest demand signal"
      }, where the pull is clearest, while watching for platform vendors extending into the space.`;

  const catalysts: string[] = [];
  const pool = [...CATALYSTS_GENERIC];
  const n = 2 + Math.floor(p.rand() * 2); // 2-3
  for (let i = 0; i < n && pool.length; i++) {
    catalysts.push(pool.splice(Math.floor(p.rand() * pool.length), 1)[0]);
  }
  if (w0 && p.rand() < 0.7) {
    catalysts.unshift(`Watch ${w0}${w1 ? ` and ${w1}` : ""} for direct moves into this workflow — the most likely source of near-term competitive pressure.`);
  }
  if (p.weakest && p.rand() < 0.5) {
    catalysts.push(`A second soft reading on ${p.weakest.toLowerCase()} would be an early warning that the market is treating this as optional rather than essential.`);
  }

  return {
    headline: pick(p.rand, HEADLINE[climate]),
    stance,
    conviction,
    landscape: pick(p.rand, LANDSCAPE[climate]),
    competitiveDynamics,
    catalysts: catalysts.slice(0, 4),
    implications: pick(p.rand, IMPLICATIONS[stance]),
  };
}
