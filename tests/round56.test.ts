import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { type AuditHit, analyzeWithPatterns } from "../src/heuristic";

const M: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Original Work"], relationships: ["Dean Winchester/Castiel"], characters: ["Dean Winchester", "Castiel"] };
const lead = "Dean and Castiel were in bed, naked and kissing, hard and aching. Dean kissed Castiel. Castiel kissed Dean back, moaning. ".repeat(2) + "\n\n";
const run = (t: string) => { const hits: AuditHit[] = []; const r = analyzeWithPatterns(lead + t, M, { quiet: true, audit: (h) => hits.push(h) }); return { p: r.pairings[0], hits: hits.filter((h) => h.para >= 1) }; };
const blow = (t: string) => run(t).p.blowjob.instances.map((i) => `${i.top.split(" ")[0]}>${i.bottom.split(" ")[0]}`);

describe("fixes from the Ethan/Hank report", () => {
  it("‘the moment Dean got his mouth on his cock’: Dean is the one sucking", () => {
    expect(blow("Castiel gasped the moment Dean got his mouth on his cock.")).toEqual(["Castiel>Dean"]);
    expect(blow("Castiel’s breath came faster almost the moment Dean finally got his mouth on his cock.")).toEqual(["Castiel>Dean"]);
    expect(blow("Dean got his mouth on his cock.")).toEqual(["Castiel>Dean"]);
  });
  it("‘if only Dean could find the courage, buried deep inside him’ is Dean's wish to top", () => {
    const { p } = run("Castiel close enough to touch, if only Dean could find the courage, buried deep inside him.");
    expect(p.anal.desires.some((d) => d.who.startsWith("Dean") && d.role === "top")).toBe(true);
    expect(p.anal.desires.some((d) => d.who === "Castiel" && d.role === "top")).toBe(false);
  });
  it("‘get himself off the couch’ is standing up, not masturbating; ‘got himself off’ still is", () => {
    expect(run("Dean’s knees were unsteady jelly, but he managed to get himself off the couch, and tug Castiel up, too.").hits.filter((h) => h.via.startsWith("mast-"))).toHaveLength(0);
    expect(run("Dean got himself off with a groan, thinking of Castiel.").hits.some((h) => h.via.startsWith("mast-"))).toBe(true);
  });
  it("tugging someone gently where you want them is a pull; tugging him off is a handjob", () => {
    expect(run("His hand tightened in Castiel’s hair and he tugged him gently to where he wanted him.").hits.filter((h) => h.via.startsWith("hj-"))).toHaveLength(0);
    expect(run("Dean tugged him off slowly, his thumb circling the head.").hits.some((h) => h.via.startsWith("hj-"))).toBe(true);
  });
});
