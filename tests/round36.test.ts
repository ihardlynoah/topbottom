import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";
import { buildReport } from "../src/report";

const meta: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Supernatural"], relationships: ["Castiel/Dean Winchester"], characters: ["Castiel", "Dean Winchester"], freeforms: ["Power Bottom Dean Winchester"] };
const base = ("Dean and Cas were in bed, naked and kissing. Cas kissed Dean. Dean kissed Cas back, breathless. ").repeat(2);
const run = (s: string) => analyzeWithPatterns(base + s, meta, { quiet: true }).pairings[0];

describe("vibe factors carry their source text", () => {
  const p = run("Cas fucked Dean hard on the bed, pounding into him.\n\nDean fell asleep on Cas’s chest, still naked.");
  const dean = p.vibe!.find((v) => v.name.startsWith("Dean"))!;
  const cas = p.vibe!.find((v) => v.name.startsWith("Cas"))!;
  it("lists every factor with tier, role, weight and what it was", () => {
    expect(dean.factors!.length).toBeGreaterThan(2);
    for (const f of dean.factors!) {
      expect(f.tier).toBeGreaterThanOrEqual(1);
      expect(f.tierName).toBeTruthy();
      expect(f.what).toBeTruthy();
      expect(f.weight).toBeGreaterThan(0);
    }
  });
  it("a sex act factor quotes the sentence", () => {
    const act = dean.factors!.find((f) => f.tier === 1 && f.role === "bottom")!;
    expect(act.source).toContain("pounding into him");
  });
  it("a tag factor quotes the tag", () => {
    const tag = dean.factors!.find((f) => f.tier === 2)!;
    expect(tag.source).toBe("Power Bottom Dean Winchester");
  });
  it("a hint factor quotes the line and says it came from the other person's side where it did", () => {
    expect(dean.factors!.some((f) => f.tier === 6 && /chest/.test(f.source ?? ""))).toBe(true);
    expect(cas.factors!.some((f) => f.tier === 6 && f.fromOther && /chest/.test(f.source ?? ""))).toBe(true);
  });
  it("factors line up with the tier summary lines", () => {
    for (const tierName of new Set(dean.factors!.map((f) => f.tierName))) expect(dean.basis.some((b) => b.startsWith(tierName))).toBe(true);
  });
});

describe("report carries the vibe factors the reader ticked", () => {
  it("prints them under the vibe item", () => {
    const text = buildReport({
      source: "patterns", summaries: [], missed: [], general: "",
      flags: [{ id: "v", kind: "vibe", pairing: "Castiel/Dean Winchester", card: "vibe", top: "Dean Winchester", bottom: "", act: "Total bottom", confidence: 0.8, evidence: "", reasons: ["vibe_too_bottom"], note: "He tops in chapter 3",
        extra: ["Evidence: Sex acts: bottom ×3", "Factor I'm pointing at: bottom · tier 1 (Sex acts) · weight 0.5 · anal sex (named) — “Cas fucked Dean hard.”"] }],
    });
    expect(text).toContain("Factor I'm pointing at: bottom · tier 1 (Sex acts)");
    expect(text).toContain("Cas fucked Dean hard.");
    expect(text).toContain("Rating leans too far toward bottom");
  });
});
