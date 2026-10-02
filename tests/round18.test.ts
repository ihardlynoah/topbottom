import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

// Round 18: a Greek-myth Captive Prince AU (paraphrased). Damen is the one doing the sucking and fucking.
const meta: Ao3Meta = {
  ...emptyMeta(),
  rating: "Explicit",
  categories: ["M/M", "F/M"],
  relationships: ["Damen/Laurent (Captive Prince)", "Damen/Jokaste"],
  characters: ["Damen", "Laurent", "Jokaste"],
};
const SET = "Damen and Laurent lay together on the pallet, naked, and Damen's hand slid down Laurent's side.";
const run = (s: string, setup = SET) => analyzeWithPatterns(`${setup}\n\n${s}`, meta, { quiet: true }).pairings[0];
const nothing = (s: string, cat: "anal" | "blowjob" = "blowjob", setup?: string) => run(s, setup)[cat].instances.length === 0;

describe("oral phrasings", () => {
  it.each([
    "Damen pressed him down, and without further preamble, took him into his mouth.",
    "Damen smiled and, without further preamble, took Laurent into his mouth.",
    "Damen lifted his eyes to meet Laurent's as he opened his mouth and began to suck lazily on the head.",
    "Damen groaned around Laurent, then pinched him tighter.",
    "Damen dropped his head down almost fully, and the sensation was one Laurent had never felt before.",
    "Damen continued to squeeze his nipples as he lowered his head between Laurent's thighs again.",
  ])("%s", (s) => {
    expect(run(s).blowjob.instances[0]).toMatchObject({ top: "Laurent", bottom: "Damen" });
  });
  it("reads 'lowered his head between her thighs' as cunnilingus", () => {
    const a = analyzeWithPatterns(
      "Damen and Jokaste lay together. She smiled at him and he kissed her.\n\nHe lowered his head between her thighs and she gasped.\n\nLater, Damen went down on her again, slow and thorough, and Jokaste moaned.",
      meta,
      { quiet: true },
    ).pairings.find((p) => /Jokaste/.test(p.pairing))!;
    expect(a.cunnilingus.instances[0]).toMatchObject({ top: "Damen", bottom: "Jokaste" });
  });
});

describe("not oral", () => {
  it.each([
    "Damen hummed around the cigarette and grinned at Laurent.",
    "Damen laughed around a mouthful of bread.",
    "Damen began to kiss his way down the road toward the stables.",
    "Damen dropped his head all the way back and laughed.",
    "His breath hitched as Damen lowered his head further, nudging the chiton off Laurent's shoulder to kiss along his collarbone.",
  ])("finds nothing in: %s", (s) => {
    expect(nothing(s)).toBe(true);
  });
  it("doesn't read a thumb circling a clit as cunnilingus", () => {
    const a = analyzeWithPatterns(
      "Damen and Jokaste lay together. She smiled at him and he kissed her.\n\nHe pressed a finger inside her and circled her clit with his thumb.",
      meta,
      { quiet: true },
    ).pairings.find((p) => /Jokaste/.test(p.pairing))!;
    expect(a.cunnilingus.instances).toHaveLength(0);
  });
});

describe("not anal", () => {
  it.each([
    "Laurent was thrown onto an altar, his chained wrists stretched taut above his head until they ached.",
    "It would be one thing, to see Damen fucking him.",
    "It was another thing entirely to see himself asking Damen to fuck him.",
  ])("finds nothing in: %s", (s) => {
    expect(nothing(s, "anal")).toBe(true);
  });
  it("still reads a person being stretched wide as anal", () => {
    expect(run("Laurent was stretched wide around Damen's cock, moaning.").anal.instances[0]).toMatchObject({ top: "Damen", bottom: "Laurent" });
  });
});

describe("'without' isn't always a refusal", () => {
  it("counts an act after 'without further ado'", () => {
    expect(run("Damen rolled Laurent over and, without further ado, slid his cock into him.").anal.instances[0]).toMatchObject({ top: "Damen", bottom: "Laurent" });
  });
  it("still treats 'without wanting to' as a refusal", () => {
    const r = run("Damen sat there without wanting to fuck him.");
    expect(r.anal.instances).toHaveLength(0);
  });
});
