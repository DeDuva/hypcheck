import { describe, expect, it } from "vitest";
import { wordDiff } from "../src/lib/diff";
import { familiesUpToTier, familyFromModelId, scoreBand } from "../src/lib/types";

describe("familyFromModelId", () => {
  it("maps model ids to families, defaulting to sonnet", () => {
    expect(familyFromModelId("claude-haiku-4-5-20251001")).toBe("haiku");
    expect(familyFromModelId("claude-opus-4-8")).toBe("opus");
    expect(familyFromModelId("claude-fable-5-2")).toBe("fable");
    expect(familyFromModelId("claude-sonnet-4-6")).toBe("sonnet");
    expect(familyFromModelId("something-else")).toBe("sonnet");
  });
});

describe("familiesUpToTier", () => {
  it("returns the ladder up to and including the tier", () => {
    expect(familiesUpToTier("haiku")).toEqual(["haiku"]);
    expect(familiesUpToTier("opus")).toEqual(["haiku", "sonnet", "opus"]);
  });
});

describe("scoreBand", () => {
  it("puts every score in some band, and higher scores in higher-or-equal bands", () => {
    const mins = [0, 25, 50, 75, 100].map((s) => scoreBand(s).min);
    expect(mins).toEqual([...mins].sort((a, b) => a - b));
    expect(scoreBand(-5)).toBeDefined();
  });
});

describe("wordDiff", () => {
  it("reconstructs both texts from its segments", () => {
    const a = "Solo consultants will pay for notes";
    const b = "Solo management consultants will pay $30 for notes";
    const segs = wordDiff(a, b);
    const join = (keep: (t: string) => boolean) =>
      segs.filter((s) => keep(s.type)).map((s) => s.text).join("").replace(/\s+/g, " ").trim();
    expect(join((t) => t !== "added")).toBe(a);
    expect(join((t) => t !== "removed")).toBe(b);
  });
});
