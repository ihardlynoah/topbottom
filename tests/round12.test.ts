import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const meta = (over: Partial<Ao3Meta>): Ao3Meta => ({ ...emptyMeta(), rating: "Explicit", categories: ["M/M"], ...over });
const MM = meta({ relationships: ["Derek Hale/Stiles Stilinski"], characters: ["Derek Hale", "Stiles Stilinski"] });
const SETUP = "Derek and Stiles were naked in bed, hard and aching.";
const main = (s: string) => analyzeWithPatterns(`${SETUP}\n\n${s}`, MM, { quiet: true }).pairings[0];
const DEREK_TOPS = { top: "Derek Hale", bottom: "Stiles Stilinski" };

describe("expanded anal phrasings", () => {
  it.each([
    "Derek nailed Stiles into the mattress.",
    "Derek ravished him until he sobbed.",
    "Derek fed his cock into Stiles inch by inch.",
    "Derek wedged himself inside Stiles.",
    "Derek glided into Stiles in one long stroke.",
    "Derek took Stiles from behind.",
    "Derek bent Stiles over the desk and fucked him.",
    "Stiles bounced in Derek's lap, taking every inch.",
    "Stiles impaled himself on Derek's cock.",
    "Stiles took Derek to the hilt.",
    "Stiles let Derek fuck him.",
    "Derek finger-banged Stiles.",
    "Derek knotted Stiles.",
    "Derek's knot locked inside Stiles.",
    "Derek's cock split Stiles open.",
  ])("%s", (s) => {
    expect(main(s).anal.instances[0]).toMatchObject(DEREK_TOPS);
  });
});

describe("expanded oral phrasings", () => {
  it.each([
    "Stiles slurped on Derek's cock.",
    "Stiles nursed at the head of Derek's cock.",
    "Stiles mouthed at Derek's cock through his boxers.",
    "Stiles took Derek down to the root.",
    "Stiles went down on Derek.",
    "Stiles gave Derek head.",
    "Stiles blew Derek in the car.",
    "Derek fucked Stiles' mouth.",
    "Derek fucked Stiles' throat.",
    "Stiles choked on Derek's cock.",
  ])("%s", (s) => {
    expect(main(s).oral.instances[0]).toMatchObject(DEREK_TOPS);
  });
  it.each([
    "Stiles ate Derek out.",
    "Stiles ate Derek's ass.",
    "Stiles tongue-fucked Derek.",
    "Stiles buried his face between Derek's cheeks.",
    "Stiles spread Derek's cheeks and licked into him.",
  ])("rimming: %s", (s) => {
    // The one rimming is the oral top.
    expect(main(s).oral.instances[0]).toMatchObject({ top: "Stiles Stilinski", bottom: "Derek Hale" });
  });
});

describe("expanded-pattern false positives", () => {
  it.each([
    "Stiles bounced on his toes in the kitchen while Derek made coffee.",
    "Derek pushed past Stiles into the living room.",
    "Stiles was leaning over the table, reading Derek's notes.",
    "Derek nailed the shelf to the wall while Stiles watched.",
  ])("%s", (s) => {
    expect(main(s).anal.instances).toHaveLength(0);
  });
});

describe("round 12 context fixes", () => {
  it("counts 'whining for X to mount him' as desire, not an act", () => {
    const p = main("Stiles lay there whining for Derek to mount him.");
    expect(p.anal.instances).toHaveLength(0);
  });
  it("treats pronoun-only self-fingering as solo, not a partnered act", () => {
    const p = main("Later, alone, he worked two fingers into himself and thought about the morning.");
    expect(p.anal.instances).toHaveLength(0);
  });
  it("gives 'arching under X's tongue as he licks into him' to X as rimmer", () => {
    const p = main("Stiles was arching under Derek's tongue as he licked into him, slow and filthy.");
    expect(p.oral.instances[0]).toMatchObject(DEREK_TOPS);
  });
});
