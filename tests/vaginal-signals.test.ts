import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const meta = (over: Partial<Ao3Meta>): Ao3Meta => ({ ...emptyMeta(), rating: "Explicit", ...over });
const run = (text: string, m: Ao3Meta) => analyzeWithPatterns(text, m, { quiet: true }).pairings[0];

const MF = meta({ relationships: ["Ana/Ben"], characters: ["Ana", "Ben"], categories: ["F/M"] });
const MF_INTRO = "Ana smiled. She kissed Ben. Ben laughed. He pulled her close. Ana sighed. She held him.";

describe("vaginal sex", () => {
  it("detects vaginal sex in an M/F scene and doesn't call it anal", () => {
    const p = run(`${MF_INTRO}\n\nBen fucked her slowly.`, MF);
    expect(p.vaginal.occurs).toBe(true);
    expect(p.vaginal.applicable).toBe(true);
    expect(p.vaginal.summary).toMatch(/Ana & Ben|Ben & Ana/);
    expect(p.anal.verdict).toBe("none");
  });

  it("still counts anal sex in an M/F scene when the text says so", () => {
    const p = run(`${MF_INTRO}\n\nBen pushed into her ass.`, MF);
    expect(p.anal.instances[0]).toMatchObject({ top: "Ben", bottom: "Ana" });
    expect(p.vaginal.occurs).toBe(false);
  });

  it("counts 'had sex' / 'made love' as vaginal only when someone has a vagina", () => {
    expect(run(`${MF_INTRO}\n\nAna and Ben made love.`, MF).vaginal.occurs).toBe(true);
    const mm = meta({ relationships: ["Harry Potter/Draco Malfoy"], categories: ["M/M"] });
    const p = run("Harry and Draco were naked.\n\nHarry and Draco made love.", mm);
    expect(p.vaginal.occurs).toBe(false);
    expect(p.vaginal.applicable).toBe(false);
  });

  it("handles omegaverse men with vaginas by the words used", () => {
    const m = meta({ relationships: ["Derek Hale/Stiles Stilinski"], categories: ["M/M"], freeforms: ["Alpha/Beta/Omega Dynamics"] });
    const text = `Derek and Stiles were naked, and Stiles's cunt was slick and aching.

Derek slid into Stiles's cunt.

Later Derek pushed into his ass.`;
    const p = run(text, m);
    expect(p.vaginal.occurs).toBe(true);
    expect(p.vaginal.instances[0].evidence).toMatch(/cunt/);
    expect(p.anal.instances[0]).toMatchObject({ top: "Derek Hale", bottom: "Stiles Stilinski" });
  });

  it("handles a trans man's front hole", () => {
    const m = meta({ relationships: ["Alex/Sam"], categories: ["M/M"] });
    const text = "Alex and Sam were naked in bed, hard and aching.\n\nSam slid into Alex's front hole.";
    expect(run(text, m).vaginal.occurs).toBe(true);
    expect(run(text, m).anal.verdict).toBe("none");
  });

  it("lets a trans woman top anally without a strap-on", () => {
    const m = meta({ relationships: ["Mia/Tom"], characters: ["Mia", "Tom"], categories: ["F/M"] });
    const text = "Mia smiled. She kissed Tom. Tom groaned. He wanted her. Mia's cock was hard.\n\nMia fucked Tom slowly, her cock deep in his ass.";
    const p = run(text, m);
    expect(p.anal.instances[0]).toMatchObject({ top: "Mia", bottom: "Tom" });
  });
});

describe("signals: fingering and ogling", () => {
  const MM = meta({ relationships: ["Draco Malfoy/Harry Potter"], categories: ["M/M"] });
  const SETUP = "Harry and Draco were naked in bed, hard and aching.";

  it("uses fingering as a hint when there's no anal sex", () => {
    const p = run(`${SETUP}\n\nHarry pushed two fingers into Draco.`, MM);
    expect(p.anal.verdict).toBe("unclear");
    expect(p.anal.summary).toMatch(/Harry Potter as the top/);
  });

  it("raises confidence when fingering agrees with the sex", () => {
    const base = run(`${SETUP}\n\nHarry fucked Draco.`, MM).anal.confidence.score;
    const withFinger = run(`${SETUP}\n\nHarry pushed two fingers into Draco.\n\nHarry fucked Draco.`, MM).anal;
    expect(withFinger.confidence.score).toBeGreaterThan(base);
    expect(withFinger.confidence.reasons.join(" ")).toMatch(/signal/);
  });

  it("reads ogling: an ass suggests top, a bulge suggests bottom", () => {
    const text = `Harry and Draco were at the party.

Harry checked out Draco's ass.

Draco's eyes dropped to Harry's crotch.

Draco couldn't stop staring at the bulge in Harry's jeans.`;
    const d = run(text, MM).anal.desires;
    expect(d).toContainEqual(expect.objectContaining({ who: "Harry Potter", role: "top", kind: "ogling" }));
    expect(d.filter((x) => x.who === "Draco Malfoy" && x.role === "bottom" && x.kind === "ogling")).toHaveLength(2);
  });

  it("reads grabbing and compliments", () => {
    const text = `Harry and Draco were alone.

Harry grabbed Draco's ass.

"Nice ass," Harry said.`;
    const d = run(text, MM).anal.desires;
    expect(d).toContainEqual(expect.objectContaining({ who: "Harry Potter", role: "top", kind: "touch" }));
    expect(d).toContainEqual(expect.objectContaining({ who: "Harry Potter", role: "top", kind: "ogling" }));
  });

  it("ignores negated ogling, and ogling in M/F pairs", () => {
    expect(run("Harry and Draco talked.\n\nHarry didn't check out Draco's ass.", MM).anal.desires).toHaveLength(0);
    expect(run(`${MF_INTRO}\n\nBen checked out Ana's ass.`, MF).anal.desires).toHaveLength(0);
  });

  it("ogling alone gives an unclear verdict with a lean", () => {
    const p = run("Harry and Draco were at the party.\n\nHarry checked out Draco's ass.\n\nHarry grabbed Draco's ass.", MM);
    expect(p.anal.verdict).toBe("unclear");
    expect(p.anal.summary).toMatch(/Harry Potter as the top/);
    expect(p.anal.confidence.label).toBe("Low");
  });
});
