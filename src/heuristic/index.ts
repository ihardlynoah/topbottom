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
  type ManualAct,
  type ManualResult,
  type Role,
  type SoloAct,
  type SoloResult,
  type VaginalResult,
  type VibeRating,
  confidenceLabel,
} from "../types";
import { rateVibe, type VibeItem } from "../vibe";
import { tagPriors } from "./ao3-prior";
import { type Cast, type Character, type Gender, buildCast } from "./characters";
import {
  ANAL_CTX,
  type Cat,
  VULVA_CTX,
  type CompiledPattern,
  DIALOGUE,
  type DialogueDef,
  EPITHET_TOKEN,
  FINGER_CTX,
  PATTERNS,
  PENIS_CTX,
  SEX_CTX,
  compilePatterns,
} from "./patterns";
import { EPITHET, canonEpithet, learnEpithets } from "./epithets";
import { type TagInfo, readTags } from "./tags";
import { ORAL_KINDS, type OralKind, ROLE_WORDS, type RoleEvidence, oralKindOf, roleOdds, roleSummary } from "../roles";
import { escapeMarker, splitParagraphs, UNCERTAIN_NOTE_END, UNCERTAIN_NOTE_START } from "../text";

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
  /** Why this reading could be wrong ("rode him" can be said of either partner); lowers the scene's confidence. */
  shaky?: string;
  /** The text around the sentence, so a reader (or Claude) can check the reading. */
  context?: string;
}

