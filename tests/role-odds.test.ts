import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";
import { oddsFromResult, roleOdds } from "../src/roles";

const meta = (over: Partial<Ao3Meta> = {}): Ao3Meta => ({
  ...emptyMeta(),
  rating: "Explicit",
  categories: ["M/M"],
  relationships: ["Derek Hale/Stiles Stilinski"],
  characters: ["Derek Hale", "Stiles Stilinski"],
  ...over,
});
const run = (s: string, m = meta()) => analyzeWithPatterns(`Derek and Stiles were naked in bed, hard and aching.\n\n${s}`, m, { quiet: true }).pairings[0];
const odds = (r: { people?: { name: string; top: number; bottom: number }[] }, name: string) => r.people!.find((p) => p.name === name)!;

describe("per-person role odds", () => {
  it("gives one person each role in a one-way pairing", () => {
    const p = run("Derek fucked Stiles hard.\n\nThe next morning Derek fucked Stiles again, slow this time.");
    expect(odds(p.anal, "Derek Hale").top).toBeGreaterThan(0.9);
    expect(odds(p.anal, "Derek Hale").bottom).toBeLessThan(0.1);
    expect(odds(p.anal, "Stiles Stilinski").bottom).toBeGreaterThan(0.9);
    expect(odds(p.anal, "Stiles Stilinski").top).toBeLessThan(0.1);
  });
  it("scores both roles high for both people when they switch", () => {
    const p = run(
      "Derek fucked Stiles hard.\n\nThe next night Derek fucked Stiles again.\n\nOn Sunday Stiles fucked Derek into the mattress.\n\nLater Stiles fucked Derek slowly.",
    );
    for (const n of ["Derek Hale", "Stiles Stilinski"]) {
      expect(odds(p.anal, n).top).toBeGreaterThan(0.75);
      expect(odds(p.anal, n).bottom).toBeGreaterThan(0.75);
    }
  });
  it("words oral odds per act: who sucks and who gets sucked", () => {
    const p = run("Stiles sucked Derek off slowly.");
    // In a blowjob the "top" is the one getting sucked.
    expect(odds(p.blowjob, "Derek Hale").top).toBeGreaterThan(0.7);
    expect(odds(p.blowjob, "Stiles Stilinski").bottom).toBeGreaterThan(0.7);
    expect(odds(p.rimming, "Derek Hale").top).toBeLessThan(0.05);
  });
  it("keeps tags alone well below on-page scenes", () => {
    const p = run("They talked for hours.", meta({ freeforms: ["Top Derek Hale", "Bottom Stiles Stilinski"] }));
    const d = odds(p.anal, "Derek Hale");
    expect(d.top).toBeGreaterThan(0.4);
    expect(d.top).toBeLessThan(0.75);
    expect(d.bottom).toBeLessThan(0.1);
  });
});

describe("roleOdds", () => {
  it("discounts one shaky scene against many the other way", () => {
    const [a] = roleOdds(["A", "B"], [
      ...Array.from({ length: 5 }, () => ({ who: "A", role: "top" as const, weight: 1, kind: "scene" as const })),
      { who: "A", role: "bottom", weight: 0.5, kind: "scene" },
    ]);
    expect(a.top).toBeGreaterThan(0.9);
    expect(a.bottom).toBeLessThan(0.2);
  });
  it("caps what hints alone can say", () => {
    const hints = Array.from({ length: 20 }, () => ({ who: "A", role: "top" as const, weight: 0.15, kind: "hint" as const }));
    expect(roleOdds(["A"], hints)[0].top).toBeLessThan(0.5);
  });
  it("works from finished results (Claude's answers)", () => {
    const o = oddsFromResult(
      {
        instances: [{ top: "A", bottom: "B", act: "anal sex", where: "", evidence: "" }],
        desires: [{ who: "B", role: "bottom", wants: true, kind: "said", act: "anal sex", where: "", evidence: "" }],
      },
      ["A", "B"],
    );
    expect(o[0].top).toBeGreaterThan(0.75);
    expect(o[1].bottom).toBeGreaterThan(0.75);
    expect(o[1].top).toBeLessThan(0.05);
  });
});
