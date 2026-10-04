import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { type AuditHit, analyzeWithPatterns } from "../src/heuristic";

const M: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Original Work"], relationships: ["Miles McKinnon/Jordan Olivera"], characters: ["Miles McKinnon", "Jordan Olivera"], freeforms: [] };
const lead = "Miles and Jordan were in bed, naked and kissing, hard and aching. Jordan kissed Miles. Miles kissed Jordan back, moaning. ".repeat(2) + "\n\n";
const run = (t: string) => { const hits: AuditHit[] = []; analyzeWithPatterns(lead + t, M, { quiet: true, audit: (h) => hits.push(h) }); return hits; };

describe("fixes from the Owned Straight Boxer report", () => {
  it("a wish that hangs on a condition is hypothetical, not said", () => {
    const h = run("“I’ll get tested too. Because if I win the bet, I want to breed you whenever I can.” Jordan smirked.").filter((x) => x.via === "dialogue:anal sex");
    expect(h.map((x) => x.kind)).toEqual(["hypothetical"]);
    expect(run("“I want to breed you.” Jordan smirked.").filter((x) => x.via === "dialogue:anal sex").map((x) => x.kind)).toEqual(["said"]);
  });
  it("‘the twink’ and ‘the bottom boy’ are strangers, not whoever was named before", () => {
    expect(run("The twink did as he was told and gagged on Jordan’s length. He massaged his balls.").filter((x) => x.cat === "oral" && x.kind === "act")).toHaveLength(0);
    expect(run("The house was empty. The bottom boy’s roommates wouldn’t hear him plead as he got fucked.").filter((x) => x.kind === "act")).toHaveLength(0);
  });
  it("…but a named person is still read", () => {
    expect(run("Miles did as he was told and gagged on Jordan’s length.").some((x) => x.cat === "oral" && x.kind === "act")).toBe(true);
  });
  it("‘his focus was on serving him … as he was getting railed’ is not credited to the last-named one", () => {
    expect(run("Meanwhile, Jordan enjoyed Miles as never before. He knew his whole focus was on serving him; there was no touching himself as he was getting railed.").filter((x) => x.kind === "act" && x.cat === "anal")).toHaveLength(0);
  });
});
