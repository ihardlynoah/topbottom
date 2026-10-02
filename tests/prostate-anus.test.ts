import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const meta = (over: Partial<Ao3Meta>): Ao3Meta => ({ ...emptyMeta(), rating: "Explicit", categories: ["M/M"], ...over });
const MM = meta({ relationships: ["Derek Hale/Stiles Stilinski"] });
const run = (text: string, m = MM) => analyzeWithPatterns(text, m, { quiet: true }).pairings[0];
const SETUP = "Derek and Stiles were naked in bed, hard and aching.";
const top = (s: string) => run(`${SETUP}\n\n${s}`);

describe("prostate and its allusions", () => {
  it.each([
    "Derek nailed his prostate on every thrust.",
    "Derek's cock found his prostate.",
    "Derek milked Stiles's prostate with two fingers.",
    "Derek ground relentlessly against Stiles's swollen prostate.",
    "Derek's cock dragged over that bundle of nerves inside Stiles.",
    "Derek kept hitting that little bundle of nerves deep inside him.",
    "Derek's cock nailed the cluster of nerves that made Stiles see stars.",
    "Derek hit his sweet spot again and again.",
    "Derek's cock brushed the spot inside Stiles that made him see white.",
    "Derek angled his hips and found the spot that made Stiles scream.",
    "Derek pressed against his p-spot.",
    "Derek's cock rubbed against the gland inside him.",
  ])("Derek tops: %s", (s) => {
    const p = top(s);
    expect([...p.anal.instances, ...p.anal.desires.filter((d) => d.kind !== "said")]).not.toHaveLength(0);
    for (const i of p.anal.instances) expect(i).toMatchObject({ top: "Derek Hale", bottom: "Stiles Stilinski" });
  });

  it.each([
    "Derek kissed his sweet spot just below his ear.",
    "Derek found the sweet spot on Stiles's neck.",
    "Derek's nerves were a mess before the date.",
    "Derek found a spot on the couch.",
  ])("ignores: %s", (s) => {
    const p = top(s);
    expect(p.anal.instances).toHaveLength(0);
  });

  it("makes a 'bundle of nerves' sentence anal when a man may have a vagina", () => {
    const m = meta({ relationships: ["Derek Hale/Stiles Stilinski"], freeforms: ["Alpha/Beta/Omega Dynamics"] });
    const text = `Stiles touched his front hole, then Derek's cunt. They were naked in bed.\n\nDerek's cock dragged over that bundle of nerves inside Stiles.`;
    const p = run(text, m);
    expect(p.vaginal.instances).toHaveLength(0);
    expect(p.anal.instances[0]).toMatchObject({ top: "Derek Hale" });
  });
});

describe("anus words", () => {
  it.each([
    ["Derek slid into Stiles's tight butthole.", "anal"],
    ["Derek's cock pressed against Stiles's puckered rosebud.", "anal"],
    ["Derek pushed past the tight ring of muscle into Stiles.", "anal"],
    ["Derek's cock slid past Stiles's sphincter.", "anal"],
    ["Derek slipped a finger into Stiles's back entrance.", "anal"],
    ["Derek licked over Stiles's furled pucker.", "oral"],
    ["Derek dragged his tongue down Stiles's crack.", "oral"],
    ["Derek tongued at Stiles's starfish.", "oral"],
    ["Derek licked into Stiles's butthole.", "oral"],
  ])("%s", (s, cat) => {
    const p = top(s);
    const hits = cat === "anal" ? p.anal.instances : p.oral.instances;
    expect(hits[0]).toMatchObject({ top: "Derek Hale", bottom: "Stiles Stilinski" });
    if (cat === "oral") expect(hits[0].act).toBe("rimming");
  });

  it("doesn't take a literal back door or a crack of dawn", () => {
    const p = top("Derek slipped out the back door at the crack of dawn.");
    expect([...p.anal.instances, ...p.oral.instances]).toHaveLength(0);
  });
});

describe("left-out subjects", () => {
  it("doesn't give a toy's movement to the person named before the comma", () => {
    const p = top("When Stiles bowed, the plug bumped against his prostate.");
    expect(p.anal.instances.filter((i) => i.top === "Stiles Stilinski")).toHaveLength(0);
  });

  it("still reads a verb that has its own object after the comma", () => {
    const p = top("Derek held the base of his dick, guided the slick head to Stiles's lips.");
    expect(p.oral.instances[0]).toMatchObject({ top: "Derek Hale", bottom: "Stiles Stilinski" });
  });
});
