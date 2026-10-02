import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

// Round 23: an A/B/O Supernatural fic and a first-person fraternity fic (paraphrased).
const meta: Ao3Meta = {
  ...emptyMeta(),
  rating: "Explicit",
  categories: ["M/M"],
  fandoms: ["Supernatural"],
  relationships: ["Castiel/Dean Winchester"],
  characters: ["Castiel (Supernatural)", "Dean Winchester"],
};
const SET = "Dean and Cas were in bed, naked and kissing. Cas kissed Dean. Dean kissed Cas back, breathless.";
const filler = Array.from({ length: 12 }, (_, i) => `Cas smiled at Dean across the garage, number ${i}.`).join("\n");
const run = (s: string) => analyzeWithPatterns(`${filler}\n\n${SET}\n\n${s}`, meta, { quiet: true }).pairings[0];

describe("rimming and fingers", () => {
  it("doesn't count 'face in his ass and started licking' as a blowjob too", () => {
    const p = run("Cas dropped him on his stomach, and before he could turn around, he had his face in his ass and started licking.");
    expect(p.blowjob.instances).toHaveLength(0);
    expect(p.rimming.instances[0]).toMatchObject({ top: expect.stringMatching(/Castiel/) });
  });
  it("gives 'as he swallows him down … while his fingers slip inside him' to the one whose tongue it is", () => {
    const p = run("Dean arches underneath Cas’ tongue as he swallows him down, humming around his length while his fingers slip inside him.");
    expect(p.anal.instances[0]).toMatchObject({ top: expect.stringMatching(/Castiel/), bottom: expect.stringMatching(/Dean/) });
  });
});

describe("wanting", () => {
  it("reads 'if Cas doesn't fuck him soon, he might die' as wanting, not refusing", () => {
    const p = run("He is so wet it slips down his cheeks, and if Cas doesn’t fuck him soon, he might actually die.");
    expect(p.anal.desires.some((d) => d.wants === false)).toBe(false);
  });
  it("keeps 'With … his head, Dean chooses' about Dean", () => {
    const p = run("With so many fantasies drifting through his head, Dean chooses the most enticing one. “Thought about presenting for you,” he admits. His finger sinks into his hole, and he sighs in relief.");
    expect(p.anal.desires.some((d) => d.kind === "solo" && /Dean/.test(d.who))).toBe(true);
    expect(p.anal.desires.some((d) => d.kind === "solo" && /Castiel/.test(d.who))).toBe(false);
  });
});

describe("first person with headed sections", () => {
  const fm: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Teen Wolf (TV)"], relationships: ["Scott McCall/Stiles Stilinski"], characters: ["Scott McCall", "Stiles Stilinski"] };
  const chat = (n: number, who: string) => Array.from({ length: n }, (_, i) => `“Hey,” ${who} said to me, and I laughed at the joke number ${i}.`).join("\n");
  const text = [
    "Scott - Saturday, September 6, 2014", chat(14, "Stiles"),
    "Stiles - Sunday, September 7, 2014", chat(14, "Scott"),
    "Scott got me on my stomach, and then started eating me out. Scott kissed me. Stiles was there too, and Scott kissed Stiles.",
  ].join("\n\n");
  it("reads 'I' as the section's narrator", () => {
    const a = analyzeWithPatterns(text, fm, { quiet: true });
    const inst = a.pairings[0].rimming.instances[0];
    expect(inst).toMatchObject({ top: expect.stringMatching(/Scott/), bottom: expect.stringMatching(/Stiles/) });
  });
});
