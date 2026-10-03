import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const mk = (chars: string[], fandom: string): Ao3Meta => ({ ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: [fandom], relationships: [chars.join("/")], characters: chars });
const baseOf = (a: string, b: string) => (`${a} and ${b} were in bed, naked and kissing. ${a} kissed ${b}. ${b} kissed ${a} back, moaning. ${a}’s cock was hard and ${b} was bare and aching. `).repeat(3) + "\n";
const SW = mk(["Obi-Wan Kenobi", "Anakin Skywalker"], "Star Wars");
const SPN = mk(["Castiel", "Dean Winchester"], "Supernatural");
// A sentence is "hit" when the engine records it as an act or a hint (found via the vibe factors, which quote their source text).
const hits = (m: Ao3Meta, base: string, line: string) => {
  const p = analyzeWithPatterns(base + line, m, { quiet: true }).pairings[0];
  const key = line.slice(0, 30);
  const f = p.vibe!.flatMap((v) => v.factors!).filter((x) => (x.source ?? "").includes(key));
  const inst = [...p.anal.instances, ...p.blowjob.instances, ...p.rimming.instances].filter((i) => i.evidence.includes(key));
  return { f, inst, p };
};
const obi = baseOf("Obi-Wan", "Anakin");
const cas = baseOf("Cas", "Dean");

describe("à la carte sweep: less common phrasings are found", () => {
  for (const l of [
    "Everything fades away but the gleam of his eyes and his enormous cock spearing Anakin open.",
    "Obi-Wan’s cock was buried deep within Anakin, driving into him relentlessly.",
    "Obi-Wan growls and thrusts harder, every stroke brushing against Anakin’s prostate perfectly.",
    "Obi-Wan drives the fingers into Anakin, who clutches at the car and wails.",
    "Anakin meets the thrusts of Obi-Wan’s fingers as Obi-Wan scissors him open.",
    "Obi-Wan brings two slick fingers to Anakin’s hole, tracing around the rim.",
    "Anakin drops his forehead to the car and takes it, his hole clenching around Obi-Wan.",
    "Anakin mouths teasingly at the head of Obi-Wan’s cock.",
    "Anakin sighs for the satisfying weight of Obi-Wan’s cock on his tongue.",
  ]) it(l, () => expect(hits(SW, obi, l).f.some((x) => x.tier <= 3 || /anal|fingering|blowjob|rimming/.test(x.what)) || hits(SW, obi, l).inst.length > 0).toBe(true));
  it("“tries thrusting back” is a bottom hint", () => {
    expect(hits(SW, obi, "Anakin moans into the covers and tries thrusting back.").f.some((x) => x.role === "bottom" && !x.fromOther)).toBe(true);
  });
  it("“the tongue probing into him” is rimming", () => {
    expect(hits(SW, obi, "It feels almost unbearably good, the hand on his cock and the tongue probing into Anakin.").inst.some((i) => /rimming/.test(i.act))).toBe(true);
  });
});

describe("Belonging sweep: less common phrasings are found", () => {
  for (const l of [
    "Cas’s threat is punctuated with the thrust of his cock into Dean.",
    "Dean whimpers as Cas sinks in a third finger and the stretch makes him groan.",
    "Cas pulls the cock ring off as his first spurt of cum enters Dean.",
    "Stretching Dean beautifully open with his oversized dick only to leave him empty.",
    "Dean cries out when Cas leans forward and slips his caged cock into his mouth.",
    "Dean freezes and Cas grabs the back of his head to keep his mouth full of cock.",
    "Dean finally sits it all inside him, humming.",
  ]) it(l, () => expect(hits(SPN, cas, l).f.length + hits(SPN, cas, l).inst.length).toBeGreaterThan(0));
  it("a hole that throbs or begs is a bottom body cue", () => {
    expect(hits(SPN, cas, "Dean cries out at the emptiness while his hole begs.").f.some((x) => x.role === "bottom" && /aching hole|empty/.test(x.what))).toBe(true);
  });
  it("rubbing over a dry hole is a touch hint for the rubber", () => {
    expect(hits(SPN, cas, "Dean gasps as Cas rubs over his dry hole.").f.some((x) => x.role === "top" && /teasing a hole/.test(x.what))).toBe(true);
  });
});

describe("sweep: things that aren't scenes", () => {
  it("collecting slick on fingers to lube a sleeve is not fingering", () => {
    expect(hits(SPN, cas, "Cas slips fingers through Dean’s dripping slick and collects it to shove into a cock sleeve.").inst.filter((i) => /fingering/.test(i.act))).toHaveLength(0);
  });
  for (const l of [
    "Will he open him up or just spear his cock inside him and hope Dean adjusts?",
    "Dean would have let Cas fuck him bare without thinking about the consequences.",
    "Cas can just keep the door open and fuck him senseless with no fear of scolding.",
    "He needs Dean to ignore the phone and pin him to the bed and fuck him.",
    "Cas had meant to feed him and fuck him, but not necessarily in that order.",
  ]) it(l, () => expect(hits(SPN, cas, l).inst).toHaveLength(0));
});

describe("subject-less sentence with his … him is one person", () => {
  it("credits the tongue to the partner, not the one it is probing", () => {
    const line =
      "Anakin pants against the car. He rocks back and Obi-Wan takes the chance to slip a hand around his hips to grab his cock. " +
      "It feels almost unbearably good, the hand on his cock and the tongue probing into him.";
    const p = analyzeWithPatterns(obi + line, SW, { quiet: true }).pairings[0];
    const i = p.rimming.instances.find((x) => x.evidence.includes("It feels almost"));
    expect(i).toBeTruthy();
    expect(i!.top).toMatch(/Obi-Wan/);
    expect(i!.bottom).toMatch(/Anakin/);
  });
});
