import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const meta = (freeforms: string[]): Ao3Meta => ({ ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Supernatural"], relationships: ["Castiel/Dean Winchester"], characters: ["Castiel", "Dean Winchester"], freeforms });
const base = (`Dean and Cas were in bed, naked and kissing. Cas kissed Dean. Dean kissed Cas back, moaning. Cas’s cock was hard and Dean was bare and aching. `).repeat(2);
const SEX = [
  "Cas pushed his cock into Dean’s ass and thrust hard, hitting Dean’s prostate.",
  "Cas fucked Dean slowly, his cock buried deep inside Dean.",
  "Cas pounded into Dean until Dean cried out.",
  "Later Dean took Cas into his mouth and sucked him off, bobbing his head.",
  "Cas’s hand snaked down to wrap around Dean’s length, loosely jerking him as he kissed Dean’s stomach.",
].join(" ");
const check = (tags: string[], text: string) => analyzeWithPatterns(`${base}\n\n${text}`, meta(tags), { quiet: true }).tagCheck ?? [];
const by = (c: ReturnType<typeof check>, tag: string) => c.find((x) => x.tag === tag);

describe("tags vs text", () => {
  it("an act tag is supported when the act is found, with lines to show", () => {
    const c = check(["Anal Sex", "Blow Jobs", "Hand Jobs"], SEX);
    for (const t of ["Anal Sex", "Blow Jobs", "Hand Jobs"]) {
      expect(by(c, t)?.status, t).toBe("supported");
      expect(by(c, t)?.evidence.length, t).toBeGreaterThan(0);
    }
  });
  it("an act tag is not found when the text has none of it", () => {
    const c = check(["Rimming", "Vaginal Sex", "Cunnilingus"], SEX);
    for (const t of ["Rimming", "Vaginal Sex", "Cunnilingus"]) expect(by(c, t)?.status, t).toBe("not_found");
  });
  it("a role tag is supported when the text agrees and contradicted when it points the other way", () => {
    const c = check(["Bottom Dean Winchester", "Top Dean Winchester"], SEX);
    expect(by(c, "Bottom Dean Winchester")?.status).toBe("supported");
    expect(by(c, "Top Dean Winchester")?.status).toBe("contradicted");
  });
  it("a role tag can’t be checked when there is no anal sex in the text", () => {
    const c = check(["Bottom Dean Winchester"], "Cas kissed Dean again and again.");
    expect(by(c, "Bottom Dean Winchester")?.status).toBe("not_found");
  });
  it("a kink tag is supported by sentences near the sex and not found without them", () => {
    const text = SEX + " Cas locked the cock cage on Dean. Dean groaned, naked in the bed, the cock cage tight. Cas tied Dean’s wrists to the bed with rope, and Dean moaned, naked. Cas tied his ankles too, his cock hard.";
    const c = check(["Cock Cage", "Bondage", "Spanking", "Edging"], text);
    expect(by(c, "Cock Cage")?.status).toBe("supported");
    expect(by(c, "Bondage")?.status).toBe("supported");
    expect(by(c, "Spanking")?.status).toBe("not_found");
    expect(by(c, "Edging")?.status).toBe("not_found");
  });
  it("kink words away from any sex don’t count", () => {
    const c = check(["Bondage"], "They walked to the harbour in the rain.\n\nThe harbour master nodded at them.\n\nCas tied the boat to the dock with rope. The rope was old. Dean tied his shoes and the rope again.");
    expect(by(c, "Bondage")?.status).toBe("not_found");
  });
  it("tags that name nothing checkable are left out", () => {
    const c = check(["Slow Burn", "Angst", "Fluff", "Anal Sex"], SEX);
    expect(c.map((x) => x.tag)).toEqual(["Anal Sex"]);
  });
});
