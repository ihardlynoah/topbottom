import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const meta: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Supernatural"], relationships: ["Castiel/Dean Winchester"], characters: ["Castiel", "Dean Winchester"] };
const base = ("Dean and Cas were in bed. Cas kissed Dean. Dean kissed Cas back. ").repeat(3) + "\n\n";
const run = (s: string) => analyzeWithPatterns(base + s, meta, { quiet: true }).pairings[0];

describe("More Views. More Money. report", () => {
  it("“would very much like Dean’s mouth on his cock” is a wish, not a scene", () => {
    const p = run("Cas would very much like Dean’s mouth on his cock too. Not that he would admit that aloud.");
    expect(p.blowjob.instances).toHaveLength(0);
    expect(p.blowjob.desires.some((d) => d.who.startsWith("Castiel") && d.role === "top")).toBe(true);
  });
  it("“'d really love / would dearly like” works the same way", () => {
    expect(run("Cas would dearly like Dean’s mouth on his cock.").blowjob.instances).toHaveLength(0);
  });
  it("“Dean could feel his cock pulse in his mouth” is Dean sucking Cas", () => {
    const p = run("Cas’ knees start to buckle, thrusts slowing down. He was close, Dean could feel his cock pulse in his mouth. He hollowed his cheeks.");
    for (const i of p.blowjob.instances) expect(i).toMatchObject({ top: "Castiel", bottom: "Dean Winchester" });
    expect(p.blowjob.instances.length).toBeGreaterThan(0);
  });
});
