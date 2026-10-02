import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

// Round 24: an F/F Stranger Things fic (paraphrased).
const meta: Ao3Meta = {
  ...emptyMeta(),
  rating: "Explicit",
  categories: ["F/F"],
  fandoms: ["Stranger Things (TV 2016)"],
  relationships: ["Robin Buckley/Nancy Wheeler"],
  characters: ["Robin Buckley", "Nancy Wheeler"],
};
const SET = "Robin and Nancy were in bed, naked and kissing. Nancy kissed Robin. Robin kissed Nancy back, breathless.";
const filler = Array.from({ length: 12 }, (_, i) => `Nancy smiled at Robin across the video store, number ${i}.`).join("\n");
const run = (s: string) => analyzeWithPatterns(`${filler}\n\n${SET}\n\n${s}`, meta, { quiet: true }).pairings[0];

describe("not sex between two women", () => {
  it("doesn't take 'so fuck me for trying' as a request", () => {
    const p = run("“Oh, so fuck me for trying to keep my lungs vaguely healthy,” Robin said.");
    expect(p.anal.desires).toHaveLength(0);
  });
  it("doesn't take fingers in her own mouth as a cock-sucking hint", () => {
    const p = run("Nancy slid her fingers into her mouth, got them nice and wet, and put them back on her nipple.");
    expect(p.blowjob.desires).toHaveLength(0);
  });
});

describe("women with women", () => {
  const cases: [string, "cunnilingus" | "vaginal"][] = [
    ["Nancy went down on her, tongue circling her clit.", "cunnilingus"],
    ["Robin buried her face in Nancy’s pussy and lapped at her.", "cunnilingus"],
    ["Nancy straddled Robin’s face and rocked down onto her mouth.", "cunnilingus"],
    ["Nancy settled between Robin’s thighs and licked her slowly.", "cunnilingus"],
    ["Nancy and Robin scissored until they both came.", "vaginal"],
    ["Nancy moved her hips, scissoring their legs together.", "vaginal"],
    ["Robin slid two fingers into Nancy and curled them.", "vaginal"],
  ];
  for (const [line, kind] of cases) {
    it(`reads “${line}”`, () => {
      const p = run(line);
      expect(p[kind].instances.length).toBeGreaterThan(0);
    });
  }
});

describe("not scissoring or blowjobs", () => {
  it("doesn't take scissoring fingers as a sex act of its own", () => {
    const p = run("Nancy pressed a finger inside her, then scissored her fingers apart and dragged them in and out.");
    expect(p.vaginal.instances.every((i) => !/scissoring/.test(i.act))).toBe(true);
  });
  it("calls 'got between Robin’s legs and buried her tongue in her hole' rimming, not oral on a penis", () => {
    const p = run("Nancy got between Robin’s legs and buried her tongue in her hole.");
    expect(p.blowjob.instances).toHaveLength(0);
  });
});
