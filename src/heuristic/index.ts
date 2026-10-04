// Free, offline top/bottom analysis using sentence patterns instead of AI.
//
// Pipeline: split into paragraphs and sentences → mask dialogue → find act patterns in narration →
// resolve names/pronouns to characters → classify each hit as an act, a desire, or a fantasy →
// read dialogue for what speakers ask for → group hits into scenes → verdict + confidence per pairing.

import { type Ao3Meta, romanticPairings } from "../ao3";
import { type Analysis, type Desire, type PairingResult, type Role } from "../types";
import { tagPriors } from "./ao3-prior";
import { type Character, type Gender, buildCast } from "./characters";
import { ANAL_CTX, type Cat, VULVA_CTX, type CompiledPattern, DIALOGUE, type DialogueDef, EPITHET_TOKEN, FINGER_CTX, PATTERNS, PENIS_CTX, SEX_CTX, compilePatterns } from "./patterns";
import { EPITHET, learnEpithets } from "./epithets";
import { readTags } from "./tags";
import { checkTags } from "./tagcheck";
import { type TextingMap, detectTexts, looksLikeChat, looksLikeMessage, summarizeTexts } from "./texting";
import { detectPov, POV_SENTENCE } from "./pov";
import { ORAL_KINDS, oralKindOf } from "../roles";
import { escapeMarker, splitParagraphs, UNCERTAIN_NOTE_END, UNCERTAIN_NOTE_START } from "../text";
import { ActHit, Basis, DesireHit } from "./hits";
import { CHAPTER_RE, Quote, maskQuotes, sentenceSpans } from "./quotes";
import { ANAL_NEAR_RE, ANIMAL_NEAR, DANGER, DESIRE, DESIRE_LEAD, DESIRE_TAIL, FANTASY, FANTASY_PARA, HABIT_AUX, HYPO_AUX, HYPO_MATCH, HYPO_SENT, HYPO_WINDOW, IDIOM_ASS, IDIOM_SAFE, NEG, ORAL_LINE_RE, ORAL_NEAR_RE, REFLEXIVE, SAY, SCENE_BREAK, SEX_STRICT, STRONG_FANTASY, contextAround } from "./markers";
import { AddressBook } from "./address";
import { reliabilityOf } from "./reliability";
import { babyNear, featuresOf, trustOf } from "./learned";
import { Ctx, groupValue, pronoun, resolvePair, stripPoss } from "./resolve";
import { PairTags, buildAct, buildDynamic, buildManual, buildSolo, buildVaginal, buildVibes, plural, soloIsAnal, tagsFor } from "./builders";

// ───────────── main analysis ─────────────

export interface AuditHit {
  via: string;
  /** Context features of the hit (see learned.ts), where the engine computed them. */
  f?: number[];
  kind: string;
  cat: string;
  act: string;
  para: number;
  sentence: string;
  a: string;
  b?: string;
}

