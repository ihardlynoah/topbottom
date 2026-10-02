import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { buildCast, coordinated, similarNames } from "../src/heuristic/characters";
import { analyzeWithPatterns } from "../src/heuristic";

// Round 19: a modern Captive Prince AU and a Teen Wolf sugar-daddy fic (paraphrased).

describe("names for one character", () => {
  it("knows which names begin alike", () => {
    expect(similarNames("Damen", "Damianos")).toBe(true);
    expect(similarNames("Steve", "Steven")).toBe(true);
    expect(similarNames("Dunk", "Duncan")).toBe(true);
    expect(similarNames("Harrington", "Hargrove")).toBe(false); // only 3 of 8 letters
    expect(similarNames("Dean", "Sam")).toBe(false);
    expect(similarNames("Al", "Alex")).toBe(false);
  });
  it("counts names listed together", () => {
    expect(coordinated("Dean and Deanna walked in. Dean, Deanna and Sam sat.", "Dean", "Deanna")).toBeGreaterThanOrEqual(2);
    expect(coordinated("Damianos kissed him. Damen, he whispered.", "Damen", "Damianos")).toBe(0);
  });
  const filler = (name: string, n: number) => Array.from({ length: n }, (_, i) => `${name} looked over at Laurent and smiled, thinking of the day.`).join("\n");
  const text = `${filler("Damianos", 30)}\n${filler("Damen", 6)}\n${filler("Laurent", 20)}`;
  const meta: Ao3Meta = { ...emptyMeta(), relationships: ["Damen/Laurent (Captive Prince)"], characters: ["Damen (Captive Prince)", "Laurent (Captive Prince)"] };
  it("links a frequent look-alike name to the tagged character", () => {
    const cast = buildCast(meta, text, text);
    const damen = cast.chars.find((c) => c.name === "Damen")!;
    expect(damen.aliases).toContain("Damianos");
    expect(cast.byAlias.get("Damianos")).toBe(damen);
  });
  it("keeps a look-alike name that is listed beside the character apart", () => {
    const t = `${text}\n${Array.from({ length: 4 }, () => "Damen and Damianos argued at the door.").join("\n")}`;
    const cast = buildCast(meta, t, t);
    expect(cast.chars.find((c) => c.name === "Damen")!.aliases).not.toContain("Damianos");
  });
  it("merges the two names when there are no tags", () => {
    const cast = buildCast(emptyMeta(), text, text);
    const named = cast.chars.filter((c) => c.aliases.some((a) => /Dam/.test(a)));
    expect(named).toHaveLength(1);
    expect(named[0].aliases).toEqual(expect.arrayContaining(["Damen", "Damianos"]));
  });
});

const meta: Ao3Meta = {
  ...emptyMeta(),
  rating: "Explicit",
  categories: ["M/M"],
  relationships: ["Damen/Laurent (Captive Prince)"],
  characters: ["Damen", "Laurent"],
};
const SET = "Damen and Laurent were naked on the bed, hard and aching, and Damen reached for the lube.";
const run = (s: string) => analyzeWithPatterns(`${SET}\n\n${s}`, meta, { quiet: true }).pairings[0];

describe("mouth, not anal", () => {
  it("doesn't read 'took all of Laurent inside him' as anal when his cheeks are hollowed", () => {
    const p = run("Laurent felt the warmth of Damen's mouth envelop his cock. Damen hollowed his cheek, moving his tongue inside his mouth, then took all of Laurent inside him.");
    expect(p.anal.instances).toHaveLength(0);
  });
  it("doesn't read 'with his cock in his mouth … fit inside him' as anal", () => {
    expect(run("Laurent moaned with Damen's cock in his mouth, eyes closing with how good Damen tasted and fit inside him.").anal.instances).toHaveLength(0);
  });
  it("still reads fingers inside him during oral as fingering", () => {
    expect(run("Damen swallowed Laurent down while his fingers slipped inside him.").anal.instances[0]).toMatchObject({ top: "Damen", act: "fingering" });
  });
});

