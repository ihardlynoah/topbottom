import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

// Round 13: a wide sweep of phrasings (paraphrased), checked per act. Derek is always the top: he
// penetrates, gets sucked, or eats ass.
const meta: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], relationships: ["Derek Hale/Stiles Stilinski"] };
const run = (s: string) => analyzeWithPatterns(`Derek and Stiles were naked in bed, hard and aching.\n\n${s}`, meta, { quiet: true }).pairings[0];
type Kind = "anal" | "blowjob" | "rimming";
const first = (s: string, k: Kind) => run(s)[k].instances.find((i) => i.act !== "fingering");

describe("recognized phrasings", () => {
  it.each([
    ["Stiles was being fucked by Derek.", "anal"],
    ["Stiles got fucked by Derek against the wall.", "anal"],
    ["Derek's cock was buried in Stiles.", "anal"],
    ["Derek was buried deep inside Stiles.", "anal"],
    ["Stiles clenched around Derek's cock.", "anal"],
    ["Stiles was stretched wide around Derek.", "anal"],
    ["Stiles sank down onto Derek's cock.", "anal"],
    ["Stiles lowered himself onto Derek.", "anal"],
    ["Derek pounded into Stiles.", "anal"],
    ["Derek thrust into Stiles over and over.", "anal"],
    ["Derek slammed into him and Stiles screamed.", "anal"],
    ["Derek rutted into Stiles.", "anal"],
    ["Derek fucked into Stiles hard.", "anal"],
    ["Derek breached Stiles slowly.", "anal"],
    ["Derek sheathed himself in Stiles.", "anal"],
    ["Derek bottomed out inside Stiles.", "anal"],
    ["Derek pulled out of Stiles and slid back in.", "anal"],
    ["Derek came inside Stiles.", "anal"],
    ["Derek filled Stiles with his come.", "anal"],
    ["Derek's come dripped out of Stiles' hole.", "anal"],
    ["Stiles rode Derek hard.", "anal"],
    ["Stiles rode Derek's cock.", "anal"],
    ["Stiles fucked himself on Derek's cock.", "anal"],
    ["Stiles pushed back onto Derek's cock.", "anal"],
    ["Stiles took him deep, hips rolling.", "anal"],
    ["Derek's cock dragged against Stiles' prostate.", "anal"],
    ["Derek's cockhead caught Stiles' rim.", "anal"],
    ["Derek pegged Stiles.", "anal"],
    ["Derek fucked Stiles with a strap-on.", "anal"],
    ["Stiles was impaled on Derek's cock.", "anal"],
    ["Derek eased the head of his cock past Stiles' rim.", "anal"],
    ["Derek lined up and pushed in.", "anal"],
    ["Stiles was so full of Derek's cock.", "anal"],
    ["Stiles spread his legs and let Derek in.", "anal"],
    ["Stiles begged and Derek finally fucked him.", "anal"],
    ["Stiles was on his back with Derek fucking him.", "anal"],
    ["Derek's hips snapped against Stiles' ass.", "anal"],
    ["Derek knotted him.", "anal"],
    ["Stiles came with Derek's cock inside him.", "anal"],
    ["Stiles sucked Derek's cock.", "blowjob"],
    ["Stiles sucked him down.", "blowjob"],
    ["Derek's cock slid down Stiles' throat.", "blowjob"],
    ["Derek came down Stiles' throat.", "blowjob"],
    ["Derek came in Stiles' mouth.", "blowjob"],
    ["Stiles swallowed Derek down.", "blowjob"],
    ["Stiles swallowed around Derek's cock.", "blowjob"],
    ["Stiles deepthroated Derek.", "blowjob"],
    ["Stiles licked a stripe up Derek's cock.", "blowjob"],
    ["Stiles licked up the underside of Derek's cock.", "blowjob"],
    ["Stiles wrapped his lips around Derek's cock.", "blowjob"],
    ["Stiles kissed the tip of Derek's cock.", "blowjob"],
    ["Stiles tongued at Derek's slit.", "blowjob"],
    ["Stiles bobbed his head on Derek's cock.", "blowjob"],
    ["Derek fucked Stiles' face.", "blowjob"],
    ["Derek thrust into Stiles' mouth.", "blowjob"],
    ["Derek's hand was in Stiles' hair as Stiles sucked him.", "blowjob"],
    ["Stiles got on his knees and took Derek into his mouth.", "blowjob"],
    ["Stiles sucked Derek off in the Jeep.", "blowjob"],
    ["Derek's cock hit the back of Stiles' throat.", "blowjob"],
    ["Stiles had Derek's cock in his mouth.", "blowjob"],
    ["Stiles gave Derek a blowjob.", "blowjob"],
    ["Stiles mouthed at Derek's balls.", "blowjob"],
    ["Stiles sucked Derek's balls into his mouth.", "blowjob"],
    ["Derek's tongue circled Stiles' rim.", "rimming"],
    ["Derek licked into Stiles' hole.", "rimming"],
    ["Derek licked over Stiles' hole.", "rimming"],
    ["Derek pushed his tongue into Stiles.", "rimming"],
    ["Derek's tongue was inside Stiles.", "rimming"],
    ["Derek licked Stiles open.", "rimming"],
    ["Derek rimmed Stiles.", "rimming"],
    ["Stiles sat on Derek's face.", "rimming"],
    ["Stiles rode Derek's face.", "rimming"],
    ["Stiles ground back against Derek's tongue.", "rimming"],
    ["Derek kissed Stiles' hole.", "rimming"],
    ["Derek's mouth was on Stiles' ass.", "rimming"],
    ["Derek sucked at Stiles' rim.", "rimming"],
    ["Derek fucked Stiles with his tongue.", "rimming"],
  ] as [string, Kind][])("%s (%s)", (s, k) => {
    expect(first(s, k)).toMatchObject({ top: "Derek Hale", bottom: "Stiles Stilinski" });
  });
});

