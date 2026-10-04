import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { type AuditHit, analyzeWithPatterns } from "../src/heuristic";
import { FEATURES, MODEL, featuresOf, probability, trustOf } from "../src/heuristic/learned";

const M: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Supernatural"], relationships: ["Dean Winchester/Castiel"], characters: ["Dean Winchester", "Castiel"] };
const lead = "Dean and Castiel were in bed, naked and kissing, hard and aching. Dean kissed Castiel. Castiel kissed Dean back, moaning. ".repeat(2) + "\n\n";
const run = (t: string) => { const hits: AuditHit[] = []; const r = analyzeWithPatterns(lead + t, M, { quiet: true, audit: (h) => hits.push(h) }); return { p: r.pairings[0], hits: hits.filter((h) => h.para >= 1) }; };
const neutral = "Dean and Castiel were in the kitchen, talking about the show. Dean laughed. Castiel smiled back. ".repeat(2) + "\n\n";
const runN = (t: string) => { const hits: AuditHit[] = []; analyzeWithPatterns(neutral + t, M, { quiet: true, audit: (h) => hits.push(h) }); return { hits: hits.filter((h) => h.para >= 1) }; };
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

describe("tightened hints (from the reviewed queue)", () => {
  it("after an opening clause the he is the opening clause's subject", () => {
    const { hits } = run("When Dean looked down and realised that Castiel had stopped listening, he blushed.");
    expect(hits.filter((h) => h.via.startsWith("flustered-verb")).map((h) => h.a.split(" ")[0])).toEqual(["Dean"]);
  });
  it("what an outsider does is not credited to the cast: ‘Eustace placed a hand on his back and guided him’", () => {
    expect(run("Dean gave the guard a sceptical look, before Eustace placed a hand on his back and guided him out into the hallway.").hits.filter((h) => h.via.startsWith("lead-by-hand"))).toHaveLength(0);
    expect(run("Dean placed a hand on Castiel’s back and guided him out into the hallway.").hits.some((h) => h.via.startsWith("lead-by-hand"))).toBe(true);
  });
  it("a handjob that is wished for, fantasised about or on oneself is not one", () => {
    expect(run("He wanted to hold Castiel close and continue to stroke his cock until he came, but he couldn’t get his tongue to work.").hits.filter((h) => h.via.startsWith("hj-"))).toHaveLength(0);
    expect(run("Dean fists his own cock and thinks of Castiel arched beneath him.").hits.filter((h) => h.via.startsWith("hj-"))).toHaveLength(0);
    expect(run("Dean stroked Castiel’s cock slowly, his thumb circling the head.").hits.some((h) => h.via.startsWith("hj-"))).toBe(true);
  });
  it("fantasies of pressing him down are not a hold-down; arms pinning him to a chest are a hug", () => {
    expect(run("His mind filled with fantasies of Castiel’s kisses, of pressing Castiel onto his back and making him moan.").hits.filter((h) => h.via.startsWith("dom-pin"))).toHaveLength(0);
    expect(run("Castiel threw himself into Dean’s arms, which wrapped around him and pinned him to the warm mass of chest.").hits.filter((h) => h.via.startsWith("dom-pin"))).toHaveLength(0);
  });
  it("rubbing hands together, pouring tea and kneeling to dig in a bag are everyday acts", () => {
    expect(run("“What are we having?” Dean asks, rubbing his hands together.").hits.filter((h) => h.via.startsWith("care-"))).toHaveLength(0);
    expect(runN("“So you have no idea,” Sam said as he poured Dean a cup of tea.").hits.filter((h) => h.via.startsWith("care-bring"))).toHaveLength(0);
    expect(runN("Dean dropped to his knees and began pulling flares out of his backpack.").hits.filter((h) => h.via.startsWith("sinks-to-floor"))).toHaveLength(0);
  });
  it("armies to protect him, and kneeling at a ceremony, are not hints", () => {
    expect(run("He would have armies to protect him and advisors to counsel his decisions.").hits.filter((h) => h.via.startsWith("dom-protect"))).toHaveLength(0);
    expect(runN("“He kneels improperly,” Sam noted, and Castiel adjusted to spread his knees further.").hits.filter((h) => h.via.startsWith("spread-legs"))).toHaveLength(0);
  });
  it("a baby being scooped up is not a hold-and-comfort hint, and a team tag is not a character", () => {
    expect(runN("Castiel went to the crib and quickly scooped the baby up, holding him close to his chest.").hits.filter((h) => h.via.startsWith("aftercare-held") || h.via.startsWith("dom-carry"))).toHaveLength(0);
    const meta = { ...M, characters: ["Dean Winchester", "Castiel", "Hawkins High Basketball Team (Stranger Things)"] };
    const r = analyzeWithPatterns(lead + "Dean protected Castiel from the Hawkins crowd.", meta, { quiet: true });
    expect(r.pairings.every((p) => !/Basketball|Team/.test(p.pairing))).toBe(true);
  });
});

describe("fixes from an error report", () => {
  it("‘you need to be fucked / filled’ is the speaker topping, not wishing to bottom", () => {
    for (const line of ["“I think you need to be filled,” Dean said.", "“You need to be fucked,” Dean said.", "“You want to get fucked, don’t you?” Dean asked."]) {
      const { p } = run(line);
      const roles = p.anal.desires.filter((d) => d.who.startsWith("Dean")).map((d) => d.role);
      expect(roles).not.toContain("bottom");
    }
    expect(run("“I need to be fucked,” Dean said.").p.anal.desires.some((d) => d.who.startsWith("Dean") && d.role === "bottom")).toBe(true);
    expect(run("“He needs to be fucked,” Dean said.").p.anal.desires.filter((d) => d.who.startsWith("Dean") && d.role === "bottom")).toHaveLength(0);
  });
  it("‘as though he hadn’t just been fucked’ means he was", () => {
    const { p } = run("Castiel rolled him onto his back and kissed him, as though Dean hadn’t just been fucked into the mattress.");
    expect(p.anal.desires.filter((d) => d.who.startsWith("Dean") && d.role === "bottom" && !d.wants)).toHaveLength(0);
  });
  it("‘from top to bottom’ is not bottoming", () => {
    expect(run("The prince doesn't have hands big enough to palm a dragon egg from top to bottom, but he is quick and smart.").hits.filter((h) => h.via.startsWith("bottomed-for"))).toHaveLength(0);
    expect(anal("Dean bottomed for Castiel, groaning.")).toEqual(["Castiel>Dean"]);
  });
  it("soreness after being stretched open is a bodily sign, not a scene", () => {
    const { p, hits } = run("Dean squirms in the saddle, still slightly sore from being stretched open, and Castiel’s pupils expand.");
    expect(p.anal.instances.filter((i) => i.act !== "fingering")).toHaveLength(0);
    expect(hits.some((h) => h.via.startsWith("body-sore") && h.a.startsWith("Dean"))).toBe(true);
  });
  it("fisting someone from root to tip is a handjob, not fisting", () => {
    const { p, hits } = run("He fists Castiel from root to tip, gasping for air as Castiel comes.");
    expect(p.anal.instances.filter((i) => /fist/.test(i.act))).toHaveLength(0);
    expect(hits.some((h) => h.via.startsWith("hj-"))).toBe(true);
  });
});
