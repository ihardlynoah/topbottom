import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { type AuditHit, analyzeWithPatterns } from "../src/heuristic";

const M = (pov?: string): Ao3Meta => ({ ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Original Work"], relationships: ["Dean Winchester/Castiel"], characters: ["Dean Winchester", "Castiel"], freeforms: pov ? [`${pov} POV`] : [] });
const lead = "Dean and Castiel were in bed, naked and kissing, hard and aching. Dean kissed Castiel. Castiel kissed Dean back, moaning. ".repeat(2) + "\n\n";
const run = (t: string, pov?: string) => { const hits: AuditHit[] = []; const r = analyzeWithPatterns(lead + t, M(pov), { quiet: true, audit: (h) => hits.push(h) }); return { p: r.pairings[0], hits: hits.filter((h) => h.para >= 1) }; };
const des = (t: string, pov?: string) => run(t, pov).p.anal.desires.map((d) => `${d.who.split(" ")[0]}:${d.role}${d.wants ? "" : "(NOT)"}:${d.kind}`);

describe("fixes from the à la carte report", () => {
  it("in Castiel's point of view, ‘Dean can just fuck him here’ is Castiel imagining being fucked", () => {
    expect(des("Maybe Dean can just fuck him here.", "Castiel")).toEqual(["Castiel:bottom:hypothetical"]);
    expect(des("Plus, it would be super hot if Dean fucked him hard enough to break something.", "Castiel")).toEqual(["Castiel:bottom:hypothetical"]);
  });
  it("…but when Dean is said to want it, it is Dean's wish", () => {
    expect(des("Maybe Dean just wants to fuck him through the weekend.", "Castiel")).toContain("Dean:top:wanted");
  });
  it("‘wanting nothing more than … being fucked stupid by this man’ is a wish, not a past with others", () => {
    const d = des("Castiel is only vaguely aware of the sounds, wanting nothing more than to spend the rest of his life here in this bed, being fucked stupid by this man.", "Castiel");
    expect(d).not.toContain("Castiel:bottom:history");
    expect(d.some((x) => x.startsWith("Castiel:bottom"))).toBe(true);
  });
  it("‘like he’s never been fucked before, which is absurdly untrue’ is not a denial", () => {
    expect(des("He’s panting into the mattress like he’s never been fucked before, which is absurdly untrue, but Dean’s finger fucking into him is like nothing he’s ever felt.", "Castiel").filter((x) => x.includes("(NOT)"))).toHaveLength(0);
  });
  it("‘X was sure he’d meant to feed him and fuck him’: the he is the other one", () => {
    expect(des("Castiel was actually pretty sure he’d meant to feed him and fuck him, but not necessarily in that order.")).toContain("Castiel:bottom:hypothetical");
  });
  it("‘demanding to be fucked’ and ‘Dean can fuck him after work’ are not scenes", () => {
    expect(run("Castiel shows incredible restraint by not following him in, stamping his feet and demanding to be fucked.", "Castiel").p.anal.instances.filter((i) => i.act !== "fingering")).toHaveLength(0);
    expect(run("Yeah Dean can fuck him after work, but it doesn’t feel worth the effort.", "Castiel").p.anal.instances.filter((i) => i.act !== "fingering")).toHaveLength(0);
  });
  it("coffee, ‘trying to fuck me’, kneeling beside someone, and sucking a tongue are not sex", () => {
    expect(run("“I made us some coffee if you want. How do you take it?” Dean said, his cock hard against his thigh.").hits.filter((h) => h.via.startsWith("dialogue:"))).toHaveLength(0);
    expect(run("“You were both trying to fuck me, but you find true love with each other.” Castiel laughed, his cock hard.").hits.filter((h) => h.via === "dialogue:anal sex")).toHaveLength(0);
    expect(run("Dean drops to his knees beside him, and then Dean is kissing him ferociously, one hand buried in his hair.").hits.filter((h) => h.via.startsWith("sinks-to-floor"))).toHaveLength(0);
    expect(run("The need for Dean burns through his veins, and he sucks on Dean’s tongue mindlessly.").p.blowjob.instances).toHaveLength(0);
    expect(run("Dean dropped to his knees and looked up at Castiel through his lashes. Castiel groaned, his cock hard.").hits.some((h) => h.via.startsWith("sinks-to-floor"))).toBe(true);
  });
});