interface DesireHit {
  /** The speaker of a quoted line was guessed from the narration rather than named by a tag. */
  guessed?: boolean;
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
  /** A solo act worded with “himself” / “his own”: certainly the actor’s own body, no partner in it. */
  reflexive?: boolean;
  /** How the people in the sentence were found (names, pronouns, inference). */
  basis?: Basis;
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

const NEG = /\b(?:not|never|no longer|no way|refused to|instead of|rather than|without|stopped (?:himself|herself|themself|myself) from|nobody|no one)\b|n['’]t\b/i;
const FANTASY =
  /\b(?:imagin\w*|fantasi[sz]\w*|daydream\w*|(?<!\blike a (?:[\w'’]+ )?)dream(?:ed|t|s|ing)?(?![-‐ ]like\b| come true)|pictur(?:e|ed|ing|es)|thought about|thinking about|thinks about|think about|(?:the )?thought of|wonder(?:ed|ing|s)? (?:what|how|if)|in (?:his|her|their|my) (?:head|mind)|mind['’]s eye|fantasy|fantasies|porn|(?:the|a|this|that) vision (?:of|he|she|they|I|that|which))\b/i;
const DESIRE =
  /\b(?:hop(?:e|es|ed|ing)(?:\s+(?:that|to|for))?(?![\w-])|(?:urge|itch|temptation|impulse|compulsion)s?(?:\s+to)?(?![\w-])|tempted(?:\s+to)?(?![\w-])|want\w*|wanna|need(?:ed|s|ing)? to|need(?:ed)? (?:him|her|them|you|me)|(?<!\b(?:take|takes|took|taking|taken|so|too|as|how|that|very|any|a|not|no|for|in|on|at|of)\s)long(?:ed|ing|s)? (?:to|for)|crav\w*|ach(?:ed|ing|es) (?:to|for)|wish\w*|desperate (?:to|for)|dying to|would love|['’]d love|['’]d\s+(?:(?:very|really|quite|so|much|just|absolutely|certainly|definitely|dearly|especially)\s+)*(?:like|rather|prefer)|would\s+(?:(?:very|really|quite|so|much|just|absolutely|certainly|definitely|dearly|especially)\s+)*(?:like|prefer|rather)|desires? (?:of|to|for)|offer(?:ed|s|ing)? to|plan(?:s|ned|ning)? to|beg(?:ged|s|ging)?|yearn\w*|hop(?:ed|ing|es) (?:to|that)|ask(?:ed|s|ing)? (?:him|her|them|me|you|[a-z][\w'’-]*) to|plead\w* (?:for|with)|itch(?:ed|ing)? to|(?:the )?(?:prospect|possibility|chance|thought|promise|idea)(?=\s+of\b|\s*$)|(?:whin|whimper|moan|beg|plead|pray|wish|hop)\w*\s+for(?:\s+[\w'’]+)?(?:\s+to\b|\s*$))/i;
/** "…see himself asking [Damen to fuck him]": the request word sits just before the match, which starts at the name. */
/** A sentence with its subject left out that opens on the wanting: "Wants to take Eddie to the back of his throat while Steve chokes on his cock." */
const DESIRE_LEAD = /^\W*(?:wants?|needs?|longs?|aches?|craves?|wishes?|yearns?)\s+(?:to|for)\b/i;
/** "your ass is grass", "kick your ass", "pain in the ass": an ass that isn't one. */
/** An animal nearby: "good boy" may be said to it. */
const ANIMAL_NEAR = /\b(?:dog|dogs|puppy|pup|doggo|hound|retriever|labrador|collie|terrier|corgi|beagle|cat|kitten|horse|pony|mare|stallion|parrot|bird)\b/i;
const IDIOM_ASS = /\b(?:ass is grass|(?:kick|kicked|kicking|whoop|whooped|whooping|save|saved|saving|bust|busted|busting|cover|covered|covering|haul|hauled|hauling|bite|bit)\w*\s+(?:your|his|her|my|their|our)?\s*ass|pain in the ass|smart[- ]?ass|dumb[- ]?ass|half[- ]?ass|work\w*\s+(?:your|his|her|my|their)\s+ass\s+off|ass\s+(?:off|kicked|whooped))\b/i;
/** A toy (dildo, plug, vibrator…) used on oneself, or worn: that is bottoming, so it counts as such. */
/** Up to ~250 characters either side of a sentence, for checking a reading by eye. */
function contextAround(para: string, sentence: string): string {
  const at = para.indexOf(sentence);
  if (at < 0) return "";
  const from = Math.max(0, at - 250);
  const to = Math.min(para.length, at + sentence.length + 250);
  return (from > 0 ? "…" : "") + para.slice(from, to).trim() + (to < para.length ? "…" : "");
}
const SOLO_TOY = /\b(?:dildos?|vibrators?|vibes?|butt\s*plugs?|plugs?|anal beads|beads|toys?|wand)\b/i;
const REFLEXIVE = /\b(?:himself|herself|themselves|themself|myself|(?:his|her|their|my)\s+own)\b/i;
/** How much a toy used on yourself counts: certain when worded “himself” / “his own” or when a plug is worn, less when only inferred from there being no one else in the sentence. */
const selfToyStrength = (d: { reflexive?: boolean; act: string }) => (d.reflexive || d.act === "wearing a plug" ? 1 : 0.55);
const usesToyOnSelf = (d: { kind: string; act: string; sentence: string }) => (d.kind === "solo" || d.act === "wearing a plug") && SOLO_TOY.test(d.sentence);
const DESIRE_TAIL = /\b(?:(?:ask|beg|plead|urg|offer)(?:ed|s|ing)?(?:\s+[\w'’-]+)?|desires?(?:\s+of)?(?:\s+\w+ly)?)\s*$/i;
const HYPO_WINDOW = /\b(?:unless|capable of|able to|would have|meant to|intended to|(?:['’]ll|will)\s+(?:just\s+)?have to|gonna have to|(?:is|are|was|were|am|['’]s|['’]re|['’]m)\s+(?:just\s+)?(?:going|about)\s+to|gonna|if|someday|some day|one day|next time|maybe|perhaps|might|what it would be like|what it'd be like|would be (?:one|a|an|the|so|too|more|less|better|worse|easier|harder)|would have been|would (?:feel|look|sound|taste)|imagine\w*|supposing|so (?:he|she|they|I|we) (?:can|could|might|may|will|would))\b/i;
/** "Yeah, maybe Dunk would stop his snide comments and stuff his mouth…": the whole sentence is a what-if. */
/** Mouth words near a line of dialogue / in the line itself, and anal words that override the oral reading. */
const ORAL_NEAR_RE = /\b(?:mouth|throat|gag\w*|choke[sd]?|lips|tongue|suck\w*|swallow\w*|blow\w*|deepthroat\w*|skull)\b/i;
const ORAL_LINE_RE = /\b(?:swallow\w*|suck\w*|throat|gag\w*|choke|mouth|lips|tongue|blow\w*)\b/i;
const ANAL_NEAR_RE = /\b(?:ass|arse|hole|asshole|inside him|inside me|inside you|prostate|rim|entrance|stretch\w*|lube[ds]?|slick\w*)\b/i;
const HYPO_SENT = /^\W*(?:[\w'’]+[,!]\s+)?(?:(?:will|would|could|should|can|shall)\s+(?:he|she|they)\b|maybe|perhaps)\b[^.!?]*?\b(?:would|could|might|['’]d)\b/i;
/** Sentences where "was fucked / screwed" is really about sex (anatomy, how, or sex words). */
const IDIOM_SAFE = /\b(?:cock|dick|prick|ass|arse|hole|claim\w*|alphas?|omegas?|mate[ds]?|mating|cunt|pussy|clit\w*|vagina|cunny|slick|wet|dripping|womb|heat|rut|bred|breed\w*|inside|thrust\w*|knot\w*|lube[ds]?|prostate|come|cum|bed|mattress|sheets?|moan\w*|gasp\w*|whimper\w*|beg\w*|hard|deep(?:ly)?|slow(?:ly)?|senseless|raw|open|into|against|until|over the|on (?:his|her|their|the)\b|all night|good and proper)\b/i;
/** In the matched words themselves: "is going to knot", "can just fuck", "would have let". */
const HYPO_MATCH = /\bgonna\b|\bcan\s+just\b|\bwould\s+have\s+let\b/i;
const DANGER = /\b(?:explo\w+|gun|guns|rifle|shotgun|knife|knives|stab\w*|shot|shoot\w*|bullet|blood\w*|bleed\w*|monster|demogorgon|demobat|vecna|upside down|torture\w*|tied (?:me|him|you|us) up|scream\w*|punch\w*|kick\w*|fight\w*|attack\w*|ambush\w*|weapon\w*|flinch\w*|lunged|crashed|fled|run!|duck(?:ed)?)\b/i;
const SEX_STRICT = /\b(?:cock|dick|prick|lube|lubed|slick|slicked|naked|erection|prostate|anus|condom|orgasm|climax|rim\w*|knot|strap|dildo|pussy|clit|cum|cumming|nipples?|arous\w*|undress\w*|thighs?|crotch|bulge|boner|hard-?on|moan\w*|thrust\w*|shirtless|blowjob|handjob)\b/gi;
const HYPO_AUX = /\b(?:would|could|will|might|should|shall|going|gonna|['’]d|['’]ll)\b/i;
const HABIT_AUX = /\b(?:always|usually|never|often|typically|rarely|only|used)\b/i;
/** Fantasy markers strong enough to cover the whole rest of the sentence ("the vision he'd clung to, which included…"). */
const STRONG_FANTASY =
  /(?<!\b(?:not|never|no)\s|n['’]t\s)\b(?:imagin(?:ed|es|ing)|fantasi[sz](?:ed|es|ing)|daydream\w*|(?<!\blike a (?:[\w'’]+ )?)dream(?:ed|t|s|ing)?(?![-‐ ]like\b| come true)|(?:the|a|this|that) vision (?:of|he|she|they|I|that|which)|fantas(?:y|ies)\s+(?:of|about))\b/i;
const SCENE_BREAK = /^\s*(?:\*+|x{3,}|~+|-{3,}|—+|#+|o+0+o+|\* \* \*)\s*$/i;
const FANTASY_PARA = /(?<!\b(?:not|never|no)\s|n['’]t\s)\b(?:(?<!\blike a (?:[\w'’]+ )?)dream(?:ed|t|s|ing)?(?![-‐ ]like\b| come true)|fantasi[sz](?:ed|ing|es)|fantasy|daydream\w*|imagin(?:ed|es|ing))\b/i;

const SAY =
  "said|says|say|asked|asks|begged|begs|whispered|whispers|murmured|murmurs|moaned|moans|groaned|groans|gasped|gasps|panted|pants|breathed|breathes|growled|growls|hissed|hisses|whined|whines|pleaded|pleads|demanded|demands|ordered|orders|told|tells|mumbled|mumbles|muttered|mutters|replied|replies|answered|answers|added|adds|choked out|managed|grunted|grunts|purred|purrs|rasped|rasps|sighed|sighs|laughed|laughs|snapped|snaps|teased|teases|urged|urges|insisted|insists|admitted|admits|confessed|confesses|sobbed|sobs|cried|cries|whimpered|whimpers|husked|drawled|offered|suggested|blurted|croaked|keened|ground out|bit out|gritted out|continued|promised|warned|commanded|instructed|repeated|agreed|protested|swore|cursed|chuckled|smirked|grinned|smiled|hummed|crooned|coaxed|praised|soothed|groused|whispered against|murmured against|chuckles|smirks|snorted|scoffed|huffed|grins|rumbled|rumbles|snarled|snarls|croons|continues|explains|explained|goes on|went on|offers|warns";

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
    // "his husband", "her lover": always the possessor's partner, never one fixed person.
    if (keys[0]?.startsWith("rel:")) {
      const ck = keys[0];
      if (this.sentence.has(ck)) return this.sentence.get(ck);
      const possessor = this.sentMentions[0]?.c ?? this.lastSubject;
      const c = possessor ? this.partnerOf(possessor, gender) : this.recent.find((r) => Ctx.compatible(r, gender));
      this.sentence.set(ck, c);
      return c;
    }
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

  /** Whose "I" this stretch is, when sections are headed by the narrator's name ("Scott - Saturday, September 6, 2014"). */
  narratorNow: Character | undefined;

  fixed(kind: "I" | "you"): Character | undefined {
    return kind === "I" ? (this.narratorNow ?? this.cast.narrator) : this.cast.secondPerson;
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
  const analysisText0 = text.replace(
    new RegExp(`${escapeMarker(UNCERTAIN_NOTE_START)}[\\s\\S]*?${escapeMarker(UNCERTAIN_NOTE_END)}`, "g"),
    "",
  ).replace(/\[\[AO3_[A-Z_]+\]\]/g, "");
  // In some dom/sub fics a man's penis is his "clit" (or "clitty"). Where the tags say it's that kind of fic, there are no women
  // and nothing says anyone has a vulva, "his clit" is read as his cock.
  const clitIsCock =
    /master\/slave|dom\/sub|\bd\/s\b|bdsm|humiliat|chastity|cock cage|cock-cage|feminiz|sissy|gender words|degrad|dehumani|free use|slave|submission|dominance/i.test(meta.freeforms.join(" | ")) &&
    !/intersex|omega|trans(?:gender|\b)|vagina|cuntboy|cunt boy|pussy|mpreg|hermaphrodit|futa|bodyswap|genderswap|gender ?bender/i.test(meta.freeforms.join(" | ")) &&
    meta.categories.length > 0 && meta.categories.every((c) => c === "M/M");
  const analysisText = clitIsCock
    ? analysisText0.replace(/\b(his|their|[A-Z][\w-]*['’]s)(\s+(?:[a-z-]+\s+){0,2}?)clit(?:ty|oris)?\b/g, "$1$2cock")
    : analysisText0;
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

  /** Whether the last speaker was named by a dialogue tag (“…,” Eddie says) rather than guessed from who the narration is about. */
  let attribExplicit = false;
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

  const subjectReG = new RegExp(subjectRe.source, "g");
  const firstEntity = (s: string): Character | undefined => {
    // A possessive name inside a prepositional phrase ("the look on Steve's face made Eddie so hard") isn't the
    // subject, if an actual name or subject pronoun follows it (not just "his"/"my", which say nothing more).
    subjectReG.lastIndex = 0;
    const first = subjectRe.exec(s);
    let m: RegExpExecArray | null = first;
    if (first && (/['’]s$/.test(first[1]) || /^(?:[Hh]is|[Hh]er|[Tt]heir|[Mm]y)$/.test(first[1])) && /\b(?:on|in|at|of|from|into|to|over|with|across|around|against|onto|under|beneath|behind|beside|near|by|for|through|toward|towards|past)\s+$/i.test(s.slice(0, first.index + first[0].length - first[1].length))) {
      let next: RegExpExecArray | null;
      subjectReG.lastIndex = first.index + first[0].length;
      next = subjectReG.exec(s);
      if (next && !/^(?:[Hh]is|[Hh]er|[Tt]heir|[Mm]y)$/.test(next[1]) && !/['’]s$/.test(next[1])) m = next;
    }
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
    // '…inside him, Cas' eyes open. "You okay?" Dean asks.': names after a line of dialogue are another clause.
    rest = rest.split(/\s{3,}/)[0];
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
      new RegExp(`\\b(?:${x.aliases.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b(?!['’]s?(?!\\w))`).test(rest);
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
  ctx.narratorNow = undefined;
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
    // Alternating first person: a short heading that is just a character's name (and a date) says whose "I" follows.
    if (cast.narrator && para.length <= 80) {
      const head = new RegExp(`^\\s*(${NAMES})(?:\\s*[-–—:]\\s*[^.!?“”"]{0,60})?\\s*$`).exec(para);
      const who = head ? cast.byAlias.get(head[1]) : undefined;
      if (who) ctx.narratorNow = who;
    }
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
    else if (/(?<!\b(?:not|never|no)\s|n['’]t\s)\b(?:(?<!\blike a (?:[\w'’]+ )?)dream(?:ed|t|s|ing)?(?![-‐ ]like\b| come true)|daydream\w*|fantasi[sz](?:ed|es|ing))\b/i.test(mp)) dreamRun = 2;
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
    // "hard", "inside", "came", "bed" and "hips" turn up in every long fic: for the weak suggestive lines the narration
    // has to carry an unambiguous sexual word (or several of the loose ones).
    const strictHits = new Set((near.toLowerCase().match(SEX_STRICT) ?? []).map((w) => w.replace(/(?:s|es|ed|ing)$/, "")));
    const narrationSexy = strictHits.size >= 1 || (near.match(SEX_CTX) ?? []).length >= 4 || /\b(?:nipples?|pleasure|arous\w*|undress\w*|thighs?|lube|fingers? (?:in|inside)|crotch|bulge)\b/i.test(near);
    let paraSpeaker: Character | undefined;
    let lastQ: Quote | undefined;
    let lastQPrev: Quote | undefined;
    for (const q of quotes) {
      // '"You can take it, princess," he tells him tightly, "You're made to take my cock."': one speaker.
      // A second quote soon after the first is the same speaker, unless the narration between names someone else
      // ("“Please,” Steve whined a complaint, “Uh uh, be patient.”").
      const gapText = lastQ ? mp.slice(lastQ.end, q.start) : "";
      const gapWho = [...gapText.matchAll(nameRe)].map((m) => cast.byAlias.get(stripPoss(m[0]))).find((c) => !!c);
      const continues = lastQ && paraSpeaker && q.start - lastQ.end < 50 && !/[.!?]["”]?\s*$/.test(para.slice(lastQ.end, q.start).trim() || ".") && !(gapWho && gapWho !== paraSpeaker);
      lastQPrev = lastQ;
      lastQ = q;
      const speaker = (continues ? paraSpeaker : undefined) ?? attributeSpeaker(para, mp, q, paraSpeaker, lastQPrev) ?? paraSpeaker ?? (mp.trim().length < 6 && prevSpeaker ? ctx.partnerOf(prevSpeaker) : undefined);
      if (!speaker) continue;
      paraSpeaker = speaker;
      scanDialogue(q.text, speaker, pi, { animal: ANIMAL_NEAR.test(near), explicit: !!continues || attribExplicit, sexy: narrationSexy, oral: ORAL_NEAR_RE.test(near) && !ANAL_NEAR_RE.test(near), after: para.slice(q.end, q.end + 60), before: para.slice(Math.max(0, q.start - 60), q.start) });
    }
    if (paraSpeaker) prevSpeaker = paraSpeaker;
  }
  }

  /** The subject of an earlier verb in "X smiled and sucked him off": nearest name/he/she that isn't an object. */
  function elidedSubject(prefix: string, suffix = ""): Character | undefined {
    // A blanked-out quote is a clause boundary: "…," Alex says, choking…
    prefix = prefix.replace(/\s{3,}/g, (x) => `,${" ".repeat(x.length - 1)}`);
    // "Cas' ashamed expression after he fucked Dean": the he is the one whose expression it is.
    {
      const ph = new RegExp(`(${NAMES})['’]s?\\s+(?:[\\w-]+\\s+){0,3}?(?:face|expression|look|eyes|voice|smile|words|shame|hands|mouth|reaction|gaze|stare|fear|anger|guilt|breathing|breath|pulse|heartbeat|moans?|sounds?|noises|gasps|cries|shudders|whimpers)\\s+(?:when|after|as|while|before|once|since)\\s*$`).exec(prefix);
      if (ph && /^\s*(?:he|she|they)\b/i.test(suffix)) { const c = cast.byAlias.get(ph[1]); if (c) return c; }
    }
    // "Dean arches underneath Cas' tongue as he swallows him down": he is the one whose tongue it is.
    const under = new RegExp(`\\b(?:under|underneath|beneath)\\s+(${NAMES})['’]s?\\s+(?:[\\w-]+\\s+)?(?:tongue|mouth|lips|hands?|fingers|touch|ministrations|weight|body|attention)\\s*,?\\s*(?:as|while|when)\\s*$`).exec(prefix);
    if (under) return cast.byAlias.get(under[1]);
    // "Diarmuid trembled beneath him as he continued to lick his cock": he is the him of the first clause, the other one.
    const beneathHim = new RegExp(`(?:^|[.!?,;]\\s+)(${NAMES})\\s+(?:[\\w'’-]+\\s+){1,4}?(?:beneath|underneath|below|under)\\s+(?:him|her)\\s*,?\\s*(?:as|while|when)\\s*$`).exec(prefix);
    if (beneathHim && /^\s*(?:he|she)\b/i.test(suffix)) {
      const subj = cast.byAlias.get(beneathHim[1]);
      const other = subj && ctx.partnerOf(subj);
      if (other) return other;
    }
    // "He thought Dracula might break the door down and fuck him": after a thinking/seeing verb, the named subject of the
    // embedded clause carries on as the left-out subject.
    {
      const emb = [...prefix.matchAll(new RegExp(`\\b(?:thought|think|thinks|knew|know|knows|felt|feels|imagined|imagines|worried|worries|feared|fears|wondered|wonders|hoped|hopes|hoping|believed|believes|realized|realised|realizes|suspected|suspects|expected|expects|figured|guessed|assumed|sensed|saw|sees|heard|hears|watched|watches|noticed|notices|said|says|swore|promised|wished|wishes|dreaded|pictured|prays|prayed)\\s+(?:that\\s+)?(${NAMES})\\s+(?:(?:just|finally|ever|actually|really|even)\\s+)?(?:might|would|could|will|may|should|must|was|were|had|has|is|are|did|can|decides|decided|wants|wanted|needs|needed|tries|tried|starts|started|gets|got|lets|let|takes|took|does)\\b`, "gi"))].pop();
      if (emb && !new RegExp(`\\b(?:${NAMES})\\b|\\b(?:he|she|they)\\b`, "i").test(prefix.slice(emb.index! + emb[0].length))) {
        const c = cast.byAlias.get(emb[1]);
        if (c) return c;
      }
    }
    // "Dean arches underneath Cas' tongue as he swallows him down, humming around his length while his fingers slip inside
    // him": the "he" is the one whose tongue it is, for the rest of the sentence.
    const underLong = new RegExp(`\\b(?:under|underneath|beneath)\\s+(${NAMES})['’]s?\\s+(?:[\\w-]+\\s+)?(?:tongue|mouth|lips|hands?|fingers|touch|ministrations|weight|body|attention)\\s*,?\\s*(?:as|while|when)\\s+(?:he|she)\\b([^.!?]*)$`).exec(prefix);
    if (underLong && !new RegExp(`\\b(?:${NAMES})\\b`).test(underLong[2])) return cast.byAlias.get(underLong[1]);
    // "…as Dunk's hands kneaded his arse as he pressed his tongue…": the hands' owner carries on as "he".
    const handsOf = new RegExp(`(?:^|[,;]|\\b(?:as|while|when|and|but|then|yet|so))\\s+(${NAMES})['’]s?\\s+(?:[\\w-]+\\s+)?(?:hands?|fingers|mouth|lips|tongue|arms?|thumbs?|palms?)\\s+([^;—]*?)\\b(?:as|while|when)\\s*$`).exec(prefix);
    if (handsOf && !new RegExp(`\\b(?:${NAMES})\\b|\\b(?:he|she|they)\\b`, "i").test(handsOf[2])) return cast.byAlias.get(handsOf[1]);
    // "Dean hardly had any warning before he was pushing inside him": the "he" is the other one.
    const warned = new RegExp(`(${NAMES})\\s+(?:(?:hardly|barely|scarcely|never|still)\\s+)?(?:had|has|got|gets|received)\\s+(?:hardly|barely|scarcely|little|no|any|not much|not any|almost no)\\s+(?:\\w+\\s+)?warning\\s+before\\s*$`).exec(prefix);
    if (warned && /^\s*(?:he|she|they)\b/i.test(suffix)) { const w = cast.byAlias.get(warned[1]); const o = w && ctx.partnerOf(w); if (o) return o; }
    // "Cas’s hand wandered again, cupping his ass": the participle belongs to the hand's owner.
    const handPart = new RegExp(`(?:^|[,;.]|\\b(?:and|as|while|when))\\s*(${NAMES})['’]s?\\s+(?:[\\w-]+\\s+)?(?:hands?|fingers|mouth|lips|tongue|arms?|thumbs?|palms?)\\s+(?:\\w+(?:\\s+|(?=[,;]|$))){1,3}?[,;]?\\s*(?:and\\s+)?$`).exec(prefix);
    if (handPart && /^\W*[A-Za-z]+ing\b/.test(suffix)) return cast.byAlias.get(handPart[1]);
    // "—pressing him down, and Riddle with him—" is an aside, not the clause's subject.
    prefix = prefix.replace(/—[^—]*—/g, (x) => " ".repeat(x.length));
    const re = new RegExp(`(?:^|([\\w'’]+)?([\\s,]+))((?:${NAMES}|${EPITHET_TOKEN})(?![\\w'’])|[Hh]e|[Ss]he|[Tt]hey|I)(?=[\\s,])`, "g");
    const hits = [...prefix.matchAll(re)];
    // "Laurent needs Damianos to know he likes him … that he drags him": after "needs X to", a bare he/she is X.
    const ctl = [...prefix.matchAll(new RegExp(`\\b(?:need|want|ask|tell|told|beg|let|make|made|get|got|expect|order|allow|permit|force|forc|command|invite|encourage|instruct|coax|urge|help|wish|like)\\w*\\s+(${NAMES})\\s+to\\b`, "gi"))].pop();
    // "The count permitted Jack to wriggle beneath him … while he was impaled": the he that follows is Jack.
    if (ctl && /^\s*(?:he|she|they)\b/i.test(suffix) && !new RegExp(`\\b(?:${NAMES})\\b`).test(prefix.slice(ctl.index! + ctl[0].length))) {
      const named = cast.byAlias.get(ctl[1]);
      if (named) return named;
    }
    const lastHit = hits[hits.length - 1];
    if (ctl && lastHit && /^(?:he|she|they)$/i.test(lastHit[3]) && lastHit.index! > ctl.index!) {
      const named = cast.byAlias.get(ctl[1]);
      if (named) return named;
    }
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i];
      // After a comma we're at a clause start, so whatever came before doesn't make this an object.
      const prev = h[2]?.includes(",") ? "" : (h[1] ?? "").toLowerCase();
      // "Cas checking that Dean was ok and with a nod he lined up": "that Dean" is an embedded clause, so a later "he"
      // goes back to the main subject, if there is one.
      if (prev === "that" && i > 0 && /^(?:he|she|they|I)$/i.test(suffix.trim().split(/[\s,]/)[0] ?? "")) continue;
      // A name right after a verb or preposition is an object ("spread Draco open"), not a subject.
      const isObject =
        !!prev &&
        !/^(?:and|but|or|so|then|when|as|while|because|until|before|after|if|though|although|once|since|where|now|still|finally|later|suddenly|slowly|meanwhile|that|who|yes|no|oh)$/.test(prev) &&
        // "…," whispers Alex: a name after a speech verb is its subject.
        !/^(?:says|said|whispers|whispered|murmurs|murmured|asks|asked|groans|groaned|moans|moaned|breathes|breathed|growls|growled|gasps|gasped|mutters|muttered|replies|replied|begs|begged|pants|panted|laughs|laughed|sighs|sighed|whimpers|whimpered|hisses|hissed|purrs|purred|teases|teased|grunts|grunted|answers|answered|adds|added|continues|continued|corrects|corrected|leers|leered|demands|demanded|insists|insisted|admits|admitted|pleads|pleaded|chokes|choked|calls|called|cries|cried)$/.test(prev);
      // "…at Sam, who's leaning over Steve…": a relative clause makes Sam the subject of what follows.
      const relative = /^,?\s*who\b/.test(prefix.slice(h.index! + h[0].length)) ||
        // "with Cas clenched tight and rolling his hips": "with X" + participle is a subject.
        (prev === "with" && /^\s+(?:\w+ly\s+)?\w+(?:ed|ing)\b/.test(prefix.slice(h.index! + h[0].length))) ||
        // "it didn't take long for Dean to cum, spilling into his mouth": X in "for X to <verb>" is the verb's subject.
        (prev === "for" && /^\s+to\s+\w+/.test(prefix.slice(h.index! + h[0].length))) ||
        // "after a few minutes of Buck fucking his finger into him", "pictured Buck straddling him": X is the gerund's subject.
        (/^(?:of|after|before|from|despite|at|by|picture[sd]?|pictur\w+|imagin\w+|watch\w*|see|sees|saw|seen|hear\w*|heard)$/.test(prev) && /^\s+(?:\w+ly\s+)?(?:\w+ing|on top)\b/.test(prefix.slice(h.index! + h[0].length) + suffix));
      // "he wasn't the man who pushed Laurent to the door to fuck him": the epithet describes the copula's subject, who
      // is the one doing what follows.
      if (relative && /^Epithet\d+$/.test(h[3]) && i > 0 && /\b(?:was|were|is|am|are|be|been)(?:n['’]t| not)?\s+$/i.test(prefix.slice(0, h.index! + h[0].length - h[3].length))) continue;
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

  /** The speaker, unless the line speaks to that very person by name ("Your dick, Damianos."), which makes it the other one. */
  function attributeSpeaker(para: string, mp: string, q: Quote, prevSpeaker?: Character, prevQ?: Quote): Character | undefined {
    attribExplicit = false;
    const who = attributeSpeakerFrom(para, mp, q, prevSpeaker, prevQ);
    if (!who) return who;
    const voc = new RegExp(`(?:^|[,.!?]\\s+|\\b(?:hey|oh|please|yes|no|god),?\\s+)(${NAMES})(?=\\s*[,.!?…]|\\s*$)|,\\s*(${NAMES})\\b`).exec(q.text);
    const addressed = voc ? cast.byAlias.get(voc[1] ?? voc[2]) : undefined;
    return addressed && addressed === who ? (ctx.partnerOf(addressed) ?? who) : who;
  }

  function attributeSpeakerFrom(para: string, mp: string, q: Quote, prevSpeaker?: Character, prevQ?: Quote): Character | undefined {
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
    if (heard) { attribExplicit = true; return cast.byAlias.get(heard[1]); }
    const a1 = new RegExp(`^[,.!?—–\\s]*((?:${NAMES})|[Hh]e|[Ss]he|[Tt]hey|I)\\s+(?:\\w+ly\\s+)?(?:${SAY})\\b`).exec(after);
    if (a1) {
      attribExplicit = true;
      let who = resolve(a1[1]);
      // "“Good boy,” He says and Steve moans": the he of the tag isn't the person named later in the same sentence.
      if (/^(?:he|she|they)$/i.test(a1[1])) {
        const rest = after.slice(a1[0].length).split(/[.!?]/)[0];
        const m2 = new RegExp(`\\b(${NAMES})\\b`).exec(rest);
        const named = m2 ? cast.byAlias.get(stripPoss(m2[1])) : undefined;
        if (named && who === named) who = ctx.partnerOf(named) ?? who;
      }
      return who;
    }
    const a2 = new RegExp(`^[,.!?—–\\s]*(?:${SAY})\\s+((?:${NAMES})|he|she|they)\\b`).exec(after);
    if (a2) { attribExplicit = true; return resolve(a2[1]); }
    const b1 = new RegExp(`((?:${NAMES})|[Hh]e|[Ss]he|[Tt]hey|I)\\s+(?:\\w+ly\\s+)?(?:${SAY})(?:\\s+[\\w’']+){0,4}?[,:.]?\\s*["“‘]?\\s*$`).exec(before);
    // "“Eddie,” He moans raggedly. “Open your eyes.”": a tag sitting right after the previous quote belongs to that quote,
    // so the new line is the other person's turn.
    const tagOfPrev = !!b1 && (!before.slice(0, b1.index!).trim() || /\s{2,}$/.test(before.slice(0, b1.index!)) || /["”’]\s*$/.test(before.slice(0, b1.index!)));
    if (b1 && !tagOfPrev) { attribExplicit = true; return resolve(b1[1]); }

    // “I’m going to take the plug out now.” Dean’s breath hitched…: the narration right after the line is the listener's
    // reaction, so the speaker is the other one.
    if (!mp.slice(0, q.start).trim()) {
      const react = new RegExp(`^[,.!?—–\\s]*(${NAMES})(?:['’]s)?\\s+(?:(?:breath|heart|cock|dick|stomach|cheeks|knees|pulse|body|throat|skin)\\s+(?:\\w+\\s+)?(?:hitched|caught|stuttered|skipped|raced|twitched|throbbed|jerked|clenched|flushed|heated|weakened|trembled|shook|stalled)|(?:shivered|shuddered|swallowed|flushed|blushed|gulped|trembled|nodded))\\b`).exec(after);
      const reactor = react ? cast.byAlias.get(stripPoss(react[1])) : undefined;
      const other = reactor && ctx.partnerOf(reactor);
      if (other) { attribExplicit = true; return other; }
    }
    // “Spread your legs for me.” The sub did as asked…: a scene someone else is performing, not the pair's.
    if (/^\s*(?:The|His|Her|Their|A|An)\s+(?:sub|submissive|Dom|Domme|Master|Mistress|stranger|man|woman|bartender|waitress|server|couple|guy|girl|performer|performers|crowd|audience)\b/.test(mp.replace(/["“”‘’\[\]]\s*/g, " ").trim())) return undefined;
    // “Please,” he cried. Cas pulled his fingers free and moved up. “You’re doing so well.”: after a tag for the
    // previous line, the person whose action comes right before this line is the one speaking.
    if (prevQ) {
      const gapSents = mp.slice(prevQ.end, q.start).trim().split(/(?<=[.!?])\s+/).filter(Boolean);
      if (gapSents.length >= 2) {
        const ent = firstEntity(gapSents[gapSents.length - 1]);
        if (ent) { attribExplicit = true; return ent; }
      }
    }
    // Otherwise, whoever the narration in this paragraph is about.
    const narr = mp.replace(/["“”‘’\[\]]\s*/g, " ").trim();
    // "His friend listened, picking up the pace. '…'": the partner of the character whose point of view this is.
    if (/^(?:His|Her|Their)\s+(?:friend|lover|partner|boyfriend|husband|girlfriend|wife|date|companion|boss)\b/.test(narr) && ctx.lastSubject) {
      const other = ctx.partnerOf(ctx.lastSubject);
      if (other) return other;
    }
    const fromNarration = narr.length > 5 ? firstEntity(narr) : undefined;
    if (fromNarration) return fromNarration;
    // A line that addresses someone by name ("…, Dean.") was said by the other person.
    const voc = new RegExp(`(?:^|[,.!?]\\s+|\\b(?:hey|oh|please|yes|no|god),?\\s+)(${NAMES})(?=\\s*[,.!?…]|\\s*$)|,\\s*(${NAMES})\\b`).exec(q.text);
    const addressed = voc ? cast.byAlias.get(voc[1] ?? voc[2]) : undefined;
    return addressed ? ctx.partnerOf(addressed) : undefined;
  }

  function scanDialogue(line: string, speaker: Character, pi: number, around: { animal?: boolean; explicit?: boolean; sexy: boolean; oral?: boolean; after: string; before: string }) {
    const lower = line.toLowerCase().replace(/’/g, "'");
    const seen = new Set<string>();
    // Generic "take it" / "you're so tight" talk is oral when the line itself mentions a mouth ("swallow me down") or the
    // scene around it is oral and not anal.
    const oralLine = ORAL_LINE_RE.test(lower) || !!around.oral;
    for (const d0 of DIALOGUE) {
      const generic = d0.cat === "anal" && d0.kind === "said" && d0.weight !== undefined && d0.weight < 1;
      const d: DialogueDef = generic && oralLine ? { ...d0, cat: "oral", act: "blowjob" } : d0;
      const m = d.re.exec(lower);
      if (!m) continue;
      // Suggestive lines ("take it", "you're so tight", "you're huge") only count when the narration around them
      // is sexual: "please take it" can be a gift, "too proud to take it" help.
      if (d.weight !== undefined && d.weight < 1 && (d.kind === "said" || d.kind === "petname" || d.kind === "position" || d.kind === "aftercare") && !around.sexy) continue;
      // "Good boy" said to a dog is a dog.
      if (d.kind === "petname" && around.animal) continue;
      // Pet names, care, check-ins and "I like to…" lines only count when the speaker was actually named, not guessed.
      if ((d.kind === "petname" || d.kind === "aftercare" || d.kind === "position" || d.kind === "stated") && around.explicit === false) continue;
      // “Please suck me off, Eddie… need your mouth on me” is about a cock, not an ass.
      if (d.act === "rimming" && /\b(?:suck|blow)\s+(?:me|my)\b|\bmouth on me\b/.test(lower) && !/\b(?:ass|arse|hole)\b/.test(lower)) continue;
      if (d.cat === "anal" && IDIOM_ASS.test(lower)) continue;
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
        (!question && /\b(?:don't|do not|never|won't|will not|not|can't|cannot|no|wouldn't|shouldn't|stop)\s+(?:(?!hesitate|forget|stop|let)\w+\s+){0,3}$/.test(before)) ||
        /\bas if\b[^.!?]*$/.test(before);
      desires.push({
        cat: d.cat,
        act: d.act,
        who: speaker,
        partner: ctx.partnerOf(speaker),
        role: d.role,
        wants: !negated,
        kind: d.kind,
        weight: (d.weight ?? (d.kind === "ogling" ? 0.6 : 1)) * (around.explicit === false ? 0.5 : 1),
        guessed: around.explicit === false ? true : undefined,
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
    // "Fuck me, so El really can move shit with her mind?": a comma and then a new clause.
    if (/^,\s*so\s+(?:\w+\s+){0,2}?(?:really|can|could|did|does|do|is|are|was|were|will|would|you|we|he|she|they|it)\b/.test(after)) return true;
    if (request) return false;
    // "Sure you won't fuck me?" is asking for it.
    if (/^\s*\?/.test(after)) return false;
    // "Oh, fuck me", "well fuck me", "holy shit, fuck me"
    if (/\b(?:oh|well|ah|god|jesus|christ|holy|bloody|shit|man|dude|ugh|wow|damn|hell|lord|mate|boy|seriously|honestly)\b[\s,!.]*$/.test(before)) return true;
    // An idiom: "fuck me sideways / running / dead / twice / gently with a chainsaw", "fuck me if I know"
    // "so fuck me for trying to keep my lungs healthy": an accusation.
    if (/^\s+for\b/.test(after)) return true;
    if (/^[,!]?\s*(?:sideways|running|dead|twice|blind|pink|silly|gently with|with a (?:spoon|chainsaw|cactus|rake|brick)|if\b|in the|up\b|over\b(?!\s+(?:the|this|that|my))|three ways|backwards)/.test(after)) return true;
    // A new clause after it: "Fuck me, it's cold", "fuck me, you're right", "fuck me, what a day"
    if (/^\s*[,!.—-]+\s*(?:i\b|i'm|i've|i'd|you're|you've|you were|it|it's|that|that's|this|there|we|he|she|they|so|but|what|how|why|who|where|when|look at|these|those|the|a\b|an\b|my|our|his|her)/.test(after)) return true;
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

  /** "…without being fucked open by older men": past experience with other people, a hint about this person's role. */
  function addHistory(cat: Cat, act: string, who: Character, role: Role, partner: Character, sentence: string, pi: number) {
    if (cat === "vaginal") return;
    desires.push({ cat, act: "past experience with others", who, partner, role, wants: true, kind: "history", weight: 0.8, para: pi, sentence });
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
    // "Cas chuckled as he bottomed the dildo out": a top seating a toy, not a bottom.
    if (/\bbottom(?:ed|ing|s)\s+(?:the\s+|a\s+|his\s+|her\s+)?(?:\w+\s+)?(?:dildo|toy|plug|vibrator|vibe|strap\S*|beads)\b/i.test(sent.slice(m.index!))) return;
    // "he’d done this to himself … stretched to fit three fingers": solo prep, not a scene with the partner.
    if (pat.cat === "anal" && /\b(?:stretch|finger|open)\w*/i.test(m[0]) && /\b(?:done|did|doing)\s+(?:this|that|it)\s+to\s+(?:himself|herself|themself)\b/i.test(sent)) return;
    // "swirling his tongue over Dean’s slit, sucking along his shaft": the slit of a cock, not a vulva.
    if (pat.cat === "oral" && /\bslit\b/i.test(m[0]) && oralKindOf(pat.act) === "cunnilingus" && /\b(?:cock|dick|shaft|balls|erection|length|prick)\b/i.test(sent)) return;
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
    // "Dean could feel his cock pulse in his mouth": what someone feels, tastes or sees belongs to the other person.
    if (!pat.elided && !subjChar && pat.subj === "t" && /^(?:his|her|their)$/i.test(tTok ?? "")) {
      const pm = new RegExp(`(?:^|[\\s,;])(${NAMES}|[Hh]e|[Ss]he|[Tt]hey)\\s+(?:could\\s+|can\\s+|would\\s+|did\\s+)?(?:feel|felt|feels|taste|tasted|tastes|sense|sensed|senses|see|saw|sees|watch\\w*|hear|heard|hears)\\s+$`).exec(sent.slice(0, m.index));
      if (pm) {
        const perceiver = resolveToken(pm[1], sent.slice(m.index!));
        const other = perceiver && ctx.partnerOf(perceiver);
        if (other) subjChar = other;
      }
    }
    // "Dracula … sat next to Jack pulling him into his lap": a name right after a preposition is that preposition's object;
    // the -ing verb that follows belongs to the sentence's subject.
    if (!pat.elided && !subjChar) {
      const st = pat.subj === "t" ? tTok : bTok;
      const pre = sent.slice(0, m.index);
      if (st && cast.byAlias.has(stripPoss(st)) && /\b(?:next to|beside|near|behind|against|toward|towards|beneath|under|around)\s+$/i.test(pre) && /^\S+\s+\w+ing\b/.test(m[0])) {
        const subjectOfSentence = elidedSubject(pre.replace(/\s+(?:next to|beside|near|behind|against|toward|towards|beneath|under|around)\s+$/i, " "), sent.slice(m.index!));
        if (subjectOfSentence && subjectOfSentence !== cast.byAlias.get(stripPoss(st))) subjChar = subjectOfSentence;
      }
    }
    // "He wished to fuck the count would at least let him know": a name followed by a finite verb starts a new clause, so it isn't the object.
    if (/^fuck/.test(pat.id) && /^\s+(?:would|could|should|might|will|can|had|was|were|did|does|is|are)\b/i.test(sent.slice(m.index! + m[0].length)) && !/^(?:him|her|them|me|you|it)$/i.test(bTok ?? "")) return;
    // "Castiel grabbed his leg and, using it as leverage, he started thrusting": "he" is the nearest clause's subject.
    const subjTok = pat.subj === "t" ? tTok : bTok;
    // "When Alex manages…, one of his digits slips lower": a possessive pronoun works the same way.
    // "Dunk would… make him take him to the back of his throat": "him" after make/let is the one being made to,
    // i.e. the causer's partner. (Not perception verbs: "Brad watched him getting fucked by Kyle".)
    // "the change in position that has him presenting himself": "him" is the sentence's own subject, not the partner.
    if (!subjChar && !pat.elided && /^(?:him|her|them)$/i.test(subjTok ?? "") && /\b(?:that|which|what)\s+(?:has|had|have|keeps|kept|leaves|left)\s+$/i.test(sent.slice(0, m.index))) {
      const main = firstEntity(sent.slice(0, m.index));
      if (main) subjChar = main;
    }
    // "the hand on his cock and the tongue probing into him": a subject-less sentence where "his" and "him" are one
    // person, the one on the receiving end, not the partner of whoever the last sentence was about.
    if (!subjChar && !pat.elided && !tTok && pat.subj === "b" && /^(?:him|her)$/i.test(bTok ?? "")) {
      const before = sent.slice(0, m.index);
      const poss = bTok!.toLowerCase() === "him" ? /\bhis\s+(?:\w+\s+)?(?:cock|dick|prick|hips?|thighs?|back|chest|nipples?|skin|neck|hair)\b/i : /\bher\s+(?:\w+\s+)?(?:cock|dick|hips?|thighs?|back|chest|breasts?|nipples?|skin|neck|hair)\b/i;
      if (poss.test(before) && !ctx.sentMentions.some((x) => x.at < m.index!) && !/\b(?:he|she|they)\b/i.test(before)) {
        const same = ctx.subjectFor(bTok!.toLowerCase() === "him" ? "m" : "f");
        if (same) subjChar = same;
      }
    }
    const causative = /^(?:him|her|them)$/.test(subjTok ?? "") && /\b(?:make|makes|made|making|let|lets|letting)\s+$/i.test(sent.slice(0, m.index));
    const clauseSubj =
      !pat.elided && subjTok && (pronoun(subjTok) || /^(?:[Hh]is|[Hh]er|[Tt]heir)$/.test(subjTok)) && m.index! > 0
        ? elidedSubject(sent.slice(0, m.index), sent.slice(m.index!))
        : undefined;
    const causer = causative ? (clauseSubj ?? firstEntity(sent.slice(0, m.index)) ?? ctx.lastSubject) : undefined;
    const nearSubj = causative ? causer && ctx.partnerOf(causer) : clauseSubj;
    const co = /([\p{L}'’]+)\s+and\s+$/u.exec(sent.slice(0, m.index));
    const coChar = co ? resolveToken(co[1]) : undefined;
    ctx.coSubjects = new Set(coChar ? [coChar] : []);
    ctx.curCat = pat.cat;
    // "slips fingers through Dean's slick and collects it to shove into a cock sleeve": gathering slick, not fingering.
    if (pat.act === "fingering" && /\b(?:collect|gather|scoop|wipe|smear|coat)\w*\b/i.test(sent.slice(m.index!))) return;
    // "grinding into the hardness he can feel through their layers of clothing" is touch over clothes, not sex.
    if (pat.cat === "anal" && !pat.signal && /\bthrough\s+(?:[\w-]+\s+){0,3}?(?:clothes|clothing|clothed|jeans|pants|trousers|fabric|layers|boxers|underwear|slacks|denim)\b/i.test(sent.slice(m.index!))) return;
    // "pushes his hips back into the alpha": the one pushing back is the bottom, which the grinding-back cue reads.
    if (/^(?:push-into|rock-into|fuck|hips-|penis-into|spread)/.test(pat.id) && (/\b(?:hips|ass|body|butt)\s+back\s+(?:in|into|onto|against|toward|towards)\b/i.test(m[0]) || /\b(?:sink|sank|sinks|sunk|sinking|settle|settles|settled|melt|melts|melted|lean|leans|leaned|press|presses|pressed|pressing|push|pushes|pushed|pushing|arch|arches|arched|arching)\s+back\s+(?:in|into|against|onto)\b/i.test(m[0]))) return;
    // "Dean wanted to beg him to just fuck him": the first "him" is the one asked, the second is the asker.
    let asked: { top: Character; bottom: Character } | undefined;
    if (pat.cat === "anal" && pat.subj === "t" && /^(?:him|her)$/i.test(tTok ?? "") && /^(?:him|her|me)$/i.test(bTok ?? "")) {
      const ask = /\b(?:beg|ask|tell|order|plead|urge|coax|command|invite|get|make|let|help|want|need|expect|wish)\w*\s+(?:him|her)\s+to\s+(?:(?:just|please|finally|really|only)\s+)*\w+\s+(?:him|her|me)\s*$/i.exec(sent.slice(0, m.index! + m[0].length));
      const asker = ask ? firstEntity(sent.slice(0, ask.index)) : undefined;
      const askedChar = asker ? ctx.partnerOf(asker) : undefined;
      if (asker && askedChar) asked = { top: askedChar, bottom: asker };
    }
    const resolved = asked ? { ...asked, basis: "pronoun" as Basis } : resolvePair(tTok, bTok, pat.subj, cast, ctx, subjChar, nearSubj);
    ctx.coSubjects.clear();
    if (!resolved) return;
    {
      // "She" or "her" can't be a man (and "he"/"him" can't be a woman): the pronoun meant someone outside the pair.
      const wrong = (tok: string | undefined, c: Character | undefined) =>
        !!c && ((/^(?:she|her|hers|herself)$/i.test(tok ?? "") && c.gender === "m" && c.vulva !== true) ||
          (/^(?:he|him|his|himself)$/i.test(tok ?? "") && c.gender === "f" && c.penis !== true));
      const r = resolved as { top?: Character; bottom?: Character };
      if (wrong(tTok, r.top) || wrong(bTok, r.bottom)) return;
    }
    let { top, bottom } = resolved as { top: Character; bottom: Character };
    // "the cock inside him starts grinding into him": the one it's inside is the bottom, and it isn't his own cock.
    if (pat.cat === "anal" && /^the$/i.test(tTok ?? "") && /\b(?:inside|in)\s+(?:him|her)\b/i.test(m[0])) {
      const sub = firstEntity(sent.slice(0, m.index)) ?? ctx.lastSubject;
      const partner = sub && ctx.partnerOf(sub);
      if (sub && partner) { top = partner; bottom = sub; }
    }
    // "Dean tries to slip Cas's cock inside him": whose cock it is tops, and the one slipping it in is taking it.
    if (pat.cat === "anal") {
      const own = new RegExp(`\\b(${NAMES})['’]s\\s+(?:[\\w-]+\\s+){0,2}?(?:cock|dick|prick|length|shaft)\\b`).exec(m[0]);
      const owner = own ? cast.byAlias.get(own[1]) : undefined;
      if (owner && owner !== top && owner === bottom && pat.subj === "t") [top, bottom] = [bottom, top];
      // "Cas jackhammers Dean's own fingers inside him": his own fingers, so it's Dean fingering himself, not a scene with Cas.
      const fing = new RegExp(`\\b(${NAMES})['’]s\\s+(?:own\\s+)?(?:[\\w-]+\\s+){0,1}?(?:fingers?|digits?)\\b`).exec(m[0]);
      const fowner = fing ? cast.byAlias.get(fing[1]) : undefined;
      if (fowner && /\bown\b/i.test(m[0])) return;
    }
    // "…and then he's sliding in, swallowed by the tight heat of Eddie": a pronoun can't be someone the same sentence
    // names plainly after it, so it is the other one.
    if (!pat.elided && !subjChar && !nearSubj && /^(?:he|she)$/i.test(subjTok ?? "")) {
      const S = pat.subj === "t" ? top : bottom;
      const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (S.aliases.length) {
        const alt = S.aliases.map(esc).join("|");
        const rest = sent.slice(m.index! + m[0].length).split(/\s{3,}/)[0];
        if (new RegExp(`\\b(?:${alt})\\b(?!['’]s?(?!\\w))`).test(rest) && !new RegExp(`\\b(?:${alt})\\b`).test(m[0])) [top, bottom] = [bottom, top];
      }
    }
    // '"Laurent." He hisses and swats his ass': a line that is just a name is spoken to that person, so the "He" after it
    // is the other one.
    {
      const subjectChar = pat.subj === "t" ? top : bottom;
      const tokOfSubject = pat.subj === "t" ? tTok : bTok;
      const spoken = new RegExp(`[“"]\\s*(${NAMES})\\s*[.,!?…]*\\s*[”"]\\s*(?:He|She|They)\\b[^“"”]*$`).exec(original.slice(0, m.index!));
      if (spoken && (pat.elided || /^(?:he|she|they)$/i.test(tokOfSubject ?? "")) && cast.byAlias.get(spoken[1]) === subjectChar) [top, bottom] = [bottom, top];
    }
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
    // "Sinking his fingers into his hole…", "His finger sinks into his hole": with nobody named, he's on his own.
    if (act === "fingering" && /^(?:[Hh]is|[Hh]er|[Tt]heir)$/.test(tTok ?? "") && /^(?:[Hh]is|[Hh]er|[Tt]heir)$/.test(bTok ?? "") &&
        !new RegExp(`\\b(?:${NAMES})\\b`).test(sent)) {
      const self = ctx.lastSubject ?? top;
      const other = ctx.partnerOf(self);
      if (other && !NEG.test(sent.slice(0, m.index).slice(-40))) {
        desires.push({ cat: "anal", act: "fingering himself", who: self, partner: other, role: "bottom", wants: true, kind: "solo", weight: 0.5, para: pi, sentence: original });
      }
      return;
    }
    // "cupping his cheeks" while kissing: a face, not an ass.
    // "scoots forwards, pushing his knees apart" before a blowjob: getting between someone's knees to kneel and suck.
    // "gently works his mouth open … as he licks into Buck": a kiss.
    if (pat.id.startsWith("licked-into") && !/\b(?:ass|arse|hole|rim|crack|cheeks|entrance|pucker)\b/i.test(matchText) && /\b(?:mouth|lips|kiss\w*)\b/i.test(para)) return;
    // "had his face in his ass and started licking": the object left out is the ass just named.
    if (pat.id.startsWith("began-to-suck") && /\b(?:ass|arse|asshole|hole|rim|cheeks|crack)\b/i.test(sent.slice(0, m.index!)) && !PENIS_CTX.test(sent)) return;
    // "got between Stiles' legs and buried my tongue in his hole" is rimming, not this.
    if (pat.id === "between-thighs-licked" && /\b(?:ass|arse|asshole|hole|rim|crack|cheeks)\b/i.test(sent.slice(m.index!, m.index! + m[0].length + 40))) return;
    // "I'm top of my class", "stripped, top first, then trousers": the noun, not a role.
    if (pat.id.startsWith("topped") && (/^\W*top\s+(?:of|off|first|half|layer|button|and\b)/i.test(sent.slice(m.index!)) || /\btops?\b/i.test(matchText) && /\b(?:strip\w*|undress\w*|shirts?|removed?|shed|peel\w*|took off|clothes|clothing|trousers|pants|skirts?|bras?|dress\w*|blouses?|sweater|hoodie|jacket|frilly|pastel|crop|tank|outfits?|wear\w*)\b/i.test(sent))) return;
    // "circled her clit" with a hand, palm or thumb and no mouth about is touch, not oral.
    if (pat.id.startsWith("licked-vulva") && /\b(?:circl|flick)/i.test(matchText) && !/\b(?:tongue|mouth|lips|licked|sucked|kissed)\b/i.test(sent)) return;
    // "He buried himself in the Egyptian cotton", "buried himself in his neck": bedding and bodies, not penetration.
    if (pat.id.startsWith("push-into") && /\bbur(?:y|ied|ies|ying)\s+(?:himself|herself|themselves|themself)\s+in\s+(?:the\s+|his\s+|her\s+|their\s+|a\s+)?(?:[\w-]+\s+){0,2}(?:cotton|sheets?|pillows?|blankets?|duvet|covers?|bedding|hair|fur|snow|sand|work|books?|neck|chest|arms|shoulder)\b/i.test(original)) return;
    // "swirled his tongue around him … taking in his whole length": that is a blowjob, which has its own patterns.
    if (pat.id.startsWith("tongue-into") && /\b(?:length|cock|dick|shaft|cockhead)\b/i.test(sent.slice(m.index!)) && !/\b(?:ass|arse|hole|rim|crack|cheeks)\b/i.test(sent)) return;
    // "his thighs clenched around Steve" and a cock that only brushed against an ass are not sex.
    if (pat.id.startsWith("clenched-around") && /\b(?:thighs?|legs?|arms?|fingers|hands|fists?|jaw)\b[^.!?]{0,60}\b(?:clench|tighten)/i.test(sent) && !ANAL_CTX.test(sent)) return;
    if (pat.id === "penis-against" && /\b(?:brush|graz|ghost|skim|bump|flick)\w*\s+(?:against|over|along|across)/i.test(matchText)) return;
    // "cum in his own mouth" is not a blowjob.
    if (cat === "oral" && /\bin\s+(?:his|her|their)\s+own\s+mouth\b/i.test(matchText)) return;
    // "pushed two fingers into his own ass", "sucked his own cock": the object belongs to the one acting, so it is a solo act, never a scene with the partner.
    if (/\b(?:his|her|their)\s+own\s+(?:[\w-]+\s+){0,2}?(?:ass|arse|asshole|hole|entrance|rim|cunt|pussy)\b/i.test(matchText) && (cat === "anal" || pat.id.startsWith("self-")) && !/\b(?:cock|dick|prick|length)\b/i.test(matchText.slice(0, matchText.search(/\b(?:his|her|their)\s+own\b/i)))) {
      const other = ctx.partnerOf(top);
      if (other && !NEG.test(sent.slice(0, m.index).slice(-40))) {
        desires.push({ cat: "anal", act: /\b(?:dildo|vibrator|vibe|plug|beads|toy)\b/i.test(matchText) ? "using a toy on himself" : "fingering himself", who: top, partner: other, role: "bottom", wants: true, kind: "solo", weight: 0.5, para: pi, sentence: original, reflexive: true });
      }
      return;
    }
    if (cat === "oral" && act === "blowjob" && /\b(?:his|her|their)\s+own\s+(?:[\w-]+\s+){0,2}?(?:cock|dick|prick|length|shaft)\b/i.test(matchText) && /^(?:his|her|their)$/i.test(tTok ?? "")) return;
    // "sink down onto it" only counts when the "it" is a cock just mentioned (not a horse or a chair).
    if (pat.id.startsWith("riding-it")) {
      const at = para.indexOf(sent);
      const recent = (at >= 0 ? para.slice(Math.max(0, at - 220), at) : "") + sent.slice(0, m.index!);
      if (!PENIS_CTX.test(recent.slice(-220))) return;
      const lastNoun = [...recent.slice(-220).matchAll(/\b(cock|dick|prick|length|shaft|erection|member|knot|girth|horse|chair|bike|bicycle|saddle|couch|sofa|bed|stool|seat|camel|pony|mechanical bull|bull|swing|log|rock|bench|horses)\b/gi)].pop();
      if (lastNoun && !PENIS_CTX.test(lastNoun[1])) return;
    }
    // Cuddling, position, aftercare and pet-name cues need a real subject: "dragging him up to sit in his lap" has "him" as the
    // sitter, which the subject slot can't read, and "his head lolls onto his chest" is one person's own chest.
    if (/^(?:cuddle-|pos-|aftercare-|petname-)/.test(pat.id)) {
      const subjTk = pat.subj === "t" ? tTok : bTok;
      if (/^(?:him|her|them)$/i.test(subjTk ?? "")) return;
      if (pat.id.startsWith("cuddle-head-on-chest-poss") && !/['’]s?$/.test(bTok ?? "")) return;
      if (pat.id.startsWith("cuddle-head-on-chest") && /^(?:he|she|they)$/i.test(bTok ?? "") && /^(?:his|her|their)$/i.test(tTok ?? "") && !/\b(?:[A-Z][a-z]+)\b[^.]*\b(?:head|face|cheek)\b/.test(matchText)) return;
    }
    // "Cregan takes him deeper … bottoming out with each punch of his cock into the prince": with his own cock in the same
    // sentence, "takes him" is the one doing the fucking, which the penetration patterns already read.
    if (pat.id.startsWith("took-deep") && /\b(?:his|her|their)\s+(?:[\w-]+\s+){0,2}?(?:cock|dick|prick|length)\b|\bbottom(?:ing|ed)?\s+out\b/i.test(sent.slice(m.index!))) return;
    // "He took the shoes and parted his legs": nobody else is in the sentence, so they're his own.
    if (pat.id.startsWith("spread-their-legs") && (!tTok || /^(?:he|she|they)$/i.test(tTok)) && /^(?:his|her|their)$/i.test(bTok ?? "") && !/\b(?:him|her|them)\b/i.test(sent.slice(0, m.index)) && !new RegExp(`^\\s*(?:to|so)?\\s*(?:stand|settle|kneel|get)\\w*\\s+between`, "i").test(after)) return;
    // A manspread on a sofa is just sitting.
    if (/^spread-(?:their-)?legs/.test(pat.id) && /\b(?:sofa|couch|chair|armchair|seat|stool|bench|sprawl\w*|comfortabl\w*|slouch\w*|lounge\w*|recline\w*)\b/i.test(sent) && !ANAL_CTX.test(sent) && !PENIS_CTX.test(sent)) return;
    // An ass in an idiom ("your ass is grass", "kick your ass").
    if (cat === "anal" && IDIOM_ASS.test(sent)) return;
    // "He parted his legs for her": the "her" is someone outside a pair with no woman in it (a doctor, a bystander).
    {
      const afterMatch = sent.slice(m.index! + m[0].length);
      const noFemale = top.gender !== "f" && bottom.gender !== "f";
      const noMale = top.gender !== "m" && bottom.gender !== "m";
      if ((noFemale && /^\s*(?:,\s*)?(?:for|to|at|toward|towards)\s+(?:her|she)\b/i.test(afterMatch)) || (noMale && /^\s*(?:,\s*)?(?:for|to|at|toward|towards)\s+(?:him|he)\b/i.test(afterMatch))) return;
    }
    // "work his tongue over his lover" in the middle of a blowjob paragraph is the blowjob, not rimming.
    if (act === "rimming" && pat.id !== "tongue-probing" && !/\b(?:ass|arse|hole|rim|crack|cheeks|entrance|pucker)\b/i.test(sent) && /\b(?:sucking|gagg\w*|throat|cock|dick|prick|blowjob)\b/i.test(para)) return;
    // "Dean pushed the dildo into his ass" with no one else in the sentence: his own ass, so he is bottoming, not topping.
    if (cat === "anal" && !pat.signal && /\b(?:dildo|vibrator|vibe|butt\s*plug|plug|beads|toy)\b/i.test(matchText) && /^(?:his|her|their)$/i.test(bTok ?? "") && !new RegExp(`\\b(?:${cast.chars.filter((c) => c !== top).flatMap((c) => c.aliases).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") || "$^"})\\b`).test(sent)) {
      desires.push({ cat: "anal", act: "using a toy on himself", who: top, partner: bottom, role: "bottom", wants: true, kind: "solo", weight: 0.5, para: pi, sentence: original });
      return;
    }
    // "spreads his legs to wipe them": he is cleaning someone, not offering himself.
    if (/^spread-(?:their-)?legs/.test(pat.id) && /^\s*(?:and\s+)?to\s+(?:wipe|clean|dry|wash|towel|inspect|examine|check|look|see)\b/i.test(after)) return;
    if (pat.id.startsWith("spread-their-legs") && [pi - 1, pi, pi + 1].some((i) => !!paras[i] && /\b(?:kneel\w*|drops? to his knees|mouth|lick\w*|nuzzl\w*|suck\w*|tongue)\b/i.test(paras[i]) && !/\b(?:hole|lube[ds]?|ass\b|arse|fingers?|prostate)\b/i.test(paras[i]))) return;
    // "Eddie smacked his cheeks to wake himself up": "cheeks" with no ass word needs a sex scene around it.
    if ((pat.id.startsWith("grab-ass") || pat.id === "hands-on-ass") && /cheeks\b/.test(matchText) && !/\b(?:ass|arse|butt|bum|backside|behind)\b/i.test(matchText) &&
        ![pi - 2, pi - 1, pi, pi + 1].some((i) => !!paras[i] && (PENIS_CTX.test(paras[i]) || /\b(?:ass|arse|butt|hole|naked|undress\w*|moan\w*|lube\w*|condom|erection|aroused|thrust\w*|kiss\w*|bed)\b/i.test(paras[i])))) return;
    // "He smacked his cheeks to wake himself up": a pronoun subject and its own possessive (He … his), no ass word.
    if ((pat.id.startsWith("grab-ass") || pat.id === "hands-on-ass") && /cheeks\b/.test(matchText) && !/\b(?:ass|arse|butt|bum|backside|behind)\b/i.test(matchText) &&
        (/^\W*(?:He|he)\b.*\bhis\s+(?:\w+\s+){0,2}cheeks\b/.test(matchText) || /^\W*(?:She|she)\b.*\bher\s+(?:\w+\s+){0,2}cheeks\b/.test(matchText) ||
         /^\W*(?:They|they)\b.*\btheir\s+(?:\w+\s+){0,2}cheeks\b/.test(matchText) || /^\W*I\b.*\bmy\s+(?:\w+\s+){0,2}cheeks\b/.test(matchText))) return;
    if ((pat.id.startsWith("grab-ass") || pat.id === "hands-on-ass") && /cheeks\b/.test(matchText) && !/\b(?:ass|arse|butt|bum)\b/i.test(matchText) &&
        (/\b(?:cup|pinch|pat|tap|stroke)\w*\b/i.test(matchText) || /\b(?:kiss\w*|face|eyes?|tears?|lips|jaw|blush\w*|flush\w*|smil\w*|forehead|nose|head|cradl\w*|temples?|chin)\b/i.test(sent))) return;
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
    // "…parted his lips, allowing Dunk's tongue to slip inside": a tongue in a kiss.
    if (pat.id.startsWith("pushed-in") && /\btongues?\b/i.test(sent.slice(0, m.index! + m[0].length)) && /\b(?:lips|mouths?|kiss\w*)\b/i.test(sent) && !ANAL_CTX.test(sent) && !PENIS_CTX.test(sent) && !FINGER_CTX.test(sent)) return;
    // A bare "as he sank in" (into a hug, a bath) needs a cock, an ass or fingers somewhere in the paragraph.
    if (pat.id.startsWith("pushed-in") && !/\b(?:thrust|fuck|rut|snap|pound|slam)/i.test(matchText)) {
      if (![pi - 2, pi - 1, pi, pi + 1].some(bodyContext)) return;
    }
    // "opened the car door and slipped inside": a place, not a person.
    if (pat.id.startsWith("pushed-in") && /\b(?:door|car|truck|van|cab|taxi|room|house|building|shop|store|bar|elevator|lift|tent|cabin|Impala|apartment|office|kitchen|bathroom)\b/.test(sent.slice(0, m.index))) return;
    // "…slipped in just before the doors closed"
    if (pat.id.startsWith("pushed-in") && /\b(?:doors?|elevator|lift|train|bus|subway|tube|taxi|cab|car)\b/i.test(sent) && !ANAL_CTX.test(sent) && !PENIS_CTX.test(sent)) return;
    // "He hollowed his cheeks, creating a suction for Cas": the one named after "for" is getting sucked.
    // "They were so screwed", "He was fucked": the idiom, unless a person does it ("by Dean"), it says how, or the
    // sentence has anatomy or a sex word.
    // "…after having sex with other rich men, but Laurent wakes to clean himself before they bend him over again":
    // "they" are those other men, not a character, and the one done to is the sentence's subject. Past experience.
    if (pat.subj === "t" && /^they$/i.test(tTok ?? "") && cat !== "vaginal" &&
        /\b(?:other|older|rich|some|many|several|those|these|previous|different)\s+(?:[\w-]+\s+){0,2}(?:men|guys|people|clients|patrons|daddies|boys|women|girls|exes|lovers|strangers|partners|dates)\b/i.test(sent.slice(0, m.index!))) {
      const victim = firstEntity(sent.slice(0, m.index!)) ?? ctx.lastSubject;
      const other = victim && ctx.partnerOf(victim);
      if (victim && other) addHistory(cat, act, victim, "bottom", other, original, pi);
      return;
    }
    // "takes all of Laurent inside him" / "fits inside him" with a mouth earlier in the sentence: that's oral, not anal.
    if (cat === "anal" && /\binside (?:of )?(?:him|her|them|me)$/i.test(matchText) && !/\b(?:thrust\w*|fuck\w*|rut\w*|pound\w*|slam\w*|snap\w*|driv\w*)\b/i.test(matchText) &&
        ORAL_LINE_RE.test(sent.slice(0, m.index! + m[0].length)) && !ANAL_CTX.test(sent.slice(0, m.index! + m[0].length)) && !FINGER_CTX.test(sent.slice(0, m.index! + m[0].length))) return;
    // "fucked open by older men": the one doing it is named, and isn't a character.
    // It isn't an act between these two, but it says the one fucked has been fucked, which points at bottoming.
    if (pat.id.startsWith("passive-fucked") && !/\bby\b/.test(matchText) && /^\s+(?:\w+\s+){0,4}?by\s+(?!(?:him|her|them|me|you|it)\b)/i.test(sent.slice(m.index! + m[0].length))) {
      addHistory(cat, act, bottom, "bottom", top, original, pi);
      return;
    }
    // "a really old guy he dated while going down on him": "him" is the guy in the relative clause, not a character.
    if (/^(?:him|her|them)$/i.test(tTok ?? "") || /^(?:him|her|them)$/i.test(bTok ?? "")) {
      const pre = sent.slice(0, m.index! + m[0].length);
      const np = [...pre.matchAll(/\b(?:a|an|some|this|that|one|another)\s+(?:[\w-]+\s+){0,3}(?:guy|man|men|dude|ex|boyfriend|girlfriend|lover|client|stranger|woman|girl|bloke|fellow|sugar daddy|daddy|patron|date|customer)\b/gi)].pop();
      if (np && !nameRe.test(pre.slice(np.index! + np[0].length)) && /\b(?:he|she|they|who|that|whom)\b/i.test(pre.slice(np.index! + np[0].length))) {
        // Past experience with someone else: the actor's own role is what it points at.
        if (pat.subj === "t") addHistory(cat, act, top, "top", bottom, original, pi);
        else addHistory(cat, act, bottom, "bottom", top, original, pi);
        return;
      }
    }
    // "from being blown out by a hurricane", "blown away", "blow up": blowing, not a blowjob.
    if (cat === "oral" && /\bblo(?:w|wn|wing|ws|n)\s*$/i.test(matchText.replace(/\s+(?:out|away|up|over|off course)\b.*$/i, "")) && /^\s*(?:out|away|up|over|off course)\b/i.test(sent.slice(m.index! + m[0].length))) return;
    // "He bites Laurent's neck and sucks harder": a mark on the skin, not a blowjob.
    if (pat.id.startsWith("sucked-harder") && /\b(?:neck|skin|collarbone|jaw|lips?|nipples?|earlobe|ears?|shoulders?|bruise|hickey|mark|thumb|fingers?|chest|throat's|pulse)\b/i.test(sent)) return;
    // "they worshipped him": worship needs a penis in the match to be oral.
    if (cat === "oral" && /\bworship/i.test(matchText) && !PENIS_CTX.test(matchText)) return;
    // "the shadows are going to swallow him whole": only a cock (or a penis word nearby) makes it oral.
    if (pat.id.startsWith("swallowed-down") && /\bwhole\b/i.test(matchText) && !PENIS_CTX.test(sent)) return;
    // "the skin he had slipped in": a relative clause about a thing, not penetration.
    if (pat.id.startsWith("pushed-in") && /\b(?:the|a|that|this|those|these)\s+[\w-]+\s+(?:that\s+)?(?:he|she|they|I)\s+(?:had\s+|'d\s+)?$/i.test(sent.slice(0, m.index! + (matchText.search(/\b(?:slip|slid|sank|push|sunk)/i) > 0 ? matchText.search(/\b(?:slip|slid|sank|push|sunk)/i) : 0))) && !ANAL_CTX.test(sent) && !PENIS_CTX.test(sent)) return;
    // "his chained wrists … until they were stretched taut": things being stretched or filled, not a person.
    if (pat.id.startsWith("passive-fucked") && /\b(?:stretched|filled)\s*$/i.test(matchText) &&
        (/^(?:they|it|them)$/i.test(bTok ?? "") || /^\s*(?:taut|tight|thin|out|across|between|over|above|along|with (?:water|blood|light|dread|pride|joy))\b/i.test(sent.slice(m.index! + m[0].length)))) return;
    if (pat.id.startsWith("passive-fucked") && /\b(?:fucked|screwed)\b/i.test(matchText) && !/\bby\b/.test(matchText) && !IDIOM_SAFE.test(sent)) return;
    // "mimicking the way Steve had hollowed his cheeks" (smoking), "the straw", "a drag": cheeks hollowed for something else.
    if (pat.id.startsWith("hollowed-cheeks") && /\b(?:cigarettes?|smok\w*|vap\w*|drag|puff\w*|inhal\w*|exhal\w*|joint|blunt|pipe|straw|whistl\w*|fish face|kiss\w*|pout\w*|smoke)\b/i.test(para + " " + (paras[pi - 1] ?? "") + " " + (paras[pi + 1] ?? ""))) return;
    // "sucked him into the drain", "sucking Steve back into reality": not a mouth.
    if (/^sucked/.test(pat.id) && /^\s*(?:back\s+)?(?:into|out of|under|down the)\s+(?!(?:his|her|their|my|your)\s+(?:mouth|throat|lips)\b)/i.test(sent.slice(m.index! + m[0].length))) return;
    // "(the shower) was about to open up and suck him into the drain" (the match ends at "him"; the tail is a place)
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
    // Fingers busy elsewhere ("his fingers tangling in Alex's curls") don't make it fingering.
    const fingerSent = sent.replace(/\b(?:fingers?|fingertips?|digits?|knuckles?)\b[^,.;]{0,40}?\b(?:hair|curls|locks|sheets?|pillows?|shoulders?|back|neck|jaw|cheeks?|face|scalp|nape|arms?|biceps?|hands?|chest|headboard|blankets?)\b/gi, "");
    if (cat === "anal" && pat.id !== "worked-open-pushed-in" && act.startsWith("anal sex") && !PENIS_CTX.test(matchText) && FINGER_CTX.test(matchText + " " + fingerSent) && !PENIS_CTX.test(sent)) act = "fingering";
    if (pat.id === "prostate" && FINGER_CTX.test(sent) && !PENIS_CTX.test(sent)) act = "fingering";

    // Hints, not acts: checking out an ass, grabbing it, staring at a bulge...
    if (pat.signal) {
      const prefix = sent.slice(0, m.index);
      if (NEG.test(m.groups?.aux ?? "") || NEG.test(prefix.slice(-40))) return;
      if (pat.signal.kind === "fingers" && /\bown\b/i.test(matchText)) return;
      // A wish, a plan or an attempt isn't a solo act: "wanted to touch himself", "if he jerked off", "tried not to masturbate".
      if ((pat.signal.kind === "masturbation" || pat.signal.kind === "handjob") && (HYPO_AUX.test(m.groups?.aux ?? "") || /\b(?:want\w*|wish\w*|imagin\w*|fantasi[sz]\w*|thought\s+about|think\w*\s+about|if|unless|would|could|might|should|gonna|going\s+to|tempted|temptation|urge|tried|trying|try|needed|need|about\s+to|stop\w*|refus\w*|without|keep\s+from|kept\s+from|resist\w*|difficult|struggl\w*|held\s+back|hold\s+back)\b[^.!?]{0,40}$/i.test(prefix.slice(-60) + " " + (m.groups?.aux ?? "") + " " + m[0].slice(0, 25)))) return;
      // “He stroked his cock” could be his own: a handjob needs the partner in the sentence or the one before, and the
      // one before mustn't be a thought about them.
      if (pat.signal.kind === "handjob" && /^(?:his|her|their)$/i.test(bTok ?? "") && !pat.id.includes("both") && pat.id !== "frottage") {
        const at = para.indexOf(sent);
        const prevSent = (at > 0 ? para.slice(Math.max(0, at - 240), at) : "").trim().split(/(?<=[.!?”])\s+/).pop() ?? "";
        const other = ctx.partnerOf(top);
        const mentions = (txt: string) => new RegExp(`\\b(?:${NAMES})\\b|\\b(?:him|her|them)\\b`, "i").test(txt);
        const inSentence = (other ? new RegExp(`\\b${other.name.split(" ")[0]}\\b`, "i").test(sent) : false) || /\b(?:him|her)\b/i.test(sent);
        const prevOk = mentions(prevSent) && !/\b(?:thought|thinking|imagin\w*|pictur\w*|fantasi[sz]\w*|remember\w*|dream\w*|wonder\w*|alone)\b/i.test(prevSent);
        if (!inSentence && !prevOk) return;
      }
      // “Cas touched himself” is solo, but “Cas touched Dean, who was jerking himself off” has two people in it: only the subject counts.

      // "licking a couple fingers and pushing them in together": wetting his own fingers to open someone up, not being sucked on.
      if (pat.id === "suck-fingers" && /^[^.!?]{0,60}?\b(?:push|press|slid|slip|work|insert|sink|guid|ease)\w*\s+(?:them|it)\s+(?:in|into|inside)\b/i.test(after)) return;
      if (pat.signal.kind === "fingers" && /\bwhistl\w*/i.test(sent)) return;
      if (cat === "oral" && oralKindOf(act) === "blowjob" && top.penis === false && bottom.penis === false && !/\b(?:cock|dick|penis)\b/i.test(para)) return;
      // Fights, torture and rescues: shoving, gripping, lifting and shielding aren't dominance when they come with danger
      // and no sexual words, and a plural "they" is a group, not the partner.
      if (cat === "vibe" && (pat.signal.kind === "behavior" || pat.signal.kind === "position")) {
        // Dancing and family hugs aren't dominance: "took the lead, guiding Cas in a box step", "tucked his head into his brother's chest".
        if (/\b(?:danc\w*|waltz\w*|box step|tango|foxtrot)\b|\b(?:brother|sister|father|mother|mom|son|daughter|uncle|aunt|grandma|grandpa)\b/i.test(original)) return;
        if (/^they$/i.test(tTok ?? "") || /^(?:the|a)\s+(?:man|guy|dude|stranger|bastard|cop|officer)$/i.test(tTok ?? "")) return;
        const recent = original + " " + (paras[pi] ?? "").slice(Math.max(0, (paras[pi] ?? "").indexOf(original) - 200), (paras[pi] ?? "").indexOf(original));
        if (DANGER.test(recent) && (recent.match(SEX_STRICT) ?? []).length === 0) return;
      }
      // Behaviour hints need two people: "pressing them into his chest" (knees) and "grabbed his opposite wrist" are not.
      if (cat === "vibe" && (/^(?:them|it)$/i.test(bTok ?? "") || /^(?:them|it)$/i.test(tTok ?? "") || /\b(?:own|opposite|other)\s+(?:wrist|hand|chin|hair|neck)/i.test(matchText))) return;
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
        reflexive: pat.signal.kind === "solo" && REFLEXIVE.test(matchText) ? true : undefined,
        basis,
      });
      return;
    }

    // "thrust forward into Eddie, who moaned as Steve hit the back of his throat": a mouth, not an ass.
    if (cat === "anal" && /\b(?:throat|mouth)\b/i.test(sent) && !ANAL_CTX.test(sent) && !FINGER_CTX.test(sent) && !/\b(?:could swear|swear|felt like|feels like|feeling like|as if|as though|kiss\w*|lips?|nips?|nibbl\w*|tongue)\b/i.test(sent) &&
        (/\b(?:back of (?:his|her|their) throat|down (?:his|her|their) throat|in(?:to)? (?:his|her|their|\w+['’]s) mouth)\b/i.test(sent) || /\b(?:cock|dick|length)\b[^.!?]{0,20}\bin(?:to)? (?:his|her|their) throat\b/i.test(sent))) {
      cat = "oral";
      act = "blowjob (face-fucking)";
    }
    // "made wet, filthy sounds around him … as he emptied into him": the sounds are a mouth around a cock, so a blowjob.
    if (cat === "anal" && /^(?:came-inside|bottomed-out|push-into|fuck)/.test(pat.id) && !ANAL_CTX.test(sent) && !FINGER_CTX.test(sent) &&
        /\b(?:sounds?|noises?|gagg\w*|chok\w*|slurp\w*|swallow\w*|suck\w*|sloppy|messy|wet)\b[^.!?]{0,30}\baround\s+(?:him|it|his|her|their)\b/i.test(sent)) {
      cat = "oral";
      act = "blowjob";
    }
    // Anal or vaginal? Decided by the words used (male omegas and trans men can have vaginas),
    // falling back to anatomy when the text doesn't say.
    // "Shannon rides him … Buck could fuck him like this": a woman riding is vaginal unless an ass or hole is named.
    if (cat === "anal" && /riding/.test(act) && bottom.vulva === true && bottom.penis !== true && top.penis !== false && !/\b(?:ass|arse|hole|anal|butt)\b/i.test(sent)) {
      cat = "vaginal";
      act = "vaginal sex (riding)";
    }
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
      } else if (top.penis === false && act !== "fingering" && !/\b(?:sodomi[sz]\w*|bugger\w*)\b/i.test(sent) && !/\b(?:strap\w*|dildo|toy|peg\w*|harness|butt ?plug|vibrator|anal beads)\b/i.test(para)) {
        // A woman "fucking" someone with no strap-on mentioned: not anal penetration by her.
        return;
      }
    }
    if (act === "rimming" && (VULVA_CTX.test(matchText) || (bottom.vulva === true && !ANAL_CTX.test(para)))) act = "cunnilingus";
    if (pat.femaleTarget && !PENIS_CTX.test(matchText)) {
      // "went down on her": the receiver has a vagina, so it's cunnilingus and the licker is the top.
      const receiverHasVulva =
        (top.vulva === true && top.penis !== true) || (top.vulva === "maybe" && VULVA_CTX.test(sent)) || ((top.gender === "f" || /^her$/i.test(tTok ?? "")) && top.penis !== true && !PENIS_CTX.test(sent));
      if (receiverHasVulva) {
        if (pat.femaleTarget === "drop") return;
        [top, bottom] = [bottom, top];
        act = "cunnilingus";
      }
    }
    // A cock-sucking hint between two people with no penis (and no strap-on or toy about) is something else: fingers in the mouth, a kiss.
    if (cat === "oral" && oralKindOf(act) === "blowjob" && top.penis === false && bottom.penis === false && !/\b(?:cock|dick|penis)\b/i.test(para)) return;
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
    // "just not yet, not before he bottomed out" delays an act and "it didn't take long for Dean to cum" is an idiom:
    // neither says the act doesn't happen.
    const negWindow = (/^\s*,/.test(m[0]) ? "" : window.slice(-40)).replace(/^.*,\s*/, "").replace(/\bwithout\s+(?:any\s+|much\s+|further\s+|more\s+|so much as\s+|a\s+)*(?:preamble|ado|hesitation|hesitating|warning|ceremony|delay|word|sound|protest|pause|question|complaint|fanfare|prelude|resistance|effort|being asked|asking|waiting|thought)\b|\b(?:just\s+)?not\s+(?:just\s+)?(?:yet|before|until|quite|now)\b|\b(?:did|does|do|would|will|won|could)(?:n['’]t| not)\s+take\s+(?:long|much|any time|a lot)\b/gi, " ");
    // "if Cas doesn't fuck him soon, he might die": a conditional, which says it is wanted, not refused.
    const ifNot = /\bif\s+(?:[\w'’-]+\s+){0,2}(?:doesn['’]t|don['’]t|didn['’]t|won['’]t|hadn['’]t|isn['’]t|wasn['’]t)\s*$/i.test(window) || (/\bif\s+(?:[\w'’-]+\s+){0,2}$/i.test(window) && NEG.test(aux));
    // "tried not to suppress the urge to pull out and snap back in": not resisting a wish means having it.
    const doubleNeg = /\b(?:not|n['’]t|never|without)\s+(?:to\s+)?(?:\w+\s+){0,2}?(?:suppress|resist|fight|hold back|stifle|restrain|deny|ignore|squash|stop|hide|push down|swallow|fight off)\w*\s+(?:\w+\s+){0,2}(?:urge|desire|need|want|impulse|temptation|craving)/i.test(window);
    // "Not without taking Eddie's dick out of his mouth": not … without cancels out.
    const notWithout = /\bnot\s+without\s+(?:\w+\s+){0,2}$/i.test(window);
    const negated = !ifNot && !doubleNeg && !notWithout && (NEG.test(aux) || NEG.test(negWindow));
    let kind: Desire["kind"] | "act" = "act";
    if (fantasyPara || FANTASY.test(window) || STRONG_FANTASY.test(prefix)) kind = "fantasy";
    else if (DESIRE_LEAD.test(sent) || DESIRE.test(window) || DESIRE_TAIL.test(window) || DESIRE.test(aux) || DESIRE.test(m.groups?.lead ?? "")) kind = "wanted";
    else if (/\b(?:want|need|wish|hope|long|crave)\w*\b[^.!?]*\b(?:and|but)\s+(?:then\s+)?(?:have|let|make|get)\s*$/i.test(prefix)) kind = "wanted";
    else if (/\b(?:want|need|wish|hope|long|crave)\w*\s+(?:\w+\s+){0,3}?to\b[^.!?]*\band\s+\w*(?:\s+\w*){0,2}$/i.test(prefix + matchText.slice(0, 14))) kind = "wanted";
    else if (HABIT_AUX.test(aux) && (pat.id === "bottomed-for" || pat.id === "topped")) kind = "identity";
    else if (
      !/\bas (?:if|though)\s+(?:he|she|they)\s+(?:wasn['’]t|weren['’]t|was not|were not|hadn['’]t been|had not been)\s+(?:the\s+(?:man|guy|one|person|boy|woman|girl)|Epithet\d+)\s+(?:who|that)\b/i.test(prefix) &&
      !(/\bas (?:if|though)\s*$/i.test(prefix) && /\b(?:isn['’]t|wasn['’]t|aren['’]t|weren['’]t|is not|was not|were not|not)\b[^.!?]*\benough\b/i.test(sent.slice(m.index!))) &&
      ((HYPO_AUX.test(aux) && !/\bcould\s+(?:\w+\s+)?(?:taste|feel|smell|hear|see)\b/i.test(prefix.slice(-25) + matchText.slice(0, 30))) || HYPO_MATCH.test(prefix.slice(-25) + matchText) || /\b(?:can|could|would|should)\s+(?:just\s+)?\w+\b[^.!?]*\band\s*\w*$/i.test(prefix + matchText.slice(0, 6)) || HYPO_WINDOW.test(window) || HYPO_SENT.test(prefix) || (/\bthan\s+(?:it\s+was\s+|it's\s+)?$/i.test(prefix) && /^to\b/i.test(matchText)) || /\bthan\s+(?:it\s+was\s+|it's\s+)?to\s*$/i.test(prefix) || /\b(?:like|as if|as though)\s+(?:he|she|they|I)(?:['’]s|['’]d|\s+(?:is|was|were|are|had|has|would))?\s*$/i.test(prefix) || (/\b(?:like|as if|as though)\s*$/i.test(prefix) && /^(?:he|she|they|I)\b/.test(matchText)) ||
      (/\bso\s*$/i.test(window) && /\b(?:can|could|might|may|will|would)\b/i.test(aux)) ||
      /\b(?:would|could|might)\s+(?:want|like|love|wish|prefer|enjoy|rather|fit)\b[^.!?;]{0,70}?\b(?:as|while|when|if|so)\s+(?:[\w'’]+\s+)?$/i.test(prefix))
    ) kind = "hypothetical";

    if (kind === "act") {
      if (negated) return;
      // The newer oral patterns overlap each other and the older ones ("wraps his lips around Alex, a tap of his tongue
      // around the head"): they add to a sentence's evidence only once.
      const dup = pat.dedupe ? acts.find((a) => a.para === pi && a.sentence === original && a.cat === cat && a.top === top && a.bottom === bottom) : undefined;
      if (dup) {
        if (weight > dup.weight) { dup.weight = weight; dup.basis = basis; }
        ctx.setPartners(cat, top, bottom);
        ctx.lastSubject = pat.subj === "t" ? top : bottom;
        return;
      }
      // "Dracula rode him": with no cock, lap or "on" in the sentence it says nothing about who is inside whom.
      const shaky = /^riding/.test(pat.id) && /^(?:him|her|them|it)$/i.test(tTok ?? "") && !/\b(?:cock|dick|prick|length|shaft|lap|dildo|strap|on|onto|astride|straddl\w*)\b/i.test(sent.slice(m.index!).replace(/^\S+\s+\S+\s+/, ""))
        ? "“rode him” can describe either partner" : holeGuess === "ambiguous" ? "the sentence doesn't say which hole" : undefined;
      acts.push({ cat, act, top, bottom, weight, basis, para: pi, sentence: original, holeGuess, shaky, context: contextAround(paras[pi] ?? "", original) });
      ctx.setPartners(cat, top, bottom);
      ctx.lastSubject = pat.subj === "t" ? top : bottom;
      return;
    }

    // Whose desire is it? The first person mentioned before the desire word, else the subject.
    const wantAnd = /\b(?:want|need|wish|hope|long|crave)\w*\b[^.!?]*\b(?:and|but)\s+(?:then\s+)?(?:have|let|make|get)\s*$/i.test(prefix);
    const exp = (wantAnd ? firstEntity(sent) : undefined) ?? firstEntity(window) ?? (pat.subj === "t" ? top : bottom);
    const role: Role | undefined = exp === top ? "top" : exp === bottom ? "bottom" : undefined;
    if (!role) return;
    // "There was no way Steve was asking him to fuck him": disbelief about a claim, not a dislike of the act.
    if (negated && /\bno\s+(?:fucking\s+|damn\s+)?(?:way|chance)\b|\bnot\s+a\s+chance\b|\bas\s+if\b|\bthere\s+(?:was|is)\s+no\s+(?:possible\s+)?(?:way|chance)\b/i.test(prefix.slice(-90))) return;
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
      basis,
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
    if (top.penis === false && top.vulva === true && !/\b(?:strap\w*|dildo|toy|peg\w*|harness|butt ?plug|vibrator|anal beads)\b/i.test(para)) return "vaginal";
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

  // The same hint read by two patterns ("wanted to be full of Cas, wanted Cas spilling down his throat") counts once.
  {
    const seen = new Set<string>();
    desires = desires.filter((d) => {
      const key = [d.para, d.sentence, d.cat, d.who.name, d.role, d.wants, d.kind].join("\u0000");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // The work's categories set a presumption: tagged only M/M, men have sex with each other; tagged only F/F, women do.
  // Any other category in the mix (F/M, Multi, Other) removes it. It is context, not a ban: a scene with someone of the
  // other gender stays when it is clearly real (both people named, or the pair is seen more than once), and is dropped
  // when it rests on a single pronoun-only or inferred reading, which is where false flags come from.
  {
    const cats = meta.categories.map((c) => c.trim().toUpperCase());
    const onlyOf = (c: string) => cats.includes(c) && cats.every((x) => x === c || x === "GEN");
    const excluded: Gender | undefined = onlyOf("M/M") ? "f" : onlyOf("F/F") ? "m" : undefined;
    if (excluded) {
      const out = (c: Character) => c.gender === excluded && c.name !== "Reader";
      const key = (a: Character, b: Character) => [a.name, b.name].sort().join("\u0000");
      const seen = new Map<string, Set<string>>();
      for (const a of acts) {
        if (!(out(a.top) || out(a.bottom))) continue;
        const k = key(a.top, a.bottom);
        seen.set(k, (seen.get(k) ?? new Set()).add(`${a.para}\u0000${a.sentence}`));
      }
      const keepAct = (a: ActHit) => !(out(a.top) || out(a.bottom)) || a.basis === "named" || (seen.get(key(a.top, a.bottom))?.size ?? 0) >= 2;
      acts = acts.filter(keepAct);
      const kept = new Set(acts.map((a) => `${key(a.top, a.bottom)}\u0000${a.cat}`));
      desires = desires.filter((d) => !(out(d.who) || (d.partner && out(d.partner))) || (!!d.partner && kept.has(`${key(d.who, d.partner)}\u0000${d.cat}`)));
    }
  }

  const where = (pi: number) => chapters[pi] || `~${Math.round((pi / Math.max(1, paras.length)) * 100)}% through`;
  const pairKey = (a: Character, b: Character) => [a.name, b.name].sort().join("\u0000");
  const pairOrder = new Map<string, [Character, Character]>();
  for (const p of cast.pairings) if (!pairOrder.has(pairKey(p[0], p[1]))) pairOrder.set(pairKey(p[0], p[1]), p);

  const keys = new Set<string>();
  for (const a of acts) keys.add(pairKey(a.top, a.bottom));
  for (const d of desires) if (d.partner && d.cat !== "vibe") keys.add(pairKey(d.who, d.partner));
  const mainPair = cast.pairings[0];
  if (mainPair) keys.add(pairKey(mainPair[0], mainPair[1]));

  const results: (PairingResult & { weight: number; key: string })[] = [];
  for (const key of keys) {
    const pActs = acts.filter((a) => pairKey(a.top, a.bottom) === key);
    const allPairDes = desires.filter((d) => d.partner && pairKey(d.who, d.partner) === key);
    // Solo acts get their own card. Self-fingering and toys on oneself still count toward anal bottom evidence, but only for
    // someone with an ass in play: a woman fingering herself is vaginal unless the sentence says ass.
    const soloDes = allPairDes.filter((d) => d.kind === "solo" || d.kind === "masturbation");
    const manualDes = allPairDes.filter((d) => d.kind === "handjob");
    const pDes = allPairDes.filter((d) => d.kind !== "masturbation" && d.kind !== "handjob" && !(d.kind === "solo" && !soloIsAnal(d)));
    const tagged = pairOrder.get(key);
    const members = tagged ?? (pActs[0] ? [pActs[0].top, pActs[0].bottom] : pDes[0] ? [pDes[0].who, pDes[0].partner!] : undefined);
    if (!members) continue;
    const isMain = !!mainPair && key === pairKey(mainPair[0], mainPair[1]);
    const pairTags = tagsFor(tags, members as [Character, Character], isMain);
    const pair = members as [Character, Character];
    // Two women with no anal in the text: "Top X / Bottom Y" tags are about strap-on or other play, not anal sex.
    const analWords = /\b(?:ass|arse|butt|anal|asshole|arsehole|hole|plug|rim\w*|backdoor)\b/i;
    const noAnalHere = pair[0].penis === false && pair[1].penis === false && !pActs.some((a) => a.cat === "anal") && pDes.filter((d) => d.cat === "anal" && analWords.test(d.sentence ?? "")).length < 3;
    const analTags: PairTags = noAnalHere ? { roles: [], dynamics: [], dynamicTags: [], switching: [], actTags: { ...pairTags.actTags, anal: [] } } : pairTags;
    const anal = buildAct("anal", pActs.filter((a) => a.cat === "anal"), noAnalHere ? [] : pDes.filter((d) => d.cat === "anal"), analTags, pair, meta, where);
    const oralActs = pActs.filter((a) => a.cat === "oral");
    const oralDes = pDes.filter((d) => d.cat === "oral");
    const oral = buildAct("oral", oralActs, oralDes, pairTags, pair, meta, where);
    const [blowjob, rimming, cunnilingus] = ORAL_KINDS.map((kind) =>
      buildAct("oral", oralActs.filter((a) => oralKindOf(a.act) === kind), oralDes.filter((d) => oralKindOf(d.act) === kind), pairTags, pair, meta, where, kind),
    );
    const vaginal = buildVaginal(pActs.filter((a) => a.cat === "vaginal"), pair, meta, where);
    const weight = pActs.reduce((n, a) => n + a.weight, 0) + pDes.filter((d) => d.cat !== "vibe").length * 0.2 + (isMain ? 0.01 : 0);
    // Skip incidental pairs with almost nothing (likely misresolved pronouns); a tagged pair needs less.
    if (!isMain && weight < (tagged ? 0.5 : 1.2)) continue;
    // A work with relationship tags and a pair nobody tagged: a couple of pronoun-only or inferred readings are far more
    // likely a misread "he" in the main couple's scene than a second couple, so it needs named scenes or more of them.
    if (!tagged && cast.pairings.length && pActs.every((a) => a.cat !== "vaginal") && pActs.filter((a) => a.basis === "named").length < 2 && pActs.length < 4) continue;
    // Two people who share a family name (Sam and Dean Winchester) and aren't tagged as a pair are far more likely a misread
    // "he" in someone else's scene than a couple.
    {
      const last = (n: string) => n.trim().split(/\s+/).slice(-1)[0].toLowerCase();
      if (!tagged && members[0].name.includes(" ") && members[1].name.includes(" ") && last(members[0].name) === last(members[1].name) && pActs.filter((a) => a.basis === "named").length < 4) continue;
    }
    const vibe = buildVibes(pair, pActs, pDes, pairTags, meta, where);
    const solo = buildSolo(pair, soloDes, where);
    const manual = buildManual(pair, manualDes, where);
    results.push({ pairing: `${members[0].name}/${members[1].name}`, anal, oral, blowjob, rimming, cunnilingus, vaginal, solo, manual, vibe, weight, key });
  }
  results.sort((a, b) => b.weight - a.weight);

  const notes: string[] = [];
  // Rated Explicit / Not Rated and tagged only M/M (or only F/F), yet no act was recognised: the sex is probably there but
  // written non-graphically or in phrasing the patterns miss, so point at the passages that read like sex scenes.
  {
    const cats = meta.categories.map((c) => c.trim().toUpperCase());
    const kind = cats.includes("M/M") && cats.every((x) => x === "M/M" || x === "GEN") ? "M/M" : cats.includes("F/F") && cats.every((x) => x === "F/F" || x === "GEN") ? "F/F" : "";
    const rated = /explicit|not rated/i.test(meta.rating ?? "");
    const actCount = results.reduce((n, r) => n + [r.anal, r.blowjob, r.rimming, r.cunnilingus].reduce((m, a) => m + a.instances.length, 0) + (r.vaginal?.instances?.length ?? 0), 0);
    if (kind && rated && actCount <= 1) {
      const AROUSAL = /\b(?:moan\w*|gasp\w*|orgasm\w*|climax\w*|came|cum|thrust\w*|grind\w*|arch\w*|naked|nipples?|pleasure|unbutton\w*|undress\w*|writh\w*|shudder\w*|sheets|hips|between (?:her|his|their) (?:legs|thighs)|panting|breathless|sweat\w*|trembl\w*|clothes)\b/gi;
      const scored = paras
        .map((para, i) => ({ para, i, n: new Set((para.match(AROUSAL) ?? []).map((w) => w.toLowerCase())).size }))
        .filter((x) => x.n >= 2 && x.para.length < 2500)
        .sort((a, b) => b.n - a.n || a.i - b.i)
        .slice(0, 3)
        .sort((a, b) => a.i - b.i);
      if (scored.length) {
        const quote = (t: string) => `“${t.replace(/\s+/g, " ").trim().slice(0, 170)}${t.length > 170 ? "…" : ""}”`;
        notes.push(
          `This work is rated ${meta.rating} and tagged only ${kind}, but ${actCount ? "only one" : "no"} ${kind} sex act was recognized. The sex may be written without explicit detail, or in phrasing these patterns don't cover. Passages that read like sex scenes: ${scored.map((x) => quote(x.para)).join(" · ")}`,
        );
      }
    }
  }

  {
    const named = results.flatMap((r) => r.pairing.split("/")).map((n) => n.trim());
    const priors = tagPriors(meta, cast.chars.filter((c) => named.includes(c.name)));
    if (priors.size)
      notes.push(`As a very faint tie-breaker, how often AO3 tags ${[...priors.keys()].join(", ")} as a top or bottom was used; anything in the text outweighs it.`);
  }

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
    pairings: results.map(({ weight: _w, key: _k, ...p }) => p),
    notes: notes.join(" "),
  };
}

// ───────────── solo acts ─────────────

/** Whether a self-fingering or toy sentence is about an ass: always for someone with no vulva, only when the words say so for someone with one. */
function soloIsAnal(d: { who: Character; sentence: string }): boolean {
  if (ANAL_CTX.test(d.sentence)) return true;
  const vulvaHolder = d.who.vulva === true || (d.who.gender === "f" && d.who.penis !== true);
  if (VULVA_CTX.test(d.sentence)) return false;
  return !vulvaHolder;
}

function soloLabel(d: { act: string; kind: string; sentence: string }): string {
  if (d.kind === "masturbation") return "Masturbation";
  if (/toy|dildo|plug|vibrator|ride|rode/i.test(d.act) || SOLO_TOY.test(d.sentence)) return "Toy on self";
  return "Self-fingering";
}

function buildSolo(pair: [Character, Character], hits: DesireHit[], where: (pi: number) => string): SoloResult {
  const seen = new Set<string>();
  const instances: SoloAct[] = [];
  for (const d of hits) {
    if (!d.wants || !pair.includes(d.who)) continue;
    const key = `${d.who.name}\u0000${d.para}\u0000${d.sentence}`;
    if (seen.has(key)) continue;
    seen.add(key);
    instances.push({ who: d.who.name, act: soloLabel(d), evidence: truncate(d.sentence), where: where(d.para) });
  }
  const people = pair.map((c) => {
    const mine = instances.filter((i) => i.who === c.name);
    const acts = [...new Set(mine.map((i) => i.act))].map((act) => ({ act, count: mine.filter((i) => i.act === act).length }));
    return { name: c.name, total: mine.length, acts };
  });
  const listed = people.filter((p) => p.total).map((p) => `${p.name}: ${p.acts.map((a) => `${a.act.toLowerCase()} ×${a.count}`).join(", ")}`);
  return {
    occurs: instances.length > 0,
    summary: listed.length ? listed.join("; ") : "No solo acts recognized.",
    people,
    instances,
  };
}

function buildManual(pair: [Character, Character], hits: DesireHit[], where: (pi: number) => string): ManualResult {
  const seen = new Set<string>();
  const instances: ManualAct[] = [];
  for (const d of hits) {
    if (!d.wants || !d.partner || !pair.includes(d.who) || !pair.includes(d.partner)) continue;
    const key = `${d.para}\u0000${d.sentence}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const mutual = /^(?:mutual|frottage)/i.test(d.act);
    const act = d.act === "frottage" ? "Frottage" : mutual ? "Mutual handjob" : "Handjob";
    instances.push({ giver: d.who.name, receiver: d.partner.name, act, mutual, evidence: truncate(d.sentence), where: where(d.para) });
  }
  const people = pair.map((c) => ({
    name: c.name,
    gives: instances.filter((i) => !i.mutual && i.giver === c.name).length,
    gets: instances.filter((i) => !i.mutual && i.receiver === c.name).length,
    mutual: instances.filter((i) => i.mutual).length,
  }));
  const parts: string[] = [];
  for (const p of people) if (p.gives) parts.push(`${p.name} gives a handjob ×${p.gives}`);
  const mut = instances.filter((i) => i.mutual).length;
  if (mut) parts.push(`mutual/frottage ×${mut}`);
  return { occurs: instances.length > 0, summary: parts.length ? parts.join("; ") : "No handjobs or frottage recognized.", people, instances };
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
  roles: { char: Character; role: "top" | "bottom" | "switch"; tag: string; style?: "power" | "service" | "pillow" }[];
  dynamics: { char: Character; lean: "top" | "bottom"; tag: string }[];
  dynamicTags: string[];
  switching: string[];
  actTags: Record<"anal" | "oral" | OralKind, string[]>;
}

function tagsFor(info: TagInfo, pair: [Character, Character], isMain: boolean): PairTags {
  return {
    roles: info.roles.filter((r) => pair.includes(r.char)),
    dynamics: info.dynamics.filter((r) => pair.includes(r.char)),
    dynamicTags: isMain ? info.dynamicTags : [],
    switching: isMain ? info.switching : [],
    actTags: isMain
      ? { anal: info.anal, oral: info.oral, blowjob: info.blowjobs, rimming: info.rimming, cunnilingus: info.oral.filter((t) => /cunnilingus|eating out|pussy/i.test(t)) }
      : { anal: [], oral: [], blowjob: [], rimming: [], cunnilingus: [] },
  };
}

/**
 * Overall top/bottom "vibe" for each partner, from every kind of evidence, in descending order of importance: sex acts,
 * stating what they are or prefer (and AO3 role tags), groping and similar, desires/plans/fantasies, other hints, dominant
 * or submissive behaviour, then AO3 tag counts for the character.
 */
function buildVibes(pair: [Character, Character], acts: ActHit[], des: DesireHit[], tags: PairTags, meta: Ao3Meta, where: (pi: number) => string): VibeRating[] {
  const other = (c: Character) => (pair[0] === c ? pair[1] : pair[0]);
  const items = new Map<Character, VibeItem[]>(pair.map((c) => [c, []]));
  type Src = Pick<VibeItem, "what" | "source" | "where" | "fromOther">;
  const add = (c: Character, tier: VibeItem["tier"], role: Role, weight: number, src: Src = {}) => items.get(c)?.push({ tier, role, weight, ...src });
  const theirs = (src: Src): Src => ({ ...src, fromOther: true });
  const flip = (r: Role): Role => (r === "top" ? "bottom" : "top");

  // 1. Sex acts: penetration, strap-ons and fingering (oral isn't about topping).
  for (const a of acts) {
    if (a.cat !== "anal" && !(a.cat === "vaginal" && !/scissor/i.test(a.act))) continue;
    const w = (a.basis === "named" ? 1 : a.basis === "pronoun" ? 0.8 : 0.6) * (/fingering/i.test(a.act) ? 0.15 : 0.5) * (a.shaky ? 0.4 : 1);
    const src = { what: `${a.act} (${a.basis === "named" ? "named" : a.basis === "pronoun" ? "via pronouns" : "inferred"}${a.shaky ? `; ${a.shaky}` : ""})`, source: a.sentence, where: where(a.para) };
    add(a.top, 1, "top", w, src);
    add(a.bottom, 1, "bottom", w, theirs(src));
  }
  // 2. Saying what they are or prefer, and AO3 role tags.
  for (const r of tags.roles) {
    if (!items.has(r.char)) continue;
    const src = { what: `AO3 tag “${r.tag}”`, source: r.tag };
    if (r.role === "switch") {
      add(r.char, 2, "top", 0.6, src);
      add(r.char, 2, "bottom", 0.6, src);
    } else {
      add(r.char, 2, r.role, r.style === "pillow" ? 0.9 : 1, src);
      add(other(r.char), 2, flip(r.role), 0.5, theirs(src));
      // A power bottom runs the show; a service top is there to please.
      if (r.style === "power") add(r.char, 6, "top", 0.5, { ...src, what: `${src.what} (a power bottom takes charge)` });
      if (r.style === "service") add(r.char, 6, "bottom", 0.4, { ...src, what: `${src.what} (a service top gives way)` });
    }
  }
  // "Dominant Dean", "Submissive Cas": a dynamic, which leans that way but isn't the same as topping.
  for (const d of tags.dynamics) {
    if (!items.has(d.char)) continue;
    const src = { what: `AO3 tag “${d.tag}”`, source: d.tag };
    add(d.char, 2, d.lean, 0.6, src);
    add(other(d.char), 2, flip(d.lean), 0.3, theirs(src));
  }
  for (const c of pair) if (tags.switching.length) { const src = { what: `AO3 tag “${tags.switching[0]}”`, source: tags.switching[0] }; add(c, 2, "top", 0.4, src); add(c, 2, "bottom", 0.4, src); }
  const TIER_OF: Partial<Record<Desire["kind"], [VibeItem["tier"], number]>> = {
    identity: [2, 1],
    touch: [3, 0.4], fingering: [3, 0.4], prep: [3, 0.4],
    said: [4, 0.6], wanted: [4, 0.8], fantasy: [4, 0.6], hypothetical: [4, 0.4], history: [4, 0.5],
    ogling: [5, 0.4], fingers: [5, 0.4], solo: [5, 0.4],
    behavior: [6, 0.4],
    // Says what they are or prefer (tier 2), aftermath of sex (tier 3), position, aftercare and pet names (tier 6).
    stated: [2, 0.8], body: [3, 0.8], position: [6, 0.4], aftercare: [6, 0.3], petname: [6, 0.25],
  };
  const selfToyVibe = new Map<string, number>();
  for (const d of des) {
    const dsrc: Src = { what: `${d.act} (${d.kind}${d.wants ? "" : ", not wanted"}${d.guessed ? "; speaker guessed from the narration" : ""})`, source: d.sentence, where: where(d.para) };
    if (usesToyOnSelf(d) && d.wants && items.has(d.who)) {
      const seen = (selfToyVibe.get(`${d.who.name}|${d.para}`) ?? 0) + 1;
      selfToyVibe.set(`${d.who.name}|${d.para}`, seen);
      if (seen <= 2) add(d.who, 1, "bottom", 0.5 * selfToyStrength(d) * (seen === 1 ? 1 : 0.5), dsrc);
      continue;
    }
    const hit = TIER_OF[d.kind];
    if (!hit || !items.has(d.who)) continue;
    if (d.cat === "oral") continue;
    const [tier, w] = hit;
    add(d.who, tier, d.wants ? d.role : flip(d.role), (d.wants ? w : w * 0.5) * (d.kind === "stated" || d.kind === "body" ? Math.min(1, d.weight + 0.2) : 1), dsrc);
    // Position and aftercare are two-sided: the one resting on a chest or held close means the other is the chest or the arms.
    if (d.wants && (d.kind === "position" || d.kind === "aftercare")) add(other(d.who), tier, flip(d.role), w * 0.7, theirs(dsrc));
    // A tag that names the pair's dynamic ("Dom/sub", "Praise Kink") backs up who gives the orders, the praise or the care.
    if (tags.dynamicTags.length && d.wants && (d.kind === "petname" || d.kind === "aftercare")) add(d.who, 2, d.role, w * 0.5, { ...dsrc, what: `${dsrc.what}; backed up by a dynamic tag (${tags.dynamicTags[0]})` });
  }
  // 7. How AO3 tags the character overall.
  for (const [name, pr] of tagPriors(meta, pair)) {
    const c = pair.find((x) => x.name === name);
    if (!c) continue;
    const lean = (pr.pTop - 0.5) * 2;
    add(c, 7, lean > 0 ? "top" : "bottom", Math.abs(lean) * 0.6, { what: `AO3 tag counts for ${name}: ${Math.round(pr.pTop * 100)}% of tagged roles are top`, source: "community Top Tops / Top Bottoms / Most Versatile sheets" });
  }
  return pair.map((c) => rateVibe(c.name, items.get(c) ?? []));
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

// ───────────── how sure each desire / fantasy / hint line is ─────────────

/** How much a line of this kind says, before looking at its wording. */
const DESIRE_BASE: Partial<Record<Desire["kind"], number>> = {
  said: 0.8, stated: 0.8, identity: 0.85, wanted: 0.75, history: 0.7, fantasy: 0.6, hypothetical: 0.45,
  body: 0.65, masturbation: 0.7, handjob: 0.7, solo: 0.6, fingering: 0.6, touch: 0.55, prep: 0.55, fingers: 0.5,
  ogling: 0.55, behavior: 0.5, aftercare: 0.5, position: 0.5, petname: 0.5,
};
const DESIRE_NOTE: Partial<Record<Desire["kind"], string>> = {
  said: "said outright in dialogue", stated: "a stated preference", identity: "says what they are", wanted: "a stated want",
  history: "something they have done", fantasy: "a fantasy", hypothetical: "a ‘what if’ or conditional", body: "a bodily sign after sex",
  solo: "a solo act", ogling: "a look", touch: "a touch short of sex", prep: "lead-up", fingers: "fingers and mouth", behavior: "everyday behaviour",
  aftercare: "care or comfort", position: "a position", petname: "a pet name",
};
const HEDGE = /\b(?:maybe|perhaps|kind of|sort of|almost|might|seemed|as if|as though|probably|supposedly|apparently)\b/i;

/** Per-line confidence for every desire, fantasy and hint of an act. `pointsTo` says who the line makes the top. */
function scoreDesires(sig: DesireHit[], pointsTo: (d: DesireHit) => string | undefined): Map<DesireHit, { conf: number; reasons: string[] }> {
  const sentencesBy = new Map<string, Set<string>>();
  for (const d of sig) {
    const t = pointsTo(d);
    if (!t) continue;
    if (!sentencesBy.has(t)) sentencesBy.set(t, new Set());
    sentencesBy.get(t)!.add(`${d.para}\u0000${d.sentence}`);
  }
  const out = new Map<DesireHit, { conf: number; reasons: string[] }>();
  for (const d of sig) {
    const reasons: string[] = [];
    let conf = (DESIRE_BASE[d.kind] ?? 0.5) * (0.7 + 0.3 * Math.min(1, d.weight));
    if (DESIRE_NOTE[d.kind]) reasons.push(DESIRE_NOTE[d.kind]!);
    if (d.guessed) { conf -= 0.2; reasons.push("speaker guessed from the narration"); }
    else if (d.basis === "named") conf += 0.05;
    else if (d.basis === "inferred") { conf -= 0.15; reasons.push("people inferred, not named"); }
    else if (d.basis === "pronoun") reasons.push("people found through pronouns");
    if (!d.wants) reasons.push("negated, so it counts the other way");
    if (HEDGE.test(d.sentence)) { conf -= 0.1; reasons.push("hedged wording"); }
    const t = pointsTo(d);
    if (t) {
      const mine = `${d.para}\u0000${d.sentence}`;
      const agree = (sentencesBy.get(t)?.size ?? 1) - 1;
      let conflict = 0;
      for (const [other, set] of sentencesBy) if (other !== t) conflict += set.size - (set.has(mine) ? 1 : 0);
      if (agree) { conf += Math.min(0.09, 0.03 * agree); reasons.push(`${agree} other line${agree === 1 ? "" : "s"} point the same way`); }
      if (conflict) { conf -= Math.min(0.12, 0.04 * conflict); reasons.push(`${conflict} other line${conflict === 1 ? "" : "s"} point the other way`); }
    }
    out.set(d, { conf: Math.max(0.15, Math.min(0.95, conf)), reasons });
  }
  return out;
}
/** A line's weight in the verdict and the odds: 1 at 70% sure, less when shakier, a little more when firm. */
const confFactor = (conf: number) => Math.max(0.3, Math.min(1.2, conf / 0.7));

function buildAct(
  cat: Cat,
  hits: ActHit[],
  des: DesireHit[],
  tags: PairTags,
  pair: [Character, Character],
  meta: Ao3Meta,
  where: (pi: number) => string,
  /** One oral act, reported in its own words; without it, oral sex as a whole. */
  kind?: OralKind,
): ActResult {
  const otherOf = (name: string) => pair.find((c) => c.name !== name)?.name;
  const label = kind ? ROLE_WORDS[kind].label : cat === "anal" ? "anal sex" : "oral sex";
  const reasons: string[] = [];
  const instances: Instance[] = [];

  // Scenes, each with a direction (or two, if they switch mid-scene).
  const decisive = hits.filter((h) => !(cat === "anal" && h.act === "fingering"));
  const fingering = hits.filter((h) => cat === "anal" && h.act === "fingering");
  const sceneTops = new Map<string, { char: Character; partner: Character; scenes: number; weight: number; strong: boolean }>();
  // First pass: one record per scene direction, with how sure we are of it.
  interface SceneRec { best: ActHit; hs: ActHit[]; w: number; first: number; conf: number; reasons: string[] }
  const recs: SceneRec[] = [];
  for (const scene of groupScenes(decisive, where)) {
    const dirs = new Map<string, ActHit[]>();
    for (const h of scene.hits) {
      const k = h.top.name;
      dirs.set(k, [...(dirs.get(k) ?? []), h]);
    }
    const total = scene.hits.reduce((n, h) => n + h.weight, 0);
    // For the stray-hit test each sentence counts once, however many patterns read it.
    const once = (hs: ActHit[]) => {
      const best = new Map<string, number>();
      for (const h of hs) best.set(h.sentence, Math.max(best.get(h.sentence) ?? 0, h.weight));
      return [...best.values()].reduce((n, x) => n + x, 0);
    };
    const totalOnce = once(scene.hits);
    for (const [, hs] of dirs) {
      const w = hs.reduce((n, h) => n + h.weight, 0);
      if (once(hs) < Math.max(0.2, totalOnce * 0.3)) continue; // a stray hit against the scene's majority
      const best = [...hs].sort((a, b) => b.weight - a.weight || (a.basis === "named" ? -1 : 1))[0];
      const sentences = new Set(hs.map((h) => h.sentence)).size;
      const against = new Set(scene.hits.filter((h) => h.top.name !== best.top.name).map((h) => h.sentence)).size;
      const reasons: string[] = [];
      let conf = 0.3 + 0.5 * Math.min(1, best.weight);
      if (sentences >= 3) { conf += 0.15; reasons.push(`${sentences} sentences agree`); }
      else if (sentences === 2) { conf += 0.1; reasons.push("2 sentences agree"); }
      else reasons.push("one sentence");
      if (best.basis === "named") conf += 0.05;
      else if (best.basis === "inferred") { conf -= 0.1; reasons.push("people inferred, not named"); }
      else reasons.push("people found through pronouns");
      if (against) { conf -= Math.min(0.3, 0.1 * against); reasons.push(`${against} sentence${against === 1 ? "" : "s"} in the scene point the other way`); }
      const shaky = hs.find((h) => h.shaky && h.sentence === best.sentence)?.shaky;
      if (shaky) { conf -= 0.25; reasons.push(shaky); }
      recs.push({ best, hs, w, first: scene.first, conf: Math.max(0.15, Math.min(0.98, conf)), reasons });
    }
  }
  // A shaky or lone-sentence scene that goes against what nearly every firm scene says is probably the misread one.
  {
    const firm = recs.filter((r) => r.conf >= 0.6);
    const byTop = new Map<string, number>();
    for (const r of firm) byTop.set(r.best.top.name, (byTop.get(r.best.top.name) ?? 0) + r.conf);
    const sum = [...byTop.values()].reduce((n, x) => n + x, 0);
    const lead = [...byTop.entries()].sort((a, b) => b[1] - a[1])[0];
    if (firm.length >= 3 && lead && lead[1] / sum >= 0.85) {
      for (const r of recs) {
        if (r.best.top.name !== lead[0] && r.conf < 0.65) {
          r.conf = Math.max(0.15, r.conf - 0.2);
          r.reasons.push(`goes against ${firm.filter((f) => f.best.top.name === lead[0]).length} firmer scenes the other way`);
        }
      }
    }
  }
  for (const r of recs) {
    const { best, hs, w, conf } = r;
    const acts = [...new Set(hs.map((h) => h.act))];
    instances.push({
      top: best.top.name,
      bottom: best.bottom.name,
      act: acts.join(", "),
      where: where(r.first),
      evidence: truncate(best.sentence),
      basis: best.basis,
      confidence: Math.round(conf * 100) / 100,
      reasons: r.reasons,
      context: best.context,
    });
    const entry = sceneTops.get(best.top.name) ?? { char: best.top, partner: best.bottom, scenes: 0, weight: 0, strong: false };
    // A shaky scene adds a little weight but doesn't on its own make someone a switch.
    if (conf >= 0.4) entry.scenes++;
    entry.weight += Math.min(w, 3) * (0.4 + 0.6 * conf);
    entry.strong ||= (hs.some((h) => h.basis === "named") || w >= 1.5) && conf >= 0.5;
    sceneTops.set(best.top.name, entry);
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
      summary = roleSummary(kind ?? "anal", "switch", { name: major.char.name, partner: major.partner.name, scenes: major.scenes }, { name: minor.char.name, scenes: minor.scenes });
      base = evidence * (0.55 + 0.45 * Math.min(1, minor.weight / 2));
      reasons.push(`${plural(major.scenes + minor.scenes, "scene")} found, with each person ${kind ? "in each role" : "on top"} at least once`);
    } else {
      verdict = "one_way";
      const consistency = major.weight / totalW;
      summary = roleSummary(kind ?? "anal", "one_way", { name: major.char.name, partner: major.partner.name, scenes: major.scenes });
      if (minor) summary += ` One possible exception where ${minor.char.name} ${kind ? ROLE_WORDS[kind].topVerb : "tops"} — check the quoted line.`;
      base = evidence * (0.45 + 0.55 * consistency);
      reasons.push(`${plural(major.scenes, "scene")} ${kind ? `where ${ROLE_WORDS[kind].scene(major.char.name, major.partner.name)}` : `with ${major.char.name} on top`}${minor ? `, 1 weak contrary hit` : ""}`);
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
  // Someone tagged both "Top X" and "Bottom X" is versatile (with the other person); it never means they have sex with themselves.
  const taggedBoth = tagTops.some((t) => tagBottoms.some((b) => b.char === t.char));
  const tagSwitch = tags.roles.filter((r) => r.role === "switch").length > 0 || tags.switching.length > 0 || taggedBoth;
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
  const actTags = cat === "anal" ? tags.actTags.anal : kind ? tags.actTags[kind] : tags.actTags.oral;
  if (actTags.length && verdict !== "none") {
    tagAdj += 0.05;
    reasons.push(`tagged “${actTags[0]}”`);
  }

  // ── desire, fantasy & other signals ──
  // Ogling/touching/fingering hints only mean something for same-sex pairs.
  const sameSex = pair[0].gender === pair[1].gender || pair[0].gender === "u" || pair[1].gender === "u";
  const sig: DesireHit[] = des.filter((d) => sameSex || (d.kind !== "ogling" && d.kind !== "touch" && d.kind !== "prep" && d.kind !== "fingers" && d.kind !== "solo" && d.kind !== "body" && d.kind !== "aftercare" && d.kind !== "position" && d.kind !== "petname"));
  if (cat === "anal" && sameSex) {
    for (const f of fingering) {
      sig.push({ cat, act: "fingering", who: f.top, partner: f.bottom, role: "top", wants: true, kind: "fingering", weight: 0.8, para: f.para, sentence: f.sentence });
    }
  }
  // Every hint "points" to a top: wanting to bottom (or not wanting to top) means the partner tops.
  const desireTop = (d: DesireHit) => ((d.role === "top") === d.wants ? d.who.name : d.partner?.name);
  const lineConf = scoreDesires(sig, desireTop);
  const cf = (d: DesireHit) => confFactor(lineConf.get(d)?.conf ?? 0.7);
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
      confidence: Math.round((lineConf.get(d)?.conf ?? 0.5) * 100) / 100,
      reasons: lineConf.get(d)?.reasons ?? [],
    }));
  const isBehaviour = (d: DesireHit) => d.kind === "ogling" || d.kind === "touch" || d.kind === "fingering" || d.kind === "prep" || d.kind === "fingers" || d.kind === "solo" || d.kind === "body" || d.kind === "aftercare" || d.kind === "position" || d.kind === "petname";
  const tally = { desAgree: 0, desConflict: 0, behAgree: 0, behConflict: 0, wAgree: 0, wConflict: 0 };
  for (const d of sig) {
    const pointsTo = desireTop(d);
    if (!pointsTo || verdict === "none") continue;
    const agrees = verdict === "switch" || pointsTo === top;
    if (agrees) { tally.wAgree += d.weight * cf(d); isBehaviour(d) ? tally.behAgree++ : tally.desAgree++; }
    else { tally.wConflict += d.weight * cf(d); isBehaviour(d) ? tally.behConflict++ : tally.desConflict++; }
  }
  let desAdj = Math.min(0.2, tally.wAgree * 0.05) - Math.min(0.2, tally.wConflict * 0.05);
  if (verdict !== "none") {
    if (tally.desAgree) reasons.push(`${plural(tally.desAgree, "desire/fantasy line")} ${tally.desAgree === 1 ? "points" : "point"} the same way`);
    if (tally.desConflict) reasons.push(`${plural(tally.desConflict, "desire/fantasy line")} ${tally.desConflict === 1 ? "points" : "point"} the other way`);
    if (tally.behAgree) reasons.push(`${plural(tally.behAgree, "other signal")} (fingering, ogling, touching, lead-up) ${tally.behAgree === 1 ? "agrees" : "agree"}`);
    if (tally.behConflict) reasons.push(`${plural(tally.behConflict, "other signal")} (fingering, ogling, touching, lead-up) ${tally.behConflict === 1 ? "disagrees" : "disagree"}`);
  }

  {
    const lines = sig.filter((d) => d.kind !== "fingering");
    if (lines.length) {
      const avg = Math.round((lines.reduce((n, d) => n + (lineConf.get(d)?.conf ?? 0.5), 0) / lines.length) * 100);
      reasons.push(`${plural(lines.length, "desire/fantasy/hint line")}, ${avg}% sure on average`);
    }
  }

  // ── nothing found on-page ──
  if (verdict === "none") {
    const hasTagRoles = roleTagsApply && (tagTops.length || tagBottoms.length || tagSwitch);
    const pointing = new Map<string, number>();
    for (const d of sig) {
      const p = desireTop(d);
      if (p) pointing.set(p, (pointing.get(p) ?? 0) + d.weight * cf(d));
    }
    const desireRank = [...pointing.entries()].sort((a, b) => b[1] - a[1]);

    if (hasTagRoles) {
      verdict = tagSwitch ? "switch" : "one_way";
      let t = tagTops[0]?.char.name ?? (tagBottoms[0] ? otherOf(tagBottoms[0].char.name) : "");
      let b = tagBottoms[0]?.char.name ?? (tagTops[0] ? otherOf(tagTops[0].char.name) : "");
      // Tagged both ways: the tops/bottoms are the two different people.
      if (t && t === b) b = otherOf(t) ?? b;
      top = t ?? "";
      bottom = b ?? "";
      summary = `Not found in the text; going by AO3 tags: ${[...tags.roles.map((r) => r.tag), ...tags.switching].join(", ")}.` + (taggedBoth ? " Tagged as both top and bottom, so versatile with each other." : "") + (summary ? ` ${summary}` : "");
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
      summary = `No on-page ${label} recognized, but ${plural(n, "hint")} (${kinds.join(", ")}) point to ${kind === "blowjob" ? `${otherOf(who) ?? "the other"} ${ROLE_WORDS.blowjob.bottomIng}` : kind ? `${who} ${ROLE_WORDS[kind].topIng}` : `${who} as the top`}.`;
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

  // ── per-person odds ──
  const ev: RoleEvidence[] = [];
  const doubt: RoleEvidence[] = [];
  for (const e of sceneTops.values()) {
    // Scenes worked out only from pronouns count for less.
    const w = e.weight * (e.strong ? 1 : 0.75);
    ev.push({ who: e.char.name, role: "top", weight: w, kind: "scene" }, { who: e.partner.name, role: "bottom", weight: w, kind: "scene" });
  }
  const selfToyCount = new Map<string, number>();
  for (const d of sig) {
    // A toy used on oneself is bottoming, about as telling as a scene.
    if (usesToyOnSelf(d) && d.wants) {
      // “Fucked himself on the dildo” is as telling as a short scene; “pushed the dildo into his ass” with no one else
      // named is the same act but a little less sure. A long solo scene counts at most about twice.
      const seen = (selfToyCount.get(`${d.who.name}|${d.para}`) ?? 0) + 1;
      selfToyCount.set(`${d.who.name}|${d.para}`, seen);
      if (seen <= 2) ev.push({ who: d.who.name, role: "bottom", weight: 0.8 * selfToyStrength(d) * (seen === 1 ? 1 : 0.5), kind: "scene" });
      continue;
    }
    const t = desireTop(d);
    const b = t && otherOf(t);
    if (!t || !b) continue;
    // Behaviour (ogling, touching, lead-up) points a little; saying you want something, or having done it, points more.
    const [kind, w] = isBehaviour(d) ? (["hint", 0.15] as const) : (["desire", d.kind === "history" ? 0.25 : 0.2] as const);
    ev.push({ who: t, role: "top", weight: w * d.weight * cf(d), kind }, { who: b, role: "bottom", weight: w * d.weight * cf(d), kind });
  }
  if (roleTagsApply) {
    // Tags alone reach about 60%; "Top X" also says a little about the partner.
    const tagged = (who: string, role: Role) =>
      tags.roles.some((r) => r.char.name === who && (r.role === role || r.role === "switch")) ||
      tags.roles.some((r) => r.char.name !== who && r.role === (role === "top" ? "bottom" : "top"));
    for (const r of tags.roles) {
      const other = otherOf(r.char.name);
      if (r.role === "switch") {
        for (const role of ["top", "bottom"] as const) ev.push({ who: r.char.name, role, weight: 0.35, kind: "tag" });
        continue;
      }
      const opp = r.role === "top" ? "bottom" : "top";
      ev.push({ who: r.char.name, role: r.role, weight: 0.35, kind: "tag" });
      if (other) ev.push({ who: other, role: opp, weight: 0.25, kind: "tag" });
      // Unless the tags also give them the other role ("Top Castiel", "Top Dean" → they switch).
      if (!tagSwitch && !tagged(r.char.name, opp)) doubt.push({ who: r.char.name, role: opp, weight: 0.3, kind: "tag" });
      if (!tagSwitch && other && !tagged(other, r.role)) doubt.push({ who: other, role: r.role, weight: 0.3, kind: "tag" });
    }
    if (tags.switching.length) for (const c of pair) for (const role of ["top", "bottom"] as const) ev.push({ who: c.name, role, weight: 0.25, kind: "tag" });
  }
  // How AO3 tags the character overall: a very faint nudge (at most about 15% on its own), under everything above.
  if (cat === "anal") {
    for (const [name, pr] of tagPriors(meta, pair)) {
      const lean = (pr.pTop - 0.5) * 2;
      const role: Role = lean > 0 ? "top" : "bottom";
      const w = 0.12 * Math.abs(lean);
      ev.push({ who: name, role, weight: w, kind: "prior" });
      const other = otherOf(name);
      if (other) ev.push({ who: other, role: role === "top" ? "bottom" : "top", weight: w * 0.4, kind: "prior" });
    }
  }
  const people = roleOdds(pair.map((c) => c.name), ev, doubt);
  return { verdict, top, bottom, summary, instances, desires: desireOut, confidence, people };
}
