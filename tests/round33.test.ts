import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const meta: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Dracula (TV 2020)"], relationships: ["Dracula/Jack Seward"], characters: ["Dracula", "Jack Seward"] };
const base = ("Dracula and Jack were in bed, naked and kissing. The count kissed Jack. Jack kissed the count back, breathless. The count, Dracula, smiled. ").repeat(3) + "Jack's hole clenched and his cock was hard. ";
const run = (s: string) => analyzeWithPatterns(base + s, meta, { quiet: true }).pairings[0];
const all = (s: string) => { const p = run(s); return [...p.anal.desires ?? [], ...p.blowjob.desires ?? []]; };
const jack = (s: string) => run(s).vibe!.find((v) => /Jack/.test(v.name))!;

describe("finger sucking, dry humping, urges", () => {
  it("fingers stroked in and out of a mouth hint that the mouth's owner bottoms", () => {
    const d = all("The count stroked his fingers in and out of Jack's mouth as Jack sucked on them.");
    expect(d.some((x) => /Jack/.test(String(x.who)) && x.role === "bottom")).toBe(true);
  });
  it("fingers merely over a cheek do nothing", () => expect(all("The count stroked his fingers over Jack's cheek.").length).toBe(0));
  it("rutting against the line of an ass is a top touch hint", () => {
    const d = all("His cock rutted against the line of Jack's ass.");
    expect(d.some((x) => /Dracula/.test(String(x.who)) && x.role === "top")).toBe(true);
  });
  it("grinding on a wall is nothing", () => expect(all("The count ground his hips against the wall.").length).toBe(0));
  for (const l of [
    "Jack felt the urge to sink down onto the count's cock.",
    "Jack was tempted to ride the count's cock.",
    "The count's cock stood hard against his belly. Jack had the urge to sink down onto it.",
  ]) it(`desire, not an act: ${l}`, () => {
    const p = run(l);
    expect(p.anal.instances.length).toBe(0);
    expect(all(l).some((x) => /Jack/.test(String(x.who)) && x.role === "bottom")).toBe(true);
    expect(jack(l).label).not.toMatch(/top/i);
  });
  for (const l of ["Jack saw the horse and wanted to ride it.", "The chair was empty. Jack sank down onto it with a sigh.", "Jack had the urge to sink down onto the couch and sleep."])
    it(`no hit: ${l}`, () => expect(run(l).anal.instances.length + all(l).length).toBe(0));
});
