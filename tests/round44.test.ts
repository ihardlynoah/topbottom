import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";
import { buildReport } from "../src/report";

const meta = (cats = ["M/M"]): Ao3Meta => ({ ...emptyMeta(), rating: "Explicit", categories: cats, fandoms: ["Supernatural"], relationships: ["Castiel/Dean Winchester"], characters: ["Castiel", "Dean Winchester", "Sam Winchester"] });
const base = ("Dean and Cas were in bed. Cas kissed Dean. Dean kissed Cas back. Sam knocked and Dean answered. Dean was bare and aching, and Cas’s cock was hard. ").repeat(3) + "\n\n";
const run = (s: string) => analyzeWithPatterns(base + s, meta(), { quiet: true });
const first = (s: string) => run(s).pairings[0];
const factors = (s: string, who: string) => first(s).vibe!.find((v) => v.name.startsWith(who))!.factors!;

describe("Hush / The Overs reports", () => {
  it("pushing back into someone, through layers of clothing, is not Dean topping", () => {
    const p = first("He groans and pushes back into Castiel, grinding into the hardness he can feel through their layers of clothing.");
    expect(p.anal.instances.filter((i) => i.top === "Dean Winchester")).toHaveLength(0);
  });
  it("clothed grinding is not anal sex", () => {
    expect(first("Cas ground his hips into Dean through their jeans, rutting against him.").anal.instances).toHaveLength(0);
  });
  it("licking a couple of fingers and pushing them in is lube, not being sucked on", () => {
    const f = factors("He pulls Dean’s jeans to his knees and spreads him with both hands, licking a couple fingers and pushing them in together without preamble.", "Castiel");
    expect(f.some((x) => /sucking on fingers/.test(x.what))).toBe(false);
  });
  it("“Cas’ ashamed expression after he fucked Dean” is Cas, not Sam", () => {
    const run2 = run("Sam asks how his sessions are going, and Dean thinks of Cas’ ashamed expression after he fucked Dean on the floor of his office.");
    expect(run2.pairings.some((p) => /Sam/.test(p.pairing) && p.anal.instances.length > 0)).toBe(false);
  });
  it("an untagged pair of Winchesters needs more than a stray scene", () => {
    const a = run("Sam smiled at him. He fucked him hard on the bed, thrusting into him.");
    expect(a.pairings.some((p) => /Sam Winchester\/Dean Winchester|Dean Winchester\/Sam Winchester/.test(p.pairing))).toBe(false);
  });
  it("“that has him presenting himself” is Dean presenting", () => {
    const f = factors("Dean rolls with Castiel’s strong hands, gasping with the change in position that has him presenting himself for his professor.", "Castiel");
    expect(f.some((x) => /presenting/.test(x.what) && x.role === "bottom" && !x.fromOther)).toBe(false);
  });
  it("a negation before a comma doesn't carry into the next clause", () => {
    const d = first("He bites his arm until it bleeds because he doesn’t have the right to moan or beg, fucks himself back onto Cas’ cock harder because he needs it to hurt.");
    expect(d.anal.desires.every((x) => x.wants)).toBe(true);
  });
  it("“Good boy” with a dog around is not a pet name", () => {
    const f = factors("The dog wagged its tail at Dean’s feet. “Good boy,” Dean said softly, scratching its ears.", "Dean");
    expect(f.some((x) => /good boy/.test(x.what))).toBe(false);
  });
});

describe("error report wording for oral cards", () => {
  it("says who gets sucked and who sucks, not just top/doing it", () => {
    const text = buildReport({
      source: "patterns", summaries: [], missed: [], general: "",
      flags: [{ id: "a", kind: "scene", pairing: "Castiel/Dean", card: "blowjob", top: "Dean", bottom: "Castiel", topVerb: "gets sucked", bottomVerb: "sucks cock", act: "blowjob", evidence: "x", reasons: [], note: "" }],
    });
    expect(text).toContain("**Dean** gets sucked (top), **Castiel** sucks cock (bottom)");
  });
});
