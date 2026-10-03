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

describe("Steve/Eddie report: everyday sentences are not sex cues", () => {
  const ST = mk(["Steve Harrington", "Eddie Munson"], "Stranger Things");
  const sb = baseOf("Steve", "Eddie");
  const none = (line: string) => {
    const r = hits(ST, sb, line);
    expect(r.f.length + r.inst.length, line).toBe(0);
  };
  for (const l of [
    "Eddie had flipped onto his stomach but was still pushed to the far end of the bed like Steve had the plague.",
    "Steve groaned and rolled over onto his stomach, away from his phone, and said he did not want to deal with her.",
    "He wanted it more now that he’d had a taste, only for it to be shoved back in his face.",
    "Eddie’s body was leaking all over the place, and he could not make it stop.",
    "Every new scar on Eddie’s body began to weep with pain, like he had stretched them out too quickly.",
    "Steve felt like he was about to sweat just standing there, which gave Jason time to drop to the floor around the open window.",
  ]) it(`no cue: ${l.slice(0, 50)}`, () => none(l));
  it("still reads a stomach-down, ass-up presentation", () => {
    const r = hits(ST, sb, "Eddie rolled onto his stomach and lifted his ass for Steve.");
    expect(r.f.length + r.inst.length).toBeGreaterThan(0);
  });
  it("disbelief about being asked is not a preference", () => {
    const p = analyzeWithPatterns(sb + "There was no way Steve was subtly asking him to fuck him or something.", ST, { quiet: true }).pairings[0];
    const f = p.vibe!.flatMap((v) => v.factors!).filter((x) => (x.source ?? "").includes("no way Steve"));
    expect(f.length).toBe(0);
  });
});

describe("Steve/Eddie sweep: oral phrasings in a bathroom scene", () => {
  const ST = mk(["Steve Harrington", "Eddie Munson"], "Stranger Things");
  const sb = baseOf("Steve", "Eddie");
  const blow = (line: string) => analyzeWithPatterns(sb + line, ST, { quiet: true }).pairings[0].blowjob.instances.filter((i) => i.evidence.includes(line.slice(0, 25)));
  const cases: [string, string, string][] = [
    ["Not without pulling Eddie’s dick out of his mouth, which Steve did not want to do yet.", "Eddie", "Steve"],
    ["Steve choked, his throat squeezing around Eddie tighter than before.", "Eddie", "Steve"],
    ["Steve was busy digging his fingers into Eddie’s hips, slowly forcing his cock down his throat.", "Eddie", "Steve"],
    ["Eddie grabbed Steve’s hair and slowly pushed his hips as far forward as they would go.", "Eddie", "Steve"],
    ["Steve said, pressing his open mouth against Eddie’s zipper.", "Eddie", "Steve"],
    ["Steve ran the back of his tongue around the head, looking up at Eddie.", "Eddie", "Steve"],
  ];
  for (const [l, top, bottom] of cases)
    it(`reads: ${l.slice(0, 48)}`, () => {
      const i = blow(l);
      expect(i.length, l).toBeGreaterThan(0);
      expect(i[0].top).toMatch(new RegExp(top));
      expect(i[0].bottom).toMatch(new RegExp(bottom));
    });
  it("slipping in next to someone is not penetration", () => {
    const p = analyzeWithPatterns(sb + "Steve slid in next to Eddie, which he tried not to read into.", ST, { quiet: true }).pairings[0];
    expect(p.anal.instances.length).toBe(0);
  });
  it("shoving someone aside, or to safety, is not a dominance cue", () => {
    for (const l of ["Steve jumped off Billy and shoved him to the side at the same time.", "Eddie shoved Steve to the floor and covered his head just as the explosion hit."]) {
      const r = hits(ST, sb, l);
      expect(r.f.length, l).toBe(0);
    }
  });
  it("comfort after a nightmare is not aftercare evidence", () => {
    const r = hits(ST, sb, "Steve woke up shaking in the dark. Eddie sat down beside him on the bed. “Hey, you’re okay,” Eddie said. “I’ve got you.”");
    expect(r.f.length).toBe(0);
  });
  it("letting someone take over a job is not submission", () => {
    const r = hits(ST, sb, "He wondered if Rick would let him take over the job for the whole town.");
    expect(r.f.length).toBe(0);
  });
});

