import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

// First-person threesome: the narrator (Scott) tops Stiles while Derek takes the narrator.
const M: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Teen Wolf"], relationships: ["Scott McCall/Stiles Stilinski", "Derek Hale/Scott McCall", "Derek Hale/Stiles Stilinski"], characters: ["Scott McCall", "Derek Hale", "Stiles Stilinski"], freeforms: ["POV Scott McCall"] };
const lead = "I lay on the bed with Derek and Stiles, kissing. Derek kissed me. Stiles kissed me back, moaning, naked and hard. I wanted them both. I said so, and I smiled. ".repeat(2);
const run = (text: string) => analyzeWithPatterns(`${lead}\n\n${text}`, M, { quiet: true });
const scenes = (r: ReturnType<typeof run>) => r.pairings.flatMap((p) => p.anal.instances.map((i) => `${i.top.split(" ")[0]}>${i.bottom.split(" ")[0]}`));

describe("a third person moving someone else’s cock, and role locking in a threesome", () => {
  it("‘Derek fucked my cock into Stiles’ is the narrator topping Stiles", () => {
    const r = run("Scott lined his cock up with Stiles’ hole and slid in.\n\nStiles moaned, squeezing and milking me as Derek fucked my cock into Stiles.");
    expect(scenes(r)).not.toContain("Derek>Stiles");
    expect(scenes(r)).toContain("Scott>Stiles");
  });
  it("a pronoun-only line that has Stiles penetrating the man inside him is read as the third person’s", () => {
    const text = "I lined my dick up with Stiles’ hole and slid in, pushing my cock deep into Stiles.\n\nOnce I was back from the brink, Derek held his hips tighter to mine. He stayed buried in me to the hilt.\n\nHis dick barely moved inside me at all, thrusting into me.";
    const r = run(text);
    expect(scenes(r)).not.toContain("Stiles>Scott");
  });
  it("a real flip between two people, with no third person, is left alone", () => {
    const m2: Ao3Meta = { ...M, relationships: ["Scott McCall/Stiles Stilinski"], characters: ["Scott McCall", "Stiles Stilinski"] };
    const text = "Scott pushed his cock into Stiles’ ass and thrust hard. Scott fucked Stiles slowly.\n\nThen Stiles flipped him onto his back. He pushed into him and thrust deep. He fucked him hard.";
    const r = analyzeWithPatterns(`${lead}\n\n${text}`, m2, { quiet: true });
    expect(r.pairings[0].anal.verdict).toBe("switch");
  });
});
