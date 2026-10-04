import { describe, expect, it } from "vitest";
import type { FlaggedScene } from "../src/report";
import { testSkeletons } from "../src/testgen";

const flag = (over: Partial<FlaggedScene>): FlaggedScene => ({ id: "x", pairing: "A/B", card: "anal", top: "A", bottom: "B", act: "anal sex", evidence: "A secret quoted line.", reasons: [], note: "", ...over });

describe("test skeletons from flagged mistakes", () => {
  it("makes one test per included item and leaves the fic’s sentence out of the code", () => {
    const t = testSkeletons([flag({ reasons: ["swapped"] }), flag({ id: "y", reasons: ["hypothetical"] }), flag({ id: "z", included: false })], []);
    expect(t.match(/^\s+it\(/gm)?.length).toBe(2);
    expect(t).toContain("PARAPHRASE_ME");
    expect(t.split("\n").filter((l) => l.includes("secret quoted line") && !l.trim().startsWith("//")).length).toBe(0);
  });
  it("swapped roles expect the reverse; a wish expects no scene", () => {
    expect(testSkeletons([flag({ reasons: ["swapped"] })], [])).toContain('{ top: "B", bottom: "A" }');
    expect(testSkeletons([flag({ reasons: ["hypothetical"] })], [])).toContain("toBe(0)");
  });
  it("handles vibe ratings, missed scenes and the reader’s note", () => {
    const t = testSkeletons([flag({ kind: "vibe", card: "vibe", top: "A", act: "Top", reasons: ["vibe_too_top"], note: "he is a switch" })], [{ passage: "Missed bit.", note: "oral" }]);
    expect(t).toContain("not lean as far toward top");
    expect(t).toContain("reader's note: he is a switch");
    expect(t).toContain("finds the missed scene 1");
  });
});

describe("readings that look right", () => {
  it("become tests that must keep passing", () => {
    const t = testSkeletons([], [], [flag({ id: "r1", reasons: [] }), flag({ id: "r2", kind: "hint", card: "anal", top: "A", bottom: "top (said)", act: "anal sex", reasons: [] }), flag({ id: "r3", kind: "vibe", card: "vibe", top: "A", act: "Total top", reasons: [] })]);
    expect(t).toContain("readings that looked right (a fix should keep these passing unless there is a reason)");
    expect(t).toContain('{ top: "A", bottom: "B" }');
    expect(t).toContain("toBeGreaterThan(0); // the hint still appears");
    expect(t).toContain('rating(r, "A").label).toBe("Total top")');
    expect(t.split("\n").filter((l) => l.includes("secret quoted line") && !l.trim().startsWith("//")).length).toBe(0);
  });
});
