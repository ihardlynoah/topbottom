import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

// Round 29: three more fics (a Dracula phone-fic and two Steve/Eddie fics), paraphrased.
const meta: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Stranger Things (TV 2016)"], relationships: ["Steve Harrington/Eddie Munson"], characters: ["Steve Harrington", "Eddie Munson", "Robin Buckley"] };
const SET = "Steve and Eddie were in bed, naked and kissing. Eddie kissed Steve. Steve kissed Eddie back, breathless.";
const filler = Array.from({ length: 12 }, (_, i) => `Eddie grinned at Steve across the trailer, number ${i}.`).join("\n");
const run = (s: string) => analyzeWithPatterns(`${filler}\n\n${SET}\n\n${s}`, meta, { quiet: true }).pairings[0];
const nothing = (s: string) => {
  const p = run(s);
  expect([...p.anal.instances, ...p.blowjob.instances, ...p.rimming.instances]).toHaveLength(0);
  expect([...p.anal.desires, ...p.blowjob.desires, ...p.rimming.desires]).toHaveLength(0);
};

describe("not sex", () => {
  it("bedding", () => nothing("He buried himself in the Egyptian cotton which reeked of their congress."));
  it("sitting comfortably", () => nothing("Eddie settled into the sofa with a beer, spreading his legs wide to get comfortable."));
  it("'your ass is grass'", () => nothing("“You tell anyone that and your ass is grass, Harrington,” Eddie said."));
  it("'fuck me, so El really can…'", () => nothing("“Fuck me, so El really can move shit with her mind?” Eddie said."));
  it("thighs clenching", () => nothing("His hands lifted to splay on Eddie’s thighs as they clenched around Steve."));
  it("a cock brushing an ass", () => nothing("Eddie’s cock brushed against Steve’s ass."));
  it("cum in his own mouth", () => nothing("He made Steve cum in his own mouth."));
  it("frilly tops", () => nothing("He liked the way girls would dress up in pretty pastel skirts and frilly tops."));
  it("a doctor ('for her') in a pair with no woman", () => nothing("The doctor was careful. Steve parted his legs for her when she pressed gently on his knees."));
});

describe("right act, right category", () => {
  it("calls a thrust into a throat a blowjob, not anal", () => {
    const p = run("Eddie thrust forward into Steve, who moaned as Eddie hit the back of his throat hard.");
    expect(p.anal.instances).toHaveLength(0);
    expect(p.blowjob.instances[0]).toMatchObject({ top: expect.stringMatching(/Eddie/) });
  });
  it("calls 'tongue around him … taking in his whole length' a blowjob, not rimming", () => {
    const p = run("Eddie swirled his tongue around him before dipping down and taking in his whole length.");
    expect(p.rimming.instances).toHaveLength(0);
    expect(p.blowjob.instances.length).toBeGreaterThan(0);
  });
  it("calls a pointer finger fingering", () => {
    const p = run("Eddie pressed inside with his pointer finger and felt Steve clench around it.");
    expect(p.anal.instances.every((i) => /fingering/.test(i.act))).toBe(true);
  });
  it("treats 'like he was sucking Eddie's dick' as a simile", () => {
    const p = run("He ran his tongue over the fingers like he was sucking Eddie’s dick, eyes open.");
    expect(p.blowjob.instances).toHaveLength(0);
  });
});

describe("wanting and refusing", () => {
  it("reads 'wants to fuck Steve and have Steve fuck him' as two wishes, one each way", () => {
    const p = run("He wants to fuck Steve and have Steve fuck him.");
    expect(p.anal.instances).toHaveLength(0);
    expect(p.anal.desires.some((d) => /Eddie/.test(d.who) && d.role === "top")).toBe(true);
    expect(p.anal.desires.some((d) => /Eddie/.test(d.who) && d.role === "bottom")).toBe(true);
  });
  it("keeps 'fantasies about sticking his cock inside Steve, making him scream as he pounds…' a fantasy", () => {
    const p = run("Eddie was battling more fantasies about sticking his cock inside Steve, making him scream as he pounded his prostate.");
    expect(p.anal.instances).toHaveLength(0);
  });
  it("reads “I—I don’t want you to fuck me” as a refusal", () => {
    const p = run("“I—I don’t want you to fuck me,” Steve said.");
    expect(p.anal.desires.every((d) => d.wants === false)).toBe(true);
  });
  it("still reads “I want you to fuck me” as a request", () => {
    const p = run("“I want you to fuck me,” Steve said.");
    expect(p.anal.desires.some((d) => d.wants && d.role === "bottom")).toBe(true);
  });
});

describe("staring, groping and handling", () => {
  const hint = (s: string, role: "top" | "bottom", kind: string) => {
    const p = run(s);
    expect(p.anal.desires.some((d) => d.role === role && d.kind === kind)).toBe(true);
  };
  it("staring where a cock strains a pair of briefs → bottom-ish", () => hint("Eddie bit his lip as he stared where Steve’s fat cock stretched out his briefs.", "bottom", "ogling"));
  it("watching someone bend over → top-ish", () => hint("Eddie licked his lips, watching Steve bend over the hood of the car.", "top", "ogling"));
  it("a hand down the back of the jeans → top-ish groping", () => hint("Eddie’s hand slipped down the back of Steve’s jeans and squeezed.", "top", "touch"));
  it("rubbing a palm over a bulge → bottom-ish touch", () => hint("Steve rubbed his palm over the bulge in Eddie’s jeans.", "bottom", "touch"));
  it("pouring lube over his own dick → top prep", () => hint("Steve watched, transfixed, as Eddie poured lube over his dick and rubbed it over himself.", "top", "prep"));
  it("grabbing hips and pulling close counts as taking charge on the everyday-dynamic axis", () => {
    const v = run("Eddie grabbed Steve’s hips and pulled him close.").dynamic!.find((x) => /Eddie/.test(x.name))!;
    expect(v.basis.join(" ")).toMatch(/Taking charge/);
  });
});

describe("Robin (a woman) in a Steve/Eddie fic", () => {
  it("keeps canon women female even when 'X … He' sentences abound", () => {
    const t = Array.from({ length: 10 }, () => "Robin laughed at the joke. He smirked back at her.").join("\n") + `\n\n${SET}`;
    const a = analyzeWithPatterns(`${filler}\n\n${t}`, meta, { quiet: true });
    expect(a.pairings.every((p) => !/Robin/.test(p.pairing) || p.anal.instances.length === 0)).toBe(true);
  });
});
