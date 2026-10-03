import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const meta = (freeforms: string[] = []): Ao3Meta => ({ ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Supernatural"], relationships: ["Castiel/Dean Winchester"], characters: ["Castiel", "Dean Winchester"], freeforms });
const base = ("Dean and Cas were in bed, naked and kissing. Cas kissed Dean. Dean kissed Cas back, breathless. ").repeat(2);
const run = (s: string, tags: string[] = []) => analyzeWithPatterns(base + s, meta(tags), { quiet: true }).pairings[0];
const hints = (s: string, tags: string[] = []) => { const p = run(s, tags); return [...p.anal.desires, ...p.blowjob.desires]; };
const vibe = (s: string, who: string, tags: string[] = []) => run(s, tags).vibe!.find((v) => v.name.startsWith(who))!;
const tier = (s: string, who: string, name: string, tags: string[] = []) => vibe(s, who, tags).basis.find((b) => b.startsWith(name));

describe("a woman sodomizing a man is anal, not vaginal", () => {
  const m: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M", "F/M"], fandoms: ["Dracula (TV 2020)"], relationships: ["Dracula/Jack Seward", "Zoe Van Helsing/Jack Seward"], characters: ["Dracula", "Jack Seward", "Zoe Van Helsing"] };
  const b = ("Zoe and Jack were friends. Zoe smiled at Jack. Jack smiled back at Zoe. Dracula kissed Jack. ").repeat(3);
  it("She had sodomized him with some regularity", () => {
    const a = analyzeWithPatterns(b + "She had sodomized him with some regularity and taught him to enjoy it.", m, { quiet: true });
    const zoe = a.pairings.find((p) => /Zoe/.test(p.pairing))!;
    expect(zoe.vaginal.instances).toHaveLength(0);
    expect(zoe.anal.instances[0]).toMatchObject({ top: "Zoe Van Helsing", bottom: "Jack Seward" });
  });
});

describe("double negatives keep the wish: 'tried not to suppress the urge'", () => {
  it("is not a refusal to top", () => {
    const d = hints("Cas tensed himself, breathless, as he tried not to suppress the urge to pull out and snap back in.");
    expect(d.every((x) => x.wants)).toBe(true);
  });
});

describe("stated preference (tier 2)", () => {
  for (const [l, who, ] of [
    ["Dean liked being fucked, loved the weight of Cas above him.", "Dean"],
    ["Cas loved being in control and being on top, Dean knew that much.", "Cas"],
    ["Cas had always been the one who topped.", "Cas"],
    ["Cas had always been the one to take charge.", "Cas"],
    ["“I like being on top,” Cas said. “I never bottom.”", "Cas"],
    ["“I never top,” Dean said, panting. “I love being fucked.”", "Dean"],
  ] as const) it(l, () => expect(tier(l, who, "Says what they are")).toBeTruthy());
  it("'I never top' makes the speaker a bottom, not a top", () => {
    const b = tier("“I never top,” Dean said.", "Dean", "Says what they are")!;
    expect(b).toMatch(/bottom/);
  });
  it("'on top of the world' is nothing", () => expect(tier("Cas felt on top of the world, grinning.", "Cas", "Says what they are")).toBeUndefined());
});

describe("body after sex (tier 3)", () => {
  for (const l of [
    "Dean's ass was sore and he walked funny the next morning.",
    "Dean sat down gingerly at the table, wincing, still sore from the night before.",
    "Come leaked out of Dean's hole and ran down his thigh.",
    "Dean's hole clenched around nothing, aching to be filled again.",
  ]) it(`bottom hint: ${l}`, () => expect(hints(l).some((d) => d.who.startsWith("Dean") && d.role === "bottom" && d.kind === "body")).toBe(true));
  for (const l of ["The pipe leaked down the wall of the cellar.", "He sat down heavily on the couch, sore from the long drive.", "Dean sat down gingerly."])
    it(`no hint: ${l}`, () => expect(hints(l).some((d) => d.kind === "body")).toBe(false));
});

describe("position, aftercare and pet names (tier 6)", () => {
  for (const [l, who] of [
    ["Cas pulled Dean onto his lap and kissed him.", "Cas"],
    ["Cas pinned Dean's wrists above his head and rolled his hips.", "Cas"],
    ["Afterwards, Cas cleaned Dean up with a warm cloth.", "Cas"],
    ["Cas wrapped Dean in a blanket.", "Cas"],
    ["“Good boy,” Cas whispered, and Dean shivered.", "Cas"],
    ["“Ready?” Cas asked. “Tell me if it hurts.”", "Cas"],
    ["“Please, sir,” Dean begged, hips lifting.", "Dean"],
  ] as const) it(l, () => {
    const other = who === "Cas" ? "Dean" : "Cas";
    const mine = tier(l, who, "Dominant or submissive")!;
    const baseline = tier("", who, "Dominant or submissive") ?? "";
    expect(mine).not.toEqual(baseline);
    void other;
  });
  it("a pet name is weaker than a sex act", () => {
    const withAct = vibe("Dean fucked Cas hard on the bed, pounding into him. “Good boy,” Cas said.", "Dean");
    expect(withAct.label).toMatch(/top/i);
  });
});

describe("AO3 role and dynamic tags (tier 2)", () => {
  it("'Power Bottom Dean Winchester' makes Dean a bottom who also takes charge", () => {
    const v = vibe("", "Dean", ["Power Bottom Dean Winchester"]);
    expect(v.basis.join()).toMatch(/Says what they are or prefer: bottom/);
    expect(v.basis.join()).toMatch(/Dominant or submissive behaviour: top/);
  });
  it("'Service Top Castiel' makes Cas a top who also gives way", () => {
    const v = vibe("", "Cas", ["Service Top Castiel"]);
    expect(v.basis.join()).toMatch(/Says what they are or prefer: top/);
  });
  it("'Dominant Castiel' and 'Submissive Dean Winchester' lean top and bottom", () => {
    const tags = ["Dominant Castiel", "Submissive Dean Winchester"];
    expect(vibe("", "Cas", tags).basis.join()).toMatch(/Says what they are or prefer: top/);
    expect(vibe("", "Dean", tags).basis.join()).toMatch(/Says what they are or prefer: bottom/);
  });
  it("'Pillow Prince Dean' leans bottom", () => expect(vibe("", "Dean", ["Pillow Prince Dean Winchester"]).basis.join()).toMatch(/Says what they are or prefer: bottom/));
  it("a Dom/sub tag backs up the one who gives the praise", () => {
    const plain = tier("“Good boy,” Cas whispered.", "Cas", "Says what they are");
    const tagged = tier("“Good boy,” Cas whispered.", "Cas", "Says what they are", ["Dom/sub", "Praise Kink"]);
    expect(plain).toBeUndefined();
    expect(tagged).toMatch(/top/);
  });
});
