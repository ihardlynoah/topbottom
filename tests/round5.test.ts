import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const meta = (over: Partial<Ao3Meta>): Ao3Meta => ({ ...emptyMeta(), rating: "Explicit", categories: ["M/M"], ...over });
const all = (text: string, m: Ao3Meta) => analyzeWithPatterns(text, m, { quiet: true }).pairings;
const run = (text: string, m: Ao3Meta) => all(text, m)[0];
const MM = meta({ relationships: ["Draco Malfoy/Harry Potter"] });
// A triad where only two of the three pairs actually have sex.
const TRIO = meta({
  relationships: ["Harry Potter/Ron Weasley", "Harry Potter/Draco Malfoy", "Harry Potter/Draco Malfoy/Ron Weasley"],
});
const pair = (text: string, name: string) => {
  const want = name.split("/").sort().join("/");
  return all(text, TRIO).find((p) => p.pairing.split("/").sort().join("/") === want);
};

describe("crotch ogling", () => {
  it("counts toward both the oral and the anal bottom", () => {
    const text = "Harry and Draco were at the party.\n\nDraco couldn't stop staring at the bulge in Harry's jeans.";
    const p = run(text, MM);
    for (const d of [p.anal.desires, p.oral.desires]) {
      expect(d).toContainEqual(expect.objectContaining({ who: "Draco Malfoy", role: "bottom", kind: "ogling" }));
    }
  });
});

describe("round 5 phrasings", () => {
  const SETUP = "Harry and Draco were naked in bed, hard and aching.";

  it("reads a cock pressed to someone's lips as oral", () => {
    const p = run(`${SETUP}\n\nHarry guided his cock to Draco's lips and Draco opened up for him.`, MM);
    expect(p.oral.instances[0]).toMatchObject({ top: "Harry Potter", bottom: "Draco Malfoy" });
  });

  it("resolves 'his lover' to the partner", () => {
    const p = run(`${SETUP}\n\nDraco sighed happily. Then his lover pushed into him.`, MM);
    expect(p.anal.instances[0]).toMatchObject({ top: "Harry Potter", bottom: "Draco Malfoy" });
  });

  it("doesn't read sucking on fingers as a blowjob", () => {
    const p = run(`${SETUP}\n\nHarry held up two fingers. Draco sucked them into his mouth and swirled his tongue around them.`, MM);
    expect(p.oral.instances).toHaveLength(0);
  });

  it("keeps a negation inside its own clause", () => {
    const p = run(`${SETUP}\n\nHarry didn't say a word as he slid into Draco.`, MM);
    expect(p.anal.instances[0]).toMatchObject({ top: "Harry Potter", bottom: "Draco Malfoy" });
  });
});

describe("threesome partner resolution", () => {
  const SETUP = "Harry, Ron and Draco were naked on the bed together.";

  it("doesn't pair 'him' with someone named later in the sentence", () => {
    const text = `${SETUP}\n\nRon fucked Harry hard. Draco watched. "Go on," Draco said.\n\nSlowly, Ron began fucking him again, though he kept glancing at the way Draco watched.`;
    expect(pair(text, "Draco Malfoy/Ron Weasley")?.anal.instances ?? []).toHaveLength(0);
  });

  it("uses the clause subject for a pronoun when someone else is named first", () => {
    const text = `${SETUP}\n\nDraco fucked into Harry while Ron held him. It was too much, and he came over Ron's thigh as he clenched around Draco's cock.`;
    expect(pair(text, "Draco Malfoy/Ron Weasley")?.anal.instances ?? []).toHaveLength(0);
  });

  it("skips a dash-set aside when finding the subject", () => {
    const text = `${SETUP}\n\nRon fucked Harry until he came. The moment he pulled out, Draco lifted Harry by his thighs, pressing him down—and Ron with him—as he fucked into him.`;
    expect(pair(text, "Draco Malfoy/Ron Weasley")?.anal.instances ?? []).toHaveLength(0);
    expect(pair(text, "Harry Potter/Draco Malfoy")?.anal.instances.length).toBeGreaterThan(0);
  });
});
