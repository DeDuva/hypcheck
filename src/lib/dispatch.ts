/**
 * Research runs don't execute on Vercel. A run takes ~200–300 s with a 600 s
 * abort backstop, and Vercel Hobby caps a function at 300 s. Instead, Vercel
 * dispatches the `research.yml` GitHub Actions workflow, which runs
 * `scripts/research.ts` against the same Turso database. This module is the
 * Vercel side of that: one short GitHub API call.
 *
 * Config (Vercel env, Production scope only):
 *   HYPCHECK_DISPATCH_TOKEN  fine-grained PAT, repo DeDuva/hypcheck only, Actions: write
 *   HYPCHECK_DISPATCH_REPO   owner/name (default DeDuva/hypcheck)
 *   HYPCHECK_DISPATCH_REF    branch the workflow runs from (default main)
 */

export const RESEARCH_WORKFLOW = "research.yml";

export class DispatchError extends Error {}

export interface DispatchConfig {
  token: string;
  repo: string;
  ref: string;
}

export function dispatchConfig(env: NodeJS.ProcessEnv = process.env): DispatchConfig | null {
  const token = env.HYPCHECK_DISPATCH_TOKEN;
  if (!token) return null;
  return {
    token,
    repo: env.HYPCHECK_DISPATCH_REPO || "DeDuva/hypcheck",
    ref: env.HYPCHECK_DISPATCH_REF || "main",
  };
}

/**
 * Ask GitHub Actions to run research — for one hypcheck, or (no id) for every
 * hypcheck that is due. Resolves once GitHub has accepted the dispatch (HTTP
 * 204); the run itself happens later and reports through the attempt marker.
 */
export async function dispatchResearch(
  hypcheckId: string | null,
  opts: { config?: DispatchConfig | null; fetchImpl?: typeof fetch } = {}
): Promise<void> {
  const config = opts.config !== undefined ? opts.config : dispatchConfig();
  if (!config) {
    throw new DispatchError(
      "Research dispatch isn't configured (HYPCHECK_DISPATCH_TOKEN is not set for this deployment)."
    );
  }
  const doFetch = opts.fetchImpl ?? fetch;
  const url = `https://api.github.com/repos/${config.repo}/actions/workflows/${RESEARCH_WORKFLOW}/dispatches`;
  const res = await doFetch(url, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "hypcheck",
    },
    body: JSON.stringify({ ref: config.ref, inputs: { hypcheck_id: hypcheckId ?? "" } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status !== 204 && res.status !== 200) {
    // GitHub's error body is a short JSON message; it never echoes the token.
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new DispatchError(`GitHub refused the research dispatch (HTTP ${res.status}): ${detail}`);
  }
}
