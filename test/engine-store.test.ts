/**
 * executeRun end to end against a throwaway file-backed libSQL database, on the
 * simulated engine (no ANTHROPIC_API_KEY). This is the exact code path a
 * scheduled or manual research run takes, minus the Claude call.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hypcheck-test-"));
const cwd = process.cwd();

beforeAll(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.TURSO_DATABASE_URL;
  process.chdir(dir); // db.ts puts its file DB under <cwd>/data
});
afterAll(() => {
  process.chdir(cwd);
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("executeRun (simulated) against a file DB", () => {
  it("records a run, advances next_run_at, and leaves an ok attempt marker", async () => {
    const store = await import("../src/lib/store");
    const { executeRun } = await import("../src/lib/engine");

    await store.ensureUserRow({ id: "u1", email: "owner@example.com", name: "Owner", role: "admin" });
    const created = await store.createHypcheck(
      {
        name: "Test hypothesis",
        statement: "Solo consultants will pay $30/mo for structured call notes.",
        cadence: "weekly",
        depth: "brief",
        model: "haiku",
        watchlist: [],
        metrics: [{ name: "Demand", description: "Search and community volume", weight: 3 }],
      },
      "u1"
    );

    // Make it due, then confirm the due query sees it.
    await store.setNextRun(created.id, "weekly", new Date(Date.now() - 8 * 24 * 3600 * 1000));
    expect((await store.listDueHypchecks()).map((h) => h.id)).toContain(created.id);

    const hypcheck = (await store.getHypcheck(created.id))!;
    const run = await executeRun(hypcheck);

    expect(run.mode).toBe("simulated");
    expect(run.pmfScore).toBeGreaterThanOrEqual(0);
    expect(run.pmfScore).toBeLessThanOrEqual(100);
    expect((await store.listRuns(created.id)).map((r) => r.id)).toContain(run.id);
    expect((await store.listDueHypchecks()).map((h) => h.id)).not.toContain(created.id);

    const attempt = await store.getLastRunAttempt();
    expect(attempt?.status).toBe("ok");
    expect(attempt?.hypcheckId).toBe(created.id);
  });
});
