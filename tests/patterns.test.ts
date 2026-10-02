import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

function meta(over: Partial<Ao3Meta>): Ao3Meta {
  return { ...emptyMeta(), rating: "Explicit", ...over };
}

const drarry = meta({
  fandoms: ["Harry Potter - J. K. Rowling"],
  relationships: ["Draco Malfoy/Harry Potter"],
  characters: ["Draco Malfoy", "Harry Potter"],
  categories: ["M/M"],
  freeforms: ["Bottom Harry Potter", "Rimming", "Blow Jobs"],
});

const fic = `Chapter 1

Harry and Draco stumbled into the bedroom, kissing hard.

Draco kissed Harry's neck. He pushed into him slowly, and Harry moaned at the stretch.

Later, Harry sucked Draco off in the shower.

He wanted Draco to fuck him again.

Chapter 2

Draco's cock slid into Harry's hole and they both groaned.

Draco rimmed him until his legs shook.

"Fuck me," Harry begged.

Draco didn't fuck him that night, though.

Chapter 3

Harry imagined Draco sucking him off.

Harry fucked Draco hard against the wall, his hips snapping.

Then Draco rode Harry's cock until they both came.`;

describe("pattern engine on an M/M fic", () => {
  const a = analyzeWithPatterns(fic, drarry, { quiet: true });
  const main = a.pairings[0];

  it("finds the tagged pairing", () => {
    expect(a.source).toBe("patterns");
    expect(main.pairing).toBe("Draco Malfoy/Harry Potter");
  });

  it("detects anal switching with Draco topping more", () => {
    expect(main.anal.verdict).toBe("switch");
    expect(main.anal.top).toBe("Draco Malfoy");
    expect(main.anal.bottom).toBe("Harry Potter");
    const tops = main.anal.instances.map((i) => i.top);
    expect(tops).toContain("Harry Potter");
  });

  it("resolves 'He pushed into him' through pronouns", () => {
    const inst = main.anal.instances.find((i) => i.evidence.startsWith("Draco kissed") || i.evidence.startsWith("He pushed"));
    expect(inst?.top).toBe("Draco Malfoy");
  });

  it("gets oral roles right: receiver of a blowjob and the rimmer are tops", () => {
    expect(main.oral.verdict).toBe("one_way");
    expect(main.oral.top).toBe("Draco Malfoy");
    expect(main.oral.bottom).toBe("Harry Potter");
    const acts = main.oral.instances.map((i) => i.act).join(" ");
    expect(acts).toMatch(/blowjob/);
    expect(acts).toMatch(/rimming/);
  });

  it("does not count negated acts", () => {
    expect(main.anal.instances.some((i) => /didn't/.test(i.evidence))).toBe(false);
  });

  it("records desire and fantasy separately from acts", () => {
    const d = main.anal.desires;
    expect(d.some((x) => x.who === "Harry Potter" && x.role === "bottom" && x.kind === "wanted")).toBe(true);
    expect(d.some((x) => x.who === "Harry Potter" && x.role === "bottom" && x.kind === "said")).toBe(true);
    const f = main.oral.desires.find((x) => x.kind === "fantasy");
    expect(f).toMatchObject({ who: "Harry Potter", role: "top" });
    expect(main.oral.instances.some((i) => /imagined/.test(i.evidence))).toBe(false);
  });

  it("scores confidence with reasons", () => {
    expect(main.anal.confidence.score).toBeGreaterThan(0.3);
    expect(main.anal.confidence.reasons.length).toBeGreaterThan(0);
    expect(main.oral.confidence.label).not.toBe("Low");
  });
});

describe("pattern engine edge cases", () => {
  it("ignores vaginal sex and treats going down on a woman as cunnilingus (licker on top)", () => {
    const m = meta({ relationships: ["Ana/Ben"], characters: ["Ana", "Ben"], categories: ["F/M"] });
    const text = `Ben kissed Ana and she pulled him close. Ben smiled at her. He fucked her slowly. Ben was gentle with her and she loved him.

Later he went down on her.

Ana laughed as she pushed him back. She grinned at him, and he went to sleep. She smiled and kissed Ben. She hummed and held Ben. Ana told Ben she loved him.`;
    const a = analyzeWithPatterns(text, m, { quiet: true });
    const p = a.pairings[0];
    expect(p.anal.verdict).toBe("none");
    expect(p.oral.instances[0]).toMatchObject({ top: "Ben", bottom: "Ana", act: "cunnilingus" });
  });

  it("falls back to AO3 role tags when the text has nothing", () => {
    const a = analyzeWithPatterns("They held hands.", drarry, { quiet: true });
    const p = a.pairings[0];
    expect(p.anal.verdict).toBe("one_way");
    expect(p.anal.bottom).toBe("Harry Potter");
    expect(p.anal.top).toBe("Draco Malfoy");
    expect(p.anal.confidence.label).not.toBe("High");
  });

  it("reads first-person narration", () => {
    const m = meta({ relationships: ["Steve Rogers/Bucky Barnes"], categories: ["M/M"] });
    const text = `I couldn't stop looking at Bucky. I had been thinking about it all day. I wanted him so badly.

Bucky pushed me onto the bed. He slid into me and I gasped. I knew I would never forget it. I said his name. I held on.`;
    const a = analyzeWithPatterns(text, m, { quiet: true });
    const p = a.pairings[0];
    expect(p.anal.instances[0]).toMatchObject({ top: "Bucky Barnes", bottom: "Steve Rogers" });
  });

  it("guesses characters when there are no tags", () => {
    const text = Array.from({ length: 8 }, () => "Later that night Sam laughed and Dean grinned.").join(" ") + "\n\nSam sucked Dean off.";
    const a = analyzeWithPatterns(text, emptyMeta(), { quiet: true });
    expect(a.pairings[0].oral.instances[0]).toMatchObject({ top: "Dean", bottom: "Sam" });
  });
});
