// Regressions from testing real AO3 fics (constructions paraphrased, not quoted).
import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";
import { guessNames } from "../src/heuristic/characters";

const DC: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], relationships: ["Castiel/Dean Winchester"] };
const SETUP = "Dean and Castiel were naked in the motel room, hard and aching.";
const run = (text: string, m = DC) => analyzeWithPatterns(text, m, { quiet: true }).pairings[0];

describe("names", () => {
  it("recognizes an untagged nickname (Cas for Castiel)", () => {
    const text = `${SETUP} Cas smiled. Cas kissed him. Cas laughed.\n\nCas slid into Dean slowly.`;
    expect(run(text).anal.instances[0]).toMatchObject({ top: "Castiel", bottom: "Dean Winchester" });
  });

  it("merges nicknames and surnames when guessing names without tags", () => {
    const text = Array.from({ length: 5 }, () => "Dean Winchester sighed. Castiel watched Dean. Cas smiled at Dean. Castiel nodded.").join(" ");
    const names = guessNames(text);
    expect(names).toContain("Dean Winchester");
    expect(names).toContain('Castiel "Cas"');
    expect(names.some((n) => /^(Winchester|Cas)$/.test(n))).toBe(false);
  });
});

describe("subjects", () => {
  it.each([
    // the subject of "began" is a finger, not Dean
    ["Dean whimpered when a second finger began pushing into him.", null],
    // "he" is the nearest clause's subject (Castiel), not the first name in the sentence
    ["Before Dean could react, Castiel grabbed his leg and, using it as leverage, he started thrusting in harder.", ["Castiel", "Dean Winchester"]],
    // "to + verb" takes the clause's subject
    ["Castiel stroked Dean's hips as he rose up on his knees to slide into him.", ["Castiel", "Dean Winchester"]],
    // ...or the object right before "to"
    ["Dean begged Castiel to fuck him.", null], // a desire, not an act
  ] as const)("%s", (sentence, exp) => {
    const p = run(`${SETUP}\n\n${sentence}`);
    const sex = p.anal.instances.filter((i) => i.act !== "fingering");
    if (exp) expect(sex[0]).toMatchObject({ top: exp[0], bottom: exp[1] });
    else expect(sex).toHaveLength(0);
  });

  it("reads 'begged Castiel to fuck him' as Dean wanting to bottom", () => {
    const d = run(`${SETUP}\n\nDean begged Castiel to fuck him.`).anal.desires;
    expect(d).toContainEqual(expect.objectContaining({ who: "Dean Winchester", role: "bottom", kind: "wanted" }));
  });
});

describe("texts and dialogue", () => {
  it("treats [bracketed] text messages as dialogue and finds the sender from who they address", () => {
    const text = `${SETUP}\n\nThe phone buzzed.\n\n[I want to fuck you until you can't walk, Dean.]`;
    const d = run(text).anal.desires;
    expect(d).toContainEqual(expect.objectContaining({ who: "Castiel", role: "top", kind: "said" }));
    expect(run(text).anal.instances).toHaveLength(0);
  });

  it.each([
    [`"Get in me, Cas," Dean begged.`, "Dean Winchester", "bottom", true],
    [`"I'd have you bent over the table," Castiel said.`, "Castiel", "top", true],
    [`"If anyone is going to bottom it's you," Dean said.`, "Dean Winchester", "top", true],
    [`"Fine, I'll let you top," Dean said.`, "Dean Winchester", "bottom", true],
    [`"As if I'd let you top," Dean said.`, "Dean Winchester", "bottom", false],
  ] as const)("%s", (line, who, role, wants) => {
    const d = run(`${SETUP}\n\n${line}`).anal.desires;
    expect(d).toContainEqual(expect.objectContaining({ who, role, wants }));
  });
});
