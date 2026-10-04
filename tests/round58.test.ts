import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { type AuditHit, analyzeWithPatterns } from "../src/heuristic";

const M: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Original Work"], relationships: ["Dean Winchester/Castiel"], characters: ["Dean Winchester", "Castiel"] };
const sexy = "Dean and Castiel were in bed, naked and kissing, hard and aching. Dean kissed Castiel. Castiel kissed Dean back, moaning. ".repeat(2) + "\n\n";
const neutral = "Dean and Castiel were on the couch, talking about the show. Dean laughed. Castiel smiled back. ".repeat(2) + "\n\n";
const hints = (lead: string, t: string) => { const hits: AuditHit[] = []; analyzeWithPatterns(lead + t, M, { quiet: true, audit: (h) => hits.push(h) }); return hits.filter((h) => h.para >= 1 && h.via.startsWith("arch-")); };

describe("arching a back or an ass hints at bottoming", () => {
  it("is a bottom hint for the one arching", () => {
    for (const t of ["Castiel arched his back, pushing his ass up toward Dean.", "Castiel’s back arched off the mattress as Dean spread him open.", "Castiel arched his hips back, offering himself to Dean."]) {
      const h = hints(sexy, t);
      expect(h.length, t).toBeGreaterThan(0);
      expect(h.every((x) => x.a.startsWith("Castiel")), t).toBe(true);
    }
  });
  it("is nothing in an ordinary scene, and not offered when it is pleasure from a mouth or a hand", () => {
    expect(hints(neutral, "Dean arched his back and stretched after the long drive."), "ordinary").toHaveLength(0);
    expect(hints(sexy, "Dean sucked Castiel’s cock slowly, and Castiel arched his back off the bed."), "oral").toHaveLength(0);
  });
});
