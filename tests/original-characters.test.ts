import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";
import { parseOc } from "../src/heuristic/characters";

const meta = (over: Partial<Ao3Meta>): Ao3Meta => ({ ...emptyMeta(), rating: "Explicit", categories: ["M/M"], ...over });
const run = (text: string, m: Ao3Meta) => analyzeWithPatterns(text, m, { quiet: true });
const names = (n: number, ...who: string[]) => Array.from({ length: n }, () => `${who.join(" and ")} talked for a while.`).join(" ");

describe("original-character tags", () => {
  it.each([
    ["Original Male Character(s)", { gender: "m", plural: true, name: undefined }],
    ["Original Female Character", { gender: "f", plural: false, name: undefined }],
    ["Original Characters", { gender: "u", plural: true, name: undefined }],
    ["OMC", { gender: "m", name: undefined }],
    ["OFCs", { gender: "f", plural: true }],
    ["Kyle (Original Character)", { name: "Kyle", gender: "u" }],
    ["Mira (OFC)", { name: "Mira", gender: "f" }],
    ["Original Male Character - Jonah", { name: "Jonah", gender: "m" }],
    ["OMC: Jonah", { name: "Jonah", gender: "m" }],
  ])("reads %s", (tag, want) => {
    expect(parseOc(tag)).toMatchObject(want);
  });

  it.each(["Harry Potter", "Original Reader Character", "Reader", "Castiel (Supernatural)"])("ignores %s", (tag) => {
    expect(parseOc(tag)).toBeUndefined();
  });
});

describe("original characters in the text", () => {
  it("names OCs from the text when the only tag is generic", () => {
    const text = `${names(6, "Milo", "Rafe")}\n\nThey were naked in bed. Rafe slid into Milo slowly.`;
    const a = run(text, meta({ fandoms: ["Original Work"], characters: ["Original Male Character(s)"] }));
    expect(a.pairings[0].anal.instances[0]).toMatchObject({ top: "Rafe", bottom: "Milo" });
    expect(a.notes).toMatch(/Original characters, named from the text: .*Milo/);
  });

  it("fills an OC slot in a relationship tag", () => {
    const text = `${names(6, "Harry", "Jonah")}\n\nThey were naked in bed. Jonah sucked Harry off.`;
    const a = run(text, meta({ relationships: ["Harry Potter/Original Male Character"], characters: ["Harry Potter", "Original Male Character"] }));
    expect(a.pairings[0].pairing).toBe("Harry Potter/Jonah");
    expect(a.pairings[0].oral.instances[0]).toMatchObject({ top: "Harry Potter", bottom: "Jonah" });
  });

  it("uses a named OC tag as-is", () => {
    const text = `${names(3, "Harry", "Kyle")}\n\nThey were naked in bed. Kyle fucked Harry.`;
    const a = run(text, meta({ relationships: ["Harry Potter/Kyle (Original Character)"] }));
    expect(a.pairings[0].anal.instances[0]).toMatchObject({ top: "Kyle", bottom: "Harry Potter" });
  });

  it("doesn't take a canon character for the OC", () => {
    const text = `${names(8, "Harry", "Ron")} ${names(5, "Harry", "Jonah")}\n\nThey were naked in bed. Jonah fucked Harry.`;
    const a = run(text, meta({ relationships: ["Harry Potter/Original Male Character"], characters: ["Harry Potter", "Ron Weasley"] }));
    expect(a.pairings[0].pairing).toBe("Harry Potter/Jonah");
  });
});

describe("narrator", () => {
  it("takes the narrator from a POV tag", () => {
    const m = meta({ relationships: ["Draco Malfoy/Harry Potter", "Draco Malfoy/Harry Potter/Ron Weasley"], freeforms: ["POV First Person", "POV Ron Weasley"] });
    const text = "I watched Harry kiss Draco. I wanted them both. Draco looked at me and I swallowed.\n\nDraco sank down onto my cock.";
    expect(run(text, m).pairings.find((p) => /Ron/.test(p.pairing))?.anal.instances[0]).toMatchObject({ top: "Ron Weasley", bottom: "Draco Malfoy" });
  });

  it("picks the character named only in dialogue as the narrator", () => {
    const m = meta({ relationships: ["Draco Malfoy/Harry Potter", "Draco Malfoy/Harry Potter/Ron Weasley"] });
    const lines = Array.from({ length: 4 }, () => `"Ron, come here," Harry said. Draco smirked at Harry. I rolled my eyes.`).join(" ");
    const text = `${lines}\n\nDraco sank down onto my cock.`;
    expect(run(text, m).notes).toMatch(/“I” is read as Ron Weasley/);
  });
});

describe("threesome pronouns", () => {
  it("doesn't make either half of 'Harry and I' the bottom", () => {
    const m = meta({ relationships: ["Draco Malfoy/Harry Potter/Ron Weasley"], freeforms: ["POV Ron Weasley"] });
    const text = "I was naked with Harry and Draco. I wanted it. I said so.\n\nDraco moaned between us as Harry and I fucked him.";
    const pairs = run(text, m).pairings;
    const hr = pairs.find((p) => /Harry/.test(p.pairing) && /Ron/.test(p.pairing));
    expect(hr?.anal.instances ?? []).toHaveLength(0);
  });
});

describe("omegaverse holes", () => {
  it("settles an unclear sentence by the bottom's clearly worded scenes", () => {
    const m = meta({ relationships: ["Jacks/Tanner"], freeforms: ["Alpha/Beta/Omega Dynamics"] });
    const text = "Tanner was naked and wet. Jacks touched his seam.\n\nJacks slid into Tanner’s cunt.\n\nJacks patted his ass. Later Jacks pushed into Tanner again.";
    const p = run(text, m).pairings[0];
    expect(p.anal.instances).toHaveLength(0);
    expect(p.vaginal.instances.length).toBe(2);
  });
});
