import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const meta = (over: Partial<Ao3Meta>): Ao3Meta => ({ ...emptyMeta(), rating: "Explicit", categories: ["M/M"], ...over });
const MM = meta({ relationships: ["Derek Hale/Stiles Stilinski"] });
const SETUP = "Derek and Stiles were naked in bed, hard and aching.";
const run = (s: string, m = MM) => analyzeWithPatterns(`${SETUP}\n\n${s}`, m, { quiet: true }).pairings[0];

describe("sucking on fingers hints oral bottom", () => {
  it.each([
    "Stiles licked and sucked at Derek's gloved fingers.",
    "Stiles sucked on the fingers greedily.",
    "Stiles sucked two of Derek's fingers into his mouth.",
    "Derek shoved two leather-covered fingers into Stiles's mouth.",
    "Derek pushed his thumb past Stiles's swollen lips.",
  ])("%s", (s) => {
    const p = run(s);
    expect(p.oral.instances).toHaveLength(0);
    expect(p.oral.desires).toContainEqual(expect.objectContaining({ who: "Stiles Stilinski", role: "bottom", kind: "fingers" }));
  });
});

describe("playing with oneself hints anal bottom", () => {
  it.each([
    "Stiles fingered himself open.",
    "Stiles slid a finger into himself.",
    "Stiles eased the slick dildo inside himself.",
    "Stiles rode the plug against the pew.",
    "Stiles fucked himself on the toy.",
    "Stiles opened up quickly under rhythmic thrusts down on his own finger, pressing against his rim.",
  ])("%s", (s) => {
    const p = run(s);
    expect(p.anal.instances).toHaveLength(0);
    expect(p.anal.desires).toContainEqual(expect.objectContaining({ who: "Stiles Stilinski", role: "bottom", kind: "solo" }));
  });

  it.each(["Stiles opened himself to the idea.", "Stiles stretched himself out on the couch after the run.", "Stiles ran his own fingers through his hair."])(
    "ignores: %s",
    (s) => {
      const p = run(s);
      expect(p.anal.desires.filter((d) => d.kind === "solo")).toHaveLength(0);
    },
  );

  it("doesn't count these hints for a man and a woman", () => {
    const m = meta({ categories: ["F/M"], relationships: ["Derek Hale/Lydia Martin"] });
    const p = analyzeWithPatterns("Lydia laughed. She smiled. Lydia sighed. She grinned. Derek nodded. He smiled. Derek waited. He sighed.\n\nDerek and Lydia were naked in bed.\n\nLydia sucked on Derek's fingers.", m, { quiet: true }).pairings[0];
    expect(p.oral.desires.filter((d) => d.kind === "fingers")).toHaveLength(0);
  });
});
