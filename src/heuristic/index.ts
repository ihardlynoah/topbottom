// Free, offline top/bottom analysis using sentence patterns instead of AI.
//
// Pipeline: split into paragraphs and sentences → mask dialogue → find act patterns in narration →
// resolve names/pronouns to characters → classify each hit as an act, a desire, or a fantasy →
// read dialogue for what speakers ask for → group hits into scenes → verdict + confidence per pairing.

import { type Ao3Meta, romanticPairings } from "../ao3";
import {
  type ActResult,
  type Analysis,
  type Confidence,
  type Desire,
  type Instance,
  type PairingResult,
  type Role,
  type VaginalResult,
  confidenceLabel,
} from "../types";
import { type Cast, type Character, type Gender, buildCast } from "./characters";
import {
  ANAL_CTX,
  type Cat,
  VULVA_CTX,
  type CompiledPattern,
  DIALOGUE,
  EPITHET_TOKEN,
  FINGER_CTX,
  PATTERNS,
  PENIS_CTX,
  SEX_CTX,
  compilePatterns,
} from "./patterns";
import { EPITHET, canonEpithet, learnEpithets } from "./epithets";
import { type TagInfo, readTags } from "./tags";
import { splitParagraphs, UNCERTAIN_NOTE_END, UNCERTAIN_NOTE_START } from "../text";

type Basis = NonNullable<Instance["basis"]>;

interface ActHit {
  cat: Cat;
  act: string;
  top: Character;
  bottom: Character;
  weight: number;
  basis: Basis;
  para: number;
  sentence: string;
  /** The sentence didn't say which hole, and the bottom may have a vagina: settled later by their other scenes. */
  holeGuess?: "anal" | "vaginal" | "ambiguous";
}

interface DesireHit {
  cat: Cat;
  act: string;
  who: Character;
  partner?: Character;
  role: Role;
  wants: boolean;
  kind: Desire["kind"];
  /** How much this hint counts toward confidence (a stated desire > a glance). */
  weight: number;
  para: number;
  sentence: string;
}

// ───────────── text helpers ─────────────

interface Quote {
  start: number;
  end: number;
  text: string;
}

/** Replace dialogue with spaces (same length) so narration patterns don't fire on speech. */
export function maskQuotes(p: string, singleQuotes: boolean): { masked: string; quotes: Quote[] } {
  const quotes: Quote[] = [];
  const re = singleQuotes
    ? /(^|[\s(—–-])‘((?:[^’]|’(?=\p{L}))*)’(?=[\s,.;:!?—–)-]|$)/gu
    : // Straight and curly quotes are interchangeable: many fics open with " and close with ” (autocorrect).
      /[“"]([^“”"]*)[”"]?/g;
  let masked = p;
  for (const m of p.matchAll(re)) {
    const lead = singleQuotes ? m[1].length : 0;
    const start = m.index! + lead;
    const end = m.index! + m[0].length;
    const text = singleQuotes ? m[2] : (m[1] ?? "");
    quotes.push({ start, end, text });
    masked = masked.slice(0, start + 1) + " ".repeat(Math.max(0, end - start - 2)) + masked.slice(end - 1);
  }
  // Text messages are often written in [brackets]; treat them like dialogue.
  for (const m of masked.matchAll(/\[([^\[\]]{2,})\]/g)) {
    const start = m.index!;
    const end = start + m[0].length;
    quotes.push({ start, end, text: p.slice(start + 1, end - 1) });
    masked = masked.slice(0, start + 1) + " ".repeat(Math.max(0, end - start - 2)) + masked.slice(end - 1);
  }
  quotes.sort((x, y) => x.start - y.start);
  return { masked, quotes };
}

/** Sentence boundaries (start indices) in a paragraph. */
function sentenceSpans(p: string): [number, number][] {
  const spans: [number, number][] = [];
  const re = /[.!?…]+["”’)]*\s+(?=["“‘(]?[\p{Lu}\d])/gu;
  let start = 0;
  for (const m of p.matchAll(re)) {
    const end = m.index! + m[0].length;
    // Don't split after common abbreviations.
    if (/\b(?:Mr|Mrs|Ms|Dr|St|Mt|Jr|Sr|vs|etc)\.\s*$/.test(p.slice(start, end))) continue;
    spans.push([start, end]);
    start = end;
  }
  if (start < p.length) spans.push([start, p.length]);
  return spans;
}

const CHAPTER_RE = /^(?:chapter|ch\.?|part)\s*(\d+|[ivxlc]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|[a-z]+teen|twenty[\w-]*|thirty[\w-]*)\b/i;

// ───────────── context markers ─────────────

