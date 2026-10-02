import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const meta = (over: Partial<Ao3Meta>): Ao3Meta => ({ ...emptyMeta(), rating: "Explicit", categories: ["M/M"], ...over });
const MM = meta({ relationships: ["Derek Hale/Stiles Stilinski"] });
const run = (text: string) => analyzeWithPatterns(text, MM, { quiet: true }).pairings[0];
const SETUP = "Derek and Stiles were naked in bed, hard and aching.";
const go = (s: string) => run(`${SETUP}\n\n${s}`);

describe("curses in narration", () => {
  it("doesn't read 'fuck X for being…' as sex", () => {
    expect(go("Stiles couldn't help it, and fuck Derek for being so patient about it.").anal.instances).toHaveLength(0);
  });
  it("doesn't read 'with X in the first place' as penetration", () => {
    expect(go("Stiles was stupid to fall for Derek in the first place, stupid to be with Derek in the first place.").anal.instances).toHaveLength(0);
  });
});

describe("speech tags", () => {
  it("takes the name after an inverted speech tag as the subject", () => {
    const p = go(`"Love you," whispers Derek, rolling on a condom, before sliding into Stiles inch by inch.`);
    expect(p.anal.instances[0]).toMatchObject({ top: "Derek Hale", bottom: "Stiles Stilinski" });
  });
  it("finds the speaker after a blanked-out quote", () => {
    const p = go(`"Don't stop," Derek says, choking at the heat of being inside Stiles.`);
    expect(p.anal.instances[0]).toMatchObject({ top: "Derek Hale", bottom: "Stiles Stilinski" });
  });
});

describe("round 8 phrasings", () => {
  it("reads 'finally bottoms' after sliding in as bottoming out", () => {
    const p = go("Derek pushed against Stiles, slipping in inch by inch, until Derek finally bottoms.");
    for (const i of p.anal.instances) expect(i).toMatchObject({ top: "Derek Hale", bottom: "Stiles Stilinski" });
  });
  it("reads 'takes the head between his lips' as oral", () => {
    expect(go("Stiles takes the head of Derek's cock between his lips.").oral.instances[0]).toMatchObject({ top: "Derek Hale", bottom: "Stiles Stilinski" });
  });
  it("reads 'parts his lips and wraps them around his girth' as oral", () => {
    expect(go("Derek watches as Stiles parts his lips, and wraps them around Derek's girth.").oral.instances[0]).toMatchObject({ top: "Derek Hale", bottom: "Stiles Stilinski" });
  });
  it("reads 'licks directly over his hole' as rimming", () => {
    expect(go("Derek licks directly over Stiles's hole.").oral.instances[0]).toMatchObject({ top: "Derek Hale", act: "rimming" });
  });
  it("doesn't make balls that are being teased the actor", () => {
    const p = go("When Stiles gets halfway down, one of his fingers slips lower to tease Derek's balls and graze his hole.");
    expect(p.anal.instances.filter((i) => i.top === "Derek Hale" && i.act !== "fingering")).toHaveLength(0);
  });
});
