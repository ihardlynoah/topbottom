import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { type AuditHit, analyzeWithPatterns } from "../src/heuristic";

const M = (freeforms: string[], categories = ["M/M"]): Ao3Meta => ({ ...emptyMeta(), rating: "Explicit", categories, fandoms: ["Original Work"], relationships: ["Dean Winchester/Castiel"], characters: ["Dean Winchester", "Castiel"], freeforms });
const lead = "Dean and Castiel were in bed, naked and kissing, hard and aching. Dean kissed Castiel. Castiel kissed Dean back, moaning. ".repeat(2) + "\n\n";
const hitsFor = (t: string, freeforms: string[], categories?: string[]) => {
  const hits: AuditHit[] = [];
  analyzeWithPatterns(lead + t, M(freeforms, categories), { quiet: true, audit: (h) => hits.push(h) });
  return hits.filter((h) => h.via.startsWith("chastity-"));
};
const TAGS = ["Chastity Device"];

describe("chastity device / cock cage tags (m/m)", () => {
  it("the one who locks the cage on is the controlling one", () => {
    const h = hitsFor("Dean snapped the cage onto Castiel's cock and smiled.", TAGS);
    expect(h.length).toBeGreaterThan(0);
    expect(h.every((x) => x.via.startsWith("chastity-lock-on"))).toBe(true);
  });
  it("‘locked Castiel's cock in a cage’ and ‘put Castiel in a cage’ are read", () => {
    expect(hitsFor("Dean locked Castiel's cock in a cage that night.", ["Cock Cage"]).length).toBeGreaterThan(0);
    expect(hitsFor("Dean put Castiel in a cock cage for the week.", ["Cock Cage"]).length).toBeGreaterThan(0);
  });
  it("the keyholder and the wearer are read", () => {
    expect(hitsFor("Dean held the key to Castiel's cage in his fist.", TAGS).length).toBeGreaterThan(0);
    expect(hitsFor("Castiel was locked in a cage all week, whining.", TAGS).length).toBeGreaterThan(0);
    expect(hitsFor("Castiel's cock strained against the cage.", ["Cock-Cage"]).length).toBeGreaterThan(0);
  });
  it("nothing fires without a chastity tag, or in a work that isn't m/m", () => {
    expect(hitsFor("Dean snapped the cage onto Castiel's cock and smiled.", ["Rimming"])).toHaveLength(0);
    expect(hitsFor("Dean snapped the cage onto Castiel's cock and smiled.", TAGS, ["F/M"])).toHaveLength(0);
  });
  it("a bird cage is not a chastity device", () => {
    expect(hitsFor("Dean carried the bird cage to Castiel's porch.", TAGS)).toHaveLength(0);
  });
});
