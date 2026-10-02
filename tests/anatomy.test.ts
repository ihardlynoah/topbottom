import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { buildCast } from "../src/heuristic/characters";

const base: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Supernatural"], relationships: ["Castiel/Dean Winchester"], characters: ["Castiel", "Dean Winchester"] };
const text = Array.from({ length: 8 }, () => "Dean kissed Cas. Cas kissed Dean back.").join("\n");
const dean = (m: Ao3Meta) => buildCast(m, text).chars.find((c) => c.name.startsWith("Dean"))!;

describe("anatomy from tags", () => {
  it("gives a man a vagina when a tag names him an omega", () => {
    expect(dean({ ...base, freeforms: ["Omega Dean Winchester"] }).vulva).toBe(true);
  });
  it("gives a man a vagina when a tag names him trans", () => {
    expect(dean({ ...base, freeforms: ["Trans Dean Winchester"] }).vulva).toBe(true);
  });
  it("only makes men's anatomy uncertain for a general omegaverse tag", () => {
    expect(dean({ ...base, freeforms: ["Alpha/Beta/Omega Dynamics"] }).vulva).toBe("maybe");
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
