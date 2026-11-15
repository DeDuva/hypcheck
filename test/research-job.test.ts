/** runResearchJob — what research.yml executes — against a throwaway file DB, simulated engine. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseHypcheckId } from "../src/lib/researchJob";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hypcheck-job-"));
const cwd = process.cwd();

beforeAll(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.TURSO_DATABASE_URL;
  process.chdir(dir);
});
afterAll(() => {
  process.chdir(cwd);
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("parseHypcheckId", () => {
  it("treats empty as 'all due' and rejects anything but safe id characters", () => {
    expect(parseHypcheckId("")).toBeNull();
    expect(parseHypcheckId("  ")).toBeNull();
    expect(parseHypcheckId(undefined)).toBeNull();
    expect(parseHypcheckId(" a1b2c3d4e5f60718 ")).toBe("a1b2c3d4e5f60718");
    expect(() => parseHypcheckId("x; rm -rf /")).toThrow(/Invalid hypcheck id/);
    expect(() => parseHypcheckId("$(whoami)")).toThrow();
  });
});

describe("runResearchJob", () => {
  async function makeHypcheck(name: string, dueDaysAgo: number | null) {
    const store = await import("../src/lib/store");
    await store.ensureUserRow({ id: "u1", email: "owner@example.com", name: "Owner", role: "admin" });
    const h = await store.createHypcheck(
      {
        name,
        statement: `${name}: solo consultants will pay $30/mo for structured call notes.`,
        cadence: "weekly",
        depth: "brief",
        model: "haiku",
        watchlist: [],
        metrics: [{ name: "Demand", description: "Search and community volume", weight: 3 }],
      },
      "u1"
    );
    // dueDaysAgo null = not due (next run a week out)
    const from = dueDaysAgo === null ? new Date() : new Date(Date.now() - (7 + dueDaysAgo) * 86_400_000);
    await store.setNextRun(h.id, "weekly", from);
    return h.id;
  }

  it("with no id, runs exactly the due hypchecks", async () => {
    const { runResearchJob } = await import("../src/lib/researchJob");
    const due = await makeHypcheck("Due one", 1);
    const notDue = await makeHypcheck("Not due", null);

    const results = await runResearchJob(null);
    const ids = results.map((r) => r.id);
    expect(ids).toContain(due);
    expect(ids).not.toContain(notDue);
    expect(results.every((r) => r.ok && r.mode === "simulated")).toBe(true);

    // Second pass: nothing left due.
    expect((await runResearchJob(null)).map((r) => r.id)).not.toContain(due);
  });

  it("with an id, runs that hypcheck even when it isn't due ('Run now')", async () => {
    const { runResearchJob } = await import("../src/lib/researchJob");
    const store = await import("../src/lib/store");
    const id = await makeHypcheck("Run me now", null);
    const before = (await store.listRuns(id)).length;

    const results = await runResearchJob(id);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id, ok: true });
    expect((await store.listRuns(id)).length).toBe(before + 1);
    expect((await store.getLastRunAttempt())?.status).toBe("ok");
  });

  it("rejects an unknown id", async () => {
    const { runResearchJob } = await import("../src/lib/researchJob");
    await expect(runResearchJob("doesnotexist")).rejects.toThrow(/No hypcheck/);
  });
});