describe("not about these two", () => {
  it("doesn't take 'a really old guy he dated … going down on him' as Damen", () => {
    expect(run("Laurent learned that from a really old guy he dated while going down on him at his home office.").blowjob.instances).toHaveLength(0);
  });
  it("doesn't take 'fucked open by older men' as Damen", () => {
    expect(run("Laurent noticed the bathtub, thinking it would be nice to enjoy it without being fucked open by older men in it.").anal.instances).toHaveLength(0);
  });
  it("doesn't read a candle 'blown out' or staff who 'worship him' as oral", () => {
    expect(run("Laurent sat covering a tiny flame from being blown out by a strong hurricane.").blowjob.instances).toHaveLength(0);
    expect(run("Damen had good rapport with his staff because they worshipped him and knew he deserved the job.").blowjob.instances).toHaveLength(0);
  });
  it("doesn't read kissing an ass cheek as rimming", () => {
    expect(run("While down there, Damen kissed Laurent's ass cheek while gripping tightly.").rimming.instances).toHaveLength(0);
    expect(run("Damen kissed Laurent's hole before spreading him wider.").rimming.instances[0]).toMatchObject({ top: "Damen" });
  });
});

describe("wanting, not doing", () => {
  it.each([
    "Damen held back, muscles taut, stopping his carnal desires of simply taking Laurent raw.",
    "Damen looked like he wanted to keep the shirt on but also rip it all off so he can fuck him senseless.",
    "Laurent was very sure he'd like to be fucked by Damen on every surface of the room.",
    "It looked like the thighs Laurent would want to fit his head in as he sucks Damen dry.",
    "Laurent offered to fuck Damen.",
  ])("%s", (s) => {
    const p = run(s);
    expect(p.anal.instances).toHaveLength(0);
    expect(p.blowjob.instances).toHaveLength(0);
  });
  it("reads 'offered to fuck … let Laurent bounce on it' with Laurent riding", () => {
    expect(run("Laurent offered to fuck Damen, and Damen still let Laurent bounce on it.").anal.instances[0]).toMatchObject({ top: "Damen", bottom: "Laurent" });
  });
  it("doesn't read sucking a neck as a blowjob", () => {
    expect(run("He bit Laurent's neck and sucked harder, until Laurent's mouth opened in a gasp.").blowjob.instances).toHaveLength(0);
    expect(run("Laurent sucked harder, mouth wet around Damen's cock, and Damen groaned.").blowjob.instances[0]).toMatchObject({ top: "Damen" });
  });
});

describe("Peter and Stiles: more phrasings", () => {
  const pm: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], relationships: ["Peter Hale/Stiles Stilinski"], characters: ["Peter Hale", "Stiles Stilinski"] };
  const PSET = "Stiles lay on the bed in lace panties, hard and leaking, and Peter knelt over him, still in his suit.";
  const go = (s: string) => analyzeWithPatterns(`${PSET}\n\n${s}`, pm, { quiet: true }).pairings[0];
  it.each([
    "Peter held his legs open and bobbed slowly.",
    "And then Peter started sucking, and Stiles thought he yelled.",
    "Peter suckled the head of his cock, tongue flittering over sensitive flesh, before swallowing him all the way down to the base.",
    "Stiles choked on a moan as Peter sucked briefly at the base of his cock through the panties.",
  ])("Peter sucks Stiles: %s", (s) => {
    expect(go(s).blowjob.instances[0]).toMatchObject({ top: "Stiles Stilinski", bottom: "Peter Hale" });
  });
  it.each([
    "Peter unzipped his suit pants to pull his cock out and feed it between Stiles's lips.",
    "Peter's hips rocked faster and Stiles tried to suck harder.",
  ])("Stiles sucks Peter: %s", (s) => {
    expect(go(s).blowjob.instances[0]).toMatchObject({ top: "Peter Hale", bottom: "Stiles Stilinski" });
  });
  it.each([
    "The first time Peter worked him open and pushed inside, everything stopped for a moment.",
    "Peter worked Stiles open with two fingers and then slid inside him.",
  ])("Peter tops: %s", (s) => {
    expect(go(s).anal.instances.find((i) => i.act === "anal sex")).toMatchObject({ top: "Peter Hale", bottom: "Stiles Stilinski" });
  });
  it("doesn't read bobbing in a pool or sucking a lollipop as oral", () => {
    expect(go("Stiles bobbed slowly in the pool, kicking his legs.").blowjob.instances).toHaveLength(0);
    expect(go("Peter started sucking on a lollipop and watched the game.").blowjob.instances).toHaveLength(0);
  });
});
