import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const meta = (over: Partial<Ao3Meta>): Ao3Meta => ({ ...emptyMeta(), rating: "Explicit", categories: ["M/M"], ...over });
const run = (text: string, m: Ao3Meta) => analyzeWithPatterns(text, m, { quiet: true }).pairings[0];
const DRARRY = meta({ relationships: ["Draco Malfoy/Harry Potter"] });

describe("epithets", () => {
  it("learns 'the blond' from hair colour, even when the default guess would be wrong", () => {
    // After "Draco sighed", the default would read "the blond" as Harry (the other person).
    const text = `Draco's pale blond hair fell into his eyes. Harry's dark hair was a mess.

They were naked in bed. Draco sighed. The blond pushed into Harry slowly.`;
    expect(run(text, DRARRY).anal.instances[0]).toMatchObject({ top: "Draco Malfoy", bottom: "Harry Potter" });
  });

  it("maps 'the alpha' / 'the omega' from AO3 tags", () => {
    const m = meta({ relationships: ["Derek Hale/Stiles Stilinski"], freeforms: ["Alpha Derek Hale", "Omega Stiles Stilinski"] });
    const text = "Derek and Stiles were naked, Stiles's hole slick.\n\nThe alpha slid into the omega.";
    expect(run(text, m).anal.instances[0]).toMatchObject({ top: "Derek Hale", bottom: "Stiles Stilinski" });
  });

  it("learns an epithet from consistent use across the fic", () => {
    // "The blond" consistently means Draco earlier, so it should still mean Draco right after "Draco moaned".
    const scenes = Array.from({ length: 4 }, () => "Harry smiled at Draco. The blond grinned back.").join(" ");
    const text = `${scenes}\n\nThey were naked in bed. Draco moaned. The blond sucked him off.`;
    expect(run(text, DRARRY).oral.instances[0]).toMatchObject({ top: "Harry Potter", bottom: "Draco Malfoy" });
  });
});

describe("lead-up signals", () => {
  const SETUP = "Harry and Draco were naked in bed, hard and aching.";
  const signals = (s: string) => run(`${SETUP}\n\n${s}`, DRARRY);

  it.each([
    ["Harry lined himself up with Draco's hole.", "anal", "Harry Potter", "top"],
    ["Harry slicked himself up.", "anal", "Harry Potter", "top"],
    ["Harry rolled on a condom.", "anal", "Harry Potter", "top"],
    ["Draco spread his legs for Harry.", "anal", "Draco Malfoy", "bottom"],
    ["Draco got on his hands and knees.", "anal", "Draco Malfoy", "bottom"],
    ["Draco bent over the desk.", "anal", "Draco Malfoy", "bottom"],
    ["Harry pushed Draco's head down.", "oral", "Harry Potter", "top"],
    ["Draco dropped to his knees in front of Harry.", "oral", "Draco Malfoy", "bottom"],
    ["Draco knelt between Harry's legs.", "oral", "Draco Malfoy", "bottom"],
  ] as const)("%s", (sentence, cat, who, role) => {
    const d = signals(sentence)[cat].desires;
    expect(d).toContainEqual(expect.objectContaining({ who, role, kind: "prep" }));
  });
});

describe("dialogue during sex", () => {
  const SETUP = "Harry and Draco were naked in bed, hard and aching.";
  it.each([
    [`"You're so tight," Harry groaned.`, "anal", "Harry Potter", "top"],
    [`"You feel so big," Draco gasped.`, "anal", "Draco Malfoy", "bottom"],
    [`"Bend over," Harry ordered.`, "anal", "Harry Potter", "top"],
    [`"I need your knot," Draco begged.`, "anal", "Draco Malfoy", "bottom"],
    [`"Your mouth feels so good," Harry moaned.`, "oral", "Harry Potter", "top"],
  ] as const)("%s", (line, cat, who, role) => {
    const d = run(`${SETUP}\n\n${line}`, DRARRY)[cat].desires;
    expect(d).toContainEqual(expect.objectContaining({ who, role, kind: "said" }));
  });

  it("doesn't read 'you're so tight' as a role when negated", () => {
    const d = run(`${SETUP}\n\n"You're not tight at all," Harry said.`, DRARRY).anal.desires;
    expect(d.filter((x) => x.kind === "said")).toHaveLength(0);
  });
});
