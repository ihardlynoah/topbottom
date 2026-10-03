import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";
import { rateVibe, type VibeItem } from "../src/vibe";

const it_ = (tier: VibeItem["tier"], role: "top" | "bottom", weight = 1): VibeItem => ({ tier, role, weight });

describe("rateVibe", () => {
  it("gives no rating with nothing to go on", () => {
    expect(rateVibe("A", []).label).toBe("Unclear");
  });
  it("calls repeated on-page topping a total top with high confidence", () => {
    const v = rateVibe("A", [it_(1, "top", 0.5), it_(1, "top", 0.5), it_(1, "top", 0.5), it_(1, "top", 0.5), it_(1, "top", 0.5)]);
    expect(v.label).toBe("Total top");
    expect(v.confidence.score).toBeGreaterThan(0.7);
  });
  it("calls a mix of scenes vers, leaning by the balance", () => {
    expect(rateVibe("A", [it_(1, "top", 0.5), it_(1, "bottom", 0.5), it_(1, "top", 0.5), it_(1, "bottom", 0.5)]).label).toBe("Vers");
    expect(rateVibe("A", [it_(1, "top", 0.5), it_(1, "top", 0.5), it_(1, "top", 0.5), it_(1, "bottom", 0.5)]).label).toBe("Vers top");
  });
  it("lets a higher tier outweigh a lower one", () => {
    const v = rateVibe("A", [it_(1, "bottom", 0.5), it_(1, "bottom", 0.5), it_(5, "top", 0.4), it_(5, "top", 0.4), it_(6, "top", 0.4), it_(7, "top", 0.6)]);
    expect(v.label === "Total bottom" || v.label === "Vers bottom").toBe(true);
  });
  it("won't commit on faint hints alone", () => {
    const v = rateVibe("A", [it_(5, "top", 0.4)]);
    expect(["Unclear", "Vers", "Vers top"]).toContain(v.label);
    expect(v.confidence.score).toBeLessThan(0.3);
  });
  it("keeps tag counts alone at very low confidence", () => {
    const v = rateVibe("A", [it_(7, "bottom", 0.5)]);
    expect(v.confidence.score).toBeLessThanOrEqual(0.12);
  });
});

describe("vibe in an analysis", () => {
  const meta: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Teen Wolf (TV)"], relationships: ["Derek Hale/Stiles Stilinski"], characters: ["Derek Hale", "Stiles Stilinski"] };
  const filler = Array.from({ length: 12 }, () => "Derek glanced at Stiles across the loft. Stiles grinned back.").join("\n");
  it("rates both partners from the scenes", () => {
    const t = `${filler}\n\nDerek and Stiles were in bed, naked. Derek pushed Stiles onto his back and fucked him slowly. Derek thrust into Stiles again. Derek fucked Stiles harder.`;
    const [d, s] = analyzeWithPatterns(t, meta, { quiet: true }).pairings[0].vibe!;
    expect(d.name).toMatch(/Derek/);
    expect(d.label).toBe("Total top");
    expect(s.label === "Total bottom" || s.label === "Vers bottom").toBe(true);
  });
  it("scores dominant and submissive behaviour on the dynamic axis, and only faintly in the vibe", () => {
    const t = `${filler}\n\nDerek pinned Stiles against the wall. Derek took control of the kiss. Stiles melted into the kiss.`;
    const p = analyzeWithPatterns(t, meta, { quiet: true }).pairings[0];
    expect(p.dynamic![0].basis.join(" ")).toMatch(/Taking charge/);
    expect(p.vibe![0].confidence.score).toBeLessThan(0.45);
  });
});