describe("Tricks of the Trade sweep: pronouns, speakers and idioms", () => {
  const CD: Ao3Meta = { ...mk(["Castiel", "Dean Winchester"], "Supernatural"), freeforms: ["Dom Castiel", "Sub Dean"] };
  const cb = baseOf("Cas", "Dean");
  const run = (line: string) => analyzeWithPatterns(cb + line, CD, { quiet: true }).pairings[0];
  const factors = (line: string, key: string) => run(line).vibe!.flatMap((v) => v.factors!.map((f) => ({ ...f, who: v.name }))).filter((f) => (f.source ?? "").includes(key));
  it("‘beg him to fuck him’: the asker is the bottom", () => {
    const f = factors("Dean wanted to beg him to just fuck him without it, but he knew he would be thankful tomorrow.", "beg him");
    expect(f.filter((x) => x.who === "Dean Winchester" && x.role === "top").length).toBe(0);
    expect(f.some((x) => x.who === "Dean Winchester" && x.role === "bottom")).toBe(true);
  });
  it("a participle after ‘Cas’s hand wandered again,’ belongs to Cas", () => {
    const f = factors("Dean watched in amusement and Cas’s hand wandered again, cupping his ass under his cape.", "wandered again");
    expect(f.filter((x) => x.who === "Dean Winchester" && x.role === "top").length).toBe(0);
    expect(f.some((x) => x.who === "Castiel" && x.role === "top")).toBe(true);
  });
  it("‘as he pounded into him’ after ‘Cas’s hands … holding him down’ is Cas", () => {
    const i = run("He tried to rut into the bed, but Cas’s hands moved to his hips, holding him down as he pounded into him.").anal.instances.find((x) => x.evidence.includes("pounded into him"));
    expect(i?.top).toMatch(/Castiel/);
  });
  it("‘Dean had no warning before he was pushing inside him’ is Cas", () => {
    const i = run("Cas moved back behind him and Dean hardly had any warning before he was pushing inside him.").anal.instances.find((x) => x.evidence.includes("warning before"));
    expect(i?.top).toMatch(/Castiel/);
  });
  it("bottoming a toy out is the top’s act; solo prep with the partner away is not a scene", () => {
    expect(run("Dean pushed up into the pressure and Cas chuckled as he bottomed the dildo out.").anal.instances.some((x) => x.evidence.includes("bottomed the dildo"))).toBe(false);
    expect(run("It had been a long time since he’d done this to himself, but he persevered until he was stretched to fit three fingers.").anal.instances.some((x) => x.evidence.includes("done this to himself"))).toBe(false);
  });
  it("the slit of a cock is not cunnilingus", () => {
    const p = run("He swirled his tongue over Dean’s slit, sucking along his shaft.");
    expect(p.cunnilingus.instances.length).toBe(0);
  });
  it("a show someone else performs, a dance and a brother are not cues", () => {
    expect(factors("The sub nodded. “Spread your legs for me. Let’s show off your cock.” The sub did as asked and Dean shifted in his seat.", "Spread your legs").length).toBe(0);
    expect(factors("Dean took the lead, guiding Cas in a small box step.", "took the lead").length).toBe(0);
    expect(factors("Cas clutched at his brother, tucking his head into his chest.", "his brother").length).toBe(0);
  });
  it("an action sentence just before an untagged line names its speaker", () => {
    const f = factors("“Please,” he cried. Cas pulled his fingers free and moved up so Dean could see him. “You’re doing so well, you’re such a good boy.”", "such a good boy");
    expect(f.filter((x) => x.who === "Dean Winchester" && x.role === "top").length).toBe(0);
    expect(f.some((x) => x.who === "Castiel" && x.role === "top")).toBe(true);
  });
  it("‘brief Castiel/Meg Masters’ is a tag qualifier, not part of the name", () => {
    const m = { ...CD, relationships: ["Castiel/Dean Winchester", "brief Castiel/Meg Masters"] };
    const a = analyzeWithPatterns(cb + "Cas fucked Dean hard.", m, { quiet: true });
    expect(a.pairings.map((p) => p.pairing).join(" ")).not.toMatch(/brief/i);
  });
});

