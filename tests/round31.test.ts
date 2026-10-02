import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const meta: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Dracula (TV 2020)"], relationships: ["Dracula/Jack Seward"], characters: ["Dracula", "Jack Seward"] };
const base = ("Dracula and Jack were in bed, naked and kissing. The count kissed Jack. Jack kissed the count back, breathless. The count, Dracula, smiled. Vlad smiled at Jack. ").repeat(3);
const run = (s: string) => analyzeWithPatterns(base + s, meta, { quiet: true }).pairings[0];
const hits = (s: string, k: "anal" | "blowjob") => run(s)[k].instances.length;

describe("Dracula aliases + big-cock phrasings", () => {
  const anal = [
    "The count's cock pushed against Jack's hole, demanding entry.",
    "The count seated himself inside of Jack with a groan.",
    "The count's huge prick stabbed into him over and over.",
    "The count spread Jack open, nudging against his hole with the wide head of his cock.",
    "The count was rubbing his enormous prick against Jack's ass.",
    "The count was fucking into him, snarling.",
  ];
  for (const l of anal) it(`anal: ${l}`, () => expect(hits(l, "anal")).toBeGreaterThan(0));
  it("oral: blew over the head of the prick", () => expect(hits("Jack blew over the head of Dracula's prick, sucking gently.", "blowjob")).toBeGreaterThan(0));
  const none = [
    "The count's prick stabbed into Jack's hand, which was a joke about the knife.",
    "The count's cock slid into the glove compartment of the car.",
    "The count drove into Jack's yard and parked.",
    "Jack blew over the head of the candle, smiling.",
    "The count spread Jack's map open, looking at the hole in the road.",
  ];
  for (const l of none) it(`no hit: ${l}`, () => { const p = run(l); expect(p.anal.instances.length + p.blowjob.instances.length).toBe(0); });
});
