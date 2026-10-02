import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";
import { canonEpithet } from "../src/heuristic/epithets";

const meta = (rel: string): Ao3Meta => ({ ...emptyMeta(), rating: "Explicit", categories: ["M/M"], relationships: [rel] });
const pair = (text: string, rel: string) => analyzeWithPatterns(text, meta(rel), { quiet: true }).pairings[0];

/**
 * Each case: a description, then a scene where the subject of the previous sentence is NOT who the
 * epithet means. The fallback ("the other person") would get it wrong, so passing requires learning.
 */
describe("learned epithets", () => {
  it.each([
    // hair colour
    ["Draco Malfoy/Harry Potter", "Draco's platinum hair gleamed.", "Harry moaned. The platinum-haired man pushed into Harry.", "Draco Malfoy", "Harry Potter"],
    ["Ron Weasley/Harry Potter", "Ron was a redhead.", "Harry moaned. The redhead pushed into Harry.", "Ron Weasley", "Harry Potter"],
    ["Draco Malfoy/Harry Potter", "Harry ran a hand through his messy black hair.", "Harry gasped. The dark-haired man slid into Draco.", "Harry Potter", "Draco Malfoy"],
    // height
    ["Draco Malfoy/Harry Potter", "Harry was taller than Draco.", "Draco moaned. The shorter man pushed into Harry.", "Draco Malfoy", "Harry Potter"],
    ["Steve Rogers/Tony Stark", "Steve towered over Tony.", "Tony groaned. The taller man slid into Tony.", "Steve Rogers", "Tony Stark"],
    // size, including the inferred opposite
    ["Steve Rogers/Tony Stark", "Steve was a big man.", "Steve moaned. The smaller man pushed into Steve.", "Tony Stark", "Steve Rogers"],
    ["Steve Rogers/Tony Stark", "Tony was smaller than Steve.", "Tony gasped. The bigger man slid into Tony.", "Steve Rogers", "Tony Stark"],
    // age
    ["Draco Malfoy/Harry Potter", "Draco was two years older than Harry.", "Draco moaned. The older man slid into Harry.", "Draco Malfoy", "Harry Potter"],
    ["Steve Rogers/Bucky Barnes", "Steve was thirty-five years old.", "Steve sighed. The thirty-five-year-old slid into Bucky.", "Steve Rogers", "Bucky Barnes"],
    // nationality
    ["Steve Rogers/Bucky Barnes", "Bucky was from Russia, originally.", "Bucky moaned. The Russian pushed into Steve.", "Bucky Barnes", "Steve Rogers"],
    ["Steve Rogers/Bucky Barnes", "Steve's American accent thickened.", "Steve moaned. The American slid into Bucky.", "Steve Rogers", "Bucky Barnes"],
    ["Draco Malfoy/Harry Potter", "Harry was British, after all.", "Harry gasped. The Brit slid into Draco.", "Harry Potter", "Draco Malfoy"],
    ["Ed Crane/Luc Martin", "Luc was French.", "Luc gasped. The Frenchman pushed into Ed.", "Luc Martin", "Ed Crane"],
    // appositive
    ["Draco Malfoy/Harry Potter", "Draco, the blond, smirked at everyone.", "Draco moaned. The blond slid into Harry.", "Draco Malfoy", "Harry Potter"],
    // stacked descriptors
    ["Steve Rogers/Bucky Barnes", "Steve was taller than Bucky. Steve's American accent was strong.", "Steve groaned. The tall American soldier slid into Bucky.", "Steve Rogers", "Bucky Barnes"],
  ])("%s: %s", (rel, desc, scene, top, bottom) => {
    const text = `${desc}\n\nThey were naked in bed, hard and aching. ${scene}`;
    expect(pair(text, rel).anal.instances[0]).toMatchObject({ top, bottom });
  });
});

describe("canonEpithet", () => {
  it.each([
    ["the blond", ["hair:blond"], "any"],
    ["The blonde woman", ["hair:blond"], "f"],
    ["the taller of the two men", ["cmp:taller"], "any"],
    ["the tall American soldier", ["nat:american", "cmp:taller"], "any"],
    ["the Frenchman's", ["nat:french"], "m"],
    ["the thirty-year-old", ["age:thirty"], "any"],
    ["the human", ["noun:human"], "any"],
    ["the other man", [], "m"],
  ] as const)("%s", (tok, keys, gender) => {
    const c = canonEpithet(tok);
    expect(c.keys).toEqual(keys);
    expect(c.gender).toBe(gender);
  });
});
