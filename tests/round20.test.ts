import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

// Round 20: a modern Captive Prince AU (paraphrased). Damen is "Damianos" in the text; Laurent is the sugar baby.
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

describe("who says it", () => {
  it("gives a line that speaks to Damianos by name to Laurent", () => {
    const p = run("Damianos looked at him quietly.\n\n“Your dick, Damianos. I want your dick in me. Please.”");
    const said = p.anal.desires.filter((d) => d.kind === "said");
    expect(said.some((d) => d.who === "Damen" && d.role === "bottom")).toBe(false);
    expect(said.some((d) => d.who === "Laurent" && d.role === "bottom")).toBe(true);
  });
});

describe("other people in the past", () => {
  it("takes 'before they bend him over again' as history for Laurent bottoming", () => {
    const p = run("It's nothing new, sleeping after having sex with other rich men, but Laurent usually wakes to clean himself before they bend him over again.");
    expect(p.anal.desires.some((d) => d.who === "Laurent" && d.role === "top")).toBe(false);
    expect(p.anal.desires.find((d) => d.kind === "history")).toMatchObject({ who: "Laurent", role: "bottom" });
  });
  it("still lets a named person bend someone over", () => {
    const p = run("Damianos bent Laurent over the desk and fucked him.");
    expect(p.anal.instances[0]).toMatchObject({ top: "Damen", bottom: "Laurent" });
  });
});

describe("who wants what", () => {
  it("reads 'Laurent needs Damianos to know … he drags him … just to fuck him raw' as Laurent wanting to be fucked", () => {
    const p = run(
      "Laurent needs Damianos to know he likes him like this, likes how much he wants him, that he drags him to the nearest bathroom just to fuck him raw and agree to leave his cum inside.",
    );
    expect(p.anal.desires.some((d) => d.who === "Laurent" && d.role === "top")).toBe(false);
    expect(p.anal.desires.some((d) => d.who === "Laurent" && d.role === "bottom" && d.wants)).toBe(true);
  });
});

describe("fingering and oral at once", () => {
  it("gives 'Damianos continues to suck his cock as if his finger in his ass isn't torture enough' to Damianos", () => {
    const p = run("Laurent is losing it but Damianos continues to suck his cock as if his finger in his ass isn't torture enough.");
    expect(p.anal.instances.find((i) => i.act === "fingering")).toMatchObject({ top: "Damen", bottom: "Laurent" });
    expect(p.anal.desires.filter((d) => d.who === "Laurent" && d.role === "top")).toHaveLength(0);
    expect(p.blowjob.instances[0]).toMatchObject({ top: "Laurent", bottom: "Damen" });
  });
  it("still treats a real 'as if' as a what-if", () => {
    const p = run("Damianos looked at him as if he wanted to bend him over the desk.");
    expect(p.anal.instances).toHaveLength(0);
  });
});

describe("getting between someone's knees to kneel", () => {
  it("doesn't take Laurent pushing Damianos' knees apart before a blowjob as a topping hint", () => {
    const p = run(
      "Laurent gently dropped to his knees, needing to show how grateful he was.\n\n“What are you doing, baby?” Damianos asked when Laurent scooted forward, pushing his knees apart. “You don't have to.”\n\nLaurent looked up, nuzzling Damianos' hardening cock, his tongue darting out.",
    );
    expect(p.anal.desires.filter((d) => /spreading/.test(d.act))).toHaveLength(0);
  });
  it("still counts spreading someone's legs for sex", () => {
    const p = run("Damianos pushed Laurent's thighs apart and reached for the lube, his fingers slick.");
    expect(p.anal.desires.some((d) => d.who === "Damen" && d.role === "top" && /spreading/.test(d.act))).toBe(true);
  });
});