describe("not sex", () => {
  it.each([
    ["Stiles took him deeper, lips stretched wide.", "anal"],
    ["Derek sucked in a breath while Stiles watched.", "blowjob"],
    ["Stiles swallowed hard and looked at Derek.", "blowjob"],
    ["Derek licked his lips at Stiles.", "blowjob"],
    ["Stiles rode with Derek to the station.", "anal"],
    ["Derek came inside the house with Stiles.", "anal"],
    ["Stiles took Derek's hand.", "anal"],
    ["Derek pulled out of the driveway with Stiles.", "anal"],
    ["Stiles filled Derek in on the case.", "anal"],
    ["Derek buried his face in Stiles' neck.", "rimming"],
    ["Derek kissed Stiles' cheek.", "rimming"],
    ["Stiles was full after dinner with Derek.", "anal"],
    ["Derek pushed into the room after Stiles.", "anal"],
    ["Stiles sank onto the couch next to Derek.", "anal"],
    ["Derek thrust the file at Stiles.", "anal"],
    ["Stiles mouthed Derek's name.", "blowjob"],
    ["Derek fucked Stiles' mouth with his tongue as they kissed.", "blowjob"],
    ["Stiles hoped it would open up the possibility of giving Derek head.", "blowjob"],
    ["Derek fucked Stiles' mouth with his tongue as they kissed.", "blowjob"],
    ["Stiles hoped it would open up the possibility of giving Derek head.", "blowjob"],
    ["Derek moved, sliding on top of Stiles' body to cover him top to toe.", "anal"],
  ] as [string, Kind][])("%s (%s)", (s, k) => {
    expect(first(s, k)).toBeUndefined();
  });
});

describe("round 13 context fixes", () => {
  it("reads 'proceeded to stretch him open' as fingering", () => {
    expect(run("Derek kissed along Stiles' thigh as he proceeded to stretch him open.").anal.instances[0]).toMatchObject({ top: "Derek Hale", act: "fingering" });
  });
  it("gives 'while his fingers slipped inside him' to the one doing the sucking", () => {
    expect(run("Derek swallowed Stiles down, humming, while his fingers slipped inside him.").anal.instances[0]).toMatchObject({ top: "Derek Hale", act: "fingering" });
  });
  it("doesn't call it fingering when the fingers are in someone's hair", () => {
    const i = run("Stiles moaned, grinding in Derek's lap and taking him deep, his fingers tangling in Derek's hair.").anal.instances[0];
    expect(i).toMatchObject({ top: "Derek Hale", act: "anal sex (riding)" });
  });
  it("doesn't read 'took him deeper' with a mouth as anal", () => {
    expect(run("Stiles took him deeper, lips stretched wide.").anal.instances).toHaveLength(0);
  });
  it("needs a name for 'let X in', since bare pronouns get misresolved", () => {
    expect(run("Stiles spread his legs and let Derek in.").anal.instances[0]).toMatchObject({ top: "Derek Hale" });
  });
});
