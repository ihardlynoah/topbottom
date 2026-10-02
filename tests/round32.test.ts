import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const meta: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Supernatural"], relationships: ["Castiel/Dean Winchester"], characters: ["Castiel", "Dean Winchester"] };
const base = ("Dean and Cas were in bed, naked and kissing. Cas kissed Dean. Dean kissed Cas back, breathless. ").repeat(3);
const run = (s: string) => analyzeWithPatterns(base + s, meta, { quiet: true }).pairings[0];
const count = (s: string) => { const p = run(s); return p.anal.instances.length + p.blowjob.instances.length; };

describe("his own X / himself is not a scene with the partner", () => {
  for (const l of [
    "Cas pushed two fingers into his own ass and moaned.",
    "Cas slid a finger into his own hole, eyes fixed on Dean.",
    "Dean sucked his own cock, flexible bastard.",
    "Cas fingered himself open, hole slick and stretched, while Dean watched.",
  ]) it(`no partner scene: ${l}`, () => expect(count(l)).toBe(0));

  it("own-ass fingers count as Cas bottoming (solo hint)", () => {
    const p = run("Cas pushed two fingers into his own ass and moaned, then did it again.");
    const cas = p.vibe!.find((v) => /Cas/.test(v.name))!;
    expect(cas.label).not.toMatch(/top/i);
  });
  it("the object form still reads as a scene", () => {
    expect(count("Cas worked him open on his fingers while Dean groaned.")).toBeGreaterThan(0);
    expect(count("Cas fucked him on the bed.")).toBeGreaterThan(0);
    expect(count("Dean sucked him off.")).toBeGreaterThan(0);
  });
});
