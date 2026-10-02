import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const meta: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Stranger Things (TV 2016)"], relationships: ["Steve Harrington/Eddie Munson"], characters: ["Steve Harrington", "Eddie Munson", "Will Byers", "Wayne Munson"] };
const filler = Array.from({ length: 12 }, (_, i) => `Eddie grinned at Steve across the trailer, number ${i}. Wayne waved. Will drew a dragon.`).join("\n");

describe("pairs nobody tagged", () => {
  it("doesn't invent a second couple from a couple of pronoun-only readings", () => {
    const t = `${filler}\n\nSteve and Eddie were in bed, naked. Will watched TV in the next room. He clenches around Eddie as he fucks into him.`;
    const a = analyzeWithPatterns(t, meta, { quiet: true });
    expect(a.pairings.map((p) => p.pairing).every((n) => /Steve/.test(n) && /Eddie/.test(n))).toBe(true);
  });
});
