import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const M: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Original Work"], relationships: ["Dean Winchester/Castiel"], characters: ["Dean Winchester", "Castiel"], freeforms: [] };
const lead = "Dean and Castiel were in bed, naked and kissing, hard and aching. Dean kissed Castiel. Castiel kissed Dean back, moaning. ".repeat(2) + "\n\n";

describe("context in the mistake report", () => {
  it("a quoted line carries the paragraphs on either side", () => {
    const r = analyzeWithPatterns(`${lead}Castiel pulled him close and Dean shuddered, hard.\n\n“Fuck me, Cas,” Dean begged.\n\nCastiel growled and bit his neck, rocking against him.\n\n`, M, { quiet: true });
    const d = r.pairings[0].anal.desires.find((x) => x.via?.startsWith("dialogue:"));
    expect(d?.context).toContain("Dean shuddered");
    expect(d?.context).toContain("“Fuck me, Cas,”");
    expect(d?.context).toContain("growled and bit his neck");
  });
  it("a narrated hint and a solo act carry the passage around them", () => {
    const r = analyzeWithPatterns(`${lead}Dean spread his legs a little. Castiel watched him, hard in his jeans. Dean stroked himself slowly, moaning, naked on the bed.\n\n`, M, { quiet: true });
    const hint = r.pairings[0].anal.desires.find((x) => x.via === "spread-legs");
    expect(hint?.context).toContain("Castiel watched him");
    const solo = r.pairings[0].solo.instances[0];
    expect(solo?.context).toContain("Castiel watched him");
  });
});
