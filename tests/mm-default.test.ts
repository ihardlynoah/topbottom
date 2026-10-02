import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const meta = (over: Partial<Ao3Meta>): Ao3Meta => ({ ...emptyMeta(), rating: "Explicit", categories: ["M/M"], ...over });
const run = (text: string, m: Ao3Meta) => analyzeWithPatterns(text, m, { quiet: true });

describe("unclear hole between two men", () => {
  // "his front hole" elsewhere means a man here may have a vagina, so "slid into him" alone doesn't say which.
  const M = meta({ relationships: ["Derek Hale/Stiles Stilinski"], freeforms: ["Alpha/Beta/Omega Dynamics"] });
  const SETUP = "Scott had once joked about his front hole. Derek and Stiles were naked in bed.";

  it("defaults to anal", () => {
    const a = run(`${SETUP}\n\nDerek slid into Stiles.`, M);
    expect(a.pairings[0].anal.instances[0]).toMatchObject({ top: "Derek Hale", bottom: "Stiles Stilinski" });
    expect(a.pairings[0].vaginal.instances).toHaveLength(0);
    expect(a.notes).toMatch(/1 sentence between two men didn't say which and was counted as anal/);
  });

  it("still goes vaginal when that bottom's other scenes clearly are", () => {
    const a = run(`${SETUP}\n\nDerek slid into Stiles’s wet cunt.\n\nLater Derek slid into Stiles again.`, M);
    expect(a.pairings[0].anal.instances).toHaveLength(0);
    expect(a.pairings[0].vaginal.instances).toHaveLength(2);
  });
});

describe("left-out subjects after a thing", () => {
  const M = meta({ relationships: ["Derek Hale/Stiles Stilinski"] });
  it("doesn't credit a person when the clause before has a thing as its subject", () => {
    const a = run("Derek and Stiles were naked in bed.\n\nStiles cried out as a finger breached him, sliding inside.", M);
    expect(a.pairings[0].anal.instances.filter((i) => i.top === "Stiles Stilinski")).toHaveLength(0);
  });
});

describe("mouth near a cock", () => {
  const M = meta({ relationships: ["Derek Hale/Stiles Stilinski"] });
  const SETUP = "Derek and Stiles were naked in bed, hard.";
  it.each([
    ["Stiles pulled his mouth off Derek's cock.", 1],
    ["Stiles pulled off Derek's cock with a pop.", 1],
    ["The head of Derek's cock rested against Stiles's lips.", 1],
    ["Stiles pulled off him and rolled over.", 0],
    ["Stiles smiled into the kiss Derek pressed against his lips.", 0],
  ])("%s", (s, n) => {
    expect(run(`${SETUP}\n\n${s}`, M).pairings[0].oral.instances).toHaveLength(n);
  });
});
