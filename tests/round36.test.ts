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

import { FLAG_REASONS, REASONS_FOR } from "../src/report";
describe("error-report checkbox options", () => {
  it("every option offered for scenes, hints, ratings and single factors has a label", () => {
    const keys = new Set(FLAG_REASONS.map((r) => r.key as string));
    for (const [kind, list] of Object.entries(REASONS_FOR)) for (const k of list) expect(keys.has(k), `${kind}:${k}`).toBe(true);
  });
  it("factors can be reported for a wrong speaker, pronoun, person, tier, weight, duplicates and more", () => {
    for (const k of ["wrong_speaker", "wrong_pronoun", "wrong_person", "swapped", "not_sexual_context", "figurative", "hypothetical", "negated", "duplicate", "wrong_tier", "too_strong", "too_weak"]) expect(REASONS_FOR.factor).toContain(k);
  });
  it("scenes and hints offer the new speaker / pronoun / negation / duplicate options", () => {
    expect(REASONS_FOR.scene).toEqual(expect.arrayContaining(["wrong_pronoun", "negated", "duplicate", "figurative"]));
    expect(REASONS_FOR.hint).toEqual(expect.arrayContaining(["wrong_speaker", "wrong_pronoun", "not_sexual_context", "negated", "duplicate"]));
  });
  it("labels are unique", () => expect(new Set(FLAG_REASONS.map((r) => r.label)).size).toBe(FLAG_REASONS.length));
});
