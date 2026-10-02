import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const meta = (over: Partial<Ao3Meta>): Ao3Meta => ({ ...emptyMeta(), rating: "Explicit", categories: ["M/M"], ...over });
const MM = meta({ relationships: ["Derek Hale/Stiles Stilinski"] });
const SETUP = "Derek and Stiles were naked in bed, hard and aching.";
const run = (s: string) => analyzeWithPatterns(`${SETUP}\n\n${s}`, MM, { quiet: true }).pairings[0];

describe("round 9 oral phrasings", () => {
  it.each([
    ["Stiles opens for him, taking in the head of his cock and giving him a soft, slow suck."],
    ["Derek comes between those soft lips, and Stiles swallows."],
    ["Stiles gives Derek a long, slow suck, his cock heavy on his tongue."],
  ])("%s", (s) => {
    expect(run(s).oral.instances[0]).toMatchObject({ top: "Derek Hale", bottom: "Stiles Stilinski" });
  });

  it("doesn't read a bottle brought to the lips as oral", () => {
    expect(run("Derek wraps his hand around the neck of the bottle and brings it to his lips.").oral.instances).toHaveLength(0);
  });
});

describe("round 9 false positives", () => {
  it("treats 'at the prospect of X filling him' as desire", () => {
    const p = run("Stiles nods, eyes widening at the prospect of Derek's cock filling him.");
    expect(p.anal.instances).toHaveLength(0);
  });
  it("doesn't read cupping cheeks as grabbing an ass", () => {
    const p = run("Derek tugs him around and cups his cheeks.");
    expect(p.anal.desires.filter((d) => d.kind === "touch")).toHaveLength(0);
  });
  it("doesn't read a face pressed against a neck as pushing a head down", () => {
    const p = run("Stiles sagged against Derek, pressing his face against his neck.");
    expect(p.oral.desires.filter((d) => d.kind === "prep")).toHaveLength(0);
  });
  it("doesn't read 'presses in harder' during a kiss as penetration", () => {
    const p = run("Derek's mouth is hot, and Derek shudders and presses in harder, deepening the kiss.");
    expect(p.anal.instances).toHaveLength(0);
  });
  it("credits 'they' after someone's knuckles to that person, as fingering", () => {
    const p = run("Stiles rolls his hips until the ridges of Derek's knuckles draw moans from him each time they slide past his rim.");
    expect(p.anal.instances[0]).toMatchObject({ top: "Derek Hale", bottom: "Stiles Stilinski", act: "fingering" });
  });
  it("doesn't take 'fuck you so full' as the speaker feeling full", () => {
    const p = run(`"Gonna fuck you so full," Derek growls.`);
    expect(p.anal.desires.filter((d) => d.who === "Derek Hale" && d.role === "bottom")).toHaveLength(0);
  });
});

describe("speakers", () => {
  it("gives a paragraph-opening 'he says' line to the other person from the last line", () => {
    const text = `${SETUP}\n\nDerek leaned close. "Fingers or cock?" Derek asked.\n\nStiles's heart pounded. "Cock," he says, sliding a finger into himself.`;
    const p = analyzeWithPatterns(text, MM, { quiet: true }).pairings[0];
    expect(p.anal.desires).toContainEqual(expect.objectContaining({ who: "Stiles Stilinski", kind: "solo" }));
  });
  it("keeps one speaker across a quote split by a speech tag", () => {
    const text = `${SETUP}\n\nDerek fucks him through it. "You can take it," he tells him, "you're made to take my cock."`;
    const p = analyzeWithPatterns(text, MM, { quiet: true }).pairings[0];
    for (const d of p.anal.desires.filter((x) => x.kind === "said")) expect(d.who).toBe("Derek Hale");
  });
});
