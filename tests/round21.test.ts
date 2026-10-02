import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

// Round 21: leftovers from a modern Captive Prince AU and a mail-order-husbands Western (paraphrased).
const meta: Ao3Meta = {
  ...emptyMeta(),
  rating: "Explicit",
  categories: ["M/M"],
  fandoms: ["Captive Prince - C. S. Pacat"],
  relationships: ["Damen/Laurent (Captive Prince)"],
  characters: ["Damen (Captive Prince)", "Laurent (Captive Prince)"],
};
const SET = "Damianos and Laurent were in the penthouse, and Laurent was flushed and breathless. Damianos kissed him hard. Laurent whispered Damianos' name again.";
const filler = Array.from({ length: 12 }, (_, i) => `Damianos smiled at Laurent in the office, number ${i}.`).join("\n");
const run = (s: string) => analyzeWithPatterns(`${filler}\n\n${SET}\n\n${s}`, meta, { quiet: true }).pairings[0];

describe("who 'he' is after a line that is only a name", () => {
  it("makes the one who swats the other person", () => {
    const p = run("Laurent nuzzled his head in Damianos' neck, found a spot and bit it. “Laurent.” He hissed and swatted his ass. Laurent kept grinding.");
    expect(p.anal.desires.some((d) => d.who === "Laurent" && d.role === "top")).toBe(false);
  });
});

describe("'as if he wasn't the man who …'", () => {
  it("is a fact about the one who did it", () => {
    const p = run("He gazed at him softly as if he wasn't the man who pushed Laurent to the door to fuck him in the bathroom.");
    expect(p.anal.desires.some((d) => d.who === "Damen" && d.role === "bottom")).toBe(false);
  });
});

describe("everyday things that aren't roles", () => {
  it("doesn't take spreading his legs to wipe them as offering himself", () => {
    const p = run("Damianos pulled off his pants completely then spread his legs to wipe them.");
    expect(p.anal.desires.some((d) => d.who === "Damen" && d.role === "bottom")).toBe(false);
  });
  it("doesn't take pinching someone's cheeks as an ass grab", () => {
    const p = run("Damianos scoffed and pinched Laurent’s cheeks. “Take that back.” He kissed him.");
    expect(p.anal.desires.some((d) => d.who === "Damen")).toBe(false);
  });
});

describe("a nameless tagged character", () => {
  const wm: Ao3Meta = {
    ...emptyMeta(),
    rating: "Explicit",
    categories: ["M/M"],
    fandoms: ["Pilgrimage (2017)"],
    relationships: ["Brother Diarmuid/The Mute"],
    characters: ["Brother Diarmuid", "The Mute", "Original Characters"],
  };
  const lines = Array.from({ length: 14 }, (_, i) => `David carried the flour to the wagon with Diarmuid, trip ${i}.`).join("\n");
  const text = `${lines}\n\nDavid pressed his lips to the tip. Diarmuid trembled beneath him as he continued to lick his cock with the flat of his tongue.`;
  it("is the original character the text names, not a second person", () => {
    const a = analyzeWithPatterns(text, wm, { quiet: true });
    expect(a.pairings[0].pairing).toMatch(/David/);
    expect(a.pairings.length).toBe(1);
  });
  it("reads 'trembled beneath him as he licked his cock' as David sucking Diarmuid", () => {
    const a = analyzeWithPatterns(text, wm, { quiet: true });
    const inst = a.pairings[0].blowjob.instances[0];
    expect(inst?.top).toMatch(/Diarmuid/);
    expect(inst?.bottom).toMatch(/David/);
  });
});