const NEG = /\b(?:not|never|no longer|refused to|instead of|rather than|without|stopped (?:himself|herself|themself|myself) from|nobody|no one)\b|n['’]t\b/i;
const FANTASY =
  /\b(?:imagin\w*|fantasi[sz]\w*|daydream\w*|dream(?:ed|t|s|ing)?|pictur(?:ed|ing|es)|thought about|thinking about|thinks about|think about|(?:the )?thought of|wonder(?:ed|ing|s)? (?:what|how|if)|in (?:his|her|their|my) (?:head|mind)|mind['’]s eye|fantasy|fantasies|porn|(?:the|a|this|that) vision (?:of|he|she|they|I|that|which))\b/i;
const DESIRE =
  /\b(?:want\w*|wanna|need(?:ed|s|ing)? to|need(?:ed)? (?:him|her|them|you|me)|long(?:ed|ing|s)? (?:to|for)|crav\w*|ach(?:ed|ing|es) (?:to|for)|wish\w*|desperate (?:to|for)|dying to|would love|['’]d love|beg(?:ged|s|ging)?|yearn\w*|hop(?:ed|ing|es) (?:to|that)|ask(?:ed|s|ing)? (?:him|her|them|me|you) to|plead\w* (?:for|with)|itch(?:ed|ing)? to|(?:the )?prospect of|the promise of|the idea of)\b/i;
const HYPO_WINDOW = /\b(?:if|someday|some day|one day|next time|maybe|perhaps|might|what it would be like|what it'd be like)\b/i;
const HYPO_AUX = /\b(?:would|could|will|might|should|shall|going|gonna|['’]d|['’]ll)\b/i;
const HABIT_AUX = /\b(?:always|usually|never|often|typically|rarely|only|used)\b/i;
/** Fantasy markers strong enough to cover the whole rest of the sentence ("the vision he'd clung to, which included…"). */
const STRONG_FANTASY =
  /(?<!\b(?:not|never|no)\s|n['’]t\s)\b(?:imagin(?:ed|es|ing)|fantasi[sz](?:ed|es|ing)|daydream\w*|dream(?:ed|t|s|ing)?|(?:the|a|this|that) vision (?:of|he|she|they|I|that|which))\b/i;
const SCENE_BREAK = /^\s*(?:\*+|x{3,}|~+|-{3,}|—+|#+|o+0+o+|\* \* \*)\s*$/i;
const FANTASY_PARA = /(?<!\b(?:not|never|no)\s|n['’]t\s)\b(?:dream(?:ed|t|s|ing)?|fantasi[sz](?:ed|ing|es)|fantasy|daydream\w*|imagin(?:ed|es|ing))\b/i;

const SAY =
  "said|says|say|asked|asks|begged|begs|whispered|whispers|murmured|murmurs|moaned|moans|groaned|groans|gasped|gasps|panted|pants|breathed|breathes|growled|growls|hissed|hisses|whined|whines|pleaded|pleads|demanded|demands|ordered|orders|told|tells|mumbled|mumbles|muttered|mutters|replied|replies|answered|answers|added|adds|choked out|managed|grunted|grunts|purred|purrs|rasped|rasps|sighed|sighs|laughed|laughs|snapped|snaps|teased|teases|urged|urges|insisted|insists|admitted|admits|confessed|confesses|sobbed|sobs|cried|cries|whimpered|whimpers|husked|drawled|offered|suggested|blurted|croaked|keened|ground out|bit out|gritted out|continued|promised|warned|commanded|instructed|repeated|agreed|protested|swore|cursed|chuckled|smirked|grinned|smiled|hummed|crooned|coaxed|praised|soothed|groused|whispered against|murmured against";

// ───────────── character resolution ─────────────

type PronounInfo = { gender: Gender | "any" } | { fixed: "I" | "you" };

function pronoun(tok: string): PronounInfo | undefined {
  switch (tok.toLowerCase()) {
    case "he": case "him": case "his": return { gender: "m" };
    case "she": case "her": return { gender: "f" };
    case "they": case "them": case "their": return { gender: "any" };
    case "i": case "me": case "my": return { fixed: "I" };
    case "you": case "your": return { fixed: "you" };
  }
  return undefined;
}

class Ctx {
  recent: Character[] = [];
  lastSubject?: Character;
  /** Learned epithets ("the blond" → Draco). */
  epithets = new Map<string, Character>();
  /** How each unlearned epithet was resolved, for learning on a second pass. */
  votes = new Map<string, Map<Character, number>>();
  /** Epithets resolved in the current sentence, so they mean the same thing throughout it. */
  private sentence = new Map<string, Character | undefined>();
  /** The epithets replaced by "Epithet<n>" tokens in the current sentence. */
  epiTable: string[] = [];
  constructor(private cast: Cast) {}

  reset() {
    this.recent = [];
    this.lastSubject = undefined;
    this.sentence.clear();
  }

  newSentence(epiTable: string[] = []) {
    this.sentence.clear();
    this.epiTable = epiTable;
  }

  /** Resolve an "Epithet<n>" placeholder token, if that's what this is. */
  token(tok: string): Character | undefined | null {
    const m = /^Epithet(\d+)$/.exec(tok);
    if (!m) return null;
    const text = this.epiTable[Number(m[1])];
    return text ? this.epithet(text) : undefined;
  }

  /** "The blond", "the taller man": a learned mapping, else the person who isn't the current subject. */
  epithet(tok: string): Character | undefined {
    const { keys, gender, other } = canonEpithet(tok);
    for (const k of keys) {
      const known = this.epithets.get(k);
      if (known && Ctx.compatible(known, gender)) return known;
    }
    const cacheKey = keys[0] ?? tok.toLowerCase();
    if (this.sentence.has(cacheKey)) return this.sentence.get(cacheKey);
    const c = this.lastSubject ? this.partnerOf(this.lastSubject, gender) : this.recent.find((r) => Ctx.compatible(r, gender));
    this.sentence.set(cacheKey, c);
    // "The other man" is always relative, so it never becomes a fixed mapping.
    if (c && keys.length && !other) {
      for (const k of keys) {
        const v = this.votes.get(k) ?? new Map<Character, number>();
        v.set(c, (v.get(c) ?? 0) + 1);
        this.votes.set(k, v);
      }
    }
    return c;
  }

  /** Adopt epithet mappings that were consistent on the first pass. Returns true if anything was learned. */
  learnFromVotes(): boolean {
    let learned = false;
    for (const [key, v] of this.votes) {
      if (this.epithets.has(key)) continue;
      const total = [...v.values()].reduce((a, b) => a + b, 0);
      const [best, n] = [...v.entries()].sort((a, b) => b[1] - a[1])[0];
      if (total >= 3 && n / total >= 0.7) {
        this.epithets.set(key, best);
        learned = true;
      }
    }
    this.votes.clear();
    return learned;
  }

  mention(c: Character | undefined) {
    if (!c) return;
    this.recent = [c, ...this.recent.filter((r) => r !== c)].slice(0, 10);
  }

  static compatible(c: Character, g: Gender | "any") {
    return g === "any" || c.gender === "u" || c.gender === g;
  }

  /** Who a subject pronoun (he/she) most likely refers to: the last subject, or the last-mentioned match. */
  subjectFor(g: Gender | "any"): Character | undefined {
    if (this.lastSubject && Ctx.compatible(this.lastSubject, g)) return this.lastSubject;
    return this.recent.find((c) => Ctx.compatible(c, g));
  }

  /** The other person in a two-person scene. */
  /** Characters named in the current sentence, in order. */
  sentMentions: { c: Character; at: number }[] = [];
  /** Where the current match ends: people named after it aren't its partner ("Riddle fucks him, though Voldemort watches"). */
  cutoff = Infinity;
  /** "Harry and I fucked him": people sharing the subject, who can't be the object. */
  coSubjects = new Set<Character>();
  /** Each person's most recent partner, per kind of act ("" = any). */
  partners = new Map<string, Map<Character, Character>>();
  /** The kind of act being resolved right now. */
  curCat = "";

  lastPartner(x: Character): Character | undefined {
    return this.partners.get(this.curCat)?.get(x) ?? this.partners.get("")?.get(x);
  }

  setPartners(cat: string, a: Character, b: Character) {
    for (const k of [cat, ""]) {
      const m = this.partners.get(k) ?? new Map<Character, Character>();
      m.set(a, b);
      m.set(b, a);
      this.partners.set(k, m);
    }
  }

  partnerOf(x: Character, g: Gender | "any" = "any", exclude: Set<Character> = new Set()): Character | undefined {
    const ok = (c: Character) => c !== x && !exclude.has(c) && !this.coSubjects.has(c) && Ctx.compatible(c, g);
    // Someone else named earlier in the same sentence is the likeliest partner (matters in threesomes).
    const last = this.lastPartner(x);
    // …unless their current partner is named in it too ("…thrusts into him as Harry is forced up").
    if (last && ok(last) && this.sentMentions.some((m) => m.c === last)) return last;
    const inSentence = this.sentMentions.find((m) => m.at < this.cutoff && ok(m.c));
    if (inSentence) return inSentence.c;
    // Mid-scene, "him" is whoever x was just having sex with, not whoever last spoke.
    if (last && ok(last) && this.recent.slice(0, 6).includes(last)) return last;
    const paired = new Set(this.cast.pairings.filter((p) => p.includes(x)).map((p) => (p[0] === x ? p[1] : p[0])));
    const near = this.recent.slice(0, 6).filter(ok);
    return (
      near.find((c) => paired.has(c)) ??
      near[0] ??
      [...paired].find(ok) ??
      this.cast.pairings.flat().find(ok)
    );
  }

  fixed(kind: "I" | "you"): Character | undefined {
    return kind === "I" ? this.cast.narrator : this.cast.secondPerson;
  }
}

function stripPoss(tok: string) {
  return tok.replace(/['’]s?$/, "");
}


interface Slot {
  char?: Character;
  pron?: PronounInfo;
  /** Came from an epithet ("the blond"), so it's less certain than a name. */
  epithet?: boolean;
}

function readSlot(tok: string | undefined, cast: Cast, ctx: Ctx): Slot | undefined {
  if (!tok) return undefined;
  const name = stripPoss(tok);
  const byName = cast.byAlias.get(name);
  if (byName) return { char: byName };
  const viaEpithet = ctx.token(name);
  if (viaEpithet !== null) return viaEpithet ? { char: viaEpithet, epithet: true } : undefined;
  const p = pronoun(name);
  if (!p) return undefined;
  if ("fixed" in p) {
    const c = ctx.fixed(p.fixed);
    return c ? { char: c } : undefined;
  }
  return { pron: p };
}

function slotGender(s: Slot): Gender | "any" {
  return s.pron && "gender" in s.pron ? s.pron.gender : "any";
}

/** Turn the matched T/B tokens into characters. */
function resolvePair(
  tTok: string | undefined,
  bTok: string | undefined,
  subj: "t" | "b",
  cast: Cast,
  ctx: Ctx,
  /** For elided-subject matches: the subject found earlier in the sentence. */
  subjChar?: Character,
  /** For pronoun subjects mid-sentence: the nearest preceding clause subject. */
  nearSubj?: Character,
): { top?: Character; bottom?: Character; basis: Basis } | undefined {
  const subjectFor = (g: Gender | "any") => (nearSubj && Ctx.compatible(nearSubj, g) ? nearSubj : ctx.subjectFor(g));
  let t = readSlot(tTok, cast, ctx);
  let b = readSlot(bTok, cast, ctx);
  if (subjChar) {
    if (subj === "t") t = { char: subjChar };
    else b = { char: subjChar };
  }
  if (tTok && !t) return undefined;
  if (bTok && !b) return undefined;
  // "…he spills over Riddle's thigh as he clenches around Voldemort": the pronoun subject is the clause's subject.
  let viaNear = false;
  if (nearSubj && t && b) {
    const [s, o] = subj === "t" ? [t, b] : [b, t];
    if (s.pron && o.char && o.char !== nearSubj && Ctx.compatible(nearSubj, slotGender(s))) {
      if (subj === "t") t = { char: nearSubj };
      else b = { char: nearSubj };
      viaNear = true;
    }
  }

  let top = t?.char;
  let bottom = b?.char;
  let basis: Basis = viaNear ? "pronoun" : "named";

  if (t && b) {
    if (top && !bottom) {
      bottom = ctx.partnerOf(top, slotGender(b));
      basis = "pronoun";
    } else if (bottom && !top) {
      top = ctx.partnerOf(bottom, slotGender(t));
      basis = "pronoun";
    } else if (!top && !bottom) {
      const [s, o] = subj === "t" ? [t, b] : [b, t];
      const sc = subjectFor(slotGender(s));
      const oc = sc ? ctx.partnerOf(sc, slotGender(o)) : undefined;
      [top, bottom] = subj === "t" ? [sc, oc] : [oc, sc];
      basis = "pronoun";
    }
  } else {
    // Only one side mentioned ("he bottomed out", "he was fucked"): the other is the scene partner.
    const only = (t ?? b)!;
    // "…was probably him fingering himself": an object pronoun on its own is the other person, not the subject.
    const objectForm = /^(?:him|her|them)$/i.test((tTok ?? bTok) ?? "");
    const subj0 = subjectFor(slotGender(only));
    const c = only.char ?? (objectForm && subj0 ? (ctx.partnerOf(subj0, slotGender(only)) ?? subj0) : subj0);
    const other = c ? ctx.partnerOf(c) : undefined;
    if (t) [top, bottom] = [c, other];
    else [top, bottom] = [other, c];
    basis = "inferred";
  }
  if (!top || !bottom || top === bottom) return undefined;
  if (basis === "named" && (t?.epithet || b?.epithet)) basis = "pronoun";
  return { top, bottom, basis };
}


function groupValue(groups: Record<string, string | undefined> | undefined, role: "t" | "b") {
  if (!groups) return undefined;
  for (const [k, v] of Object.entries(groups)) if (v !== undefined && k.startsWith(`${role}_`)) return v;
  return undefined;
}

// ───────────── main analysis ─────────────

export interface PatternOptions {
  /** Leave out the "how this works" caveats in notes (for tests). */
  quiet?: boolean;
}

export function analyzeWithPatterns(text: string, meta: Ao3Meta, opts: PatternOptions = {}): Analysis {
  const hasUncertainNotes = text.includes(UNCERTAIN_NOTE_START);
  const analysisText = text.replace(
    new RegExp(`${UNCERTAIN_NOTE_START}[\\s\\S]*?${UNCERTAIN_NOTE_END}`, "g"),
    "",
  );
  const paras = splitParagraphs(analysisText);
  const doubleQuotes = (analysisText.match(/[“"]/g) ?? []).length;
  const singleQuotes = doubleQuotes < 4 && (analysisText.match(/(^|\s)‘/g) ?? []).length >= 4;
  const masked = paras.map((p) => maskQuotes(p, singleQuotes));
  const narration = masked.map((m) => m.masked).join("\n");

  const cast = buildCast(meta, narration, paras.join("\n"));
  const tags = readTags(meta.freeforms, cast);
  const patterns = compilePatterns(PATTERNS, cast.aliasPattern);
  const NAMES = cast.aliasPattern || "(?!)";
  const nameRe = new RegExp(`\\b(?:${NAMES})(?:['’]s)?\\b`, "g");
  const subjectRe = new RegExp(`(?:^|[\\s(—–-])((?:${NAMES}|${EPITHET_TOKEN})(?:['’]s)?|[Hh]e|[Ss]he|[Tt]hey|I|[Hh]is|[Hh]er|[Tt]heir|[Mm]y)\\b`);
  const epithetRe = new RegExp(EPITHET, "g");
  const ING_NOUNS =
    "morning|evening|wedding|building|feelings?|clothing|bedding|ceiling|thing|something|nothing|anything|everything|ring|king|wing|string|darling|sibling|stocking|ending|beginning|meaning|warning|painting|drawing|training|meeting|offering|blessing|pudding|earring|upbringing|being|wellbeing|well-being|belongings|surroundings|savings|lodgings|bring";
  const contractionRe = new RegExp(
    `\\b((?:${NAMES}|${EPITHET_TOKEN})|[Hh]e|[Ss]he)['’]s(?=\\s+(?:(?:\\w+ly|just|still|now|already|been|gonna|going|not|never|always|so|too)\\s+)?(?:(?!(?:${ING_NOUNS})\\b)[a-z]+ing\\b(?!\\s+(?:cock|dick|prick|length|shaft|erection|hard-?on|hole|entrance|rim|ass|arse|body|thighs?|hips?|nipples?|chest|mouth|lips|tongue|fingers?|hands?|heat|walls|muscles?|skin|balls)\\b)|(?:held|buried|seated|sheathed|lodged|inside|deep|balls-deep|been|gonna|going|not|never|still|already|finally|fully)\\b))`,
    "g",
  );
  // Prostate allusions. The owner comes from "inside X" or the possessive in front; otherwise "his".
  const OWNER = `(?:him|her|them|me|you|${NAMES}|${EPITHET_TOKEN})`;
  const POSS_FRONT = `(?:that|the|this|his|her|their|my|your|(?:${NAMES})['’]s)`;
  const P_ADJ = "(?:little|small|sweet|tender|sensitive|secret|magic(?:al)?|perfect|swollen|hidden|special|precious|wonderful|delicious|electric|oversensitive|abused|spongy|firm|walnut-sized)";
  const INSIDE = `(?:\\s+(?:deep\\s+|buried\\s+|hidden\\s+|tucked\\s+|right\\s+)?(?:inside|in|within)\\s+(?<in>${OWNER})\\b)`;
  // "that bundle of nerves (inside him)", "the cluster of nerves", "his little nub of nerves"
  const prostateRe = new RegExp(
    `\\b(?<front>${POSS_FRONT})\\s+(?:${P_ADJ}\\s+){0,2}(?:bundle|cluster|knot|nub|bunch|ball|nest)\\s+of\\s+(?:\\w+\\s+)?nerves${INSIDE}?`,
    "gi",
  );
  // "his sweet spot", "his p-spot (inside him)" — but not "the sweet spot on his neck"
  const sweetSpotRe = new RegExp(
    `\\b(?<front>${POSS_FRONT})\\s+(?:${P_ADJ}\\s+){0,2}(?:sweet\\s+spot|p-?spot)(?!\\s+(?:on|at|behind|below|under|just|of|along|between|beneath|where)\\b)${INSIDE}?`,
    "gi",
  );
  // "the spot inside Harry", "the gland inside him"
  const insideSpotRe = new RegExp(`\\b(?<front>${POSS_FRONT})\\s+(?:${P_ADJ}\\s+){0,2}(?:spot|place|gland|nub)${INSIDE}`, "gi");
  // "the spot that made him see stars"
  const seeStarsRe = new RegExp(
    `\\b(?<front>${POSS_FRONT})\\s+(?:${P_ADJ}\\s+){0,2}spot\\s+(?:that|which)\\s+(?:always\\s+)?(?:made|makes|had|has)\\s+(?<seer>${OWNER})\\s+(?:see\\s+(?:stars|white|spots)|scream|keen|cry out|shudder|jolt|arch|buck|sob|shake|whimper|moan|writhe|tremble|go cross-eyed|melt|lose it|come apart)`,
    "gi",
  );
  const PROSTATE_HINT = /\b(?:nerves|sweet\s+spot|p-?spot|spot|place|gland|nub)\b/i;
  const possOf = (who: string): string => {
    const w = who.toLowerCase();
    if (w === "him") return "his";
    if (w === "her") return "her";
    if (w === "them") return "their";
    if (w === "me") return "my";
    if (w === "you") return "your";
    return `${who}'s`;
  };
  function prostateOf(...args: unknown[]): string {
    const groups = args[args.length - 1] as { front?: string; in?: string; seer?: string };
    const front = groups.front ?? "";
    const who = groups.in ?? groups.seer;
    const owner = who ? possOf(who) : /^(?:that|the|this)$/i.test(front) ? "his" : front;
    return `${owner} prostate`;
  }

  const ctx = new Ctx(cast);
  ctx.epithets = learnEpithets(cast, meta.freeforms, narration);

  let acts: ActHit[] = [];
  let ambiguousHoles = 0;
  let defaultedAnal = 0;
  /** For each bottom, how many sentences clearly said anal vs vaginal. */
  const holeVotes = new Map<Character, { anal: number; vaginal: number }>();
  let desires: DesireHit[] = [];
  let chapters: string[] = [];
  let chapter = "";
  let prevSpeaker: Character | undefined;
  /** For a paragraph opening with a quote tagged only "he says": whoever didn't speak last. */
  let turnSpeaker: Character | undefined;
  let turnQuote: Quote | undefined;

  const firstEntity = (s: string): Character | undefined => {
    const m = subjectRe.exec(s);
    if (!m || m.index > 80) return undefined;
    const tok = stripPoss(m[1]);
    const named = cast.byAlias.get(tok);
    if (named) return named;
    const viaEpithet = ctx.token(tok);
    if (viaEpithet !== null) return viaEpithet;
    const p = pronoun(tok);
    if (!p) return undefined;
    if ("fixed" in p) return ctx.fixed(p.fixed);
    return notNamedLater(ctx.subjectFor(p.gender), s.slice(m.index + m[0].length), p.gender);
  };

  /**
   * A subject pronoun can't mean someone the same sentence names afterwards ("He pushed Stiles' legs
   * open" — he isn't Stiles), so switch to the other person.
   */
  function notNamedLater(c: Character | undefined, rest: string, g: Gender | "any"): Character | undefined {
    if (!c || !c.aliases.length) return c;
    const namedIn = (x: Character) =>
      x.aliases.length > 0 && new RegExp(`\\b(?:${x.aliases.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`).test(rest);
    if (!namedIn(c)) return c;
    // Not anyone else named later either: in a threesome, the pronoun is the third person.
    const later = new Set(cast.chars.filter(namedIn));
    const strict = ctx.partnerOf(c, g, later);
    if (strict && cast.pairings.some((p) => p.includes(strict) && p.includes(c))) return strict;
    // Everyone plausible was named later ("He hollowed his cheeks … for Cas … in Dean's mouth"): a later
    // possessive doesn't rule its owner out, rather than reaching for someone outside the scene.
    const namedPlain = (x: Character) =>
      x.aliases.length > 0 &&
      new RegExp(`\\b(?:${x.aliases.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b(?!['’]s?\\b)`).test(rest);
    if (!namedPlain(c)) return c;
    const loose = ctx.partnerOf(c, g, new Set(cast.chars.filter(namedPlain)));
    return (loose && cast.pairings.some((p) => p.includes(loose) && p.includes(c)) ? loose : strict) ?? ctx.partnerOf(c, g) ?? c;
  }

  const bodyCtxCache = new Map<number, boolean>();
  // Two passes when epithets are in play: the first learns which character "the blond" usually is.
  scan();
  if (ctx.learnFromVotes()) scan();

  function scan() {
  acts = [];
  desires = [];
  chapters = [];
  chapter = "";
  prevSpeaker = undefined;
  ambiguousHoles = 0;
  holeVotes.clear();
  ctx.partners.clear();
  ctx.reset();
  let dreamRun = 0;
  for (let pi = 0; pi < paras.length; pi++) {
    const para = paras[pi];
    const { masked: mp, quotes } = masked[pi];
    if (para.length < 120 && CHAPTER_RE.test(para)) {
      chapter = para.length > 60 ? para.slice(0, 60) + "…" : para;
    }
    chapters[pi] = chapter;
    // Turn-taking: '"Cock," he says, his slippery fingers…' answers the last speaker, and the narration
    // that follows is about the one who answered.
    turnSpeaker = undefined;
    const opensWithQuote = (q: Quote) => q === quotes[0] && !new RegExp(`\\b(?:${NAMES})\\b`).test(mp.slice(0, q.start));
    if (quotes.length && opensWithQuote(quotes[0]) && prevSpeaker) {
      const tag = para.slice(quotes[0].end, quotes[0].end + 40);
      if (new RegExp(`^[,.!?—–\\s]*(?:[Hh]e|[Ss]he|[Tt]hey)\\s+(?:\\w+ly\\s+)?(?:${SAY})\\b`).test(tag)) {
        turnSpeaker = ctx.partnerOf(prevSpeaker);
        turnQuote = quotes[0];
        if (turnSpeaker) ctx.lastSubject = turnSpeaker;
      }
    }
    // A dream can run on into the next two paragraphs ("Louis's tongue feels so good…") until someone wakes.
    const WAKE = /\b(?:wak(?:e|es|ing)\s+up|woke|awake|jolt(?:s|ed)?\s+awake|snap(?:s|ped)?\s+out\s+of)\b/i;
    const fantasyPara = FANTASY_PARA.test(mp.slice(0, 160)) || (dreamRun > 0 && !WAKE.test(mp.slice(0, 160)) && !SCENE_BREAK.test(para));
    if (WAKE.test(mp) || SCENE_BREAK.test(para)) dreamRun = 0;
    else if (/(?<!\b(?:not|never|no)\s|n['’]t\s)\b(?:dream(?:ed|t|s|ing)?|daydream\w*|fantasi[sz](?:ed|es|ing))\b/i.test(mp)) dreamRun = 2;
    else if (dreamRun) dreamRun--;
    const sexy = SEX_CTX.test(`${paras[pi - 1] ?? ""} ${para} ${paras[pi + 1] ?? ""}`);

    for (const [s0, s1] of sentenceSpans(mp)) {
      // Swap epithets for short tokens once, instead of every pattern carrying the whole epithet list.
      const epiTable: string[] = [];
      let sent = mp.slice(s0, s1);
      if (/\b(?:[Tt]he|[Hh]is|[Hh]er|[Tt]heir)\s/.test(sent)) {
        sent = sent.replace(epithetRe, (e) => `Epithet${epiTable.push(e) - 1}`);
      }
      // "Derek's licking" means "Derek is licking", not a possessive.
      sent = sent.replace(contractionRe, (_, who: string) => `${who} is`);
      // "That bundle of nerves inside him", "his sweet spot": say "his prostate" so every pattern reads it.
      // "Pushed past the tight ring of muscle": whose ring is left to the partner logic, like "his".
      sent = sent.replace(/\b[Tt]he\s+((?:(?:tight|outer|inner|first|clenching|fluttering|puckered|furled|resisting|stubborn)\s+)?rings?\s+of\s+muscles?)\b/g, "his $1");
      if (PROSTATE_HINT.test(sent)) {
        sent = sent.replace(prostateRe, prostateOf).replace(seeStarsRe, prostateOf).replace(insideSpotRe, prostateOf).replace(sweetSpotRe, prostateOf);
      }
      const original = para.slice(s0, s1).trim();
      ctx.newSentence(epiTable);
      ctx.sentMentions = [...sent.matchAll(nameRe)]
        .map((m) => ({ c: cast.byAlias.get(stripPoss(m[0]))!, at: m.index! }))
        .filter((m) => !!m.c);
      ctx.cutoff = Infinity;
      const subj = firstEntity(sent);
      if (subj) ctx.lastSubject = subj;

      {
        const penisy = PENIS_CTX.test(sent);
        for (const pat of patterns) {
          if (pat.gate && !pat.gate.test(sent)) continue;
          if (pat.needsCtx && !sexy) continue;
          if (pat.needsPenis && !penisy) continue;
          if (pat.needs && !pat.needs.test(sent)) continue;
          pat.re.lastIndex = 0;
          for (const m of sent.matchAll(pat.re)) {
            handleMatch(pat, m, sent, original, pi, fantasyPara, para);
          }
        }
      }

      // Update who's been mentioned, in order.
      for (const m of sent.matchAll(nameRe)) ctx.mention(cast.byAlias.get(stripPoss(m[0])));
      if (cast.narrator && /\b(?:I|me|my)\b/.test(sent)) ctx.mention(cast.narrator);
      if (subj) ctx.mention(subj);
    }

    // Dialogue: attribute each quote to a speaker and look for requests/desires.
    // Is sex happening around here? Narration only, so a "fuck me" in the dialogue doesn't count.
    const near = [pi - 3, pi - 2, pi - 1, pi, pi + 1, pi + 2, pi + 3].map((i) => masked[i]?.masked ?? "").join(" ");
    const narrationSexy = SEX_CTX.test(near) || /\b(?:nipples?|pleasure|arous\w*|undress\w*|thighs?|lube|fingers? (?:in|inside)|crotch|bulge)\b/i.test(near);
    let paraSpeaker: Character | undefined;
    let lastQ: Quote | undefined;
    for (const q of quotes) {
      // '"You can take it, princess," he tells him tightly, "You're made to take my cock."': one speaker.
      const continues = lastQ && paraSpeaker && q.start - lastQ.end < 50 && !/[.!?]["”]?\s*$/.test(para.slice(lastQ.end, q.start).trim() || ".") ;
      lastQ = q;
      const speaker = (continues ? paraSpeaker : undefined) ?? attributeSpeaker(para, mp, q) ?? paraSpeaker ?? (mp.trim().length < 6 && prevSpeaker ? ctx.partnerOf(prevSpeaker) : undefined);
      if (!speaker) continue;
      paraSpeaker = speaker;
      scanDialogue(q.text, speaker, pi, { sexy: narrationSexy, after: para.slice(q.end, q.end + 60), before: para.slice(Math.max(0, q.start - 60), q.start) });
    }
    if (paraSpeaker) prevSpeaker = paraSpeaker;
  }
  }

  /** The subject of an earlier verb in "X smiled and sucked him off": nearest name/he/she that isn't an object. */
  function elidedSubject(prefix: string, suffix = ""): Character | undefined {
    // A blanked-out quote is a clause boundary: "…," Alex says, choking…
    prefix = prefix.replace(/\s{3,}/g, (x) => `,${" ".repeat(x.length - 1)}`);
    // "—pressing him down, and Riddle with him—" is an aside, not the clause's subject.
    prefix = prefix.replace(/—[^—]*—/g, (x) => " ".repeat(x.length));
    const re = new RegExp(`(?:^|([\\w'’]+)?([\\s,]+))((?:${NAMES}|${EPITHET_TOKEN})(?![\\w'’])|[Hh]e|[Ss]he|[Tt]hey|I)(?=[\\s,])`, "g");
    const hits = [...prefix.matchAll(re)];
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i];
      // After a comma we're at a clause start, so whatever came before doesn't make this an object.
      const prev = h[2]?.includes(",") ? "" : (h[1] ?? "").toLowerCase();
      // A name right after a verb or preposition is an object ("spread Draco open"), not a subject.
      const isObject =
        !!prev &&
        !/^(?:and|but|or|so|then|when|as|while|because|until|before|after|if|though|although|once|since|where|now|still|finally|later|suddenly|slowly|meanwhile|that|who|yes|no|oh)$/.test(prev) &&
        // "…," whispers Alex: a name after a speech verb is its subject.
        !/^(?:says|said|whispers|whispered|murmurs|murmured|asks|asked|groans|groaned|moans|moaned|breathes|breathed|growls|growled|gasps|gasped|mutters|muttered|replies|replied|begs|begged|pants|panted|laughs|laughed|sighs|sighed|whimpers|whimpered|hisses|hissed|purrs|purred|teases|teased|grunts|grunted|answers|answered|adds|added|continues|continued|corrects|corrected|leers|leered|demands|demanded|insists|insisted|admits|admitted|pleads|pleaded|chokes|choked|calls|called|cries|cried)$/.test(prev);
      // "…at Sam, who's leaning over Steve…": a relative clause makes Sam the subject of what follows.
      const relative = /^,?\s*who\b/.test(prefix.slice(h.index! + h[0].length)) ||
        // "with Cas clenched tight and rolling his hips": "with X" + participle is a subject.
        (prev === "with" && /^\s+(?:\w+ly\s+)?\w+(?:ed|ing)\b/.test(prefix.slice(h.index! + h[0].length)));
      if (isObject && !relative && !/^(?:He|She|They|I)$/.test(h[3])) continue;
      return resolveToken(h[3], prefix.slice(h.index! + h[0].length) + suffix);
    }
    return undefined;
  }

  /** A name, epithet token, or pronoun to a character (pronouns can't mean someone named in `rest`). */
  function resolveToken(tok: string, rest = ""): Character | undefined {
    const named = cast.byAlias.get(stripPoss(tok));
    if (named) return named;
    const viaEpithet = ctx.token(stripPoss(tok));
    if (viaEpithet !== null) return viaEpithet;
    const p = pronoun(stripPoss(tok));
    if (!p) return undefined;
    return "fixed" in p ? ctx.fixed(p.fixed) : notNamedLater(ctx.subjectFor(p.gender), rest, p.gender);
  }

  function attributeSpeaker(para: string, mp: string, q: Quote): Character | undefined {
    const after = para.slice(q.end, q.end + 80);
    const before = mp.slice(Math.max(0, q.start - 80), q.start);
    const resolve = (tok: string | undefined) => {
      if (!tok) return undefined;
      const named = cast.byAlias.get(stripPoss(tok));
      if (named) return named;
      const p = pronoun(tok);
      if (!p) return undefined;
      if ("fixed" in p) return ctx.fixed(p.fixed);
      // "Alex fucks him through it. 'You can take it,' he tells him": he is the narration's subject just before.
      // A paragraph that opens with "'Cock,' he says": the other person from the last line.
      if (q === turnQuote && turnSpeaker && Ctx.compatible(turnSpeaker, p.gender)) return turnSpeaker;
      // The main subject of the last sentence before the quote ("Henry moans … as Alex lifts him. 'Use me,' he whispers").
      const lastSentence = mp.slice(0, q.start).trim().split(/(?<=[.!?])\s+/).pop() ?? "";
      const prior = lastSentence.length > 5 ? (firstEntity(lastSentence) ?? elidedSubject(lastSentence)) : undefined;
      if (prior && Ctx.compatible(prior, p.gender)) return prior;
      return ctx.subjectFor(p.gender);
    };
    // '"…," he heard Cas' voice': the voice's owner said it.
    const heard = new RegExp(`^[,.!?—–\\s]*(?:[Hh]e|[Ss]he|[Tt]hey|I)\\s+(?:\\w+\\s+)?(?:heard|hears|recognized|recognised)\\s+((?:${NAMES}))(?:['’]s?)?\\s+(?:\\w+\\s+)?voice`).exec(after);
    if (heard) return cast.byAlias.get(heard[1]);
    const a1 = new RegExp(`^[,.!?—–\\s]*((?:${NAMES})|[Hh]e|[Ss]he|[Tt]hey|I)\\s+(?:\\w+ly\\s+)?(?:${SAY})\\b`).exec(after);
    if (a1) return resolve(a1[1]);
    const a2 = new RegExp(`^[,.!?—–\\s]*(?:${SAY})\\s+((?:${NAMES})|he|she|they)\\b`).exec(after);
    if (a2) return resolve(a2[1]);
    const b1 = new RegExp(`((?:${NAMES})|[Hh]e|[Ss]he|[Tt]hey|I)\\s+(?:\\w+ly\\s+)?(?:${SAY})(?:\\s+[\\w’']+){0,4}?[,:]?\\s*["“‘]?\\s*$`).exec(before);
    if (b1) return resolve(b1[1]);
    // Otherwise, whoever the narration in this paragraph is about.
    const narr = mp.replace(/["“”‘’\[\]]\s*/g, " ").trim();
    const fromNarration = narr.length > 5 ? firstEntity(narr) : undefined;
    if (fromNarration) return fromNarration;
    // A line that addresses someone by name ("…, Dean.") was said by the other person.
    const voc = new RegExp(`(?:^|[,.!?]\\s+|\\b(?:hey|oh|please|yes|no|god),?\\s+)(${NAMES})(?=\\s*[,.!?…]|\\s*$)|,\\s*(${NAMES})\\b`).exec(q.text);
    const addressed = voc ? cast.byAlias.get(voc[1] ?? voc[2]) : undefined;
    return addressed ? ctx.partnerOf(addressed) : undefined;
  }

  function scanDialogue(line: string, speaker: Character, pi: number, around: { sexy: boolean; after: string; before: string }) {
    const lower = line.toLowerCase().replace(/’/g, "'");
    const seen = new Set<string>();
    for (const d of DIALOGUE) {
      const m = d.re.exec(lower);
      if (!m) continue;
      // "Fuck me, it's cold" / "Well, fuck me" / "fuck me sideways": an exclamation, not a request.
      if (/^fuck me$/.test(m[0]) && exasperated(lower, m.index!, around)) continue;
      // One line can match several phrasings of the same request ("I want you to fuck me").
      const key = `${d.cat}:${d.role}:${d.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const before = lower.slice(Math.max(0, m.index - 30), m.index);
      // "Won't you fuck me?" / "Sure you won't fuck me?" are requests, not refusals.
      const question = /\?\s*$/.test(lower.slice(m.index)) && !/[.!]/.test(lower.slice(m.index, m.index + m[0].length + 40).split("?")[0]);
      const negated =
        (!question && /\b(?:don't|do not|never|won't|will not|not|can't|cannot|no|wouldn't|shouldn't|stop)\s+(?:\w+\s+){0,2}$/.test(before)) ||
        /\bas if\b[^.!?]*$/.test(before);
      desires.push({
        cat: d.cat,
        act: d.act,
        who: speaker,
        partner: ctx.partnerOf(speaker),
        role: d.role,
        wants: !negated,
        kind: d.kind,
        weight: d.weight ?? (d.kind === "ogling" ? 0.6 : 1),
        para: pi,
        sentence: `“${line.trim()}”`,
      });
    }
  }

  /** Is this "fuck me" an exclamation rather than a request? */
  function exasperated(line: string, at: number, around: { sexy: boolean; after: string; before: string }): boolean {
    const before = line.slice(0, at);
    const after = line.slice(at + "fuck me".length);
    // A request says so: "please fuck me", "fuck me harder", "just fuck me already", "I need you to fuck me".
    const request =
      /\b(?:please|just|now|need|want|wanna|gonna|going to|will you|would you|can you|could you|come on|c'mon|you should|to)\s+(?:\w+\s+)?$/.test(before) ||
      /^[,!]?\s*(?:please|harder|faster|deeper|now|already|properly|slow(?:ly)?|hard|raw|open|good|right there|until|so|like|with (?:your|that|those) (?:cock|dick|fingers?|tongue|strap)|into|through|against|on|over (?:the|this|that|my)|from behind|again)\b/.test(after);
    if (request) return false;
    // "Sure you won't fuck me?" is asking for it.
    if (/^\s*\?/.test(after)) return false;
    // "Oh, fuck me", "well fuck me", "holy shit, fuck me"
    if (/\b(?:oh|well|ah|god|jesus|christ|holy|bloody|shit|man|dude|ugh|wow|damn|hell|lord|mate|boy|seriously|honestly)\b[\s,!.]*$/.test(before)) return true;
    // An idiom: "fuck me sideways / running / dead / twice / gently with a chainsaw", "fuck me if I know"
    if (/^[,!]?\s*(?:sideways|running|dead|twice|blind|pink|silly|gently with|with a (?:spoon|chainsaw|cactus|rake|brick)|if\b|in the|up\b|over\b(?!\s+(?:the|this|that|my))|three ways|backwards)/.test(after)) return true;
    // A new clause after it: "Fuck me, it's cold", "fuck me, you're right", "fuck me, what a day"
    if (/^\s*[,!.—-]+\s*(?:i\b|i'm|i've|i'd|you're|you've|you were|it|it's|that|that's|this|there|we|he|she|they|what|how|why|who|where|when|look at|these|those|the|a\b|an\b|my|our|his|her)/.test(after)) return true;
    // Said like a curse: "Fuck me," he muttered / swore / sighed.
    if (/^\s*[,!.]?\W*\s*(?:\w+\s+){0,2}(?:mutter|swor|swear|curs|sigh|grumbl|groan(?:ed)? in (?:frustration|disbelief)|laugh|snort|scoff|exclaim|whistl)\w*/i.test(around.after)) return true;
    // Nothing sexual happening around it, and nothing marking it as a request.
    return !around.sexy;
  }

  /** Whether a paragraph mentions a cock, an ass, fingers or other sex-scene context (cached). */
  function bodyContext(i: number): boolean {
    if (i < 0 || i >= paras.length) return false;
    let v = bodyCtxCache.get(i);
    if (v === undefined) {
      const p = paras[i];
      v = PENIS_CTX.test(p) || ANAL_CTX.test(p) || FINGER_CTX.test(p) ||
        /\b(?:naked|legs\s+(?:apart|wide|open)|spread|thighs|hips|lube\w*|slick\w*|condom)\b/i.test(p);
      bodyCtxCache.set(i, v);
    }
    return v;
  }

  function handleMatch(
    pat: CompiledPattern,
    m: RegExpMatchArray,
    sent: string,
    original: string,
    pi: number,
    fantasyPara: boolean,
    para: string,
  ) {
    ctx.cutoff = m.index! + m[0].length;
    const tTok = groupValue(m.groups, "t");
    const bTok = groupValue(m.groups, "b");
    let subjChar: Character | undefined;
    if (pat.elided) {
      // ", the plug bumps against…": a determiner after the trigger starts a new subject, not a left-out one.
      if (/^\W*(?:(?:and|then|of|about|before|after|while|by|without|from|to)\s+)?(?:the|a|an|this|that|these|those|its)\s/i.test(m[0])) return;
      const before = sent.slice(0, m.index);
      const trigger = /^\W*(\w+)/.exec(m[0])?.[1]?.toLowerCase() ?? "";
      const lastWord = (before.trim().split(/\s+/).pop() ?? "").replace(/[,;]$/, "");
      if (/^(?:kept|started|began|continued|finished|enjoyed|loved|tried|resumed)$/.test(trigger)) {
        // "…began pushing into him": whoever began must be right before it ("a finger began…" isn't a person).
        subjChar = resolveToken(lastWord, sent.slice(m.index!));
      } else if (trigger === "to") {
        // "asked Draco to fuck him" → Draco; "rose up on his knees to slide into him" → the clause's subject.
        const clauseSubj = elidedSubject(before, sent.slice(m.index!));
        subjChar = /^(?:him|her|them)$/.test(lastWord)
          ? clauseSubj && ctx.partnerOf(clauseSubj)
          : (resolveToken(lastWord, sent.slice(m.index!)) ?? clauseSubj);
      } else {
        // "…as a finger breached him, sliding inside": the clause right before has a thing for its subject,
        // so the left-out subject is that thing, not a person.
        const lastClause = before.trimEnd().replace(/[,;]$/, "").split(/[,;:—]|\b(?:as|when|while|whenever|because|until|since|though|although|and|but|then)\b/).pop()?.trim() ?? "";
        if (/^(?:it|this|that|the|a|an|one|another|something)\b/i.test(lastClause) && /\b\w+(?:s|ed)\b/.test(lastClause)) return;
        subjChar = elidedSubject(before, sent.slice(m.index!));
      }
      if (!subjChar) return;
    }
    // "Castiel grabbed his leg and, using it as leverage, he started thrusting": "he" is the nearest clause's subject.
    const subjTok = pat.subj === "t" ? tTok : bTok;
    // "When Alex manages…, one of his digits slips lower": a possessive pronoun works the same way.
    const nearSubj =
      !pat.elided && subjTok && (pronoun(subjTok) || /^(?:[Hh]is|[Hh]er|[Tt]heir)$/.test(subjTok)) && m.index! > 0
        ? elidedSubject(sent.slice(0, m.index), sent.slice(m.index!))
        : undefined;
    const co = /([\p{L}'’]+)\s+and\s+$/u.exec(sent.slice(0, m.index));
    const coChar = co ? resolveToken(co[1]) : undefined;
    ctx.coSubjects = new Set(coChar ? [coChar] : []);
    ctx.curCat = pat.cat;
    const resolved = resolvePair(tTok, bTok, pat.subj, cast, ctx, subjChar, nearSubj);
    if (process.env.DBG && /rode him hard|let you fuck me|snug around Dean/.test(original)) console.log("HM", pat.id, JSON.stringify(m[0].slice(0,60)), tTok, bTok, nearSubj?.name, subjChar?.name, resolved?.top?.name, resolved?.bottom?.name);
    ctx.coSubjects.clear();
    if (!resolved) return;
    let { top, bottom } = resolved as { top: Character; bottom: Character };
    let { basis } = resolved;
    let act = pat.act;
    let cat = pat.cat;
    let weight = pat.weight * (basis === "named" ? 1 : basis === "pronoun" ? 0.75 : 0.5);
    const matchText = m[0];
    const after = sent.slice(m.index! + matchText.length, m.index! + matchText.length + 70);

    // Refinements.
    if (pat.id === "fuck") {
      if (/^\s+(?:[\w']+\s+){0,4}?with\s+(?:his|her|their|my|your)\s+tongue\b/.test(after)) { cat = "oral"; act = "rimming"; }
      else if (/^\s+(?:[\w']+\s+){0,4}?with\s+(?:his|her|their|my|your|a|one|two|three|four)\s+(?:\w+\s+)?(?:fingers?|digits?|knuckles?)\b/.test(after)) act = "fingering";
      else if (/^\s+(?:[\w']+\s+){0,3}?(?:between|with)\s+(?:his|her|their|my|your)\s+(?:thighs|breasts|tits|hand|fist)\b/.test(after)) return;
      else if (/^\s+(?:[\w']+\s+){0,4}?with\s+(?:a|the|her|his|their|my|your)\s+(?:strap|dildo|toy|vibrator|plug)/.test(after)) act = "anal sex (strap-on/toy)";
    }
    // "cupping his cheeks" while kissing: a face, not an ass.
    if (pat.id.startsWith("grab-ass") && /cheeks\b/.test(matchText) && !/\b(?:ass|arse|butt|bum)\b/i.test(matchText) &&
        (/\bcup\w*\b/i.test(matchText) || /\b(?:kiss\w*|face|eyes?|tears?|lips|jaw|blush\w*|flush\w*|smil\w*|forehead|nose)\b/i.test(sent))) return;
    // "…until the ridges of Alex's knuckles … each time they slide past his rim": "they" are the fingers.
    // They're fingering, by whoever owns the fingers ("Alex's knuckles", "his fingers").
    if (/^they$/i.test(tTok ?? "") && /\b(?:fingers?|knuckles?|digits?|hands?|toys?|thumbs?)\b/i.test(sent.slice(0, m.index))) {
      if (cat !== "anal") return;
      const own = new RegExp(`\\b((?:${NAMES})|${EPITHET_TOKEN}|[Hh]is|[Hh]er|[Tt]heir|[Mm]y)(?:['’]s)?\\s+(?:[\\w-]+\\s+){0,2}?(?:fingers?|knuckles?|digits?|thumbs?)\\b`).exec(sent.slice(0, m.index));
      const tok = own ? stripPoss(own[1]) : "";
      const owner = cast.byAlias.get(tok) ?? (ctx.token(tok) || undefined) ?? (own && pronoun(tok) ? elidedSubject(sent.slice(0, own.index)) : undefined);
      const other = owner ? ctx.partnerOf(owner) : undefined;
      if (!owner || !other) return;
      [top, bottom] = [owner, other];
      act = "fingering";
    }
    // "Alex shudders and presses in harder" while kissing: not penetration.
    if (pat.id.startsWith("pushed-in") && /\bkiss/i.test(sent) && !ANAL_CTX.test(sent)) return;
    // A bare "as he sank in" (into a hug, a bath) needs a cock, an ass or fingers somewhere in the paragraph.
    if (pat.id.startsWith("pushed-in") && !/\b(?:thrust|fuck|rut|snap|pound|slam)/i.test(matchText)) {
      if (![pi - 2, pi - 1, pi, pi + 1].some(bodyContext)) return;
    }
    // "opened the car door and slipped inside": a place, not a person.
    if (pat.id.startsWith("pushed-in") && /\b(?:door|car|truck|van|cab|taxi|room|house|building|shop|store|bar|elevator|lift|tent|cabin|Impala|apartment|office|kitchen|bathroom)\b/.test(sent.slice(0, m.index))) return;
    // "He hollowed his cheeks, creating a suction for Cas": the one named after "for" is getting sucked.
    if (pat.id.startsWith("hollowed-cheeks")) {
      const forName = new RegExp(`^[^.;]{0,40}?\\bfor\\s+(${NAMES})\\b`).exec(sent.slice(m.index! + matchText.length));
      const named = forName ? cast.byAlias.get(forName[1]) : undefined;
      if (named && named !== top) {
        top = named;
        if (bottom === named) bottom = ctx.partnerOf(named) ?? bottom;
      }
    }
    // "…slipping inch by inch, until Alex finally bottoms": he bottomed out, so he's the top.
    if (pat.id.startsWith("bottomed-for") && !/\bfor\b/.test(matchText) && /\b(?:finally|fully|all the way)\s+bottom/.test(matchText + " " + sent) && /\b(?:inch|slid|slip|push|sank|sink|thrust|sheath|buri|bury|eas)/i.test(sent)) {
      [top, bottom] = [bottom, top];
    }
    // "Harry wraps a hand around Louis's cock and guides the tip into his mouth": the cock named earlier is
    // the one in the mouth, so its owner tops and the one guiding it bottoms.
    if (pat.id.startsWith("cock-to-lips") && !/['’]s\s+(?:[\w-]+\s+){0,2}(?:cock|dick|prick|length|shaft|erection)\b/.test(matchText)) {
      const owner = new RegExp(`\\b(${NAMES})['’]s\\s+(?:[\\w-]+\\s+){0,2}(?:cock|dick|prick|length|shaft|erection)\\b`).exec(sent.slice(0, m.index));
      const oc = owner ? cast.byAlias.get(owner[1]) : undefined;
      if (oc && oc !== top) [top, bottom] = [oc, top];
    }
    // "…when a second finger began pushing into him": fingers named in the sentence (and no cock) mean fingering.
    if (cat === "anal" && act.startsWith("anal sex") && !PENIS_CTX.test(matchText) && FINGER_CTX.test(matchText + " " + sent) && !PENIS_CTX.test(sent)) act = "fingering";
    if (pat.id === "prostate" && FINGER_CTX.test(sent) && !PENIS_CTX.test(sent)) act = "fingering";

    // Hints, not acts: checking out an ass, grabbing it, staring at a bulge...
    if (pat.signal) {
      const prefix = sent.slice(0, m.index);
      if (NEG.test(m.groups?.aux ?? "") || NEG.test(prefix.slice(-40))) return;
      if (pat.signal.kind === "fingers" && /\bown\b/i.test(matchText)) return;
      const actor = (pat.signal.actor ?? pat.subj) === "t" ? top : bottom;
      if (desires.some((d) => d.sentence === original && d.cat === cat && d.kind === pat.signal!.kind && d.who === actor)) return;
      const other = actor === top ? bottom : top;
      desires.push({
        cat,
        act,
        who: actor,
        partner: other,
        role: pat.signal.actorRole,
        wants: true,
        kind: pat.signal.kind,
        weight,
        para: pi,
        sentence: original,
      });
      return;
    }

    // Anal or vaginal? Decided by the words used (male omegas and trans men can have vaginas),
    // falling back to anatomy when the text doesn't say.
    let holeGuess: ActHit["holeGuess"];
    if (cat === "anal" || cat === "vaginal") {
      const hole = holeType(matchText, sent, para, top, bottom);
      const said = holeType(matchText, sent, "", top, bottom, true);
      // A man who may have a vagina, and the sentence doesn't say: decide from how his other scenes went.
      if (cat === "anal" && said === "ambiguous" && bottom.gender !== "f" && bottom.vulva !== false && cast.maleVulva) holeGuess = hole;
      else if (said !== "ambiguous") {
        const v = holeVotes.get(bottom) ?? { anal: 0, vaginal: 0 };
        v[said]++;
        holeVotes.set(bottom, v);
      }
      if (cat === "vaginal") {
        // "Had sex"/"made love": only vaginal if someone involved has a vagina and nothing says anal.
        const canVaginal = top.vulva !== false || bottom.vulva !== false;
        if (!canVaginal || hole === "anal" || ANAL_CTX.test(sent)) return;
        if (top.vulva !== true && bottom.vulva !== true && hole !== "vaginal") return;
      } else if (hole === "vaginal") {
        cat = "vaginal";
        act = act === "fingering" ? "fingering" : "vaginal sex";
      } else if (hole === "ambiguous" && !holeGuess) {
        ambiguousHoles++;
        return;
      } else if (top.penis === false && act !== "fingering" && !/\b(?:strap|dildo|toy|peg\w*|harness)\b/i.test(para)) {
        // A woman "fucking" someone with no strap-on mentioned: not anal penetration by her.
        return;
      }
    }
    if (act === "rimming" && (VULVA_CTX.test(matchText) || (bottom.vulva === true && !ANAL_CTX.test(para)))) act = "cunnilingus";
    if (pat.femaleTarget && !PENIS_CTX.test(matchText)) {
      // "went down on her": the receiver has a vagina, so it's cunnilingus and the licker is the top.
      const receiverHasVulva = (top.vulva === true && top.penis !== true) || (top.vulva === "maybe" && VULVA_CTX.test(sent));
      if (receiverHasVulva) {
        if (pat.femaleTarget === "drop") return;
        [top, bottom] = [bottom, top];
        act = "cunnilingus";
      }
    }
    if (pat.id === "enter" && /\b(?:took|take|takes|taking)\b/.test(matchText)) weight *= 0.5;
    // "them"/"it" may be a thing, not a person ("sucks them into his mouth" = fingers): require the
    // sentence to name the body part the act needs.
    const thing = (tok?: string) => /^(?:them|it)$/i.test(tok ?? "");
    if (thing(tTok) || thing(bTok)) {
      const needs = act === "rimming" ? ANAL_CTX : cat === "oral" ? PENIS_CTX : new RegExp(`${PENIS_CTX.source}|${ANAL_CTX.source}`, "i");
      if (!needs.test(sent)) return;
    }

    // Questions ("Did Harry fuck him?") don't say it happened.
    if (/\?\s*["”’)]*\s*$/.test(original)) return;

    // Act, or desire/fantasy/hypothetical?
    const prefix = sent.slice(0, m.index);
    // Negation and desire only reach as far as their own clause: "Steve doesn't complain as Sam enters him".
    const clause =
      prefix.split(/[;:]|,\s+(?:and|but|then|so)\s+|\b(?:and then|but then)\b|—|\b(?:as|while|when|whenever|because|until|after|since|though|although|whereas|but|and)(?:\s+|$)/).pop() ?? "";
    const window = clause.slice(-90);
    const aux = m.groups?.aux ?? "";
    const negated = NEG.test(aux) || NEG.test(window.slice(-40));
    let kind: Desire["kind"] | "act" = "act";
    if (fantasyPara || FANTASY.test(window) || STRONG_FANTASY.test(prefix)) kind = "fantasy";
    else if (DESIRE.test(window) || DESIRE.test(aux) || DESIRE.test(m.groups?.lead ?? "")) kind = "wanted";
    else if (HABIT_AUX.test(aux) && (pat.id === "bottomed-for" || pat.id === "topped")) kind = "identity";
    else if (HYPO_AUX.test(aux) || HYPO_WINDOW.test(window)) kind = "hypothetical";

    if (kind === "act") {
      if (negated) return;
      acts.push({ cat, act, top, bottom, weight, basis, para: pi, sentence: original, holeGuess });
      ctx.setPartners(cat, top, bottom);
      ctx.lastSubject = pat.subj === "t" ? top : bottom;
      return;
    }

    // Whose desire is it? The first person mentioned before the desire word, else the subject.
    const exp = firstEntity(window) ?? (pat.subj === "t" ? top : bottom);
    const role: Role | undefined = exp === top ? "top" : exp === bottom ? "bottom" : undefined;
    if (!role) return;
    desires.push({
      cat,
      act,
      who: exp,
      partner: role === "top" ? bottom : top,
      role,
      wants: !negated,
      kind,
      weight: kind === "hypothetical" ? 0.6 : 1,
      para: pi,
      sentence: original,
    });
  }

  /** Which hole a penetration sentence is about: the nearest explicit word wins, then anatomy. */
  function holeType(
    matchText: string,
    sent: string,
    para: string,
    top: Character,
    bottom: Character,
    /** Only what the words in the sentence say ("ambiguous" if they don't). */
    wordsOnly = false,
  ): "anal" | "vaginal" | "ambiguous" {
    for (const scope of [matchText, sent]) {
      const v = VULVA_CTX.test(scope);
      const a = ANAL_CTX.test(scope);
      if (v && !a) return "vaginal";
      if (a && !v) return "anal";
    }
    if (wordsOnly) return "ambiguous";
    // A woman with no penis "fucking" someone without a strap-on: it's her vagina involved.
    if (top.penis === false && top.vulva === true && !/\b(?:strap|dildo|toy|peg\w*|harness)\b/i.test(para)) return "vaginal";
    const v = VULVA_CTX.test(para);
    const a = ANAL_CTX.test(para);
    if (bottom.vulva === false) return "anal";
    if (bottom.vulva === true && bottom.gender === "f") return a && !v ? "anal" : "vaginal";
    // A man who may have a vagina (omegaverse, trans): go by the paragraph, otherwise we can't tell.
    if (v && !a) return "vaginal";
    if (a && !v) return "anal";
    return bottom.vulva === "maybe" && cast.maleVulva ? "ambiguous" : "anal";
  }

  // ───────────── aggregate ─────────────

  // Settle the scenes that didn't say which hole by the bottom's clearly worded ones.
  acts = acts.filter((a) => {
    if (!a.holeGuess) return true;
    const v = holeVotes.get(a.bottom) ?? { anal: 0, vaginal: 0 };
    const hole = v.vaginal > v.anal ? "vaginal" : v.anal > v.vaginal ? "anal" : a.holeGuess;
    if (hole === "ambiguous") {
      // Two men and nothing says which: anal is the safe default.
      if (a.top.gender === "m" && a.bottom.gender === "m") {
        defaultedAnal++;
        return true;
      }
      ambiguousHoles++;
      return false;
    }
    if (hole === "vaginal") {
      a.cat = "vaginal";
      a.act = a.act === "fingering" ? "fingering" : "vaginal sex";
    }
    return true;
  });

  const where = (pi: number) => chapters[pi] || `~${Math.round((pi / Math.max(1, paras.length)) * 100)}% through`;
  const pairKey = (a: Character, b: Character) => [a.name, b.name].sort().join("\u0000");
  const pairOrder = new Map<string, [Character, Character]>();
  for (const p of cast.pairings) if (!pairOrder.has(pairKey(p[0], p[1]))) pairOrder.set(pairKey(p[0], p[1]), p);

  const keys = new Set<string>();
  for (const a of acts) keys.add(pairKey(a.top, a.bottom));
  for (const d of desires) if (d.partner) keys.add(pairKey(d.who, d.partner));
  const mainPair = cast.pairings[0];
  if (mainPair) keys.add(pairKey(mainPair[0], mainPair[1]));

  const results: (PairingResult & { weight: number; key: string })[] = [];
  for (const key of keys) {
    const pActs = acts.filter((a) => pairKey(a.top, a.bottom) === key);
    const pDes = desires.filter((d) => d.partner && pairKey(d.who, d.partner) === key);
    const tagged = pairOrder.get(key);
    const members = tagged ?? (pActs[0] ? [pActs[0].top, pActs[0].bottom] : pDes[0] ? [pDes[0].who, pDes[0].partner!] : undefined);
    if (!members) continue;
    const isMain = !!mainPair && key === pairKey(mainPair[0], mainPair[1]);
    const pairTags = tagsFor(tags, members as [Character, Character], isMain);
    const pair = members as [Character, Character];
    const anal = buildAct("anal", pActs.filter((a) => a.cat === "anal"), pDes.filter((d) => d.cat === "anal"), pairTags, pair, meta, where);
    const oral = buildAct("oral", pActs.filter((a) => a.cat === "oral"), pDes.filter((d) => d.cat === "oral"), pairTags, pair, meta, where);
    const vaginal = buildVaginal(pActs.filter((a) => a.cat === "vaginal"), pair, meta, where);
    const weight = pActs.reduce((n, a) => n + a.weight, 0) + pDes.length * 0.2 + (isMain ? 0.01 : 0);
    // Skip incidental pairs with almost nothing (likely misresolved pronouns); a tagged pair needs less.
    if (!isMain && weight < (tagged ? 0.5 : 1.2)) continue;
    results.push({ pairing: `${members[0].name}/${members[1].name}`, anal, oral, vaginal, weight, key });
  }
  results.sort((a, b) => b.weight - a.weight);

  const notes: string[] = [];
  if (hasUncertainNotes) notes.push("Some AO3 chapter-note text had an unclear boundary and was excluded from pattern analysis.");
  if (!meta.relationships.length && !meta.characters.length && cast.chars.length) {
    notes.push(`No AO3 tags in this file, so characters were guessed from the text: ${cast.chars.map((c) => c.name).join(", ")}.`);
  } else if (!meta.relationships.length && cast.pairings.length) {
    notes.push("No relationship tags, so pairings were worked out from who has sex with whom in the text.");
  }
  const originals = cast.chars.filter((c) => c.original);
  if (originals.length) {
    notes.push(`Original characters, named from the text: ${originals.map((c) => c.name).join(", ")}.`);
  }
  if (cast.narrator) notes.push(`First-person narration: “I” is read as ${cast.narrator.name}.`);
  if (cast.secondPerson) notes.push(`Second-person narration: “you” is read as ${cast.secondPerson.name}.`);
  if (cast.maleVulva || cast.chars.some((c) => c.gender !== "f" && c.vulva === true)) {
    notes.push(
      `At least one male character has a vagina here (e.g. omegaverse or trans), so each scene was sorted into anal or vaginal by the words used${defaultedAnal ? `; ${plural(defaultedAnal, "sentence")} between two men didn't say which and ${defaultedAnal === 1 ? "was" : "were"} counted as anal` : ""}${ambiguousHoles ? `; ${plural(ambiguousHoles, "sentence")} didn't say which and ${ambiguousHoles === 1 ? "was" : "were"} left out` : ""}.`,
    );
  }
  if (!opts.quiet) {
    notes.push(
      "Pattern matching reads sentences like “X sucked Y off” or “his tongue in X’s hole”. It can miss unusual phrasing and sometimes guesses wrong when both people are “he” or “she”, so check the quoted lines. Ask Claude for a second opinion on anything marked Low.",
    );
  }

  const romantic = romanticPairings(meta);
  return {
    source: "patterns",
    fandom: meta.fandoms.join(", "),
    main_pairing: romantic[0] ?? results[0]?.pairing ?? "",
    pairings: results.map(({ pairing, anal, oral, vaginal }) => ({ pairing, anal, oral, vaginal })),
    notes: notes.join(" "),
  };
}

// ───────────── vaginal sex (occurrence only) ─────────────

function buildVaginal(hits: ActHit[], pair: [Character, Character], meta: Ao3Meta, where: (pi: number) => string): VaginalResult {
  const applicable = hits.length > 0 || pair.some((c) => c.vulva === true);
  const reasons: string[] = [];
  const instances: Instance[] = [];
  for (const scene of groupScenes(hits, where)) {
    const best = [...scene.hits].sort((a, b) => b.weight - a.weight || (a.basis === "named" ? -1 : 1))[0];
    const acts = [...new Set(scene.hits.map((h) => h.act))];
    instances.push({
      top: best.top.name,
      bottom: best.bottom.name,
      act: acts.join(", "),
      where: where(scene.first),
      evidence: truncate(best.sentence),
      basis: best.basis,
    });
  }
  const sex = hits.filter((h) => h.act !== "fingering");
  const occurs = sex.length > 0;
  const between = `${pair[0].name} & ${pair[1].name}`;
  let summary: string;
  let score: number;
  if (occurs) {
    const scenes = instances.filter((i) => i.act !== "fingering").length;
    const w = sex.reduce((n, h) => n + h.weight, 0);
    summary = `Yes, between ${between} (${plural(scenes, "scene")}).`;
    score = 0.4 + 0.55 * (1 - Math.exp(-w / 1.5));
    const named = sex.filter((h) => h.basis === "named").length;
    reasons.push(`${plural(sex.length, "matching sentence")} (${named} with names)`);
    if (instances.length > scenes) summary += " Also vaginal fingering.";
  } else {
    summary = hits.length ? `Only vaginal fingering (${between}).` : "No vaginal sex recognized.";
    const explicit = /explicit|mature/i.test(meta.rating ?? "");
    score = explicit ? 0.45 : meta.rating ? 0.75 : 0.5;
    reasons.push(explicit ? `rated ${meta.rating}, so something may have been missed` : "no matching sentences");
  }
  return { occurs, applicable, summary, instances, confidence: { score, label: confidenceLabel(score), reasons } };
}

// ───────────── per-act verdicts ─────────────

interface PairTags {
  roles: { char: Character; role: "top" | "bottom" | "switch"; tag: string }[];
  switching: string[];
  actTags: { anal: string[]; oral: string[] };
}

function tagsFor(info: TagInfo, pair: [Character, Character], isMain: boolean): PairTags {
  return {
    roles: info.roles.filter((r) => pair.includes(r.char)),
    switching: isMain ? info.switching : [],
    actTags: isMain ? { anal: info.anal, oral: info.oral } : { anal: [], oral: [] },
  };
}

interface Scene {
  first: number;
  hits: ActHit[];
}

function groupScenes(hits: ActHit[], chapterOf: (pi: number) => string): Scene[] {
  const scenes: Scene[] = [];
  for (const h of [...hits].sort((a, b) => a.para - b.para)) {
    const last = scenes[scenes.length - 1];
    const lastPara = last?.hits[last.hits.length - 1].para ?? -1e9;
    if (last && h.para - lastPara <= 20 && chapterOf(h.para) === chapterOf(last.first)) last.hits.push(h);
    else scenes.push({ first: h.para, hits: [h] });
  }
  return scenes;
}

function truncate(s: string, n = 240) {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function buildAct(
  cat: Cat,
  hits: ActHit[],
  des: DesireHit[],
  tags: PairTags,
  pair: [Character, Character],
  meta: Ao3Meta,
  where: (pi: number) => string,
): ActResult {
  const otherOf = (name: string) => pair.find((c) => c.name !== name)?.name;
  const label = cat === "anal" ? "anal sex" : "oral sex";
  const reasons: string[] = [];
  const instances: Instance[] = [];

  // Scenes, each with a direction (or two, if they switch mid-scene).
  const decisive = hits.filter((h) => !(cat === "anal" && h.act === "fingering"));
  const fingering = hits.filter((h) => cat === "anal" && h.act === "fingering");
  const sceneTops = new Map<string, { char: Character; partner: Character; scenes: number; weight: number; strong: boolean }>();
  for (const scene of groupScenes(decisive, where)) {
    const dirs = new Map<string, ActHit[]>();
    for (const h of scene.hits) {
      const k = h.top.name;
      dirs.set(k, [...(dirs.get(k) ?? []), h]);
    }
    const total = scene.hits.reduce((n, h) => n + h.weight, 0);
    for (const [, hs] of dirs) {
      const w = hs.reduce((n, h) => n + h.weight, 0);
      if (w < Math.max(0.2, total * 0.3)) continue; // a stray hit against the scene's majority
      const best = [...hs].sort((a, b) => b.weight - a.weight || (a.basis === "named" ? -1 : 1))[0];
      const acts = [...new Set(hs.map((h) => h.act))];
      instances.push({
        top: best.top.name,
        bottom: best.bottom.name,
        act: acts.join(", "),
        where: where(scene.first),
        evidence: truncate(best.sentence),
        basis: best.basis,
      });
      const entry = sceneTops.get(best.top.name) ?? { char: best.top, partner: best.bottom, scenes: 0, weight: 0, strong: false };
      entry.scenes++;
      entry.weight += Math.min(w, 3);
      entry.strong ||= hs.some((h) => h.basis === "named") || w >= 1.5;
      sceneTops.set(best.top.name, entry);
    }
  }
  for (const scene of groupScenes(fingering, where)) {
    const best = [...scene.hits].sort((a, b) => b.weight - a.weight)[0];
    instances.push({
      top: best.top.name,
      bottom: best.bottom.name,
      act: "fingering",
      where: where(scene.first),
      evidence: truncate(best.sentence),
      basis: best.basis,
    });
  }

  const ranked = [...sceneTops.values()].sort((a, b) => b.weight - a.weight);
  const major = ranked[0];
  const minor = ranked[1];

  let verdict: ActResult["verdict"] = "none";
  let top = "";
  let bottom = "";
  let summary = "";
  let base = 0;

  const totalW = ranked.reduce((n, r) => n + r.weight, 0);
  const evidence = 1 - Math.exp(-totalW / 1.8);

  if (major) {
    top = major.char.name;
    bottom = major.partner.name;
    const isSwitch = !!minor && (minor.scenes >= 2 || minor.strong);
    if (isSwitch) {
      verdict = "switch";
      summary = `They switch: ${major.char.name} tops in ${plural(major.scenes, "scene")}, ${minor.char.name} in ${plural(minor.scenes, "scene")}.`;
      base = evidence * (0.55 + 0.45 * Math.min(1, minor.weight / 2));
      reasons.push(`${plural(major.scenes + minor.scenes, "scene")} found, with each person on top at least once`);
    } else {
      verdict = "one_way";
      const consistency = major.weight / totalW;
      summary = `${major.char.name} tops (${plural(major.scenes, "scene")}).`;
      if (minor) summary += ` One possible exception where ${minor.char.name} tops — check the quoted line.`;
      base = evidence * (0.45 + 0.55 * consistency);
      reasons.push(`${plural(major.scenes, "scene")} with ${major.char.name} on top${minor ? `, 1 weak contrary hit` : ""}`);
    }
    const named = decisive.filter((h) => h.basis === "named").length;
    const viaPronoun = decisive.length - named;
    reasons.push(`${plural(decisive.length, "matching sentence")} (${named} with names, ${viaPronoun} worked out from pronouns/context)`);
    if (decisive.length && named / decisive.length < 0.25) {
      base *= 0.85;
      reasons.push("mostly pronoun-based, which is less reliable");
    }
  }

  if (cat === "anal" && fingering.length) {
    const ft = new Map<string, number>();
    for (const f of fingering) ft.set(`${f.top.name} fingers ${f.bottom.name}`, (ft.get(`${f.top.name} fingers ${f.bottom.name}`) ?? 0) + 1);
    const fs = [...ft.keys()].join("; ");
    summary += summary ? ` Fingering: ${fs}.` : `No anal sex recognized; fingering only (${fs}).`;
  }

  // ── tags ──
  const tagTops = tags.roles.filter((r) => r.role === "top");
  const tagBottoms = tags.roles.filter((r) => r.role === "bottom");
  const tagSwitch = tags.roles.filter((r) => r.role === "switch").length > 0 || tags.switching.length > 0;
  const roleTagsApply = cat === "anal"; // AO3 Top/Bottom tags describe anal roles
  let tagAdj = 0;
  if (roleTagsApply) {
    if (verdict === "one_way") {
      const agree = tagTops.some((r) => r.char.name === top) || tagBottoms.some((r) => r.char.name === bottom);
      const conflict = tagTops.some((r) => r.char.name === bottom) || tagBottoms.some((r) => r.char.name === top);
      if (agree && !conflict) { tagAdj += 0.25; reasons.push(`agrees with tag “${[...tagTops, ...tagBottoms][0].tag}”`); }
      if (conflict && !agree) { tagAdj -= 0.3; reasons.push(`conflicts with tag “${[...tagTops, ...tagBottoms].find((r) => r.char.name === top || r.char.name === bottom)!.tag}”`); }
      if (conflict && agree) reasons.push("tags list both people as top/bottom (possible switching)");
      if (tagSwitch) { tagAdj -= 0.1; reasons.push(`tagged “${tags.switching[0] ?? "switch"}” but only one direction found in the text`); }
    } else if (verdict === "switch") {
      if (tagSwitch || (tagTops.length && tagBottoms.length)) { tagAdj += 0.2; reasons.push(`agrees with tag “${tags.switching[0] ?? tags.roles[0].tag}”`); }
      else if (tagTops.length || tagBottoms.length) reasons.push(`tagged “${(tagTops[0] ?? tagBottoms[0]).tag}”, but the text shows switching`);
    }
  }
  const actTags = cat === "anal" ? tags.actTags.anal : tags.actTags.oral;
  if (actTags.length && verdict !== "none") {
    tagAdj += 0.05;
    reasons.push(`tagged “${actTags[0]}”`);
  }

  // ── desire, fantasy & other signals ──
  // Ogling/touching/fingering hints only mean something for same-sex pairs.
  const sameSex = pair[0].gender === pair[1].gender || pair[0].gender === "u" || pair[1].gender === "u";
  const sig: DesireHit[] = des.filter((d) => sameSex || (d.kind !== "ogling" && d.kind !== "touch" && d.kind !== "prep" && d.kind !== "fingers" && d.kind !== "solo"));
  if (cat === "anal" && sameSex) {
    for (const f of fingering) {
      sig.push({ cat, act: "fingering", who: f.top, partner: f.bottom, role: "top", wants: true, kind: "fingering", weight: 0.8, para: f.para, sentence: f.sentence });
    }
  }
  const desireOut: Desire[] = sig
    .filter((d) => d.kind !== "fingering") // fingering is already listed under scenes
    .map((d) => ({
      who: d.who.name,
      role: d.role,
      wants: d.wants,
      kind: d.kind,
      act: d.act,
      where: where(d.para),
      evidence: truncate(d.sentence),
    }));
  // Every hint "points" to a top: wanting to bottom (or not wanting to top) means the partner tops.
  const desireTop = (d: DesireHit) => ((d.role === "top") === d.wants ? d.who.name : d.partner?.name);
  const isBehaviour = (d: DesireHit) => d.kind === "ogling" || d.kind === "touch" || d.kind === "fingering" || d.kind === "prep" || d.kind === "fingers" || d.kind === "solo";
  const tally = { desAgree: 0, desConflict: 0, behAgree: 0, behConflict: 0, wAgree: 0, wConflict: 0 };
  for (const d of sig) {
    const pointsTo = desireTop(d);
    if (!pointsTo || verdict === "none") continue;
    const agrees = verdict === "switch" || pointsTo === top;
    if (agrees) { tally.wAgree += d.weight; isBehaviour(d) ? tally.behAgree++ : tally.desAgree++; }
    else { tally.wConflict += d.weight; isBehaviour(d) ? tally.behConflict++ : tally.desConflict++; }
  }
  let desAdj = Math.min(0.2, tally.wAgree * 0.05) - Math.min(0.2, tally.wConflict * 0.05);
  if (verdict !== "none") {
    if (tally.desAgree) reasons.push(`${plural(tally.desAgree, "desire/fantasy line")} ${tally.desAgree === 1 ? "points" : "point"} the same way`);
    if (tally.desConflict) reasons.push(`${plural(tally.desConflict, "desire/fantasy line")} ${tally.desConflict === 1 ? "points" : "point"} the other way`);
    if (tally.behAgree) reasons.push(`${plural(tally.behAgree, "other signal")} (fingering, ogling, touching, lead-up) ${tally.behAgree === 1 ? "agrees" : "agree"}`);
    if (tally.behConflict) reasons.push(`${plural(tally.behConflict, "other signal")} (fingering, ogling, touching, lead-up) ${tally.behConflict === 1 ? "disagrees" : "disagree"}`);
  }

  // ── nothing found on-page ──
  if (verdict === "none") {
    const hasTagRoles = roleTagsApply && (tagTops.length || tagBottoms.length || tagSwitch);
    const pointing = new Map<string, number>();
    for (const d of sig) {
      const p = desireTop(d);
      if (p) pointing.set(p, (pointing.get(p) ?? 0) + d.weight);
    }
    const desireRank = [...pointing.entries()].sort((a, b) => b[1] - a[1]);

    if (hasTagRoles) {
      verdict = tagSwitch ? "switch" : "one_way";
      const t = tagTops[0]?.char.name ?? (tagBottoms[0] ? otherOf(tagBottoms[0].char.name) : "");
      const b = tagBottoms[0]?.char.name ?? (tagTops[0] ? otherOf(tagTops[0].char.name) : "");
      top = t ?? "";
      bottom = b ?? "";
      summary = `Not found in the text; going by AO3 tags: ${[...tags.roles.map((r) => r.tag), ...tags.switching].join(", ")}.` + (summary ? ` ${summary}` : "");
      base = 0.45;
      reasons.push("based on AO3 tags only — no matching sentences found");
      if (desireRank.length) {
        const agrees = desireRank[0][0] === top;
        desAdj = agrees ? 0.1 : -0.1;
        reasons.push(agrees ? "desire/fantasy and other hints agree with the tags" : "desire/fantasy and other hints disagree with the tags");
      }
    } else if (desireRank.length) {
      verdict = "unclear";
      const [who, w] = desireRank[0];
      const n = sig.filter((d) => desireTop(d) === who).length;
      const kinds = [...new Set(sig.filter((d) => desireTop(d) === who).map((d) => (isBehaviour(d) ? d.kind : "desire/fantasy")))];
      summary = `No on-page ${label} recognized, but ${plural(n, "hint")} (${kinds.join(", ")}) point to ${who} as the top.`;
      base = Math.min(0.45, 0.15 + w * 0.06);
      reasons.push("based only on hints: what characters want, imagine, look at, or do short of sex");
      desAdj = 0;
    } else if (actTags.length) {
      verdict = "unclear";
      summary = `Tagged “${actTags[0]}”, but no matching sentences were recognized.` + (summary ? ` ${summary}` : "");
      base = 0.2;
      reasons.push("the act is tagged but the phrasing wasn't recognized");
    } else {
      summary = summary || `No on-page ${label} recognized.`;
      const explicit = /explicit|mature/i.test(meta.rating ?? "");
      base = explicit ? 0.45 : meta.rating ? 0.75 : 0.5;
      reasons.push(explicit ? `rated ${meta.rating}, so something may have been missed` : meta.rating ? `rated ${meta.rating}` : "no matching sentences");
    }
  }

  const score = Math.max(0.05, Math.min(0.97, base + (verdict === "none" ? 0 : tagAdj + desAdj)));
  const confidence: Confidence = { score, label: confidenceLabel(score), reasons };
  return { verdict, top, bottom, summary, instances, desires: desireOut, confidence };
}
