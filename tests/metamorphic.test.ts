// Metamorphic checks: every sentence below is run four ways and the engine must react the way the story says it should.
//   as written       the act is found, with the right person on top
//   names swapped    the roles flip with them
//   negated          "never fucked" is no scene
//   dreamed          "dreamed that …" is no scene
// A sentence the engine gets wrong in one of these ways is listed in KNOWN with the way it fails, so a new break fails the
// test and so does a fix nobody noticed (remove it from KNOWN then).
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

type Fam = "anal" | "blowjob" | "rimming";
/** actor: whether X is the top of the family's card ("gets sucked" / "eats ass" / penetrates) or the bottom. */
interface Case { t: string; fam: Fam; xTop: boolean; noNeg?: boolean; noPresent?: boolean }
const c = (t: string, fam: Fam, xTop = true, noNeg = false, noPresent = false): Case => ({ t, fam, xTop, noNeg, noPresent });

export const CASES: Case[] = [
  c("{X} fucked {Y} hard from behind.", "anal"),
  c("{X} slid his cock into {Y} slowly, inch by inch.", "anal"),
  c("{X} pushed inside {Y} and groaned.", "anal"),
  c("{X} thrust into {Y} again and again.", "anal"),
  c("{X} pounded {Y} into the mattress.", "anal"),
  c("{X} buried himself in {Y} to the hilt.", "anal"),
  c("{X} filled {Y} up with his come.", "anal"),
  c("{X} took {Y} from behind, hands tight on his hips.", "anal"),
  c("{X} lined up and pressed into {Y}.", "anal"),
  c("{Y} rode {X} hard, slow and deep.", "anal"),
  c("{Y} sank down onto {X}'s cock with a moan.", "anal"),
  c("{X}'s cock stretched {Y} wide.", "anal"),
  c("{X} sucked {Y} off, taking him deep.", "blowjob", false),
  c("{X} wrapped his lips around {Y}'s cock and sucked.", "blowjob", false),
  c("{X} swallowed {Y}'s cock down to the root.", "blowjob", false),
  c("{X} licked a stripe up {Y}'s shaft.", "blowjob", false),
  c("{X} took {Y} in his mouth.", "blowjob", false),
  c("{Y} came down {X}'s throat.", "blowjob", false),
  c("{X} fucked {Y}'s mouth, hands in his hair.", "blowjob", true),
  c("{Y} blew {X} on his knees.", "blowjob", true),
  c("{X} went down on {Y}.", "blowjob", false),
  c("{X} licked into {Y}'s hole, slow and wet.", "rimming"),
  c("{X} buried his face between {Y}'s cheeks and ate him out.", "rimming", true, true), // two verbs: how far "never" reaches is ambiguous
  c("{X} rimmed {Y} until he shook.", "rimming"),
  c("{X} pressed his tongue against {Y}'s hole.", "rimming"),
  c("{Y} was fucked by {X} until he cried.", "anal", true, false, true),
  c("{X} fucked into {Y} with short, hard thrusts.", "anal"),
  c("{X} came inside {Y}, filling him.", "anal"),
  c("{X} opened {Y} up with two fingers, then fucked him.", "anal", true, true), // two verbs: how far "never" reaches is ambiguous
  c("{X} sucked {Y}'s cock until he came.", "blowjob", false),
  c("{X} deepthroated {Y}.", "blowjob", false),
  c("{Y}'s cock slid between {X}'s lips.", "blowjob", false),
  c("{X} tongued {Y}'s hole open.", "rimming"),
  c("{X} ate {Y} out until he shook.", "rimming"),
];

/** Sentences that say nothing happened: a wish, a plan, a refusal, a worry. No scene may come out of them, either way round. */
export const NOT_HAPPENING: { t: string; fam: Fam }[] = [
  { t: "“Fuck me,” {Y} begged.", fam: "anal" },
  { t: "{Y} wanted {X} to fuck him.", fam: "anal" },
  { t: "{X} wanted to fuck {Y}.", fam: "anal" },
  { t: "{X} refused to fuck {Y}.", fam: "anal" },
  { t: "If {X} fucked {Y}, he would never recover.", fam: "anal" },
  { t: "{X} could fuck {Y} later, if he wanted.", fam: "anal" },
  { t: "{Y} wondered what it would be like if {X} sucked him off.", fam: "blowjob" },
  { t: "“Suck me,” {X} said, but {Y} shook his head.", fam: "blowjob" },
  { t: "{X} would never eat {Y} out.", fam: "rimming" },
  { t: "{Y} thought about {X}'s tongue on his hole.", fam: "rimming" },
];

/** "<sentence>|<how it fails>" for sentences the engine does not yet handle every way. */
export const KNOWN: string[] = [];

