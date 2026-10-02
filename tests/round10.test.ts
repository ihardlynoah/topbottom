import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const meta = (over: Partial<Ao3Meta>): Ao3Meta => ({ ...emptyMeta(), rating: "Explicit", categories: ["M/M"], ...over });
const MM = meta({ relationships: ["Steve Harrington/Eddie Munson"] });
const run = (text: string) => analyzeWithPatterns(text, MM, { quiet: true }).pairings[0];
const SETUP = "Steve and Eddie were naked in bed, hard and aching.";

describe("feelings and hugs aren't penetration", () => {
  it.each([
    "Eddie broke free, being filled with pure delight as he saw Steve chasing his lips.",
    "As he looked down at Steve sprawled over him, he was filled to the brim with overwhelming adoration.",
    "Eddie was filled with warmth when Steve laughed.",
  ])("%s", (s) => {
    expect(run(`${SETUP}\n\n${s}`).anal.instances).toHaveLength(0);
  });

  it("doesn't read sinking into a hug as penetration", () => {
    const text = "Steve and Eddie hugged on the porch.\n\nEddie couldn't help but notice their close proximity, Steve's chest pressing to him as he sank in.";
    expect(run(text).anal.instances).toHaveLength(0);
  });

  it("doesn't read a thumb pressed inside someone's palm as fingering", () => {
    expect(run(`${SETUP}\n\nSteve traced Eddie's rings, one of his thumbs coming to press inside Eddie's palm.`).anal.instances).toHaveLength(0);
  });

  it("still reads 'filled him with his cock' and 'sank in' in a sex scene", () => {
    const p = run(`${SETUP}\n\nSteve's cock nudged Eddie's hole, and Steve sank in.\n\nEddie was filled with Steve's cock.`);
    expect(p.anal.instances.length).toBeGreaterThan(0);
    for (const i of p.anal.instances) expect(i).toMatchObject({ top: "Steve Harrington", bottom: "Eddie Munson" });
  });
});
