import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const meta = (freeforms: string[], categories = ["M/M"]): Ao3Meta => ({ ...emptyMeta(), rating: "Explicit", categories, fandoms: ["Original Work"], relationships: ["Marcus/Teo"], characters: ["Marcus", "Teo"], freeforms });
const base = ("Marcus watched Teo kneel. Teo looked up at Marcus. Marcus smiled at Teo. ").repeat(3) + "\n\n";
const run = (s: string, tags: string[], cats?: string[]) => analyzeWithPatterns(base + s, meta(tags, cats), { quiet: true }).pairings[0];

describe("a man's penis called his clit, in dom/sub fics", () => {
  const dom = ["Master/Slave", "Humiliation", "gender words just go anywhere in this fic"];
  it("sucking Teo's clit is a blowjob", () => {
    const p = run("Marcus pulled Teo’s clit into his mouth and sucked it, tongue working the head.", dom);
    expect(p.blowjob.instances.some((i) => i.top === "Teo" && i.bottom === "Marcus")).toBe(true);
  });
  it("“his clit” being fucked into a mouth is the same", () => {
    const p = run("Teo knelt and Marcus fed his clit between Teo’s lips, thrusting into his mouth.", dom);
    expect(p.blowjob.instances.some((i) => i.top === "Marcus" && i.bottom === "Teo")).toBe(true);
  });
  it("without a dom/sub tag, clit stays a clit", () => {
    const p = run("Marcus pulled Teo’s clit into his mouth and sucked it.", ["Fluff"]);
    expect(p.blowjob.instances).toHaveLength(0);
  });
  it("with a trans or intersex tag, clit stays a clit", () => {
    const p = run("Marcus pulled Teo’s clit into his mouth and sucked it.", [...dom, "Trans Teo"]);
    expect(p.blowjob.instances).toHaveLength(0);
  });
  it("in a work that also has women, clit stays a clit", () => {
    const p = run("Marcus pulled Teo’s clit into his mouth and sucked it.", dom, ["M/M", "F/M"]);
    expect(p.blowjob.instances).toHaveLength(0);
  });
});
