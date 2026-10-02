import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const meta: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Supernatural"], relationships: ["Castiel/Dean Winchester"], characters: ["Castiel", "Dean Winchester"] };
const filler = Array.from({ length: 12 }, (_, i) => `Cas looked at Dean across the garage, number ${i}.`).join("\n");
const SET = "Dean lay on his bed, naked and restless, thinking of Cas.";
const run = (s: string) => analyzeWithPatterns(`${filler}\n\n${SET} ${s}`, meta, { quiet: true }).pairings[0];
const dean = <T extends { name: string }>(xs: T[]) => xs.find((x) => /Dean/.test(x.name))!;

describe("using a toy on yourself is bottoming", () => {
  const lines = [
    "Dean fucked himself on the dildo until his thighs shook.",
    "Dean slid the plug inside himself and groaned.",
    "Dean rode the vibrator, one hand braced on the headboard.",
    "Dean lubed up the toy and worked it into himself, slow and deep.",
    "Dean pushed the dildo into his ass and gasped.",
    "Dean teased his hole with the tip of the vibe before pressing it in.",
    "Dean was wearing a plug under his jeans all day.",
  ];
  for (const line of lines) {
    it(`“${line}”`, () => {
      const p = run(line);
      const d = dean(p.anal.people!);
      expect(d.bottom).toBeGreaterThan(0.5);
      expect(d.top).toBeLessThan(0.1);
      // never a scene where he tops his partner
      expect(p.anal.instances).toHaveLength(0);
      expect(dean(p.vibe!).label).not.toMatch(/top/i);
    });
  }
  it("builds up with repeats", () => {
    const one = dean(run("Dean fucked himself on the dildo.").anal.people!).bottom;
    const two = dean(run("Dean fucked himself on the dildo. Later he slid the plug inside himself and groaned.").anal.people!).bottom;
    expect(two).toBeGreaterThan(one);
  });
  it("still reads a toy pushed into someone else's ass as a scene with Dean on top", () => {
    const p = run("Dean pushed the dildo into Cas’s ass and Cas gasped.");
    expect(p.anal.instances[0]).toMatchObject({ top: expect.stringMatching(/Dean/), bottom: expect.stringMatching(/Castiel/) });
  });
});
