import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";
import { escapeMarker, UNCERTAIN_NOTE_END, UNCERTAIN_NOTE_START } from "../src/text";

const meta: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["F/F"], fandoms: ["Avatar: Legend of Korra"], relationships: ["Korra/Asami Sato"], characters: ["Korra", "Asami Sato"] };

describe("unclear author-note markers", () => {
  const note = `${UNCERTAIN_NOTE_START}\nThanks for the kudos! Korra and Asami moaned and trembled in my dreams, orgasm orgasm sweat.\n${UNCERTAIN_NOTE_END}`;
  const filler = Array.from({ length: 10 }, (_, i) => `Korra grinned at Asami across the garage, number ${i}.`).join("\n");
  const vague = "Asami arched off the bed, pleasure flaring, a small moan slipping out, sweat on her skin, the sheets twisted in her fists as the orgasm broke.";
  it("escapes the brackets so the marker can be matched", () => {
    expect(new RegExp(escapeMarker(UNCERTAIN_NOTE_START)).test(UNCERTAIN_NOTE_START)).toBe(true);
    expect(UNCERTAIN_NOTE_START.replace(new RegExp(escapeMarker(UNCERTAIN_NOTE_START)), "")).toBe("");
  });
  it("leaves the note out and never shows a marker in the results", () => {
    const a = analyzeWithPatterns(`${filler}\n\n${note}\n\n${vague}`, meta, { quiet: true });
    const json = JSON.stringify(a);
    expect(json).not.toMatch(/AO3_/);
    expect(json).not.toMatch(/Thanks for the kudos/);
    expect(String(a.notes)).toMatch(/excluded from pattern analysis/);
  });
});
