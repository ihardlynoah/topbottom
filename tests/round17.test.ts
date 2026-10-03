import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

// Round 17: misreads in a long Castiel/Dean fic (paraphrased).
const meta: Ao3Meta = {
  ...emptyMeta(),
  rating: "Explicit",
  categories: ["M/M"],
  relationships: ["Castiel/Dean Winchester"],
  characters: ["Castiel", "Dean Winchester"],
};
const run = (text: string) => analyzeWithPatterns(text, meta, { quiet: true }).pairings[0];
const BED = "Dean and Cas were naked on the bed, hard and aching, and Cas slicked his cock with lube.";
const ORAL = "Dean knelt between Cas's legs, his mouth full of Cas's cock, his throat working as he gagged and swallowed.";
const whoWants = (p: ReturnType<typeof run>, cat: "anal" | "blowjob", role: "top" | "bottom") =>
  p[cat].desires.filter((d) => d.role === role && d.wants).map((d) => d.who);

describe("dialogue in an oral scene", () => {
  it("reads 'you take it so well' as blowjob talk from the one being sucked", () => {
    const p = run(`${ORAL}\n\nHis friend listened, picking up the pace. “Fuck – you take it so well, look at you.”`);
    expect(whoWants(p, "anal", "top")).toHaveLength(0);
    expect(whoWants(p, "blowjob", "top")).toEqual(["Castiel"]);
  });
  it("reads 'You gonna take it? Swallow me down?' as oral only", () => {
    const p = run(`${ORAL}\n\n“I’m close,” Cas said. “You gonna take it? Swallow me down?”`);
    expect(p.anal.desires).toHaveLength(0);
    expect(p.blowjob.desires.filter((d) => d.role === "top" && d.who === "Castiel")).toHaveLength(1);
  });
  it("still reads 'you take it so well' as anal talk in an anal scene", () => {
    const p = run(`${BED}\n\nCas pressed his cock against Dean's hole and pushed inside him.\n\n“God, you take it so well,” Cas said, thrusting.`);
    expect(whoWants(p, "anal", "top")).toContain("Castiel");
  });
});

describe("who is doing it", () => {
  it("gives 'with a nod from his lover he lined himself up' to the one who lines up", () => {
    const p = run(`${BED}\n\nTheir eyes met once more, Cas checking that Dean was ok and with a nod from his lover he lined himself up, one hand on Dean's hip.`);
    const lining = p.anal.desires.filter((d) => /lining up/.test(d.act));
    expect(lining.map((d) => d.who)).toEqual(["Castiel"]);
  });
  it("gives 'for Dean to cum, spilling into his mouth' to Dean", () => {
    const p = run(
      `${ORAL}\n\nWhen he felt Dean's muscles untighten he moved his mouth, wrapping it around Dean's cock and it didn't take long for Dean to cum, spilling into his mouth.`,
    );
    expect(p.blowjob.instances.some((i) => i.top === "Dean Winchester" && i.bottom === "Castiel")).toBe(true);
  });
});

describe("not a refusal", () => {
  it("doesn't read 'just not yet, not before he bottomed out' as not wanting to top", () => {
    const p = run(`${BED}\n\nCas wanted them labored, just not yet, not before he bottomed out and felt himself balls deep inside of Dean.`);
    expect(p.anal.desires.filter((d) => d.who === "Castiel" && d.role === "top").every((d) => d.wants)).toBe(true);
  });
  it("doesn't read 'it didn't take long for Dean to cum' as not wanting", () => {
    const p = run(`${ORAL}\n\nCas wrapped his mouth around Dean's cock and it didn't take long for Dean to cum, spilling into his mouth.`);
    expect(p.blowjob.desires.filter((d) => !d.wants)).toHaveLength(0);
  });
});

describe("counted once", () => {
  it("lists a hint once even when two patterns read the sentence", () => {
    const p = run(`${ORAL}\n\nHe wanted to be full of Cas, wanted Cas spilling down his throat.`);
    const rows = p.blowjob.desires.filter((d) => /spilling down/.test(d.evidence));
    expect(rows.length).toBeLessThanOrEqual(1);
  });
});
