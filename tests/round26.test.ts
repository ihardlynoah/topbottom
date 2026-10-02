import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

// Round 26: an F/F Wicked college AU with strap-ons (paraphrased).
const meta: Ao3Meta = {
  ...emptyMeta(),
  rating: "Explicit",
  categories: ["F/F"],
  fandoms: ["Wicked (Movie 2024)"],
  relationships: ["Elphaba Thropp/Glinda the Good"],
  characters: ["Elphaba Thropp", "Glinda the Good"],
  freeforms: ["Top Elphaba Thropp", "Bottom Elphaba Thropp", "Strap-Ons"],
};
const SET = "Glinda and Elphaba were in bed, naked and kissing. Elphaba kissed Glinda. Glinda kissed Elphaba back, breathless.";
const filler = Array.from({ length: 12 }, (_, i) => `Elphaba rolled her eyes at Glinda across the dorm, number ${i}.`).join("\n");
const run = (s: string) => analyzeWithPatterns(`${filler}\n\n${SET}\n\n${s}`, meta, { quiet: true }).pairings[0];

describe("clothing and class rank aren't roles", () => {
  it("doesn't take 'stripped, top first, then trousers' as sex", () => {
    const p = run("Glinda stood and stripped herself next, top first, then trousers.");
    expect(p.vaginal.instances).toHaveLength(0);
  });
  it("doesn't take 'I'm top of my class' as topping", () => {
    const p = run("“I’m top of my class,” Glinda said, smiling.");
    expect(p.anal.desires).toHaveLength(0);
  });
});

describe("hands aren't mouths", () => {
  it("doesn't take circling a clit with a hand as cunnilingus", () => {
    const p = run("She slid her hand back between Glinda’s thighs, slick and flushed, and circled her clit again, light and relentless.");
    expect(p.cunnilingus.instances).toHaveLength(0);
  });
  it("still takes licking as cunnilingus", () => {
    const p = run("Elphaba settled between her thighs, strap still buried deep, and licked her clit.");
    expect(p.cunnilingus.instances.length).toBeGreaterThan(0);
  });
});

describe("two women with top/bottom tags", () => {
  it("doesn't report the anal card from top/bottom tags when there's no anal", () => {
    const p = run("Elphaba slid two fingers inside her and curled them.");
    expect(p.anal.verdict).toBe("none");
    expect(p.anal.summary).not.toMatch(/AO3 tags/);
  });
  it("doesn't read fingers in her own mouth as a cock-sucking hint, even with a strap-on about", () => {
    const p = run("Elphaba buckled the strap on. Glinda slid her fingers into her mouth, wet them, and touched her nipple.");
    expect(p.blowjob.desires).toHaveLength(0);
  });
});
