import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";
import { applyCanon, detectFandoms } from "../src/heuristic/canon";
import { buildCast } from "../src/heuristic/characters";

const meta = (over: Partial<Ao3Meta>): Ao3Meta => ({ ...emptyMeta(), rating: "Explicit", categories: ["M/M"], ...over });
const lines = (n: string, k: number, rest = "looked over at the others and smiled") => Array.from({ length: k }, () => `${n} ${rest}.`).join("\n");

describe("which fandoms apply", () => {
  it("goes by the fandom tags", () => {
    const f = detectFandoms(meta({ fandoms: ["Captive Prince - C. S. Pacat"] }));
    expect(f.map((x) => x.id)).toEqual(["captive-prince"]);
  });
  it("matches several fandoms from one tag family", () => {
    expect(detectFandoms(meta({ fandoms: ["A Song of Ice and Fire & Related Fandoms", "House of the Dragon (TV)"] })).map((x) => x.id)).toEqual(["asoiaf"]);
  });
  it("ignores fandoms that aren't listed", () => {
    expect(detectFandoms(meta({ fandoms: ["Some Unlisted Series"], characters: ["Dean", "Sam"] }))).toHaveLength(0);
  });
  it("works out the fandom from two known characters when there are no fandom tags", () => {
    expect(detectFandoms(emptyMeta(), ["Castiel", "Dean"]).map((x) => x.id)).toContain("supernatural");
    // one name isn't enough: "Sam" and "Eddie" each exist in several fandoms
    expect(detectFandoms(emptyMeta(), ["Eddie"])).toHaveLength(0);
  });
});

describe("other names for tagged characters", () => {
  const cases: [string, string[], string, string, string[]][] = [
    ["Marvel Cinematic Universe", ["Wade Wilson", "Peter Parker"], "Wade Wilson", "Deadpool", ["Wade Wilson", "Deadpool"]],
    ["Marvel Cinematic Universe", ["Steve Rogers", "James \"Bucky\" Barnes"], "James \"Bucky\" Barnes", "Winter Soldier", ["Steve Rogers", "Winter Soldier"]],
    ["Harry Potter - J. K. Rowling", ["Harry Potter", "Tom Riddle"], "Tom Riddle", "Voldemort", ["Harry Potter", "Voldemort"]],
    ["Supernatural", ["Castiel", "Dean Winchester"], "Castiel", "Novak", ["Castiel", "Novak"]],
    ["Good Omens - Neil Gaiman & Terry Pratchett", ["Aziraphale", "Crowley"], "Crowley", "Anthony", ["Crowley", "Anthony"]],
    ["The Witcher (TV)", ["Geralt of Rivia", "Jaskier | Dandelion"], "Jaskier | Dandelion", "Julian", ["Geralt of Rivia", "Julian"]],
    ["Star Wars - All Media Types", ["Obi-Wan Kenobi", "Anakin Skywalker"], "Anakin Skywalker", "Vader", ["Obi-Wan Kenobi", "Vader"]],
    ["Our Flag Means Death (TV)", ["Stede Bonnet", "Edward Teach"], "Edward Teach", "Blackbeard", ["Stede Bonnet", "Blackbeard"]],
  ];
  it.each(cases)("%s: %j gets %s", (fandom, chars, who, alias, pair) => {
    const first = chars[0].split(" ")[0];
    const others = pair.filter((p) => p !== alias);
    const body = `${lines(first, 6)}\n${lines(alias, 8, "grinned and said nothing for a while")}\n${others.map((o) => lines(o.split(" ")[0], 3)).join("\n")}`;
    const m = meta({ fandoms: [fandom], characters: chars, relationships: [`${chars[0]}/${chars[1]}`] });
    const cast = buildCast(m, body, body);
    const c = cast.chars.find((x) => x.name === who.replace(/\s*\|.*$/, "") || x.name === who || x.name.startsWith(who.split(" ")[0]));
    expect(c, who).toBeDefined();
    expect(c!.aliases).toContain(alias);
    expect(cast.byAlias.get(alias)).toBe(c);
  });
  it("only adds a name the text actually uses", () => {
    const body = `${lines("Wade", 8)}\n${lines("Peter", 8)}`;
    const cast = buildCast(meta({ fandoms: ["Marvel Cinematic Universe"], characters: ["Wade Wilson", "Peter Parker"], relationships: ["Wade Wilson/Peter Parker"] }), body, body);
    expect(cast.chars.find((c) => c.name === "Wade Wilson")!.aliases).not.toContain("Deadpool");
  });
  it("doesn't add a name that's mostly an ordinary word", () => {
    const body = `${lines("Bobby", 8)}\n${lines("Eddie", 8)}\nCap, said the sailor.\nCap, said the boy.\nHe wore a cap and then a cap again, then took the cap off.\nShe put on her cap. The cap fit.`;
    const cast = buildCast(meta({ fandoms: ["9-1-1 (TV)"], characters: ["Bobby Nash", "Eddie Diaz"], relationships: ["Bobby Nash/Eddie Diaz"] }), body, body);
    expect(cast.chars.find((c) => c.name === "Bobby Nash")!.aliases).not.toContain("Cap");
  });
  it("leaves a name alone in a fandom where it belongs to someone else", () => {
    // 'Falcon' is Sam Wilson's name in the Marvel list; in a Teen Wolf fic nothing should be added.
    const body = `${lines("Derek", 8)}\n${lines("Stiles", 8)}\n${lines("Falcon", 5, "flew over the lake")}`;
    const cast = buildCast(meta({ fandoms: ["Teen Wolf (TV)"], characters: ["Derek Hale", "Stiles Stilinski"], relationships: ["Derek Hale/Stiles Stilinski"] }), body, body);
    expect(cast.chars.flatMap((c) => c.aliases)).not.toContain("Falcon");
  });
  it("keeps two separately tagged versions of a character apart", () => {
    const body = `${lines("Harry", 8)}\n${lines("Tom", 8)}\n${lines("Voldemort", 8)}`;
    const m = meta({ fandoms: ["Harry Potter - J. K. Rowling"], characters: ["Harry Potter", "Tom Riddle", "Voldemort"], relationships: ["Harry Potter/Tom Riddle", "Harry Potter/Voldemort"] });
    const names = buildCast(m, body, body).chars.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(["Tom Riddle", "Voldemort"]));
  });
  it("sets the gender of a known character", () => {
    const body = `${lines("Hermione", 8)}\n${lines("Draco", 8)}`;
    const cast = buildCast(meta({ categories: ["F/M"], fandoms: ["Harry Potter - J. K. Rowling"], characters: ["Hermione Granger", "Draco Malfoy"], relationships: ["Draco Malfoy/Hermione Granger"] }), body, body);
    expect(cast.chars.find((c) => c.name === "Hermione Granger")!.gender).toBe("f");
    expect(cast.chars.find((c) => c.name === "Draco Malfoy")!.gender).toBe("m");
  });
});

