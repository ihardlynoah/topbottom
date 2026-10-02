import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const mm: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Supernatural"], relationships: ["Castiel/Dean Winchester"], characters: ["Castiel", "Dean Winchester"] };
const filler = Array.from({ length: 12 }, (_, i) => `Cas looked at Dean across the garage, number ${i}.`).join("\n");
const SET = "Dean and Cas were in bed, naked and kissing. Cas kissed Dean. Dean kissed Cas back, breathless.";
const run = (s: string, m: Ao3Meta = mm) => analyzeWithPatterns(`${filler}\n\n${SET}\n\n${s}`, m, { quiet: true }).pairings[0];

describe("toys: whoever is penetrated is the bottom", () => {
  const cases: [string, RegExp, RegExp][] = [
    ["Cas pushed the dildo into Dean slowly.", /Castiel/, /Dean/],
    ["Cas slid a vibrator inside Dean and turned it on.", /Castiel/, /Dean/],
    ["Dean worked a plug into Cas, then eased it out.", /Dean/, /Castiel/],
    ["Cas fucked Dean with the strap-on.", /Castiel/, /Dean/],
    ["Cas fucked the toy into Dean, deeper and deeper.", /Castiel/, /Dean/],
  ];
  for (const [line, top, bottom] of cases) {
    it(`reads “${line}”`, () => {
      const i = run(line).anal.instances[0];
      expect(i.top).toMatch(top);
      expect(i.bottom).toMatch(bottom);
    });
  }
  it("takes wearing a plug as a bottom hint and strapping on as a top hint", () => {
    expect(run("Dean was wearing a plug, and Cas teased the base of it.").anal.desires.some((d) => /Dean/.test(d.who) && d.role === "bottom")).toBe(true);
    expect(run("Cas strapped on the harness and grinned at Dean.").anal.desires.some((d) => /Castiel/.test(d.who) && d.role === "top")).toBe(true);
  });
  it("doesn't call putting a plug into someone a solo scene for the one doing it", () => {
    expect(run("Dean worked a plug into Cas, then eased it out.").anal.desires.some((d) => d.kind === "solo")).toBe(false);
  });
  it("counts a toy used on a woman by a woman as vaginal", () => {
    const ff: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["F/F"], fandoms: ["Wicked"], relationships: ["Elphaba Thropp/Glinda"], characters: ["Elphaba Thropp", "Glinda"] };
    const t = `${filler.replace(/Cas/g, "Elphaba").replace(/Dean/g, "Glinda")}\n\nGlinda and Elphaba were in bed, naked and kissing. Elphaba slid the dildo inside Glinda, slow and deep.`;
    const p = analyzeWithPatterns(t, ff, { quiet: true }).pairings[0];
    expect(p.vaginal.instances.length).toBeGreaterThan(0);
  });
});

describe("tagged both top and bottom", () => {
  it("means versatile with the partner, never sex with themselves", () => {
    const m: Ao3Meta = { ...mm, freeforms: ["Top Castiel", "Bottom Castiel"] };
    const a = analyzeWithPatterns(`${filler}\n\n${SET}`, m, { quiet: true }).pairings[0].anal;
    expect(a.verdict).toBe("switch");
    expect(a.top).not.toBe(a.bottom);
  });
});

describe("two tags for the same person", () => {
  it("makes one character of 'Galinda Upland' beside 'Glinda the Good' when the text only says Glinda", () => {
    const m: Ao3Meta = {
      ...emptyMeta(), rating: "Explicit", categories: ["F/F"], fandoms: ["Wicked (Movie 2024)"],
      relationships: ["Elphaba Thropp/Galinda Upland", "Glinda the Good/Wicked Witch of the West"],
      characters: ["Glinda the Good", "Galinda Upland", "Elphaba Thropp"],
    };
    const t = Array.from({ length: 40 }, () => "Glinda smiled at Elphaba. Elphaba rolled her eyes at Glinda.").join("\n") + "\n\nOnce, someone called her Galinda.";
    const a = analyzeWithPatterns(t, m, { quiet: true });
    expect(a.pairings.length).toBe(1);
  });
});
