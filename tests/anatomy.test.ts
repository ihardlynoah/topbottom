import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { buildCast } from "../src/heuristic/characters";

const base: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Supernatural"], relationships: ["Castiel/Dean Winchester"], characters: ["Castiel", "Dean Winchester"] };
const text = Array.from({ length: 8 }, () => "Dean kissed Cas. Cas kissed Dean back.").join("\n");
const dean = (m: Ao3Meta) => buildCast(m, text).chars.find((c) => c.name.startsWith("Dean"))!;

describe("anatomy from tags", () => {
  it("does NOT give a man a vagina just because a tag names him an omega", () => {
    expect(dean({ ...base, freeforms: ["Omega Dean Winchester"] }).vulva).toBe(false);
    expect(dean({ ...base, freeforms: ["Alpha/Beta/Omega Dynamics", "Omega Dean Winchester", "Male Pregnancy"] }).vulva).toBe(false);
  });
  it("gives an omega a vagina when an intersex / vagina tag goes with it", () => {
    expect(dean({ ...base, freeforms: ["Omega Dean Winchester", "Intersex Omega"] }).vulva).toBe(true);
    expect(dean({ ...base, freeforms: ["Omega Dean Winchester", "Omegas Have Vaginas"] }).vulva).toBe(true);
  });
  it("gives a named man a vagina when a tag says he has one", () => {
    expect(dean({ ...base, freeforms: ["Dean Winchester Has A Vagina"] }).vulva).toBe(true);
    expect(dean({ ...base, freeforms: ["Intersex Dean Winchester"] }).vulva).toBe(true);
  });
  it("gives a man a vagina when a tag names him trans", () => {
    expect(dean({ ...base, freeforms: ["Trans Dean Winchester"] }).vulva).toBe(true);
  });
  it("only makes men's anatomy uncertain for a general vagina tag with no names or omegas", () => {
    expect(dean({ ...base, freeforms: ["Intersex Characters"] }).vulva).toBe("maybe");
  });
  it("leaves men male by default", () => {
    expect(dean(base).vulva).toBe(false);
  });
  it("gives a woman a penis when a tag says so", () => {
    const f: Ao3Meta = { ...base, categories: ["F/F"], relationships: ["Korra/Asami Sato"], characters: ["Korra", "Asami Sato"], fandoms: ["Avatar: Legend of Korra"], freeforms: ["Futanari Korra"] };
    const korra = buildCast(f, "Korra kissed Asami. Asami kissed Korra back.\n".repeat(8)).chars.find((c) => c.name === "Korra")!;
    expect(korra.penis).toBe(true);
  });
});
