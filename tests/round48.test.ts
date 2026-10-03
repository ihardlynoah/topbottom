import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const M: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Hockey RPF"], relationships: ["Shane Hollander/Ilya Rozanov"], characters: ["Shane Hollander", "Ilya Rozanov"] };
const lead = "Shane and Ilya were in the hotel, kissing. Shane kissed Ilya. Ilya kissed Shane back, moaning, hard and naked. ".repeat(2) + "\n\n";
const run = (t: string) => analyzeWithPatterns(lead + t, M, { quiet: true }).pairings[0];
const scenes = (t: string) => { const p = run(t); return p.anal.instances.length + p.oral.instances.length; };

describe("false positives from a real fic", () => {
  it("‘the second wave of nausea’ is not a person being swallowed", () => {
    expect(scenes("Ilya leaned over the sink. He wrinkled his nose and swallowed down the third… no, the second wave of nausea. \"No,\" he said.")).toBe(0);
    expect(scenes("Ilya swallowed down the second round of bile.")).toBe(0);
  });
  it("slipping inside a room is not penetration", () => {
    expect(scenes("The door opened at once. Shane slipped inside and sat on the edge of the bed. His hands shook.")).toBe(0);
  });
  it("finding his own prostate right after fingering himself is a solo act, not the partner’s scene", () => {
    expect(scenes("He slid a finger inside himself and stroked with the other hand.\n\nThis is easier with company, Shane thought as he tried to find his prostate. He could barely reach it.")).toBe(0);
  });
  it("resisting the urge to put a hand down his own pants is not touching the partner", () => {
    const p = run("Shane’s dick was hard already. He was only able to resist the urge to shove a hand down his pants for about ten seconds.");
    expect(p.anal.desires.some((d) => d.kind === "touch")).toBe(false);
  });
});

describe("a look back at an earlier night", () => {
  it("‘now he knew what it was like to fuck X’ after being the bottom does not make him a top", () => {
    const text = "Ilya thrust into Shane slowly, his cock buried deep inside Shane, and Shane moaned. Ilya fucked Shane hard until Shane came.\n\nLater, in the shower, Shane smiled. Now he knew what it was like to fuck Ilya Rozanov.";
    const p = analyzeWithPatterns(lead + text, M, { quiet: true }).pairings[0];
    expect(p.anal.verdict).toBe("one_way");
    expect(p.anal.top).toMatch(/Ilya/);
  });
});
