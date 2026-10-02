import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";
import { oralKindOf, splitOral } from "../src/roles";
import type { ActResult } from "../src/types";

const meta = (over: Partial<Ao3Meta>): Ao3Meta => ({ ...emptyMeta(), rating: "Explicit", categories: ["M/M"], ...over });
const MM = meta({ relationships: ["Derek Hale/Stiles Stilinski"], characters: ["Derek Hale", "Stiles Stilinski"] });
const run = (s: string, m = MM) => analyzeWithPatterns(`Derek and Stiles were naked in bed, hard and aching.\n\n${s}`, m, { quiet: true }).pairings[0];

describe("oral results per act", () => {
  it("reports a blowjob as who sucks and who gets sucked", () => {
    const p = run("Stiles sucked Derek off slowly.");
    expect(p.blowjob).toMatchObject({ verdict: "one_way", top: "Derek Hale", bottom: "Stiles Stilinski" });
    expect(p.blowjob.summary).toMatch(/^Stiles Stilinski sucks cock; Derek Hale gets sucked/);
    expect(p.rimming.verdict).toBe("none");
  });
  it("reports rimming as who eats ass and whose ass is eaten", () => {
    const p = run("Derek spread Stiles open and ate him out until he shook.");
    expect(p.rimming).toMatchObject({ verdict: "one_way", top: "Derek Hale", bottom: "Stiles Stilinski" });
    expect(p.rimming.summary).toMatch(/^Derek Hale eats ass; Stiles Stilinski gets their ass eaten/);
    expect(p.blowjob.verdict).toBe("none");
  });
  it("keeps blowjobs and rimming apart, so neither looks like a switch", () => {
    // Stiles sucks Derek, then Stiles rims Derek: the combined oral "top" flips, but each act is one-way.
    const p = run("Stiles sucked Derek off.\n\nAn hour later, Stiles rimmed Derek until he begged.");
    expect(p.blowjob).toMatchObject({ verdict: "one_way", bottom: "Stiles Stilinski" });
    expect(p.rimming).toMatchObject({ verdict: "one_way", top: "Stiles Stilinski" });
  });
  it("words a blowjob switch by who sucks", () => {
    const p = run(
      "Stiles sucked Derek off.\n\nThe next night, Derek sucked Stiles off.\n\nThe night after, Stiles blew Derek in the shower.\n\nOn Sunday Derek went down on Stiles.",
    );
    expect(p.blowjob.verdict).toBe("switch");
    expect(p.blowjob.summary).toMatch(/^Both suck cock: /);
  });
  it("sorts acts and hints", () => {
    expect(oralKindOf("blowjob, face-fucking")).toBe("blowjob");
    expect(oralKindOf("rimming")).toBe("rimming");
    expect(oralKindOf("cunnilingus")).toBe("cunnilingus");
    expect(oralKindOf("checking out a crotch")).toBe("blowjob");
  });
});

describe("splitting Claude's oral answer", () => {
  const conf = { score: 0.9, label: "High" as const, reasons: [] };
  const oral: ActResult = {
    verdict: "switch",
    top: "A",
    bottom: "B",
    summary: "",
    desires: [],
    confidence: conf,
    instances: [
      { top: "A", bottom: "B", act: "blowjob", where: "Ch 1", evidence: "" },
      { top: "B", bottom: "A", act: "rimming", where: "Ch 2", evidence: "" },
    ],
  };
  it("gives each act its own verdict", () => {
    const s = splitOral(oral, "A/B");
    expect(s.blowjob).toMatchObject({ verdict: "one_way", top: "A", bottom: "B" });
    expect(s.blowjob.summary).toBe("B sucks cock; A gets sucked (1 scene).");
    expect(s.rimming).toMatchObject({ verdict: "one_way", top: "B", bottom: "A" });
    expect(s.rimming.summary).toBe("B eats ass; A gets their ass eaten (1 scene).");
    expect(s.cunnilingus.verdict).toBe("none");
  });
});
