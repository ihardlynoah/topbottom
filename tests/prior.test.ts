import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";
import { tagPriors } from "../src/heuristic/ao3-prior";

const meta = (fandom: string, rel: string, chars: string[]): Ao3Meta => ({ ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: [fandom], relationships: [rel], characters: chars });

describe("AO3 tag-count prior", () => {
  it("finds a character by name or nickname within the tagged fandom", () => {
    const p = tagPriors(meta("Supernatural", "Castiel/Dean Winchester", []), [
      { name: "Dean Winchester", aliases: ["Dean"] },
      { name: "Castiel", aliases: ["Cas"] },
    ]);
    expect(p.get("Dean Winchester")!.pTop).toBeLessThan(0.45);
    expect(p.get("Castiel")!.pTop).toBeGreaterThan(0.5);
  });
  it("ignores characters from fandoms the work isn't in", () => {
    const p = tagPriors(meta("Teen Wolf", "Derek Hale/Stiles Stilinski", []), [{ name: "Dean Winchester", aliases: ["Dean"] }]);
    expect(p.size).toBe(0);
  });
  it("only nudges: a tiny lean with nothing else", () => {
    const m = meta("Heated Rivalry", "Shane Hollander/Ilya Rozanov", ["Shane Hollander", "Ilya Rozanov"]);
    const text = Array.from({ length: 12 }, () => "Shane glanced at Ilya across the rink. Ilya smirked back.").join("\n");
    const a = analyzeWithPatterns(text, m, { quiet: true });
    const odds = a.pairings[0].anal.people!;
    const shane = odds.find((o) => /Shane/.test(o.name))!;
    expect(shane.bottom).toBeGreaterThan(shane.top);
    expect(shane.bottom).toBeLessThan(0.3);
  });
  it("is overridden by what happens in the text", () => {
    const m = meta("Heated Rivalry", "Shane Hollander/Ilya Rozanov", ["Shane Hollander", "Ilya Rozanov"]);
    const text = `${Array.from({ length: 12 }, () => "Shane glanced at Ilya across the rink. Ilya smirked back.").join("\n")}\n\nShane and Ilya were in bed, naked. Shane pushed Ilya onto his back and fucked him slowly. Shane thrust into Ilya again.`;
    const a = analyzeWithPatterns(text, m, { quiet: true });
    const shane = a.pairings[0].anal.people!.find((o) => /Shane/.test(o.name))!;
    expect(shane.top).toBeGreaterThan(0.8);
  });
});
