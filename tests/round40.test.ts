import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const meta: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["House of the Dragon (TV)"], relationships: ["Cregan Stark/Jacaerys Velaryon"], characters: ["Cregan Stark", "Jacaerys Velaryon"] };
const base = ("Lord Cregan watched Prince Jacaerys across the fire. Prince Jacaerys smiled at Lord Cregan. Jace kissed Cregan and Cregan kissed Jace back. ").repeat(2) + "\n\n";
const run = (s: string) => analyzeWithPatterns(base + s, meta, { quiet: true }).pairings[0];
const hints = (s: string) => { const p = run(s); return [...p.anal.desires, ...p.blowjob.desires, ...p.rimming.desires]; };
const factors = (s: string, who: string) => run(s).vibe!.find((v) => v.name.startsWith(who))!.factors!;

describe("titles learned from names: Lord Cregan, Prince Jacaerys", () => {
  it("“the lord cups his ass” is Cregan, “the prince” is Jacaerys", () => {
    const p = run("“Look at me, Jacaerys,” Cregan says, and when the prince opens his eyes, the lord cups his ass and grazes the tight furl between his cheeks with a single finger, causing the boy to keen.");
    expect(p.anal.desires.some((d) => d.who.startsWith("Cregan") && d.role === "top")).toBe(true);
    expect(p.anal.desires.some((d) => d.who.startsWith("Jacaerys") && d.role === "top")).toBe(false);
  });
  it("“the dragon prince” is the prince, so “he hasn't just been fucked” is Jacaerys", () => {
    const text = "Cregan rolls him onto his back and covers him, pinning the boy down as the dragon prince accepts a kiss greedily, as though he hasn’t just been fucked into a new realm.";
    expect(hints(text).some((d) => d.who.startsWith("Cregan") && d.kind === "hypothetical")).toBe(false);
  });
});

describe("other fixes from the Pact of Ice and Fire report", () => {
  it("pressing your hips into someone isn't grinding your ass back", () => {
    expect(factors("He presses his hips into Jace, pinning the boy into the furs beneath them both.", "Cregan").some((f) => /grinding back/.test(f.what) && f.role === "bottom")).toBe(false);
  });
  it("“takes him deeper … punch of his cock” is Cregan fucking Jace, not riding", () => {
    const p = run("Cregan takes him deeper than he ever has, bottoming out with each slow punch of his cock into the prince’s guts, and Jacaerys clenches at him.");
    expect(p.anal.instances.every((i) => i.top === "Cregan Stark")).toBe(true);
    expect(p.anal.instances.length).toBeGreaterThan(0);
  });
  it("tucking someone into your chest is not curling up against them", () => {
    expect(factors("He tucks Jace into his chest and gazes at the fire.", "Jacaerys").some((f) => /curling up/.test(f.what) && f.role === "top")).toBe(false);
  });
  it("a line whose speaker was only guessed counts for half and says so", () => {
    const f = factors("“You’re so big,” was all that could be said.\n\n“Fuck me.”", "Cregan");
    for (const x of f.filter((y) => /guessed/.test(y.what))) expect(x.weight).toBeLessThanOrEqual(0.5);
  });
});
