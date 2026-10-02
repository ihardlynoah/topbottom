import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

// Round 16: a time-travel AU where idioms and everyday words were read as sex (paraphrased). Steve is the one
// getting sucked in the setup.
const meta: Ao3Meta = {
  ...emptyMeta(),
  rating: "Explicit",
  categories: ["M/M"],
  relationships: ["Steve Harrington/Eddie Munson"],
  characters: ["Steve Harrington", "Eddie Munson", "Dustin Henderson"],
};
const SET = "Steve sat on the couch, hard in his jeans, and Eddie dropped to his knees in front of him.";
const run = (s: string, setup = SET) => analyzeWithPatterns(`${setup}\n\n${s}`, meta, { quiet: true }).pairings[0];
const nothing = (s: string, setup?: string) => {
  const p = run(s, setup);
  return [...p.anal.instances, ...p.blowjob.instances, ...p.rimming.instances].length === 0 && p.anal.desires.length === 0;
};

describe("not sex", () => {
  it.each([
    "They were so screwed.",
    "He was so fucked.",
    "Honestly, he was fucked if the van broke down again.",
    "“What was the song and dance with the cigarette?” Eddie asked, mimicking the way Steve had hollowed his cheeks.",
    "Steve stared at the shower like it would open up and suck him into the drain.",
    "“Eddie's here,” Dustin said, sucking Steve back into reality.",
    "Eddie smacked his cheeks to wake himself up and opened the door.",
    "He stuck his tongue out through the gap between his bottom teeth.",
    "There was no way Steve was asking him to fuck him or something.",
  ])("finds nothing in: %s", (s) => {
    expect(nothing(s, "Eddie and Steve talked on the porch.")).toBe(true);
  });
  it("still reads 'was fucked' as sex when it says how or by whom", () => {
    const a = run("Steve was fucked hard against the wall, his cock leaking, moaning for more.");
    expect(a.anal.instances.length).toBeGreaterThan(0);
  });
});

describe("oral phrasings", () => {
  it.each([
    "Eddie wrapped his mouth around him and went as low as he could.",
    "Eddie bobbed his head a few times and came up for air.",
    "Eddie took more into his mouth.",
    "Eddie opened his mouth and pressed his tongue against Steve's underwear, right over his cock.",
    "Eddie licked his way from the base to the tip of Steve's cock.",
    "Eddie rolled his tongue around the head of Steve's cock.",
    "Eddie played with the head for a moment, then licked a long stripe up the shaft.",
    "Eddie lowered his head and licked the tip.",
    "Eddie mouthed at the bulge in Steve's jeans.",
    "Eddie pressed an open-mouthed kiss to the head of Steve's cock.",
    "Eddie lowered his head and doubled down, sucking on him through the cotton.",
    "Eddie's mouth closed around the head.",
  ])("%s", (s) => {
    expect(run(s).blowjob.instances[0]).toMatchObject({ top: "Steve Harrington", bottom: "Eddie Munson" });
  });
  it("gives Steve's turn to Steve: 'leaned his head forward and took Eddie as deep as he could'", () => {
    const p = run("Steve slowly leaned his head forward and took Eddie as deep as he could.", "Eddie stood in front of Steve, hard and leaking, one hand in Steve's hair.");
    expect(p.blowjob.instances[0]).toMatchObject({ top: "Eddie Munson", bottom: "Steve Harrington" });
  });
  it("doesn't read 'took Eddie's hand' as oral", () => {
    expect(run("Steve leaned his head forward and took Eddie's hand.").blowjob.instances).toHaveLength(0);
  });
  it("doesn't read kissing the base of a spine as oral", () => {
    expect(run("Cas kissed the base of his spine, stroking his hip.").blowjob.instances).toHaveLength(0);
  });
});

describe("who is the subject", () => {
  it("doesn't take a name inside 'the look on Steve's face' as the subject", () => {
    const p = run(
      "The look on Steve's face made Eddie so hard that it took a moment for him to get himself together.\n\nHe lowered his head, sucking on him through the cotton.",
      "Steve sat on the couch, hard in his jeans, and Eddie knelt in front of him.",
    );
    expect(p.blowjob.instances[0]).toMatchObject({ top: "Steve Harrington", bottom: "Eddie Munson" });
  });
});