export interface PatternOptions {
  /** Leave out the "how this works" caveats in notes (for tests). */
  quiet?: boolean;
  /** Called once for every act and desire hit with the pattern behind it (for the pattern audit report). */
  audit?: (hit: AuditHit) => void;
  /** Called once with what the engine worked from: its paragraphs, the point of view at each, and the texts it found (for the gold-label eval). */
  debug?: (d: { paras: string[]; pov: (string | undefined)[]; texts: { para: number; from?: string; to?: string }[] }) => void;
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
  // Arrow-style texts ("> hi" sent, "Hello <" received) are one line each and carry no end punctuation: keep each on its own paragraph.
  let paras = splitParagraphs(analysisText.replace(/^([ \t]*>[ \t]*\S.*|.*\S[ \t]*<[ \t]*)$/gm, "\n$1\n"));
  // Text messages shown as chat lines ("Shane: Why?") become dialogue with a speaker tag, so the rest of the engine reads them.
  let texting: TextingMap = { messages: [], rewritten: new Map() };
  if (looksLikeChat(paras)) {
    const pre = paras.map((p) => maskQuotes(p, false).masked);
    const preCast = buildCast(meta, pre.join("\n"), paras.join("\n"));
    // Whose phone it is comes from the point of view at that spot; a contact name above a thread isn't a POV heading.
    const povFirst = detectPov(paras.map((p, i) => (p.trim().length <= 28 && !/[.!?:,;]$/.test(p.trim()) && !looksLikeMessage(p) && looksLikeMessage(paras[i + 1] ?? "") ? "" : p)), (p) => CHAPTER_RE.test(p), preCast, meta.freeforms);
    texting = detectTexts(paras, preCast, (i) => povFirst.at[i]);
    if (texting.rewritten.size) paras = paras.map((p, i) => texting.rewritten.get(i) ?? p);
  }
  const doubleQuotes = (analysisText.match(/[“"]/g) ?? []).length;
  const singleQuotes = doubleQuotes < 4 && (analysisText.match(/(^|\s)‘/g) ?? []).length >= 4;
  const masked = paras.map((p) => maskQuotes(p, singleQuotes));
  const narration = masked.map((m) => m.masked).join("\n");

  const cast = buildCast(meta, narration, paras.join("\n"));
  const tags = readTags(meta.freeforms, cast);
  const patterns = compilePatterns(PATTERNS, cast.aliasPattern);
  const gateSeen = new Uint8Array(patterns.reduce((m, p) => Math.max(m, (p.gateId ?? -1) + 1), 0));
  const NAMES = cast.aliasPattern || "(?!)";
  const nameRe = new RegExp(`\\b(?:${NAMES})(?:['’]s)?\\b`, "g");
  // Who is on the page besides the cast: names that keep turning up as the subject of a sentence ("Sam smiled", "Greg had pulled") but
  // aren't cast members, and stand-ins for strangers ("the waiter", "the twink"). A he or a left-out subject right after one of
  // these is that person, not whichever lead was named before.
  const STRANGER_LABELS = "twink|twunk|bottom boy|slut|whore|virgin|newbie|stranger|brat|plaything|boy toy|hooker|escort|jock|waiter|waitress|bartender|barista|doctor|nurse|cop|officer|guard|driver|clerk|neighbou?r|landlord|teacher|bouncer|stripper|dancer|client|customer|cashier|receptionist";
  const outsiderNames = (() => {
    const counts = new Map<string, number>();
    const subj = /(?:^|[.!?”"]\s+|[,;]\s*(?:and|but|then|while|as)\s+)([A-Z][a-z]{2,})\s+(?:[a-z]{2,}(?:ed|s)|was|had|did|said|asked|would|could|will|looked|laughed|smiled|grinned)\b/gm;
    const castKnown = (n: string) => !!cast.byAlias.get(n);
    for (const mm of narration.matchAll(subj)) if (!castKnown(mm[1])) counts.set(mm[1], (counts.get(mm[1]) ?? 0) + 1);
    const SKIP = /^(?:The|This|That|These|Those|Then|There|Here|When|While|After|Before|And|But|Now|Just|Maybe|Not|His|Her|Their|Its|Our|Your|My|God|Jesus|Christ|Fuck|Shit|Oh|Yes|Okay|Please|Still|Again|Next|Later|Soon|Once|Some|Everyone|Someone|Anyone|Nobody|Everything|Something|Nothing|Both|Each|Every|Another|Other|Suddenly|Slowly|Finally|Instead|Always|Never|Today|Tonight|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/;
    // A name is never written in lower case, so a word that also shows up that way ("more", "even", "she") is just a sentence opener.
    const PRON = /^(?:She|He|They|We|You|It|I|Her|Him|Them|Who|What|Why|How|Which|Where|Whose|With|From|Despite|Being|Only|Even|More|Most|Two|Three|Four|Five|Six|One|Silence|Really|Like)$/;
    // …and an outsider is a minor character: if the name comes up about as often as the cast does, it's a lead the cast missed.
    const castMentions = (narration.match(nameRe) ?? []).length / Math.max(1, cast.chars.length);
    const mentions = (n: string) => (narration.match(new RegExp(`\\b${n}\\b`, "g")) ?? []).length;
    return [...counts].filter(([n, c]) => c >= 3 && !SKIP.test(n) && !PRON.test(n) && !new RegExp(`\\b${n.toLowerCase()}\\b`).test(narration) && mentions(n) < 0.3 * castMentions).map(([n]) => n);
  })();
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
  // Terms of address ("sir", "baby", "half man") that one character keeps using for the other; the previous pass's book also
  // helps tell who an untagged line is addressed to.
  const lowerAliases = new Set([...cast.byAlias.keys()].flatMap((a) => a.toLowerCase().split(/\s+/)));
  const isNameWord = (w: string) => lowerAliases.has(w);
  let addressBook = new AddressBook();
  let priorAddress = new AddressBook();
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
  const pov = detectPov(paras, (p) => CHAPTER_RE.test(p), cast, meta.freeforms);
  // An omegaverse work: alpha/beta/omega in the tags, or the words all through the text. Only there do bared throats,
  // scenting and the alpha voice mean dominance and submission.
  const isAbo = (() => {
    const tagText = [...meta.freeforms, ...meta.fandoms, ...meta.relationships, ...meta.characters].join(" | ");
    if (/omegaverse|alpha\/beta\/omega|a\/b\/o|\babo\b|\balpha\b|\bomega\b/i.test(tagText)) return true;
    const all = paras.join(" ");
    return (all.match(/\balphas?\b/gi) ?? []).length >= 8 && (all.match(/\bomegas?\b/gi) ?? []).length >= 4;
  })();
  // A chastity device or cock cage in the tags (male-only works): being locked up reads as submission, holding the key as control.
  const isChastity = /chastity|cock[- ]?cage|\bkey ?holder|\bcaged\b/i.test(meta.freeforms.join(" | ")) && (meta.categories.length === 0 || meta.categories.includes("M/M"));
  scan();
  if (ctx.learnFromVotes()) scan();

  function scan() {
  acts = [];
  desires = [];
  chapters = [];
  chapter = "";
  prevSpeaker = undefined;
  priorAddress = addressBook;
  addressBook = new AddressBook();
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
    ctx.povNow = cast.narrator ? undefined : pov.at[pi]; // in first person "he" is never the narrator
    // Alternating first person: a chapter headed with the narrator's name says whose "I" follows.
    if (cast.narrator && pov.source === "headings" && pov.at[pi]) ctx.narratorNow = pov.at[pi];
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
    // "All the times he imagined this, and the real thing is so much more" is the reverse of a fantasy.
    const fantasyPara = (FANTASY_PARA.test(mp.slice(0, 160)) && !/\b(?:the real (?:thing|deal)|for real|in real life|really happening|(?:this|it|that) is real)\b/i.test(mp.slice(0, 260))) || (dreamRun > 0 && !WAKE.test(mp.slice(0, 160)) && !SCENE_BREAK.test(para));
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
      // In this person's chapter, "He wanted…" / "His heart raced" is them, whoever was named in the line before.
      if (ctx.povNow && POV_SENTENCE.test(sent)) {
        const g: Gender = /^\W*(?:She|Her)\b/.test(sent) ? "f" : "m";
        if (Ctx.compatible(ctx.povNow, g)) ctx.lastSubject = ctx.povNow;
      }
      const subj = firstEntity(sent);
      if (subj) ctx.lastSubject = subj;

      {
        const penisy = PENIS_CTX.test(sent);
        gateSeen.fill(0);
        for (const pat of patterns) {
          if (pat.abo && !isAbo) continue;
          if (pat.chastity && !isChastity) continue;
          if (pat.needsCtx && !sexy) continue;
          if (pat.needsPenis && !penisy) continue;
          // Many patterns share a gate (and each has an elided twin): test the sentence against each distinct gate once.
          if (pat.gate) {
            const g = pat.gateId!;
            if (gateSeen[g] === 0) gateSeen[g] = pat.gate.test(sent) ? 1 : 2;
            if (gateSeen[g] === 2) continue;
          }
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
      if (continues || attribExplicit) addressBook.record(speaker, ctx.partnerOf(speaker), q.text, pi, q.text, isNameWord);
      scanDialogue(q.text, speaker, pi, { animal: ANIMAL_NEAR.test(near), explicit: !!continues || attribExplicit, sexy: narrationSexy, oral: ORAL_NEAR_RE.test(near) && !ANAL_NEAR_RE.test(near), after: para.slice(q.end, q.end + 60), before: para.slice(Math.max(0, q.start - 60), q.start) });
    }
    if (paraSpeaker) prevSpeaker = paraSpeaker;
  }
  // Lopsided titles and endearments between the pair are hints about who defers and who looks after whom.
  for (const [x, y] of cast.pairings) {
    for (const a of addressBook.asymmetries(x, y)) {
      desires.push(
        a.kind === "title"
          ? { via: "address-title", cat: "vibe", act: `addressing ${a.partner.name.split(" ")[0]} as “${a.terms[0]}”`, who: a.who, partner: a.partner, role: "bottom", wants: true, kind: "behavior", weight: 0.5, para: a.para, sentence: a.example }
          : { via: "address-endearment", cat: "vibe", act: `pet name “${a.terms[0]}” for ${a.partner.name.split(" ")[0]}`, who: a.who, partner: a.partner, role: "top", wants: true, kind: "petname", weight: 0.5, para: a.para, sentence: a.example },
      );
    }
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
    // "When Buck looked down and realised that Chris had stopped listening, he blushed": after an opening clause, the he is the
    // opening clause's own subject, not the name inside "realised that Chris…".
    {
      const opening = new RegExp(`^\\W*(?:when|after|before|as|while|once|because|since|although|though|if)\\s+(?:[\\w'’-]+\\s+){0,2}?(${NAMES})\\b[^.!?;,]*?\\b(${NAMES})\\b[^.!?;,]*,\\s*$`, "i").exec(prefix);
      if (opening && /^\s*(?:he|she)\b/i.test(suffix)) {
        const first = cast.byAlias.get(opening[1]), second = cast.byAlias.get(opening[2]);
        if (first && second && first !== second) return first;
      }
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
    // "Ethan close enough to touch, if only Hank could find the courage, buried deep inside him": the wish is Hank's, so the
    // participle that picks the sentence back up is Hank.
    {
      const wish = new RegExp(`\\bif\\s+only\\s+(${NAMES})\\b[^.!?;]*?(?:,\\s*)?$`, "i").exec(prefix);
      if (wish && /^[\s,]*\w+(?:ed|ing)\b/.test(suffix)) { const c = cast.byAlias.get(wish[1]); if (c) return c; }
    }
    // "Anakin was actually pretty sure he'd meant to feed him and fuck him": a he inside "X was sure he…" is the other one.
    {
      const sure = new RegExp(`(${NAMES})\\s+(?:(?:was|is|were|are|felt|feels|seemed|seems)\\s+)?(?:\\w+\\s+){0,2}?(?:sure|certain|convinced|positive|suspected)\\s+(?:that\\s+)?(?:he|she|they)(?:['’]d|['’]ll|['’]s)?\\b[^.!?;]*$`, "i").exec(prefix);
      // …but "sure he'd like to be fucked" is about himself: a passive wish keeps the same person.
      if (sure && !/\b(?:be|get|being|getting|been)\s+(?:\w+ly\s+)?(?:fucked|taken|filled|screwed|pounded|railed|bred|knotted|ridden|used|claimed|had|held|touched)\b/i.test(suffix.slice(0, 60))) { const x = cast.byAlias.get(sure[1]); const o = x && ctx.partnerOf(x); if (o) return o; }
    }
    // "Cas didn't wait for Dean to say anything else, he just pushed inside": the he after the comma is the main clause's
    // subject, not the name inside "for Dean to…".
    {
      const mainThenObj = new RegExp(`(?:^|[.!?]\\s+)(${NAMES})\\s+(?:[\\w'’-]+\\s+){1,5}?(?:for|to|at|with|until)\\s+(${NAMES})\\b[^.!?;,]*,\\s*$`).exec(prefix);
      if (mainThenObj && /^\s*(?:he|she)\b/i.test(suffix)) {
        const first = cast.byAlias.get(mainThenObj[1]), second = cast.byAlias.get(mainThenObj[2]);
        if (first && second && first !== second) return first;
      }
    }
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
        !/^(?:and|but|or|so|then|when|as|while|because|until|before|after|if|though|although|once|since|where|now|still|finally|later|suddenly|slowly|meanwhile|that|who|yes|no|oh|moment|instant|second|minute|time|day|night|morning|evening|afternoon)$/.test(prev) &&
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
    // A term this pair keeps using for one of them ("sir", "half man") says who the line is for, so the other one said it.
    const viaTerm = addressBook.listenerOf(q.text, isNameWord) ?? priorAddress.listenerOf(q.text, isNameWord);
    if (viaTerm) { const sp = ctx.partnerOf(viaTerm); if (sp) return sp; }
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
      // "How do you take it?" is coffee; "you were both trying to fuck me" is a report, not a request.
      if (d.kind === "said" && /\bhow (?:do|would|did|d['’]you)\s+(?:you\s+)?take (?:it|your \w+)\b/.test(lower)) continue;
      if (/^fuck me$/.test(m[0]) && /\b(?:trying|tried|tries|try|attempting|attempted)\s+to\s+$/.test(lower.slice(Math.max(0, m.index! - 24), m.index!))) continue;
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
      // "I think you need to be filled", "you want to get fucked": the want belongs to the listener, so the speaker is the one who
      // would do it. "He needs to be fucked" is about someone else and says nothing about the speaker.
      let role = d.role;
      if (d.cat === "anal" && d.role === "bottom" && /^(?:want|need|wanna)\w*\s+(?:to\s+)?(?:get|be|getting|being)\b/.test(m[0])) {
        const subj = /\b(you|u|he|she|they)\s+(?:(?:really|just|so|clearly|obviously|definitely|still|also|totally|fucking)\s+)*$/.exec(lower.slice(Math.max(0, m.index! - 40), m.index!));
        if (subj) { if (/^(?:you|u)$/.test(subj[1])) role = "top"; else continue; }
      }
      // "Won't you fuck me?" / "Sure you won't fuck me?" are requests, not refusals.
      const question = /\?\s*$/.test(lower.slice(m.index)) && !/[.!]/.test(lower.slice(m.index, m.index + m[0].length + 40).split("?")[0]);
      const negated =
        (!question && /\b(?:don't|do not|never|won't|will not|not|can't|cannot|no|wouldn't|shouldn't|stop)\s+(?:(?!hesitate|forget|stop|let)\w+\s+){0,3}$/.test(before)) ||
        /\bas if\b[^.!?]*$/.test(before);
      // "Because if I win, I want to breed you": a wish that hangs on a condition is a "what if", not a request now.
      // Other ways of putting it off or wondering: "someday I'll fuck you", "maybe next time I could", "what if I fucked you", "once we're married".
      const lead = lower.slice(Math.max(0, m.index! - 110), m.index! + m[0].length);
      const sentLead = lead.split(/[.!?;]\s+/).pop() ?? lead;
      const conditional =
        /\bif\b[^.!?;]{2,70},\s*(?:(?:then|and|so)\s+)?(?:i|we|you)\b[^.!?;]{0,30}$/.test(lead) ||
        /\b(?:what if|some ?day|one day|one of these days|next time|sometime|someday|maybe|perhaps|once (?:i|we|you|this)|when(?:ever)? (?:i|we|you) (?:get|got|can|could|finally|win|won|lose|lost|are|am)|i wonder|i bet|imagine|suppose|pretend|if i ever|if we ever|some other time)\b/.test(sentLead);
      const kind = d.kind === "said" && conditional ? "hypothetical" : d.kind;
      desires.push({
        via: `dialogue:${d.act}`,
        cat: d.cat,
        act: d.act,
        who: speaker,
        partner: ctx.partnerOf(speaker),
        role,
        wants: !negated,
        kind,
        weight: (d.weight ?? (d.kind === "ogling" ? 0.6 : 1)) * reliabilityOf(`dialogue:${d.act}`) * (around.explicit === false ? 0.5 : 1),
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
    desires.push({ via: "history", cat, act: "past experience with others", who, partner, role, wants: true, kind: "history", weight: 0.8, para: pi, sentence });
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
    // "Dustin babbled and Mrs. Henderson looks at him like…": a left-out subject belongs to the one now named, and someone
    // who isn't in the cast can't be credited as the person before.
    if (pat.elided && new RegExp(`(?:^|(?:[,;]|\\b(?:and|but|while|as|then|yet|so))\\s+)(?:(?:Mr|Mrs|Ms|Miss|Dr)\\.?\\s+)?([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)(?:,[^,.;]{2,50},)?\\s*$`).test(sent.slice(0, m.index!))) {
      const named = new RegExp(`(?:^|(?:[,;]|\\b(?:and|but|while|as|then|yet|so))\\s+)(?:(?:Mr|Mrs|Ms|Miss|Dr)\\.?\\s+)?([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)(?:,[^,.;]{2,50},)?\\s*$`).exec(sent.slice(0, m.index!))![1];
      if (!cast.byAlias.get(named) && !cast.byAlias.get(named.split(" ")[0]) && !/^(?:Then|Now|Still|Instead|Maybe|Perhaps|God|Please|Fuck|Jesus|Christ|Just|Again|Next|Later|Soon|Once|Yes|No|Oh|Okay|Ok|Fine|Good|Hell|Shit|Damn|He|She|They|It|We|You|I|His|Her|Their|The|A|An|This|That|There|Some|Another)$/.test(named) && !/ly$/.test(named)) return;
    }
    // "before Eustace placed a hand on his back and guided him out": the left-out subject is Eustace, whoever he is, when no one
    // in the cast (or a he / she) comes between his name and the verb.
    if (pat.elided) {
      const lead = sent.slice(0, m.index!) + (/^\s*(?:and\b|,)\s*/.exec(m[0])?.[0] ?? "");
      const o = /(?:^|[,;]\s*|\b(?:and|but|while|as|then|yet|so|before|after|when|until)\s+)(?:(?:Mr|Mrs|Ms|Miss|Dr)\.?\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+((?:[\w'’-]+\s+){1,8}?)(?:and|,)\s*$/.exec(lead);
      if (o && !cast.byAlias.get(o[1]) && !cast.byAlias.get(o[1].split(" ")[0]) && !/ly$/.test(o[1]) &&
          !/^(?:Then|Now|Still|Instead|Maybe|Perhaps|God|Please|Fuck|Jesus|Christ|Just|Again|Next|Later|Soon|Once|Yes|No|Oh|Okay|Ok|Fine|Good|Hell|Shit|Damn|But|And|When|While|As|After|Before|If|So|Yet|Until|He|She|They|It|We|You|I|His|Her|Their|The|A|An|This|That|There|Some|Another)$/.test(o[1]) &&
          !new RegExp(`\\b(?:${NAMES})\\b|\\b(?:he|she|they|I|we|you)\\b`, "i").test(o[2])) return;
    }
    // "The twink did as he was told and gagged on Jordan's length", "The bottom boy's roommates wouldn't hear him plead as he got fucked":
    // a generic label for someone who isn't in the cast is that stranger, not whichever character came before. Authors who keep
    // calling one of the leads "the twink" use it often, so only a label that turns up a few times is left alone.
    if (pat.elided || /^(?:he|him|she|her)$/i.test(tTok ?? "") || /^(?:he|him|she|her)$/i.test(bTok ?? "")) {
      const g = new RegExp(`(?:^|[,;]\\s*|\\b(?:and|but|as|while|then|when|before|after)\\s+)the\\s+(twink|twunk|bottom boy|bottom|slut|whore|virgin|newbie|stranger|brat|slave|plaything|boy toy|hooker|escort|jock)(?:['’]s)?\\b(?![^.!?]*\\b(?:${NAMES})\\b[^.!?]*$)`, "i").exec(sent.slice(0, m.index! + (/^\s*(?:and\b|,)\s*/.exec(m[0])?.[0].length ?? 0)));
      if (g && !cast.byAlias.get(g[1]) && !new RegExp(`\\b(?:${NAMES})\\b`).test(sent.slice(g.index! + g[0].length, m.index!)) &&
          (paras.join(" ").match(new RegExp(`\\bthe ${g[1]}\\b`, "gi")) ?? []).length < 5) return;
    }
    // "Greg frowned. He pushed Dean against the wall": the he after a clause whose subject is someone outside the cast is that person,
    // and so is a left-out subject in a sentence that someone outside the cast starts.
    if (pat.elided || /^(?:he|him|she|her)$/i.test(tTok ?? "") || /^(?:he|him|she|her)$/i.test(bTok ?? "")) {
      const startOf = (s: string): "out" | "cast" | "pron" | undefined => {
        const sm = new RegExp(`^\\W*(?:(?:and|but|then|so|when|while|as|after|before)\\s+)?(?:(?<cast>${NAMES})|(?<out>${outsiderNames.length ? outsiderNames.join("|") : "(?!)"})|(?<lab>[Tt]he (?:${STRANGER_LABELS}))|(?<pron>[Hh]e|[Ss]he))(?!['’])\\b\\s+[a-z]`).exec(s);
        const g = sm?.groups;
        return !g ? undefined : g.cast ? "cast" : g.pron ? "pron" : "out";
      };
      const at = para.indexOf(sent);
      const prevSent = at > 0 ? para.slice(Math.max(0, at - 240), at).trim().split(/(?<=[.!?”])\s+/).pop() ?? "" : "";
      const cur = startOf(sent);
      if (cur === "out" || (cur === "pron" && /[.!?”]$/.test(prevSent) && startOf(prevSent) === "out")) return;
    }
    // "He knew his whole focus was on serving him; … as he was getting railed": the he who serves is the one being taken, but the
    // last-named subject is the one served, so the pronoun can't be trusted.
    if (/^(?:passive-|be-|get-)/.test(pat.id) && /\b(?:serv(?:e|es|ed|ing)|pleas(?:e|es|ed|ing)|obey(?:s|ed|ing)?)\s+him\b/i.test(para.slice(Math.max(0, para.indexOf(sent) - 160), para.indexOf(sent) + sent.length)) && /^(?:he|him)$/i.test(tTok || bTok || "")) return;
    // "Sam said as he poured Dean a cup of tea": a he right after an outsider's name and "as / while / when" is that outsider.
    if (!pat.elided && /^(?:he|she)$/i.test(pat.subj === "t" ? tTok ?? "" : bTok ?? "")) {
      const o = /\b([A-Z][a-z]+)\s+(?:[\w'’-]+\s+){0,3}?(?:as|while|when|and|but|before|after)\s+$/.exec(sent.slice(0, m.index!));
      if (o && !cast.byAlias.get(o[1]) && !/ly$/.test(o[1]) && !/^(?:Then|Now|Still|Instead|Maybe|Perhaps|God|Please|Just|Again|Next|Later|Soon|Once|Yes|No|Oh|But|And|When|While|As|After|Before|If|So|Yet|Until|The|His|Her|Their|It|This|That|There)$/.test(o[1]) &&
          !new RegExp(`\\b(?:${NAMES})\\b|\\b(?:he|she|they|I|we|you)\\b`, "i").test(sent.slice(o.index! + o[1].length, m.index!))) return;
    }
    // "…looks at him like she wants to pull him into a hug and feed him soup": the left-out subject is the "she" before it, and
    // nobody in this cast is a she.
    if (pat.elided) {
      const pr = [...sent.slice(0, m.index!).matchAll(/\b(?:she|he)\b(?!['’])/gi)].pop();
      if (pr && !/[.!?]\s+\S/.test(sent.slice(pr.index! + 3, m.index!))) {
        const g: Gender = /^she$/i.test(pr[0]) ? "f" : "m";
        if (!cast.chars.some((c) => Ctx.compatible(c, g))) return;
      }
    }
    // "Steve never sucked Eddie off, taking him deep": a participle carries on the negated verb before it.
    if (pat.elided && /^\W*(?:\w+ly\s+)?\w+ing\b/.test(m[0]) && (/^\s*,/.test(m[0]) || /,\s*$/.test(sent.slice(0, m.index!))) && /\b(?:never|refus(?:ed|es|e|ing) to)\b/i.test(sent.slice(0, m.index!))) return;
    // Hints about how two people act (looking after, leading, protecting, pinning…) mean little around a baby: the one being
    // scooped up, fed or carried is a child. Only in stretches that aren't sexual, so "baby" as a pet name doesn't count.
    if (pat.cat === "vibe" && babyNear(paras, pi)) return;
    // "armies to protect him", "guards to keep him safe": the left-out subject is not a person in the scene.
    if (pat.id.startsWith("dom-protect") && pat.elided && /\b(?:armies|army|guards?|soldiers?|knights?|men|advisors?|servants?|laws?|walls?|shields?)\s+to\s+$/i.test(sent.slice(0, m.index!) + (/^\s*to\s+/i.exec(m[0])?.[0] ?? ""))) return;
    // "rubbing his hands together" warms hands; it comforts no one.
    if (pat.id.startsWith("care-soothe") && /\bhands?\s+together\b/i.test(sent.slice(m.index!, m.index! + m[0].length + 20))) return;
    // A handjob on oneself ("fists his own cock") is solo.
    if (pat.id.startsWith("hj-") && /\b(?:his|her|their)\s+own\b/i.test(m[0])) return;
    // A wish or fantasy before the verb: "wanted to hold him close and continue to stroke his cock", "fantasies of pressing him down".
    if (pat.cat === "vibe" && (pat.signal?.kind === "handjob" || pat.id.startsWith("dom-pin")) &&
        (/\b(?:want(?:ed|s|ing)?|wish(?:ed|es)?|long(?:ed|s|ing)?|crav(?:ed|es|ing)|hop(?:ed|es|ing)|need(?:ed|s)?)\s+(?:to|for)\b[^.!?;]*$/i.test(sent.slice(0, m.index!)) ||
         /\b(?:fantas(?:y|ies|ised|ized|ising|izing)|dream(?:s|ed|t|ing)?|imagin\w+|daydream\w*)\s+(?:of|about)\b[^.!?;]*$/i.test(sent.slice(0, m.index!)))) return;
    // Arms around him pinning him to a chest is a hug, not a hold-down.
    if (pat.id.startsWith("dom-pin") && /\bto\s*$/i.test(m[0]) && /^\s*(?:the\s+|his\s+|her\s+|their\s+|my\s+)?(?:warm\s+|broad\s+|solid\s+|firm\s+)?(?:mass of\s+)?chest\b/i.test(sent.slice(m.index! + m[0].length)) && /\barms?\b[^.!?]*$/i.test(sent.slice(0, m.index!))) return;
    // "dropped to his knees and began pulling Molotovs out of his backpack": kneeling to do something.
    if (pat.id.startsWith("sinks-to-floor") && /^\s*(?:and\s+)?(?:began|started|proceeded)?\s*(?:to\s+)?(?:pull|pick|grab|search|dig|rummag|check|examin|tie|tend|fix|bandag|gather|collect|retriev|scrabbl)/i.test(sent.slice(m.index! + m[0].length))) return;
    // Kneeling at a ceremony is not spreading for a lover.
    if (pat.id.startsWith("spread-legs") && !SEX_CTX.test(`${paras[pi - 1] ?? ""} ${para} ${paras[pi + 1] ?? ""}`) && /\bkneel\w*|\bknees\s+further\b/i.test(sent)) return;
    // "palm a dragon egg from top to bottom": the end of a thing, not a role.
    if (pat.id.startsWith("bottomed-for") && /\b(?:top|tops)\s+(?:to|and)\s+$/i.test(sent.slice(0, m.index!) + (/^\s*(?:to|and)\s+/i.exec(m[0])?.[0] ?? ""))) return;
    // "still slightly sore from being stretched open" is a bodily sign after sex, not a scene: it belongs with the soreness hints.
    if (pat.cat === "anal" && !pat.signal && /\b(?:sore|aching|achy|tender|raw)\s+(?:from|after)\s+(?:being\s+|having\s+been\s+)(?:stretched|fucked|opened|taken|filled|used|ridden|pounded|bred|knotted|plowed|wrecked)\b/i.test(sent.slice(Math.max(0, m.index! - 40), m.index! + m[0].length))) return;
    // "He fists Cregan from root to tip": a hand on a cock, not a fist in an ass.
    if (pat.id.startsWith("fisting") && /\b(?:root to tip|base to tip|tip to base|from the base|up and down|his (?:cock|dick|length|shaft)|(?:cock|dick|prick|shaft|length|erection))\b/i.test(sent.slice(m.index!, m.index! + m[0].length + 40)) && !/\b(?:ass|arse|hole|anus|rim|inside)\b/i.test(sent)) return;
    // "he tugged him gently to where he wanted him": a pull, not a handjob. Only "tugged him off" is.
    if (pat.id.startsWith("hj-jerk-him") && /\btugg?\w*\s+\S+\s+(?!off\b)/i.test(m[0])) return;
    // Arching a back while being sucked or stroked is pleasure, not offering an ass: only count it in a stretch about the ass.
    if (pat.id.startsWith("arch-back") && !ANAL_CTX.test(para) && !ANAL_CTX.test(paras[pi - 1] ?? "") && /\b(?:suck\w*|blowjob|mouth|throat|lips|tongue|hand(?:job)?|stroke\w*|jerk\w*|cock|dick)\b/i.test(para)) return;
    // "arched his back and stretched": easing a stiff back is not a yielding posture.
    if (pat.id.startsWith("arch-") && /\b(?:stretch\w*|crack\w*|popp\w*|stiff|kink|from sitting|desk|chair)\b/i.test(sent) && !ANAL_CTX.test(para)) return;
    // Cuddling up while they choose something to watch ("cuddling up against his chest as he reached for the iPad … another episode")
    // is company, not aftercare.
    if (pat.id.startsWith("aftercare-") && /\b(?:episodes?|show|movie|film|tv|iPad|remote|netflix|stream\w*|youtube|game|podcast)\b/i.test(para)) return;
    // "Anakin spreads his legs until they're bracketing Obi-Wan's knees": his own legs.
    if (pat.id.startsWith("spread-their-legs") && /^\s*(?:apart\s+|wide\s+)?until\s+(?:they|his legs|her legs|their legs)(?:['’]re|\s+(?:are|were))\s+(?:bracketing|framing|around|on either side)/i.test(sent.slice(m.index! + m[0].length))) return;
    // "he sucks on Obi-Wan's tongue": kissing, not a blowjob.
    if (pat.id.startsWith("sucked") && /\bsuck\w*\s+(?:on\s+|at\s+)?(?:[\w'’-]+['’]s\s+|his\s+|her\s+|their\s+)?(?:tongue|lips?|neck|earlobe|ear|collarbone|jaw|shoulder|nipples?|skin|bruise|pulse point)\b/i.test(sent.slice(m.index!))) return;
    // A fight is not dominance: "He slammed Cas up against the wall, fist pulling back to land another blow."
    if (pat.id.startsWith("dom-") && /\b(?:punch\w*|slugg\w*|(?:land|landed|landing|throw|threw|throwing)\s+(?:another\s+|a\s+)?(?:blow|punch|hit)|fist\s+(?:pulling|drawing|cocking|swinging)\s+back|swung|knife|blade|gun|bleed\w*|bruis\w*|broke\s+(?:his|her|their)\s+(?:nose|jaw|ribs?))\b/i.test(sent)) return;
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
    // "it made him flush": with only that one person in the pattern, "him" is the one made to flush, i.e. the causer's partner,
    // not the partner of that person.
    if (causative && !subjChar && nearSubj && !(pat.subj === "t" ? bTok : tTok)) subjChar = nearSubj;
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
    // "His eyes were glued to Buck's cock", "his hand wrapped around Steve's cock": the possessive pronoun in front is not the
    // person named after it.
    if (pat.subj === "t" && /^(?:his|her|their)$/i.test(tTok ?? "") && bTok) {
      const named = cast.byAlias.get(stripPoss(bTok));
      if (named && named !== cast.secondPerson) {
        bottom = named;
        if (top === named) top = ctx.partnerOf(named) ?? top;
      }
    }
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
      if (owner && owner !== top && owner === bottom && pat.subj === "t" && !pat.signal) [top, bottom] = [bottom, top];
      // "Derek fucked my cock into Stiles" (or "Derek's cock … into Stiles" said of a third person's): whoever the cock belongs to
      // tops; the one moving it is only helping.
      if (pat.subj === "t" && /\b(?:in|into|inside)\s+\S/.test(m[0])) {
        const mine = /\b(?:fuck|push|guid|shov|eas|drove|drive|slid|slip|work|press)\w*\s+my\s+(?:[\w-]+\s+){0,2}?(?:cock|dick|prick|length|shaft)\b/i.test(m[0]);
        const who = mine ? (ctx.narratorNow ?? cast.narrator) : owner;
        if (who && who !== top && who !== bottom && cast.pairings.some((pr) => pr.includes(who) && pr.includes(bottom))) top = who;
      }
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
    const actor = pat.subj === "t" ? top : bottom;
    const feat = featuresOf({
      sent, paras, pi, basis: basis ?? "inferred", elided: !!pat.elided,
      pairBoth: cast.pairings.some((pr) => pr.includes(top) && pr.includes(bottom)),
      actorNamed: ctx.sentMentions.some((x) => x.c === actor),
      anyNamed: ctx.sentMentions.length > 0,
    });
    let weight = pat.weight * trustOf(pat.id, feat) * (basis === "named" ? 1 : basis === "pronoun" ? 0.75 : 0.5);
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
        desires.push({ via: pat.id, cat: "anal", act: "fingering himself", who: self, partner: other, role: "bottom", wants: true, kind: "solo", weight: 0.5, para: pi, sentence: original });
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
        desires.push({ via: pat.id, cat: "anal", act: /\b(?:dildo|vibrator|vibe|plug|beads|toy)\b/i.test(matchText) ? "using a toy on himself" : "fingering himself", who: top, partner: other, role: "bottom", wants: true, kind: "solo", weight: 0.5, para: pi, sentence: original, reflexive: true });
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
    // "when Anakin rides him so hard, in sixty years": a far-off future is no scene.
    if (cat === "anal" && /\bin (?:\w+ )?(?:years|decades|centuries|months)\b[^.!?]{0,40}$/i.test(sent.slice(Math.max(0, m.index! - 80), m.index!))) return;
    // "his tongue twists inside him … Eddie sinks into him": the same paragraph's tongue is the act, not a second, anal one.
    if (cat === "anal" && /\btongue\b/i.test(`${paras[pi - 1] ?? ""} ${para} ${paras[pi + 1] ?? ""}`) && !/\b(?:cock|dick|prick|knot|fingers?|length|shaft|toy|dildo|vibrator|plug|strap|head|tip)\b/i.test(`${paras[pi - 1] ?? ""} ${para} ${paras[pi + 1] ?? ""}`)) return;
    // "Dean pushed the dildo into his ass" with no one else in the sentence: his own ass, so he is bottoming, not topping.
    if (cat === "anal" && !pat.signal && /\b(?:dildo|vibrator|vibe|butt\s*plug|plug|beads|toy)\b/i.test(matchText) && /^(?:his|her|their)$/i.test(bTok ?? "") && !new RegExp(`\\b(?:${cast.chars.filter((c) => c !== top).flatMap((c) => c.aliases).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") || "$^"})\\b`).test(sent)) {
      desires.push({ via: pat.id, cat: "anal", act: "using a toy on himself", who: top, partner: bottom, role: "bottom", wants: true, kind: "solo", weight: 0.5, para: pi, sentence: original });
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
    if (pat.id.startsWith("passive-fucked") && !/\bby\b/.test(matchText) && /^\s+(?:\w+\s+){0,4}?by\s+(?!(?:him|her|them|me|you|it)\b)(?!this\s+(?:[\w-]+\s+){0,2}?(?:man|guy|lad|boy|one|beautiful|gorgeous)\b)(?!the same\b)/i.test(sent.slice(m.index! + m[0].length))) {
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
    // "he topped a lot like how he bottomed": a comparison, not an act.
    if ((pat.id.startsWith("topped") || pat.id.startsWith("bottomed-for")) && /\b(?:how|like|than|as)\s+$/i.test(sent.slice(0, m.index))) return;
    // "Shane slipped inside and sat on the edge of the bed": entering a room, not penetration.
    if (pat.id.startsWith("pushed-in") && /^\s*,?\s*(?:and\s+)?(?:then\s+)?(?:sat|stood|closed|shut|locked|walked|went|looked|waited|crossed|leaned|turned|stepped|paused|dropped|collapsed|hung|stopped|froze|glanced|checked|set|put|placed|kicked|tossed|threw|flicked)\b/i.test(sent.slice(m.index! + m[0].length))) return;
    // "…tried to find his prostate" right after he fingered himself: the same solo act, not the partner's.
    if (pat.id.startsWith("prostate") && (!tTok || /^(?:he|she|they)$/i.test(tTok)) && /^(?:his|her|their)$/i.test(bTok ?? "")) {
      const at = para.indexOf(sent);
      const before = (at > 0 ? para.slice(Math.max(0, at - 300), at) : paras[pi - 1] ?? "").slice(-300);
      if (/\b(?:inside|into|in|stretch\w*|prepp?\w*|finger\w*|open\w*)\s+(?:\w+\s+){0,3}?(?:himself|herself|themselves|myself)\b/i.test(before)) return;
    }
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
    // "opened him up with two fingers, then fucked him": the fingers belong to the clause before; the fucking is a new clause.
    const fingersBeforeOnly = FINGER_CTX.test(sent.slice(0, m.index!)) && !FINGER_CTX.test(matchText + " " + sent.slice(m.index! + matchText.length)) &&
      /[,;]|\b(?:then|and then)\b/.test(sent.slice(Math.max(0, m.index! - 14), m.index!) + matchText.slice(0, 12)) && /\b(?:fuck|pound|rail|bang|plow|plough|screw|breed|took|take)\w*/i.test(matchText);
    if (cat === "anal" && pat.id !== "worked-open-pushed-in" && act.startsWith("anal sex") && !PENIS_CTX.test(matchText) && FINGER_CTX.test(matchText + " " + fingerSent) && !PENIS_CTX.test(sent) && !fingersBeforeOnly) act = "fingering";
    if (pat.id === "prostate" && FINGER_CTX.test(sent) && !PENIS_CTX.test(sent)) act = "fingering";

    // Hints, not acts: checking out an ass, grabbing it, staring at a bulge...
    if (pat.signal) {
      const prefix = sent.slice(0, m.index);
      if (NEG.test(m.groups?.aux ?? "") || NEG.test(prefix.slice(-40))) return;
      if (pat.signal.kind === "fingers" && /\bown\b/i.test(matchText)) return;
      // "resisted the urge to shove a hand down his pants": an urge about his own body, not a touch of the partner.
      if ((pat.id.startsWith("hand-in-pants") || pat.id.startsWith("hj-hand-in-pants")) && /\b(?:urge|temptation|tempted|resist\w*|fought|fighting)\b[^.!?]*$/i.test(prefix)) return;
      // A wish, a plan or an attempt isn't a solo act: "wanted to touch himself", "if he jerked off", "tried not to masturbate".
      if ((pat.signal.kind === "masturbation" || pat.signal.kind === "handjob") && (HYPO_AUX.test(m.groups?.aux ?? "") || /\b(?:want\w*|wish\w*|imagin\w*|fantasi[sz]\w*|thought\s+about|think\w*\s+about|if|unless|would|could|might|should|gonna|going\s+to|tempted|temptation|urge|tried|trying|try|needed|need|about\s+to|stop\w*|refus\w*|without|keep\s+from|kept\s+from|resist\w*|difficult|struggl\w*|held\s+back|hold\s+back)\b[^.!?]{0,40}$/i.test(prefix.slice(-60) + " " + (m.groups?.aux ?? "") + " " + m[0].slice(0, 25)))) return;
      // Blushing and stammering say something about the pair only when the other one is right there.
      if (pat.id.startsWith("flustered")) {
        const at = para.indexOf(sent);
        const prevSent = (at > 0 ? para.slice(Math.max(0, at - 240), at) : "").trim().split(/(?<=[.!?”])\s+/).pop() ?? "";
        const partner = ctx.partnerOf(bottom);
        const re = partner ? new RegExp(`\\b${partner.name.split(" ")[0]}\\b|\\b(?:${partner.aliases.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i") : undefined;
        if (!re || !(re.test(sent) || re.test(prevSent))) return;
      }
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
        via: pat.id,
        feat,
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
    // "as though he hasn't just been fucked into a new realm": he looks untouched, and has been. The negation is the pretence.
    // "like he's never been fucked before, which is absurdly untrue": the author says the opposite of the simile.
    const pretence = /\bas\s+(?:if|though)\s+(?:he|she|they|\w+)\s+(?:hasn['’]t|hadn['’]t|has not|had not)\s+(?:just\s+|only\s+|even\s+)*(?:been\s+)?$/i.test(prefix.slice(-60)) ||
      /\bnever\s+been\b[^.!?]{0,40}\bwhich\s+(?:is|was)\s+(?:\w+ly\s+)?(?:untrue|false|a lie|not true|laughable|ridiculous|absurd)/i.test(sent);
    const ifNot = /\bif\s+(?:[\w'’-]+\s+){0,2}(?:doesn['’]t|don['’]t|didn['’]t|won['’]t|hadn['’]t|isn['’]t|wasn['’]t)\s*$/i.test(window) || (/\bif\s+(?:[\w'’-]+\s+){0,2}$/i.test(window) && NEG.test(aux));
    // "tried not to suppress the urge to pull out and snap back in": not resisting a wish means having it.
    const doubleNeg = /\b(?:not|n['’]t|never|without)\s+(?:to\s+)?(?:\w+\s+){0,2}?(?:suppress|resist|fight|hold back|stifle|restrain|deny|ignore|squash|stop|hide|push down|swallow|fight off)\w*\s+(?:\w+\s+){0,2}(?:urge|desire|need|want|impulse|temptation|craving)/i.test(window);
    // "Not without taking Eddie's dick out of his mouth": not … without cancels out.
    const notWithout = /\bnot\s+without\s+(?:\w+\s+){0,2}$/i.test(window);
    // "Eddie's cock never slid between his lips": a never inside the match, between the subject and the verb.
    const negated = !ifNot && !doubleNeg && !notWithout && !pretence && (NEG.test(aux) || NEG.test(negWindow) || NEG.test(negWindow.slice(-14) + matchText.slice(0, 8)) || /\b(?:never|refus(?:ed|es|e|ing) to|declin(?:ed|es|e|ing) to)\b/i.test(matchText));
    let kind: Desire["kind"] | "act" = "act";
    if (fantasyPara || FANTASY.test(window) || STRONG_FANTASY.test(prefix)) kind = "fantasy";
    else if (DESIRE_LEAD.test(sent) || DESIRE.test(window) || DESIRE_TAIL.test(window) || DESIRE.test(aux) || DESIRE.test(m.groups?.lead ?? "")) kind = "wanted";
    else if (/\b(?:want|need|wish|hope|long|crave)\w*\b[^.!?]*\b(?:and|but)\s+(?:then\s+)?(?:have|let|make|get)\s*$/i.test(prefix)) kind = "wanted";
    else if (/\b(?:want|need|wish|hope|long|crave)\w*\s+(?:\w+\s+){0,3}?to\b[^.!?]*\band\s+\w*(?:\s+\w*){0,2}$/i.test(prefix + matchText.slice(0, 14))) kind = "wanted";
    else if (HABIT_AUX.test(aux) && (pat.id === "bottomed-for" || pat.id === "topped")) kind = "identity";
    else if (
      !pretence &&
      !/\bas (?:if|though)\s+(?:he|she|they)\s+(?:wasn['’]t|weren['’]t|was not|were not|hadn['’]t been|had not been)\s+(?:the\s+(?:man|guy|one|person|boy|woman|girl)|Epithet\d+)\s+(?:who|that)\b/i.test(prefix) &&
      !(/\bas (?:if|though)\s*$/i.test(prefix) && /\b(?:isn['’]t|wasn['’]t|aren['’]t|weren['’]t|is not|was not|were not|not)\b[^.!?]*\benough\b/i.test(sent.slice(m.index!))) &&
      ((HYPO_AUX.test(aux) && !/\bcould\s+(?:\w+\s+)?(?:taste|feel|smell|hear|see)\b/i.test(prefix.slice(-25) + matchText.slice(0, 30))) || (pat.cat === "anal" && /\bcan\s*$/i.test(aux) && /^(?:fuck|take|pound|ride|have|bend|breed|ravish)/i.test(matchText.replace(/^.*?\bcan\s+/i, ""))) || HYPO_MATCH.test(prefix.slice(-25) + matchText) || /\b(?:can|could|would|should)\s+(?:just\s+)?\w+\b[^.!?]*\band\s*\w*$/i.test(prefix + matchText.slice(0, 6)) || HYPO_WINDOW.test(window) || HYPO_SENT.test(prefix) || (/\bthan\s+(?:it\s+was\s+|it's\s+)?$/i.test(prefix) && /^to\b/i.test(matchText)) || /\bthan\s+(?:it\s+was\s+|it's\s+)?to\s*$/i.test(prefix) || /\b(?:like|as if|as though)\s+(?:he|she|they|I)(?:['’]s|['’]d|\s+(?:is|was|were|are|had|has|would))?\s*$/i.test(prefix) || (/\b(?:like|as if|as though)\s*$/i.test(prefix) && /^(?:he|she|they|I)\b/.test(matchText)) ||
      (/\bso\s*$/i.test(window) && /\b(?:can|could|might|may|will|would)\b/i.test(aux)) ||
      /\b(?:would|could|might)\s+(?:want|like|love|wish|prefer|enjoy|rather|fit)\b[^.!?;]{0,70}?\b(?:as|while|when|if|so)\s+(?:[\w'’]+\s+)?$/i.test(prefix))
    ) kind = "hypothetical";

    if (kind === "act") {
      if (negated) return;
      // The newer oral patterns overlap each other and the older ones ("wraps his lips around Alex, a tap of his tongue
      // around the head"): they add to a sentence's evidence only once.
      // Scene role locking: in a scene with a third person, a pronoun-only line that has someone penetrating the very person who
      // is penetrating them (a few paragraphs back, named outright) is the third person's line: "Once I was back from the brink,
      // Derek held his hips … His dick barely moved in me" is Derek, not the one Scott was inside.
      if (basis !== "named" && cat === "anal") {
        const recent = acts.filter((a) => a.cat === cat && a.para >= pi - 6 && a.para <= pi);
        const reversed = recent.some((a) => a.top === bottom && a.bottom === top && a.basis === "named" && a.weight >= 0.7);
        const same = recent.some((a) => a.top === top && a.bottom === bottom);
        if (reversed && !same) {
          const earlier = paras.slice(Math.max(0, pi - 2), pi).join(" ") + " " + para.slice(0, Math.max(0, para.indexOf(original)));
          const third = cast.chars
            .filter((c) => c !== top && c !== bottom && c !== cast.secondPerson)
            .map((c) => ({ c, at: Math.max(...c.aliases.map((a) => earlier.lastIndexOf(a))) }))
            .filter((x) => x.at >= 0)
            .sort((x, y) => y.at - x.at)[0]?.c;
          if (third && cast.pairings.some((pr) => pr.includes(third) && pr.includes(bottom))) top = third;
        }
      }
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
      // "Now he knew what it was like to fuck Ilya Rozanov": a look back that, after being the bottom, means "have sex with".
      const retro = /\bwhat it (?:was|is|felt|had been|'d been)\s+like\s+to\b/i.test(sent);
      // "took them both at once": everyone else named just before is inside him too.
      if (pat.id.startsWith("dp-took-both")) {
        const earlier = paras.slice(Math.max(0, pi - 1), pi).join(" ") + " " + para.slice(0, para.indexOf(original) + original.length);
        for (const c of cast.chars) {
          if (c === top || c === bottom || c === cast.secondPerson || !c.aliases.some((a) => earlier.includes(a))) continue;
          acts.push({ via: pat.id, cat, act, top: c, bottom, weight: weight * 0.9, basis: "named", para: pi, sentence: original, context: contextAround(paras[pi] ?? "", original) });
        }
      }
      acts.push({ via: pat.id, feat, cat, act, top, bottom, weight: retro ? weight * 0.4 : weight, basis, para: pi, sentence: original, holeGuess, shaky: retro ? "“what it was like to…” looks back on an earlier time and can describe either partner" : shaky, context: contextAround(paras[pi] ?? "", original) });
      ctx.setPartners(cat, top, bottom);
      ctx.lastSubject = pat.subj === "t" ? top : bottom;
      return;
    }

    // Whose desire is it? The first person mentioned before the desire word, else the subject.
    const wantAnd = /\b(?:want|need|wish|hope|long|crave)\w*\b[^.!?]*\b(?:and|but)\s+(?:then\s+)?(?:have|let|make|get)\s*$/i.test(prefix);
    // "…, if only Hank could find the courage, buried deep inside him": the one wishing is the one named after "if only".
    const ifOnly = new RegExp(`\\bif\\s+only\\s+(${NAMES})\\b`, "i").exec(window);
    // "Maybe Obi-Wan can just fuck him here", "it would be hot if Obi-Wan fucked him hard": in one person's point of view, with
    // no one else named as wanting it, the one imagining it is the point-of-view character, who is the one it would be done to.
    const povWisher = kind === "hypothetical" && ctx.povNow && (ctx.povNow === top || ctx.povNow === bottom) &&
      !/\b(?:want|need|wish|hope|long|crave|desire|yearn|beg|plead|ache|itch|hungry|dying)\w*/i.test(window) ? ctx.povNow : undefined;
    const exp = (ifOnly ? cast.byAlias.get(ifOnly[1]) : undefined) ?? povWisher ?? (wantAnd ? firstEntity(sent) : undefined) ?? firstEntity(window) ?? (pat.subj === "t" ? top : bottom);
    const role: Role | undefined = exp === top ? "top" : exp === bottom ? "bottom" : undefined;
    if (!role) return;
    // "There was no way Steve was asking him to fuck him": disbelief about a claim, not a dislike of the act.
    if (negated && /\bno\s+(?:fucking\s+|damn\s+)?(?:way|chance)\b|\bnot\s+a\s+chance\b|\bas\s+if\b|\bthere\s+(?:was|is)\s+no\s+(?:possible\s+)?(?:way|chance)\b/i.test(prefix.slice(-90))) return;
    desires.push({
      via: pat.id,
      feat,
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

  const narratedTexts = detectTexts(paras, cast).messages.filter((m) => m.how === "narrated" && !texting.rewritten.has(m.para));
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
    const dynamic = buildDynamic(pair, pDes, pairTags, where);
    const vibeCombined = buildVibes(pair, pActs, pDes, pairTags, meta, where, true);
    const solo = buildSolo(pair, soloDes, where);
    const manual = buildManual(pair, manualDes, where);
    results.push({ pairing: `${members[0].name}/${members[1].name}`, anal, oral, blowjob, rimming, cunnilingus, vaginal, solo, manual, vibe, vibeCombined, dynamic, weight, key });
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
  const pairings: PairingResult[] = results.map(({ weight: _w, key: _k, ...p }) => p);
  opts.debug?.({
    paras,
    pov: pov.at.map((c) => c?.name),
    texts: [...texting.messages, ...narratedTexts].map((m) => ({ para: m.para, from: m.sender?.name, to: m.receiver?.name })),
  });
  if (opts.audit) {
    for (const h of acts) opts.audit({ via: h.via ?? "?", f: h.feat, kind: "act", cat: h.cat, act: h.act, para: h.para, sentence: h.sentence, a: h.top.name, b: h.bottom.name });
    for (const h of desires) opts.audit({ via: h.via ?? "?", f: h.feat, kind: h.kind, cat: h.cat, act: h.act, para: h.para, sentence: h.sentence, a: h.who.name, b: h.partner?.name });
  }
  const textingResult = summarizeTexts([...texting.messages, ...narratedTexts], where);
  return {
    source: "patterns",
    fandom: meta.fandoms.join(", "),
    main_pairing: romantic[0] ?? results[0]?.pairing ?? "",
    pairings: pairings,
    tagCheck: checkTags(meta.freeforms, tags, pairings, paras, where, textingResult),
    texting: textingResult,
    notes: notes.join(" "),
  };
}

