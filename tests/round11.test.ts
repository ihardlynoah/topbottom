import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const meta = (over: Partial<Ao3Meta>): Ao3Meta => ({ ...emptyMeta(), rating: "Explicit", categories: ["M/M"], ...over });
const MM = meta({ relationships: ["Castiel/Dean Winchester"], characters: ["Castiel", "Dean Winchester", "Gabriel"] });
const SETUP = "Dean and Castiel were naked in bed, hard and aching. Gabriel had left hours ago.";
const run = (s: string, m = MM) => analyzeWithPatterns(`${SETUP}\n\n${s}`, m, { quiet: true }).pairings;
const main = (s: string, m = MM) => run(s, m).find((p) => !/Gabriel/.test(p.pairing))!;

describe("role tags", () => {
  it("reads 'Top Castiel/Bottom Dean Winchester' as two role tags", () => {
    const m = meta({ ...MM, freeforms: ["Top Castiel/Bottom Dean Winchester"] });
    const p = main("Castiel slid into Dean slowly.", m);
    expect(p.anal.confidence.reasons.join(" ")).not.toMatch(/conflicts with tag/);
    expect(p.anal.confidence.reasons.join(" ")).toMatch(/Top Castiel\/Bottom Dean Winchester/);
  });
});

describe("round 11 phrasings", () => {
  it("reads 'snug around X's cock' as the other person riding", () => {
    expect(main("Castiel was scorching and slick and snug around Dean's hypersensitive cock.").anal.instances[0]).toMatchObject({ top: "Dean Winchester", bottom: "Castiel" });
  });
  it("reads 'rose and fell around him' as riding", () => {
    expect(main("Dean could only feel the way Castiel slowly rose and fell around him.").anal.instances[0]).toMatchObject({ top: "Dean Winchester", bottom: "Castiel" });
  });
  it("gives 'with X clenched tight… before he rode him' to X", () => {
    const p = main("There was no way Dean could last with Castiel clenched tight and rolling his hips before he rode him hard.");
    expect(p.anal.instances[0]).toMatchObject({ top: "Dean Winchester", bottom: "Castiel" });
  });
});

describe("round 11 false positives", () => {
  it("doesn't read 'rode him through it' as riding", () => {
    expect(main("Dean came between them, and Castiel rode him through it, rutting against his hip.").anal.instances).toHaveLength(0);
  });
  it("doesn't read 'taking X with him' as penetration", () => {
    expect(main("Dean sank back into the couch, taking Castiel with him.").anal.instances).toHaveLength(0);
  });
  it("doesn't read climbing into a car as penetration", () => {
    expect(main("Dean opened the driver side door of the Impala and slipped inside.").anal.instances).toHaveLength(0);
  });
  it("credits 'hollowed his cheeks … for X' to X, not to someone outside the scene", () => {
    const pairs = run("Castiel's cock pulsed in his mouth. He hollowed his cheeks, creating a suction for Castiel, and that had him spilling in Dean's mouth.");
    expect(pairs.filter((p) => /Gabriel/.test(p.pairing))).toHaveLength(0);
    expect(main("Castiel's cock pulsed in his mouth. He hollowed his cheeks, creating a suction for Castiel, and that had him spilling in Dean's mouth.").oral.instances[0]).toMatchObject({ top: "Castiel", bottom: "Dean Winchester" });
  });
  it("credits a line to whoever's voice was heard", () => {
    const p = main(`Dean had his mouth full. "Swallow me down," he heard Castiel's voice from above him.`);
    expect(p.oral.desires.filter((d) => d.kind === "said").every((d) => d.who === "Castiel")).toBe(true);
  });
});