describe("solo toy use: ‘himself’ / ‘his own’ counts for more than an inferred ‘his’", () => {
  const SB = mk(["Steve Harrington", "Eddie Munson"], "Stranger Things");
  const sb = baseOf("Steve", "Eddie");
  const bottomOdds = (line: string) => {
    const p = analyzeWithPatterns(sb + line, SB, { quiet: true }).pairings[0];
    return p.anal.people!.find((x) => x.name.startsWith("Steve"))!.bottom;
  };
  const vibeBottom = (line: string) => {
    const p = analyzeWithPatterns(sb + line, SB, { quiet: true }).pairings[0];
    return p.vibe!.find((v) => v.name.startsWith("Steve"))!.factors!.filter((f) => f.role === "bottom" && (f.source ?? "").includes(line.slice(0, 20))).reduce((n, f) => n + f.weight, 0);
  };
  const explicit = "Steve fucked himself with the dildo, moaning into the pillow.";
  const own = "Steve fucked his own ass with the dildo, moaning into the pillow.";
  const implicit = "Steve pushed the dildo into his ass, moaning into the pillow.";
  it("‘himself’ and ‘his own’ weigh more than the bare ‘his’", () => {
    expect(vibeBottom(explicit)).toBeGreaterThan(vibeBottom(implicit));
    expect(vibeBottom(own)).toBeGreaterThan(vibeBottom(implicit));
    expect(vibeBottom(implicit)).toBeGreaterThan(0);
    expect(bottomOdds(explicit)).toBeGreaterThanOrEqual(bottomOdds(implicit));
  });
  it("a long solo scene counts about twice, not once per sentence", () => {
    const many = Array(6).fill(explicit).join(" ");
    expect(vibeBottom(many)).toBeLessThan(vibeBottom(explicit) * 3.1);
  });
  it("‘got himself fucked’ and ‘made himself come’ are not solo toy use", () => {
    for (const l of ["Eddie got himself fucked by Steve against the wall.", "Steve made himself come while Eddie watched."]) {
      expect(vibeBottom(l), l).toBe(0);
    }
  });
});

