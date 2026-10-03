import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { type AuditHit, analyzeWithPatterns } from "../src/heuristic";

const M: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Stranger Things (TV 2016)"], relationships: ["Steve Harrington/Eddie Munson"], characters: ["Steve Harrington", "Eddie Munson", "Robin Buckley"], freeforms: ["Fisting", "Double Penetration", "Thigh Fucking"] };
const lead = "Steve and Eddie were in bed, naked and kissing, hard and aching. Steve kissed Eddie. Eddie kissed Steve back, moaning. ".repeat(2) + "\n\n";
const run = (t: string) => { const hits: AuditHit[] = []; const r = analyzeWithPatterns(lead + t, M, { quiet: true, audit: (h) => hits.push(h) }); return { r, p: r.pairings[0], hits }; };
const via = (t: string, id: string) => run(t).hits.filter((h) => h.via.replace(/~elided$/, "") === id);

describe("fisting, double penetration, thigh and chest sex", () => {
  it("fisting counts as an anal act, with the fister on top", () => {
    for (const t of ["Steve worked his whole fist into Eddie’s ass, slowly, until Eddie cried out.", "Steve fisted Eddie, his knuckles pressing past the rim."]) {
      const { p } = run(t);
      expect(p.anal.instances.map((i) => `${i.top}>${i.bottom} ${i.act}`)).toEqual(["Steve Harrington>Eddie Munson fisting"]);
    }
  });
  it("a wish to be fisted is a bottom wish", () => {
    const { p } = run("Eddie wanted Steve to fist him. “Fist me,” Eddie begged.");
    expect(p.anal.desires.some((d) => d.who.startsWith("Eddie") && d.role === "bottom" && d.act === "fisting")).toBe(true);
  });
  it("fists in hair, a clenched fist and a hand between the legs are not fisting", () => {
    expect(via("Steve fisted his hands in Eddie’s hair and kissed him hard.", "fisting-verb")).toHaveLength(0);
    expect(via("Eddie fisted the sheets and groaned.", "fisting-verb")).toHaveLength(0);
    expect(via("Steve slid his hand into his pocket and watched Eddie undress.", "fist-into")).toHaveLength(0);
  });
  it("thigh sex goes on the hands-and-body card, with whose thighs they are", () => {
    for (const t of ["Steve fucked between Eddie’s thighs, his cock sliding in the slick gap.", "Eddie squeezed his thighs tight around Steve’s cock while Steve rutted."]) {
      const m = run(t).p.manual!;
      expect(m.instances.map((i) => `${i.giver} ${i.act}`)).toEqual(["Eddie Munson Thigh sex"]);
    }
    expect(run("Steve slid his hand between Eddie’s thighs and Eddie gasped.").p.manual!.instances).toHaveLength(0);
  });
  it("chest sex is recognized", () => {
    const m = run("Steve straddled Eddie’s chest and thrust his cock between Eddie’s pecs.").p.manual!;
    expect(m.instances.map((i) => i.act)).toEqual(["Chest sex"]);
  });
  it("‘took them both at once’ credits everyone just named as a top over him", () => {
    const { p } = run("Steve’s cock and Robin’s cock pressed at his rim. Eddie took them both at once, gasping.");
    const tops = new Set(p.anal.instances.filter((i) => /double/.test(i.act)).map((i) => i.top.split(" ")[0]));
    expect(tops.has("Steve")).toBe(true);
  });
  it("the tags are checked against the text", () => {
    const c = run("Steve worked his whole fist into Eddie’s ass. Steve fucked between Eddie’s thighs.").r.tagCheck!;
    expect(c.find((x) => x.tag === "Fisting")?.status).toBe("supported");
    expect(c.find((x) => x.tag === "Thigh Fucking")?.status).toBe("supported");
    expect(c.find((x) => x.tag === "Double Penetration")?.status).toBe("not_found");
  });
});
