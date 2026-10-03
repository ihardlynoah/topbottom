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

describe("the everyday-dynamic axis", () => {
  const ST: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Stranger Things (TV 2016)"], relationships: ["Steve Harrington/Eddie Munson"], characters: ["Steve Harrington", "Eddie Munson"] };
  const sb = (`Steve and Eddie were on the couch, talking. Steve laughed. Eddie smiled back. `).repeat(2) + "\n\n";
  const dyn = (text: string, m: Ao3Meta = ST) => analyzeWithPatterns(sb + text, m, { quiet: true }).pairings[0];
  const rate = (text: string, who: string, m: Ao3Meta = ST) => dyn(text, m).dynamic!.find((d) => d.name.startsWith(who))!;
  const CARE = "Eddie tucked a blanket around Steve and told him to sleep. Eddie stroked Steve’s hair until his breathing evened out. Eddie took Steve’s hand and led him toward the door. Eddie stepped between Steve and Hopper.";
  it("caring, leading and protecting make Eddie lead and Steve follow", () => {
    expect(["Leads", "Leans leading"]).toContain(rate(CARE, "Eddie").label);
    expect(["Follows", "Leans following"]).toContain(rate(CARE, "Steve").label);
  });
  it("those cues are not part of the sexual vibe any more", () => {
    const v = dyn(CARE).vibe!.flatMap((x) => x.factors!).filter((f) => /blanket|stroked|led him|stepped between/.test(f.source ?? ""));
    expect(v.length).toBe(0);
  });
  it("blushing counts only with the other one in the sentence or the one before", () => {
    expect(rate("Steve grinned at Eddie. Eddie blushed.", "Eddie").factors!.some((f) => /flustered/.test(f.what))).toBe(true);
    expect(rate("The weather turned cold. Eddie blushed.", "Eddie").factors!.some((f) => /flustered/.test(f.what))).toBe(false);
  });
  it("a Dom tag puts the character on the leading side before any behaviour", () => {
    const m: Ao3Meta = { ...ST, freeforms: ["Dominant Eddie Munson", "Submissive Steve Harrington"] };
    expect(["Leads", "Leans leading"]).toContain(rate("", "Eddie", m).label);
    expect(["Follows", "Leans following"]).toContain(rate("", "Steve", m).label);
  });
  it("unrelated text leaves the axis unclear", () => {
    expect(rate("The sun set over Hawkins.", "Eddie").label).toBe("Unclear");
  });
});