const M: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Stranger Things (TV 2016)"], relationships: ["Steve Harrington/Eddie Munson"], characters: ["Steve Harrington", "Eddie Munson"] };
const lead = "Steve and Eddie were in bed, naked and kissing, hard and aching. Steve kissed Eddie. Eddie kissed Steve back, moaning. ".repeat(2) + "\n\n";
const NAME = { Steve: "Steve Harrington", Eddie: "Eddie Munson" } as const;
type Who = keyof typeof NAME;

const fill = (t: string, x: Who, y: Who) => t.replaceAll("{X}", x).replaceAll("{Y}", y);
const negate = (s: string) => s.replace(/\b(fucked|slid|pushed|thrust|pounded|buried|filled|took|lined|pressed|rode|sank|stretched|sucked|wrapped|swallowed|licked|came|blew|went|rimmed|deepthroated|tongued|ate|opened)\b/, "never $1");
const PRESENT: Record<string, string> = { fucked: "fucks", slid: "slides", pushed: "pushes", thrust: "thrusts", pounded: "pounds", buried: "buries", filled: "fills", took: "takes", lined: "lines", pressed: "presses", rode: "rides", sank: "sinks", stretched: "stretches", sucked: "sucks", wrapped: "wraps", swallowed: "swallows", licked: "licks", came: "comes", blew: "blows", went: "goes", rimmed: "rims", ate: "eats", tongued: "tongues", opened: "opens", deepthroated: "deepthroats", was: "is" };
const present = (s: string) => s.replace(/\b[a-z]+\b/g, (w) => PRESENT[w] ?? w);
const pronoun = (t: string) => (t.startsWith("{X} ") ? `{X} grinned. He${t.slice(3)}` : undefined);
const dreamed = (s: string, x: Who) => `${x} dreamed that ${s[0].toLowerCase()}${s.slice(1)}`;

function reading(text: string, fam: Fam): string[] {
  const p = analyzeWithPatterns(lead + text, M, { quiet: true }).pairings[0];
  return p[fam].instances.filter((i) => i.act !== "fingering").map((i) => `${i.top}>${i.bottom}`);
}

describe("metamorphic checks", () => {
  it("reads each sentence, its swap, its negation and its dream the way the story says", () => {
    const failures: string[] = [];
    for (const k of CASES) {
      const expectTop = (x: Who, y: Who) => (k.xTop ? `${NAME[x]}>${NAME[y]}` : `${NAME[y]}>${NAME[x]}`);
      const ab = reading(fill(k.t, "Steve", "Eddie"), k.fam);
      if (!ab.length || ab.some((r) => r !== expectTop("Steve", "Eddie"))) failures.push(`${k.t}|as written: ${ab.join(", ") || "nothing"}`);
      const ba = reading(fill(k.t, "Eddie", "Steve"), k.fam);
      if (!ba.length || ba.some((r) => r !== expectTop("Eddie", "Steve"))) failures.push(`${k.t}|names swapped: ${ba.join(", ") || "nothing"}`);
      const pn = pronoun(k.t);
      for (const [label, text] of [["present tense", k.noPresent ? undefined : present(k.t)], ["pronoun", pn]] as const) {
        if (!text) continue;
        const r = reading(fill(text, "Steve", "Eddie"), k.fam);
        if (!r.length || r.some((x) => x !== expectTop("Steve", "Eddie"))) failures.push(`${k.t}|${label}: ${r.join(", ") || "nothing"}`);
        const r2 = reading(fill(text, "Eddie", "Steve"), k.fam);
        if (!r2.length || r2.some((x) => x !== expectTop("Eddie", "Steve"))) failures.push(`${k.t}|${label}, swapped: ${r2.join(", ") || "nothing"}`);
      }
      const neg = k.noNeg ? [] : reading(negate(fill(k.t, "Steve", "Eddie")), k.fam);
      if (neg.length) failures.push(`${k.t}|negated: ${neg.join(", ")}`);
      const dr = reading(dreamed(fill(k.t, "Steve", "Eddie"), "Steve"), k.fam);
      if (dr.length) failures.push(`${k.t}|dreamed: ${dr.join(", ")}`);
    }
    for (const k of NOT_HAPPENING) {
      for (const [x, y] of [["Steve", "Eddie"], ["Eddie", "Steve"]] as const) {
        const r = reading(fill(k.t, x, y), k.fam);
        if (r.length) failures.push(`${k.t}|not happening (${x} first): ${r.join(", ")}`);
      }
    }
    if (process.env.META_OUT) writeFileSync(process.env.META_OUT, failures.join("\n"));
    expect(failures.map((f) => f.split("|")[0] + "|" + f.split("|")[1].split(":")[0])).toEqual(KNOWN);
  });
});
