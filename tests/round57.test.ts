import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { type AuditHit, analyzeWithPatterns } from "../src/heuristic";

const M: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Original Work"], relationships: ["Dean Winchester/Castiel"], characters: ["Dean Winchester", "Castiel"] };
const neutral = "Dean and Castiel were on the couch, talking about the show. Dean laughed. Castiel smiled back. ".repeat(2) + "\n\n";
const hintsOf = (t: string) => { const hits: AuditHit[] = []; analyzeWithPatterns(neutral + t, M, { quiet: true, audit: (h) => hits.push(h) }); return hits.filter((h) => h.para >= 1); };

describe("fixes from the second Ethan/Hank report", () => {
  it("‘the text that X had sent … it made him flush’: the one who flushes is the one who got the text", () => {
    const a = hintsOf("Dean read the text on his phone. The text that Castiel had sent was no different from the others he’d gotten, but it made him flush, anyway.").filter((h) => h.via.startsWith("flustered-verb"));
    expect(a.map((h) => h.a.split(" ")[0])).toEqual(["Dean"]);
    const b = hintsOf("Castiel read the text on his phone. The text that Dean had sent was no different from the others he’d gotten, but it made him flush, anyway.").filter((h) => h.via.startsWith("flustered-verb"));
    expect(b.map((h) => h.a.split(" ")[0])).toEqual(["Castiel"]);
  });
  it("cuddling up while they pick something to watch is company, not aftercare", () => {
    expect(hintsOf("Dean flopped onto the bed. “Good, ’cause I’m gonna keep doing it.” He yanked Castiel higher up, cuddling up against Castiel’s chest as he reached for the iPad. “You wanna watch another episode of that terrible show while we fall asleep?”").filter((h) => h.via.startsWith("aftercare-"))).toHaveLength(0);
    expect(hintsOf("Dean came with a shout, then curled against Castiel’s chest, breathing hard.").some((h) => h.via.startsWith("aftercare-"))).toBe(true);
  });
});