describe("solo acts have their own category", () => {
  const SB = mk(["Steve Harrington", "Eddie Munson"], "Stranger Things");
  const sb = baseOf("Steve", "Eddie");
  const solo = (line: string, m: Ao3Meta = SB, base = sb) => analyzeWithPatterns(base + line, m, { quiet: true }).pairings[0].solo!;
  it.each([
    ["Steve jerked himself off in the shower, biting back a moan.", "Steve", "Masturbation"],
    ["Eddie stroked his own cock slowly, staring at the ceiling.", "Eddie", "Masturbation"],
    ["Steve masturbated twice before Eddie got home.", "Steve", "Masturbation"],
    ["Eddie touched himself through his jeans, hips rocking, thinking of Steve.", "Eddie", "Masturbation"],
    ["Steve thrust up into his own fist, gasping.", "Steve", "Masturbation"],
    ["Eddie got himself off in the dark with a muffled groan.", "Eddie", "Masturbation"],
    ["Steve fucked himself with the dildo, moaning into the pillow.", "Steve", "Toy on self"],
    ["Eddie fingered himself open, slick and quick, whimpering.", "Eddie", "Self-fingering"],
  ])("%s", (line, who, label) => {
    const r = solo(line);
    expect(r.occurs, line).toBe(true);
    const p = r.people.find((x) => x.name.startsWith(who))!;
    expect(p.acts.map((a) => a.act), line).toContain(label);
    expect(r.people.find((x) => !x.name.startsWith(who))!.total).toBe(0);
  });
  it.each([
    "Steve jerked Eddie off slowly, kissing his neck.",
    "Eddie wanted to touch himself, but Steve held his wrists.",
    "Steve touched himself on the chest and said he was fine.",
    "If Steve masturbated now he would never hear the end of it.",
  ])("not solo: %s", (line) => {
    expect(solo(line).occurs, line).toBe(false);
  });
  it("masturbation is not a top or bottom cue", () => {
    const p = analyzeWithPatterns(sb + Array(5).fill("Steve jerked himself off, gasping.").join(" "), SB, { quiet: true }).pairings[0];
    expect(p.solo!.people[0].total).toBeGreaterThan(0);
    expect(p.vibe!.flatMap((v) => v.factors!).filter((f) => /jerked himself/.test(f.source ?? "")).length).toBe(0);
  });
  it("self-fingering and toys still count as anal bottoming for a man, and also appear as solo", () => {
    const p = analyzeWithPatterns(sb + "Steve fucked himself with the dildo, moaning into the pillow.", SB, { quiet: true }).pairings[0];
    expect(p.solo!.people[0].acts.map((a) => a.act)).toContain("Toy on self");
    expect(p.vibe!.flatMap((v) => v.factors!.map((f) => ({ ...f, who: v.name }))).some((f) => f.who.startsWith("Steve") && f.role === "bottom" && /dildo/.test(f.source ?? ""))).toBe(true);
  });
  it("for a woman, self-fingering is solo but not anal bottoming unless the words say ass", () => {
    const FF = { ...emptyMeta(), rating: "Explicit", categories: ["F/F"], fandoms: ["Original Work"], relationships: ["Anna/Beth"], characters: ["Anna", "Beth"] } as Ao3Meta;
    const base = baseOf("Anna", "Beth");
    const vag = analyzeWithPatterns(base + "Anna fingered herself, her pussy slick, moaning Beth’s name.", FF, { quiet: true }).pairings[0];
    expect(vag.solo!.occurs).toBe(true);
    expect(vag.vibe!.flatMap((v) => v.factors!).filter((f) => /fingered herself/.test(f.source ?? "")).length).toBe(0);
    const anal = analyzeWithPatterns(base + "Anna pushed a finger into her own ass, moaning Beth’s name.", FF, { quiet: true }).pairings[0];
    expect(anal.solo!.occurs).toBe(true);
  });
});

describe("report wording for a solo act", () => {
  it("says it was shown as a solo act, not as pointing toward someone", async () => {
    const { buildReport } = await import("../src/report");
    const r = buildReport({
      source: "patterns", summaries: [], missed: [], general: "",
      flags: [{ id: "x", kind: "hint", pairing: "Steve/Eddie", card: "solo", top: "Steve", bottom: "", act: "Masturbation", evidence: "Steve jerked himself off.", reasons: ["not_sex"], note: "" }],
    });
    expect(r).toMatch(/solo act by \*\*Steve\*\* · Masturbation/);
    expect(r).not.toMatch(/points toward/);
  });
});

describe("solo acts: plans and struggles are not acts", () => {
  const SB = mk(["Steve Harrington", "Eddie Munson"], "Stranger Things");
  const sb = baseOf("Steve", "Eddie");
  it.each([
    "Steve was going to jerk off in the bathroom before coming back to bed.",
    "Eddie found it difficult to keep from reaching down to touch himself.",
  ])("%s", (line) => {
    expect(analyzeWithPatterns(sb + line, SB, { quiet: true }).pairings[0].solo!.occurs).toBe(false);
  });
});
