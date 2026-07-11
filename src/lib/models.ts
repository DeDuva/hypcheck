import Anthropic from "@anthropic-ai/sdk";
import type { ModelFamily } from "./types";
import { logger, serializeError } from "./logger";

export { familyFromModelId } from "./types";

/**
 * Known-latest model per family — the fallback when the Models API can't be
 * reached (and the instant answer before the first successful refresh).
 * Update opportunistically; resolveModel() below prefers the live list.
 */
export const FALLBACK_LATEST: Record<ModelFamily, string> = {
  haiku: "claude-haiku-4-5",
  sonnet: "claude-sonnet-5",
  opus: "claude-opus-4-8",
  fable: "claude-fable-5",
};

/**
 * Per-family request shaping. These aren't preferences — sending the wrong
 * shape is a 400:
 * - Haiku 4.5 rejects `output_config.effort` and adaptive thinking, and only
 *   supports the basic web_search_20250305 tool.
 * - Fable 5 has thinking always on; the param must be omitted (or adaptive).
 * - Sonnet 5 / Opus 4.8 take adaptive thinking, effort, and the _20260209
 *   web search tool with dynamic filtering.
 */
export interface FamilyRequestShape {
  webSearchType: "web_search_20260209" | "web_search_20250305";
  /** Send `thinking: {type: "adaptive"}`. Omit the param entirely when false. */
  adaptiveThinking: boolean;
  /** Send `output_config.effort`. Omit when false. */
  effortSupported: boolean;
}

const FAMILY_SHAPE: Record<ModelFamily, FamilyRequestShape> = {
  haiku: { webSearchType: "web_search_20250305", adaptiveThinking: false, effortSupported: false },
  sonnet: { webSearchType: "web_search_20260209", adaptiveThinking: true, effortSupported: true },
  opus: { webSearchType: "web_search_20260209", adaptiveThinking: true, effortSupported: true },
  fable: { webSearchType: "web_search_20260209", adaptiveThinking: false, effortSupported: true },
};

export function familyShape(family: ModelFamily): FamilyRequestShape {
  return FAMILY_SHAPE[family];
}

// Refresh the model list at most every 6 hours per process; serverless
// instances are short-lived anyway, so staleness is bounded by cold starts.
const REFRESH_MS = 6 * 60 * 60 * 1000;

let latestByFamily: Partial<Record<ModelFamily, string>> = {};
let lastRefresh = 0;
let refreshing: Promise<void> | null = null;

/** Dated snapshots like claude-haiku-4-5-20251001 — prefer the undated alias. */
function isDatedSnapshot(id: string): boolean {
  return /-\d{8}$/.test(id);
}

async function refresh(): Promise<void> {
  const start = Date.now();
  const anthropic = new Anthropic();
  const found: Partial<Record<ModelFamily, { id: string; createdAt: string }>> = {};
  for await (const m of anthropic.models.list()) {
    const match = /^claude-(haiku|sonnet|opus|fable)-/.exec(m.id);
    if (!match) continue;
    const family = match[1] as ModelFamily;
    const current = found[family];
    // Newest wins; on a tie (alias + dated snapshot of the same release),
    // prefer the undated alias so logs and traces stay readable.
    if (
      !current ||
      m.created_at > current.createdAt ||
      (m.created_at === current.createdAt && isDatedSnapshot(current.id) && !isDatedSnapshot(m.id))
    ) {
      found[family] = { id: m.id, createdAt: m.created_at };
    }
  }
  for (const [family, entry] of Object.entries(found)) {
    latestByFamily[family as ModelFamily] = entry.id;
  }
  lastRefresh = Date.now();
  logger.info("models.refresh", { ms: Date.now() - start, latest: latestByFamily });
}

/**
 * Resolve a model family to the newest model in it. Uses the live Models API
 * (cached per process); falls back to FALLBACK_LATEST when the API is
 * unavailable or hasn't been fetched yet. HYPCHECK_MODEL overrides everything —
 * the ops escape hatch to pin an exact model ID globally.
 */
export async function resolveModel(family: ModelFamily): Promise<string> {
  if (process.env.HYPCHECK_MODEL) return process.env.HYPCHECK_MODEL;
  if (!process.env.ANTHROPIC_API_KEY) return FALLBACK_LATEST[family];

  if (Date.now() - lastRefresh > REFRESH_MS) {
    refreshing ??= refresh()
      .catch((err) => logger.warn("models.refresh.fail", { err: serializeError(err) }))
      .finally(() => {
        refreshing = null;
      });
    // First-ever resolution waits for the list (so the very first run already
    // uses the live answer); later refreshes happen in the background while
    // the stale-but-recent cached value is served.
    if (lastRefresh === 0) await refreshing;
  }
  return latestByFamily[family] ?? FALLBACK_LATEST[family];
}
