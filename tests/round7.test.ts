import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const meta = (over: Partial<Ao3Meta>): Ao3Meta => ({ ...emptyMeta(), rating: "Explicit", categories: ["M/M"], ...over });
const M = meta({ relationships: ["Derek Hale/Stiles Stilinski"] });
const run = (text: string) => analyzeWithPatterns(text, M, { quiet: true }).pairings[0];
const SETUP = "Derek and Stiles were naked in bed, hard and aching.";

describe("round 7 phrasings", () => {
  it("reads 'eating out X's ass' as rimming", () => {
    expect(run(`${SETUP}\n\nDerek went to town, eating out Stiles's ass.`).oral.instances[0]).toMatchObject({ top: "Derek Hale", bottom: "Stiles Stilinski", act: "rimming" });
  });

  it("reads a stripe licked with the tongue along someone's rim", () => {
    expect(run(`${SETUP}\n\nDerek licked a slow stripe with his tongue along the length of Stiles's rim.`).oral.instances[0]).toMatchObject({ top: "Derek Hale", act: "rimming" });
  });

  it("gives the cock's owner the top when someone guides it into their own mouth", () => {
    const p = run(`${SETUP}\n\nStiles leaned down, wrapped a hand around Derek's swelling cock and guided the tip into his mouth.`);
    expect(p.oral.instances[0]).toMatchObject({ top: "Derek Hale", bottom: "Stiles Stilinski" });
  });

  it("doesn't read dragging a cock over a prostate as licking", () => {
    const p = run(`${SETUP}\n\nDerek shoved in deep, circling his hips and dragging his cock over Stiles's prostate.`);
    expect(p.oral.instances).toHaveLength(0);
  });
});

describe("dreams and visions", () => {
  it("keeps a dream going into the next paragraph until he wakes", () => {
    const text = `${SETUP}\n\nThat night Stiles dreams that Derek has him tied to the bed.\n\nDerek's tongue feels so good on his hole, licking in deep.\n\nStiles wakes up gasping. Derek is asleep beside him.`;
    const p = run(text);
    expect(p.oral.instances).toHaveLength(0);
    expect(p.oral.desires).toContainEqual(expect.objectContaining({ who: "Derek Hale", role: "top", kind: "fantasy" }));
  });

  it("doesn't start a dream from 'not dreaming'", () => {
    const text = `${SETUP}\n\nStiles pinches himself to make sure he's not dreaming. He isn't.\n\nDerek's lips seal over Stiles's hole, licking at him until he shakes.`;
    expect(run(text).oral.instances).toHaveLength(1);
  });

  it("treats 'the vision he'd clung to' as fantasy", () => {
    const text = `${SETUP}\n\nIt was nothing like the vision he'd clung to all month, which included Derek fucking him slowly.`;
    expect(run(text).anal.instances).toHaveLength(0);
  });
});
