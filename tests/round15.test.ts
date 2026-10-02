import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { buildCast } from "../src/heuristic/characters";
import { analyzeWithPatterns } from "../src/heuristic";

// Round 15: a slow-burn ranch AU (paraphrased) whose tags include "Eddie Diaz's Parents", "Buck's Parents" and an
// Original Female Character in a Bobby/OFC relationship, which made the engine invent a Bobby/Eddie pairing.
const meta = (over: Partial<Ao3Meta> = {}): Ao3Meta => ({
  ...emptyMeta(),
  rating: "Explicit",
  categories: ["M/M", "F/M"],
  relationships: ["Evan \"Buck\" Buckley/Eddie Diaz (9-1-1 TV)", "Bobby Nash/Original Female Character(s)"],
  characters: [
    "Eddie Diaz (9-1-1 TV)",
    "Evan \"Buck\" Buckley",
    "Bobby Nash",
    "Original Female Character(s)",
    "Evan \"Buck\" Buckley's Parents",
    "Eddie Diaz's Parents (9-1-1 TV)",
    "Original Children of Henrietta \"Hen\" Wilson\"/Karen Wilson",
  ],
  ...over,
});
const TEXT = [
  "Eddie rode out to the fence with Buck. He tipped his hat back and Buck laughed at him.",
  "Bobby waved from the porch, and Kate brought out lemonade. She smiled at Bobby, and Bobby smiled back. Kate and Bobby talked for an hour.",
  "Kate said Bobby was sweet. She laughed, and Kate poured another glass for Eddie and Buck.",
].join("\n\n");

describe("character tags that are groups", () => {
  it("doesn't let 'X's Parents' make X ambiguous", () => {
    const cast = buildCast(meta(), TEXT);
    const eddie = cast.chars.find((c) => c.name === "Eddie Diaz")!;
    const buck = cast.chars.find((c) => c.name.includes("Buck"))!;
    expect(eddie.aliases).toContain("Eddie");
    expect(buck.aliases).toContain("Buck");
    expect(cast.chars.some((c) => /Parents|Children/.test(c.name))).toBe(false);
  });
  it("doesn't turn Eddie or Buck into original characters", () => {
    const cast = buildCast(meta(), TEXT);
    const ocs = cast.chars.filter((c) => c.original).map((c) => c.name);
    expect(ocs).not.toContain("Eddie");
    expect(ocs).not.toContain("Buck");
  });
  it("gives the female OC slot to the woman, not to a man from the main pairing", () => {
    const cast = buildCast(meta(), TEXT);
    const bobby = cast.pairings.find((p) => p.some((c) => c.name === "Bobby Nash"))!;
    expect(bobby.map((c) => c.name)).toContain("Kate");
    expect(bobby.map((c) => c.name)).not.toContain("Eddie");
  });
});

describe("no sex on the page", () => {
  const sets = [
    "Eddie's skin tingled as Buck's slick hands moved over his back, spreading the oil. He groaned into the towel.",
    "Buck kissed him, and Eddie sighed against his mouth. They said goodnight and went to their own rooms.",
  ];
  it.each(sets)("finds no sex: %s", (s) => {
    const a = analyzeWithPatterns(`${TEXT}\n\n${s}`, meta(), { quiet: true });
    for (const p of a.pairings) {
      expect(p.anal.instances).toHaveLength(0);
      expect(p.blowjob.instances).toHaveLength(0);
      expect(p.rimming.instances).toHaveLength(0);
    }
    expect(a.pairings.map((p) => p.pairing)).not.toContain("Bobby Nash/Eddie");
  });
  it("doesn't read a gift or an offer of help as 'take it'", () => {
    const a = analyzeWithPatterns(
      `${TEXT}\n\n“Please take it. It fits you,” Buck said, holding out the hat.\n\n“He offered me help, and I was too proud to take it.” Eddie shrugged.`,
      meta(),
      { quiet: true },
    );
    for (const p of a.pairings) expect(p.anal.desires).toHaveLength(0);
  });
  it("still reads 'take it' as top talk when the scene is sexual", () => {
    const a = analyzeWithPatterns(
      `Eddie and Buck were naked in bed, hard and aching, and Buck slicked his cock with lube.\n\n“You can take it,” Buck said, his cock pressed against Eddie's hole.`,
      meta(),
      { quiet: true },
    );
    expect(a.pairings[0].anal.desires.some((d) => d.who === "Evan \"Buck\" Buckley" && d.role === "top")).toBe(true);
  });
});

describe("a woman as the object of oral", () => {
  it("doesn't turn 'went down on her' into a blowjob between two men", () => {
    const m = meta({ relationships: ["Evan \"Buck\" Buckley/Eddie Diaz", "Eddie Diaz/Shannon Diaz"], characters: ["Eddie Diaz", "Evan \"Buck\" Buckley", "Shannon Diaz"] });
    const text = "Eddie sat on the porch with Buck. He tipped his hat back. Buck laughed and he grinned.\n\nShannon had always smiled at Eddie. She waved. Eddie went down on her, slow and thorough, and she moaned.";
    const a = analyzeWithPatterns(text, m, { quiet: true });
    const buckEddie = a.pairings.find((p) => /Buck/.test(p.pairing) && /Eddie/.test(p.pairing));
    expect(buckEddie?.blowjob.instances ?? []).toHaveLength(0);
  });
});