describe("Dom/Sub tags are checked against everyday behaviour", () => {
  const m = (tags: string[]): Ao3Meta => ({ ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Stranger Things (TV 2016)"], relationships: ["Steve Harrington/Eddie Munson"], characters: ["Steve Harrington", "Eddie Munson"], freeforms: tags });
  const sb = (`Steve and Eddie were on the couch, talking. Steve laughed. Eddie smiled back. `).repeat(2) + "\n\n";
  const CARE = "Eddie tucked a blanket around Steve and told him to sleep. Eddie stroked Steve’s hair until his breathing evened out. Eddie took Steve’s hand and led him toward the door. Eddie stepped between Steve and Hopper. Eddie handed Steve the bag of ice.";
  const chk = (tags: string[], text: string) => analyzeWithPatterns(sb + text, m(tags), { quiet: true }).tagCheck ?? [];
  it("supported when the behaviour agrees", () => {
    const c = chk(["Dominant Eddie Munson", "Submissive Steve Harrington"], CARE);
    expect(c.find((x) => x.tag === "Dominant Eddie Munson")?.status).toBe("supported");
    expect(c.find((x) => x.tag === "Submissive Steve Harrington")?.status).toBe("supported");
  });
  it("contradicted when the behaviour points the other way", () => {
    const c = chk(["Dominant Steve Harrington", "Submissive Eddie Munson"], CARE);
    expect(c.find((x) => x.tag === "Dominant Steve Harrington")?.status).toBe("contradicted");
  });
  it("can’t tell with too little behaviour", () => {
    const c = chk(["Dominant Eddie Munson"], "They watched TV.");
    expect(c.find((x) => x.tag === "Dominant Eddie Munson")?.status).toBe("cant_tell");
  });
  it("a pair-wide Dom/sub tag is supported when one leads and the other follows", () => {
    const c = chk(["Dom/sub"], CARE);
    expect(c.find((x) => x.tag === "Dom/sub")?.status).toBe("supported");
  });
});

describe("point of view", () => {
  const ST: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Stranger Things (TV 2016)"], relationships: ["Steve Harrington/Eddie Munson"], characters: ["Steve Harrington", "Eddie Munson"], freeforms: ["Two POVs"] };
  const intro = (`Steve and Eddie were on the couch, kissing. Steve kissed Eddie. Eddie kissed Steve back, moaning. `).repeat(2);
  const body = "Eddie smiled at him across the room. He wanted to be fucked.";
  const wants = (text: string) => analyzeWithPatterns(text, ST, { quiet: true }).pairings[0].anal.desires.filter((d) => d.kind === "wanted" && d.wants);
  it("in a chapter headed with Steve’s name, ‘He wanted to be fucked’ is Steve wanting to bottom", () => {
    const d = wants(`${intro}\n\nChapter 2: Steve\n\n${body}`);
    expect(d.length).toBeGreaterThan(0);
    expect(d[0].who).toMatch(/Steve/);
    expect(d[0].role).toBe("bottom");
  });
  it("‘Eddie’s POV’ in the heading works the same way for Eddie", () => {
    const d = wants(`${intro}\n\nChapter 3 - Eddie’s POV\n\nSteve smiled at him across the room. He wanted to be fucked.`);
    expect(d[0]?.who).toMatch(/Eddie/);
    expect(d[0]?.role).toBe("bottom");
  });
  it("a name-only line inside a chapter switches the point of view", () => {
    const d = wants(`${intro}\n\nChapter 4\n\nSteve\n\nEddie grinned at him. He wanted to be fucked.\n\nEddie\n\nSteve grinned at him. He wanted to be fucked.`);
    expect(d.map((x) => `${x.who.split(" ")[0]}:${x.role}`)).toEqual(["Steve:bottom", "Eddie:bottom"]);
  });
  it("without any marker the old behaviour stands (the pronoun follows the line before)", () => {
    const d = wants(`${intro}\n\n${body}`);
    expect(d.some((x) => x.who.startsWith("Steve") && x.role === "bottom")).toBe(false);
  });
  it("a chapter that reports one man’s feelings again and again is read as his point of view", () => {
    const feel = Array.from({ length: 8 }, () => "Steve felt his stomach flip. Steve wondered what Eddie thought.").join(" ");
    const d = wants(`${intro}\n\nChapter 5\n\n${feel}\n\nEddie smiled at him across the room. He wanted to be fucked.`);
    expect(d[0]?.who).toMatch(/Steve/);
    expect(d[0]?.role).toBe("bottom");
  });
});

describe("alternating first person, chapters headed with the narrator’s name", () => {
  const ST: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Stranger Things (TV 2016)"], relationships: ["Steve Harrington/Eddie Munson"], characters: ["Steve Harrington", "Eddie Munson"] };
  const ch = (name: string, other: string) => `Chapter ${name === "Steve" ? 1 : 2}: ${name}\n\n` + Array.from({ length: 6 }, () => `I kissed ${other} and I laughed. I put my hand on ${other}’s waist.`).join(" ") + `\n\nI wanted to be fucked.`;
  it("each chapter’s ‘I’ is the man in its heading", () => {
    const a = analyzeWithPatterns(`${ch("Steve", "Eddie")}\n\n${ch("Eddie", "Steve")}`, ST, { quiet: true });
    const d = a.pairings[0].anal.desires.filter((x) => x.kind === "wanted" && x.wants);
    expect(d.map((x) => `${x.who.split(" ")[0]}:${x.role}`).sort()).toEqual(["Eddie:bottom", "Steve:bottom"]);
  });
});

describe("calibration lines in the mistake report", () => {
  it("are printed under their own heading when there are marks, and left out otherwise", async () => {
    const { buildReport } = await import("../src/report");
    const input = { source: "patterns", summaries: [], flags: [], missed: [], general: "" };
    expect(buildReport({ ...input, calibration: ["2 items marked so far (1 right, 1 wrong). Average gap between stated and observed: 40%."] })).toMatch(/## How well the confidence has matched so far\n- 2 items marked/);
    expect(buildReport(input)).not.toMatch(/How well the confidence/);
  });
});

describe("two axes or one combined vibe", () => {
  const ST: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Stranger Things (TV 2016)"], relationships: ["Steve Harrington/Eddie Munson"], characters: ["Steve Harrington", "Eddie Munson"] };
  const sb = (`Steve and Eddie were on the couch, talking. Steve laughed. Eddie smiled back. `).repeat(2) + "\n\n";
  const CARE = "Eddie tucked a blanket around Steve and told him to sleep. Eddie stroked Steve’s hair until his breathing evened out. Eddie took Steve’s hand and led him toward the door. Eddie stepped between Steve and Hopper. Eddie handed Steve the bag of ice.";
  const p = analyzeWithPatterns(sb + CARE, ST, { quiet: true }).pairings[0];
  const eddie = (v: NonNullable<typeof p.vibe>) => v.find((x) => x.name.startsWith("Eddie"))!;
  it("the two-axis vibe leaves everyday behaviour out and the combined vibe takes it in", () => {
    expect(eddie(p.vibe!).factors!.some((f) => /blanket|stroked|led him|stepped between/.test(f.source ?? ""))).toBe(false);
    const comb = eddie(p.vibeCombined!);
    expect(comb.factors!.some((f) => /blanket|stroked|led him|stepped between/.test(f.source ?? "") && f.role === "top")).toBe(true);
    expect(comb.basis.join(" ")).toMatch(/Dominant or submissive behaviour, positions and cuddling/);
  });
  it("the combined vibe is still there when nothing differs, and the dynamic axis is unchanged", () => {
    expect(p.vibeCombined).toHaveLength(2);
    expect(p.dynamic!.find((d) => d.name.startsWith("Eddie"))!.label).toMatch(/Lead/);
  });
});

describe("POV from a line that opens on a main character’s name", () => {
  const ST: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Stranger Things (TV 2016)"], relationships: ["Steve Harrington/Eddie Munson"], characters: ["Steve Harrington", "Eddie Munson"], freeforms: ["Two POVs"] };
  const intro = (`Steve and Eddie were on the couch, kissing. Steve kissed Eddie. Eddie kissed Steve back, moaning. `).repeat(2);
  const who = (text: string) => analyzeWithPatterns(text, ST, { quiet: true }).pairings[0].anal.desires.filter((d) => d.kind === "wanted" && d.wants && d.role === "bottom").map((d) => d.who);
  it("“Eddie, later that night” on its own line sets the point of view", () => {
    expect(who(`${intro}\n\nEddie, later that night\n\nSteve smiled at him across the room. He wanted to be fucked.`).join()).toMatch(/Eddie/);
  });
  it("a full sentence that starts with the name does not", () => {
    expect(who(`${intro}\n\nEddie laughed.\n\nSteve smiled at him across the room. He wanted to be fucked.`).join()).not.toMatch(/Eddie/);
  });
  it("a line in quotation marks does not", () => {
    expect(who(`${intro}\n\n“Eddie, later tonight,” Steve said.\n\nSteve smiled at him across the room. He wanted to be fucked.`).join()).not.toMatch(/Eddie/);
  });
});

describe("POV in an alternating work with dated sections", () => {
  const AP: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Hockey RPF"], relationships: ["Shane Hollander/Ilya Rozanov"], characters: ["Shane Hollander", "Ilya Rozanov"], freeforms: ["POV Alternating"] };
  const intro = (`Shane and Ilya were on the couch, kissing. Shane kissed Ilya. Ilya kissed Shane back, moaning. `).repeat(2);
  const wishes = (text: string, m: Ao3Meta = AP) => analyzeWithPatterns(text, m, { quiet: true }).pairings[0].anal.desires.filter((d) => d.kind === "wanted" && d.wants && d.role === "bottom").map((d) => d.who.split(" ")[0]);
  const sec = (head: string, who: string, other: string) => `${head}\n\n${who} lost the award to ${other}. ${who} felt sick about it. ${who} wondered why it mattered. ${who} noticed the cameras. ${who} hoped nobody saw. ${other} smiled at him across the room. He wanted to be fucked.`;
  it("each dated section is read from the character it opens on", () => {
    expect(wishes(`${intro}\n\n${sec("June 2011– Las Vegas", "Ilya", "Shane")}\n\n${sec("September 2012– Montreal", "Shane", "Ilya")}`)).toEqual(["Ilya", "Shane"]);
  });
  it("without the alternating tag the section opener is not used", () => {
    const m = { ...AP, freeforms: [] };
    expect(wishes(`${intro}\n\n${sec("June 2011– Las Vegas", "Ilya", "Shane")}`, m)).not.toEqual(["Ilya"]);
  });
  it("the camera can switch inside a section when the narration moves to the other one", () => {
    const filler = Array.from({ length: 8 }, (_, i) => `Ilya looked at the ceiling for the ${["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"][i]} time and thought about nothing.`).join("\n\n");
    const switched = "Shane felt restless. Shane wondered what Ilya was doing.\n\nShane watched the door. Shane hoped it would open.\n\nShane noticed the clock. Shane knew he should sleep. Ilya smiled at him across the room. He wanted to be fucked.";
    expect(wishes(`${intro}\n\nJune 2011– Las Vegas\n\n${filler}\n\n${switched}`)).toEqual(["Shane"]);
  });
  it("a chat line that starts with a name is not a point-of-view marker", () => {
    const text = `${intro}\n\nJune 2011– Las Vegas\n\nIlya lost the award. Ilya felt sick. Ilya wondered why.\n\nShane: who is this\n\nIlya smiled at him across the room. He wanted to be fucked.`;
    expect(wishes(text)).toEqual(["Ilya"]);
  });
});

describe("alternating POV in first person", () => {
  it("the section opener rule is not used: the first name in a first-person section is who the narrator talks to", () => {
    const m: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Teen Wolf"], relationships: ["Derek Hale/Stiles Stilinski"], characters: ["Derek Hale", "Stiles Stilinski"], freeforms: ["POV First Person", "POV Alternating"] };
    const text = `Derek and Stiles lay in bed, kissing. Derek kissed Stiles. Stiles kissed Derek back.\n\nJune 2011– Las Vegas\n\nStiles’ face went serious and I felt my stomach flip. Stiles smiled at me. I wanted to be fucked.`;
    const r = analyzeWithPatterns(text, m, { quiet: true });
    expect(r.pairings[0].anal.desires.some((d) => d.who.startsWith("Stiles") && d.role === "bottom" && d.wants)).toBe(false);
  });
});