describe("without tags", () => {
  it("merges Wade and Deadpool once the fandom is clear from the other names", () => {
    const body = `${lines("Wade", 12)}\n${lines("Deadpool", 9, "laughed and bumped into the wall")}\n${lines("Peter", 12)}\n${lines("Spidey", 6, "swung down from the building")}`;
    const cast = buildCast(emptyMeta(), body, body);
    const wade = cast.chars.filter((c) => c.aliases.includes("Wade"));
    expect(wade).toHaveLength(1);
    expect(wade[0].aliases).toContain("Deadpool");
    expect(cast.chars.filter((c) => c.aliases.includes("Peter"))[0].aliases).toContain("Spidey");
  });
  it("applyCanon reports who it merged away", () => {
    const a = { name: "Damen", aliases: ["Damen"], gender: "u" as const };
    const b = { name: "Damianos", aliases: ["Damianos"], gender: "u" as const };
    const cast = [a, b];
    const gone = applyCanon(cast, detectFandoms(emptyMeta(), ["Damen", "Laurent"]), "Damen. Damianos.", { merge: true });
    expect(gone).toEqual([b]);
    expect(cast).toEqual([a]);
    expect(a.aliases).toEqual(expect.arrayContaining(["Damen", "Damianos"]));
    expect(a.gender).toBe("m");
  });
});

describe("scores from what's said", () => {
  const m = meta({ fandoms: ["Captive Prince - C. S. Pacat"], relationships: ["Damen/Laurent (Captive Prince)"], characters: ["Damen", "Laurent"] });
  const run = (s: string) => analyzeWithPatterns(`Damen and Laurent sat in the penthouse together.\n\n${s}`, m, { quiet: true }).pairings[0];
  const odds = (p: ReturnType<typeof run>, name: string, cat: "anal" | "blowjob" = "anal") => p[cat].people!.find((x) => x.name === name)!;
  it("counts 'fucked open by older men' toward Laurent's bottoming", () => {
    const p = run("Laurent noticed the bathtub, thinking it would be nice to enjoy it for once without being fucked open by older men in it.");
    expect(p.anal.instances).toHaveLength(0);
    expect(p.anal.desires.find((d) => d.kind === "history")).toMatchObject({ who: "Laurent", role: "bottom" });
    expect(odds(p, "Laurent").bottom).toBeGreaterThan(0.2);
    expect(odds(p, "Damen").top).toBeGreaterThan(0.1);
  });
  it("counts 'a really old guy he dated … going down on him' toward Laurent sucking", () => {
    const p = run("Laurent learned that from a really old guy he dated while going down on him at his home office.");
    expect(p.blowjob.desires.find((d) => d.kind === "history")).toMatchObject({ who: "Laurent", role: "bottom" });
    expect(odds(p, "Laurent", "blowjob").bottom).toBeGreaterThan(0.2);
  });
  it("counts 'he'd like to be fucked' and 'offered to fuck' as wanting", () => {
    const a = run("Laurent was very sure he'd like to be fucked by Damen on every surface of the room.");
    expect(a.anal.desires.find((d) => d.kind === "wanted")).toMatchObject({ who: "Laurent", role: "bottom", wants: true });
    expect(odds(a, "Laurent").bottom).toBeGreaterThan(0.2);
    const b = run("Laurent offered to fuck Damen.");
    expect(b.anal.desires.find((d) => d.kind === "wanted")).toMatchObject({ who: "Laurent", role: "top" });
  });
  it("lets statements of wanting outweigh behaviour, but stay below a scene", () => {
    const p = run(
      "Laurent said he'd like to be fucked by Damen. Later he whispered that he wanted Damen to take him. Damen smiled and thought of nothing else. Laurent hoped Damen would fuck him someday.",
    );
    const l = odds(p, "Laurent").bottom;
    expect(l).toBeGreaterThan(0.35);
    expect(l).toBeLessThan(0.75);
  });
});
