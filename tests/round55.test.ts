import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { type AuditHit, analyzeWithPatterns } from "../src/heuristic";
import { FEATURES, MODEL, featuresOf, probability, trustOf } from "../src/heuristic/learned";

const M: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Supernatural"], relationships: ["Dean Winchester/Castiel"], characters: ["Dean Winchester", "Castiel"] };
const lead = "Dean and Castiel were in bed, naked and kissing, hard and aching. Dean kissed Castiel. Castiel kissed Dean back, moaning. ".repeat(2) + "\n\n";
const run = (t: string) => { const hits: AuditHit[] = []; const r = analyzeWithPatterns(lead + t, M, { quiet: true, audit: (h) => hits.push(h) }); return { p: r.pairings[0], hits: hits.filter((h) => h.para >= 1) }; };
const anal = (t: string) => run(t).p.anal.instances.filter((i) => i.act !== "fingering").map((i) => `${i.top.split(" ")[0]}>${i.bottom.split(" ")[0]}`);

describe("who is doing it", () => {
  it("a he after a comma is the main clause's subject, not the name inside ‘for Dean to…’", () => {
    expect(anal("Castiel didn’t wait for Dean to say anything else, he just pushed inside, bottoming out in one thrust.")).toEqual(["Castiel>Dean"]);
  });
  it("a left-out subject that is someone outside the cast is not credited to the person named before", () => {
    const { hits } = run("Dean lets out another string of babbles and Mrs. Henderson looks at him like she wants to pull him into a hug and feed him soup.");
    expect(hits.filter((h) => h.via.startsWith("care-"))).toHaveLength(0);
  });
  it("‘she’ in a cast with no women is an outsider, so what she does isn't theirs", () => {
    const { hits } = run("Dean laughed while the nurse watched and she wanted to comfort him and bring him water.");
    expect(hits.filter((h) => h.via.startsWith("care-"))).toHaveLength(0);
  });
  it("a fist pulling back for another blow is a fight, not dominance", () => {
    expect(run("He slammed Castiel up against the wall, fist pulling back to land another blow.").hits.filter((h) => h.via.startsWith("dom-"))).toHaveLength(0);
    expect(run("Dean pinned Castiel to the wall and kissed him hard.").hits.some((h) => h.via.startsWith("dom-pin"))).toBe(true);
  });
});

describe("acts that were slipping through", () => {
  it("‘lined up and pressed into’ is penetration", () => {
    expect(anal("Dean lined up and pressed into Castiel.")).toEqual(["Dean>Castiel"]);
  });
  it("fingers in one clause don't turn the fucking in the next into fingering", () => {
    expect(anal("Dean opened Castiel up with two fingers, then fucked him.")).toEqual(["Dean>Castiel"]);
    expect(anal("Dean fucked Castiel with two fingers, slowly.")).toEqual([]);
  });
  it("a refusal or a ‘never’ inside the match cancels it", () => {
    expect(anal("Dean refused to fuck Castiel.")).toEqual([]);
    expect(run("Castiel’s cock never slid between Dean’s lips.").p.blowjob.instances).toHaveLength(0);
  });
  it("a participle after a negated clause is negated with it", () => {
    expect(run("Dean never sucked Castiel off, taking him deep.").p.blowjob.instances).toHaveLength(0);
    expect(run("Dean sucked Castiel off, taking him deep.").p.blowjob.instances.length).toBeGreaterThan(0);
  });
  it("‘imagined this, and the real thing is more’ is the real thing", () => {
    expect(run("Castiel shuddered. All the times he had imagined this, and the real thing was so much more. Dean’s tongue twisted and curled, thickening inside him until it almost burned.").p.rimming.instances).toHaveLength(1);
  });
  it("sex decades away is no scene; ‘snapped in response’ is not pushing in", () => {
    expect(run("Dean means in sixty years, when Castiel rides him so hard they both die.").p.anal.instances).toHaveLength(0);
    expect(run("If someone slammed into Dean, Dean snapped in response.").hits.filter((h) => h.via.startsWith("pushed-in"))).toHaveLength(0);
  });
});

describe("the context model", () => {
  it("has one weight per feature and gives a feature value for each", () => {
    expect(MODEL.weights).toHaveLength(FEATURES.length);
    const f = featuresOf({ sent: "Dean fucked Castiel.", paras: ["Dean fucked Castiel."], pi: 0, basis: "named", elided: false, pairBoth: true, actorNamed: true, anyNamed: true });
    expect(f).toHaveLength(FEATURES.length);
  });
  it("trusts a hit about the declared pair more than the same hit about someone else", () => {
    const base = { sent: "He pushed inside him, slowly.", paras: ["He pushed inside him, slowly."], pi: 0, basis: "pronoun" as const, elided: false, actorNamed: false, anyNamed: false };
    const pair = featuresOf({ ...base, pairBoth: true }), other = featuresOf({ ...base, pairBoth: false });
    expect(probability(0.9, pair)).toBeGreaterThan(probability(0.9, other));
    expect(trustOf("some-pattern", pair)).toBeGreaterThan(trustOf("some-pattern", other));
  });
  it("never trusts a hit by less than the floor or by more than one", () => {
    const f = featuresOf({ sent: "x ".repeat(80), paras: [""], pi: 0, basis: "inferred", elided: true, pairBoth: false, actorNamed: false, anyNamed: false });
    const t = trustOf("whatever", f);
    expect(t).toBeGreaterThanOrEqual(0.4);
    expect(t).toBeLessThanOrEqual(1);
  });
});
