// Metadata-only checks based on two uploaded AO3 fics. No source prose is included.
import { describe, expect, it } from "vitest";
import { emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";
import { extractFromText } from "../src/extract";

const angel = {
  ...emptyMeta(),
  rating: "Explicit",
  categories: ["M/M"],
  relationships: ["Jason Carver/Eddie Munson"],
  characters: ["Jason Carver", "Eddie Munson"],
  freeforms: ["Alpha/Alpha", "Bottom Jason Carver", "Service Top Eddie Munson", "Dom/sub", "Anal Knotting", "Rimming", "Oral Sex"],
};

const rugby = {
  ...emptyMeta(),
  rating: "Explicit",
  categories: ["M/M"],
  relationships: ["Dunk | Duncan the Tall/Aerion Targaryen (Son of Maekar I)"],
  characters: ["Dunk | Duncan the Tall", "Aerion Targaryen (Son of Maekar I)"],
  freeforms: ["Top Dunk | Duncan the Tall", "Bottom Aerion Targaryen", "Rugby Player Dunk", "Rugby Player Aerion", "Rivals to Lovers", "Phone Sex", "Anal Sex", "Rimming", "Oral Sex"],
};

describe("uploaded-fic metadata guidance", () => {
  it("keeps Alpha/Alpha and service-top/Dom-sub tags separate from anal direction", () => {
    const a = analyzeWithPatterns("Chapter 1\nJason and Eddie held hands.", angel, { quiet: true }).pairings[0];
    expect(a.anal).toMatchObject({ verdict: "one_way", top: "Eddie Munson", bottom: "Jason Carver" });
    expect(a.anal.instances).toHaveLength(0); // Tags guide the fallback; they are not on-page acts.
  });

  it("resolves the rugby AU's canonical pairing and tagged roles without inventing a switch", () => {
    const a = analyzeWithPatterns("Chapter 1\nDunk and Aerion argued after practice.", rugby, { quiet: true }).pairings[0];
    expect(a.pairing).toBe("Dunk | Duncan the Tall/Aerion Targaryen");
    expect(a.anal).toMatchObject({ verdict: "one_way", top: "Dunk | Duncan the Tall", bottom: "Aerion Targaryen" });
    expect(a.anal.instances).toHaveLength(0);
  });

  it("removes AO3 preface and labeled notes before role detection", () => {
    const source = `A sample work\nRating: Explicit\nFandom: Stranger Things (TV 2016)\nRelationships: Jason Carver/Eddie Munson\nCharacters: Jason Carver, Eddie Munson\nAdditional Tags: Bottom Jason Carver, Service Top Eddie Munson\nStats: Words: 100 Chapters: 2/2\n\nSummary\nA summary says Eddie penetrates Jason.\n\nChapter 1\nJason held Eddie's hand.\n\nChapter Notes\nA fantasy describes Jason performing oral sex on Eddie.\nSee the end of the chapter for more notes\n\nEddie fucked Jason in the ass.\n\nChapter End Notes\nA note imagines a second explicit act.\n\nChapter 2\nThey went home.`;
    const work = extractFromText(source);
    const a = analyzeWithPatterns(work.text, work.meta, { quiet: true }).pairings[0];
    expect(work.text).not.toMatch(/summary says|fantasy describes|note imagines/i);
    expect(a.anal.instances.length).toBeGreaterThan(0);
    expect(a.oral.instances).toHaveLength(0);
    expect(a.anal).toMatchObject({ top: "Eddie Munson", bottom: "Jason Carver" });
  });

  it("does not count a fantasy or nightmare as an act", () => {
    const text = `Chapter 4\nJason imagined giving Eddie oral sex.\n\nChapter 6\nJason dreamed Eddie penetrated him during rut.`;
    const a = analyzeWithPatterns(text, angel, { quiet: true }).pairings[0];
    expect(a.anal.instances).toHaveLength(0);
    expect(a.oral.instances).toHaveLength(0);
  });

  it("excludes ambiguous chapter-note passages from pattern evidence", () => {
    const note = "[[AO3_UNCERTAIN_NOTE_START]]Eddie fucked Jason in the ass.[[AO3_UNCERTAIN_NOTE_END]]";
    const text = `Chapter 1\n${note}\n\nJason fucked Eddie in the ass.`;
    const a = analyzeWithPatterns(text, angel, { quiet: true }).pairings[0];
    expect(a.anal.instances).toHaveLength(1);
    expect(a.anal.instances[0].top).toBe("Jason Carver");
    expect(a.anal.instances[0].bottom).toBe("Eddie Munson");
  });
});
