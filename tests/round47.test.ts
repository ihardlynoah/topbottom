import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const M: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Supernatural"], relationships: ["Castiel/Dean Winchester"], characters: ["Castiel", "Dean Winchester"] };
const ABO: Ao3Meta = { ...M, freeforms: ["Alpha/Beta/Omega Dynamics"] };
const lead = (`Dean and Cas stood in the kitchen, talking. Dean laughed. Cas smiled back. `).repeat(2) + "\n\n";
const dyn = (text: string, m: Ao3Meta) => analyzeWithPatterns(lead + text, m, { quiet: true }).pairings[0].dynamic!;
const rate = (text: string, who: string, m: Ao3Meta) => dyn(text, m).find((d) => d.name.startsWith(who))!;
const GESTURES = "Dean bared his throat when Cas came in. Cas growled at Dean and used his alpha voice. Cas scented Dean. Cas gripped Dean’s nape. Dean lowered his eyes. Dean submitted to his alpha.";

describe("omegaverse gestures feed the everyday-dynamic axis", () => {
  it("baring the neck and deferring read as following, scenting and growling as leading", () => {
    expect(["Leads", "Leans leading"]).toContain(rate(GESTURES, "Cas", ABO).label);
    expect(["Follows", "Leans following"]).toContain(rate(GESTURES, "Dean", ABO).label);
  });
  it("the same sentences mean nothing in a work that is not omegaverse", () => {
    const f = (who: string) => rate(GESTURES, who, M).factors ?? [];
    expect(f("Dean").some((x) => /neck|throat|alpha/i.test(x.what))).toBe(false);
  });
  it("a work with the words all through the text counts without the tag", () => {
    const filler = "The alpha nodded and the omega waited. ".repeat(8);
    expect(["Follows", "Leans following"]).toContain(rate(filler + GESTURES, "Dean", M).label);
  });
  it("Alpha and Omega character tags lean the character before any behaviour", () => {
    const m: Ao3Meta = { ...M, freeforms: ["Alpha Castiel", "Omega Dean Winchester"] };
    expect(["Leads", "Leans leading"]).toContain(rate("Dean and Cas ate dinner.", "Cas", m).label);
    expect(["Follows", "Leans following"]).toContain(rate("Dean and Cas ate dinner.", "Dean", m).label);
  });
});
