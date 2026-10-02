// Sentence patterns for sex acts. Each pattern names who is the top ("T") and who is the bottom ("B").
//
// Placeholders in pattern sources:
//   {T} {B}            a person: a name or a personal pronoun (he/she/they/I/you/him/her/them/me)
//   {T:poss} {B:poss}  a possessive: Harry's, his, her, their, my, your
//   {T:penis}          "Harry's cock" / "his dick" / or just "him"
//   {T:penisReq}       must be "<possessive> <penis word>"
//   {B:ass}            "his hole" / "Harry's ass" / or just "him"
//   {B:assReq}         must be "<possessive> <ass word>"
//   {B:rimReq}         like assReq but rim-specific words
//   {B:mouthReq}       "<possessive> mouth/lips/throat/tongue"
//   {B:faceReq}        "<possessive> face/mouth/throat"
//   {B:vulvaReq}       "<possessive> clit/pussy/..."
//   {x's}              any possessive (not captured)
//   {aux}              auxiliaries/adverbs between subject and verb ("was slowly", "wanted to")
//   {PENIS} {ASS} {MOUTH} {FINGERS}  body-part vocab
// Matching is case-sensitive so names like "Will" or "Grace" aren't confused with ordinary words.

export type Cat = "anal" | "oral" | "vaginal" | "vibe";

export interface PatternDef {
  id: string;
  cat: Cat;
  act: string;
  /** Which slot is the grammatical subject (used for pronoun resolution). */
  subj: "t" | "b";
  weight: number;
  src: string;
  /** Sentence must also contain sex vocabulary (for verbs that have innocent meanings). */
  needsCtx?: boolean;
  /** Sentence must mention a penis/strap word. */
  /** Counts at most once per sentence, alongside whatever else matched it (for patterns that overlap others). */
  dedupe?: boolean;
  needsPenis?: boolean;
  /** Sentence must match this too. */
  needs?: RegExp;
  /** Words at least one of which must appear (for patterns whose verbs can't be read off automatically). */
  kw?: string;
  /** Oral patterns whose receiver might be a woman: "went down on her" is cunnilingus, licker = top. */
  femaleTarget?: "flip" | "drop";
  /** Not an act: a hint about who'd top (ogling an ass, grabbing it, staring at a bulge). */
  /** A hint, not an act. `actor` says whose behaviour it is when that isn't the subject ("shoved his fingers into Peter's mouth"). */
  signal?: { kind: "ogling" | "touch" | "prep" | "fingers" | "solo" | "behavior"; actorRole: "top" | "bottom"; actor?: "t" | "b" };
}

export interface CompiledPattern extends PatternDef {
  re: RegExp;
  /** Cheap pre-check: the sentence must contain one of the pattern's verbs/nouns. */
  gate?: RegExp;
  /** The subject isn't in the match; it's the nearest subject earlier in the sentence. */
  elided?: boolean;
}

const PENIS_ADJ =
  "hypersensitive|oversensitive|sensitive|hot|eager|desperate|needy|heavy|hard|thick|aching|leaking|throbbing|swollen|heavy|wet|slick|stiff|big|long|huge|rigid|straining|twitching|flushed|full|whole|fat|dripping|weeping|pretty|perfect|lubed|slicked|neglected|own|entire|impressive|spit-slick|spit-slicked|knotted|swelling|cut|uncut|red|angry";
const ASS_ADJ =
  "puckered|winking|trembling|spasming|fucked-out|well-used|tender|velvety|silky|tiny|furled|tight|slick|wet|loose|puffy|stretched|sensitive|twitching|fluttering|clenching|quivering|eager|needy|empty|furled|pink|swollen|little|perfect|lubed|slicked|gaping|greedy|virgin|own|pretty|spit-slick|spit-slicked|sloppy|abused|used|sore|hot|warm|soft|willing|waiting|untouched|clenched";
const MOUTH_ADJ = "hot|wet|warm|open|eager|pretty|soft|swollen|perfect|waiting|willing|own|sweet|tight|filthy|slack|stretched|talented|clever|sinful|greedy";

export const PENIS = `(?:(?:${PENIS_ADJ})\\s+){0,2}(?:cock(?:head)?|dick|prick|length|shaft|erection|member|hard-?on|manhood|girth|knot|strap(?:-?on)?|dildo|balls)`;
/** Words for the anus itself, beyond "hole" and "ass": "butthole", "pucker", "ring of muscle", "back door"... */
const ANUS = `butt-?hole|anus|sphincter|rosebud|starfish|back ?door|back entrance|(?:(?:tight|outer|inner|first)\\s+)?rings? of muscles?|pucker|passage`;
export const ASS = `(?:(?:${ASS_ADJ})\\s+){0,2}(?:ass(?:hole)?|arse(?:hole)?|${ANUS}|front ?hole|hole|entrance|rim|opening|bum|butt|insides?|prostate|body|backside|channel|pussy|cunt|vagina|folds|cervix|sex)`;
const RIM = `(?:(?:${ASS_ADJ})\\s+){0,2}(?:ass(?:hole)?|arse(?:hole)?|${ANUS}|hole|entrance|rim|(?:ass |arse |butt )?crack|cleft|crease|taint|perineum)(?!\\s+(?:cheeks?|muscles?))`;
const MOUTH = `(?:(?:${MOUTH_ADJ})\\s+){0,2}(?:mouth|lips|throat|tongue)`;
const FACE = `(?:(?:${MOUTH_ADJ})\\s+){0,2}(?:mouth|throat|face)\\b`;

/** "…to stand between them", "and stepped between them": the legs being spread are someone else's. */
const BETWEEN_THEM = `\\s+(?:apart\\s+|wide\\s+)?(?:to|and|so (?:he|she|they) could)\\s+(?:\\w+\\s+){0,2}?(?:stand|step|kneel|settl|fit|slot|get|mov|climb|crawl|press|wedg|sett|nestl|lay|lie|position)\\w*\\s+(?:(?:himself|herself|themselves)\\s+)?between`;

/** Words that put a "took him deep" sentence in someone's mouth. */
const ORAL_WORDS = `(?:mouth|throat|lips|swallow\\w*|gag\\w*|tongue|hum(?:s|med|ming)?|suck\\w*|chok\\w*|jaw|saliva|spit|drool\\w*|bob\\w*|blow\\w*|knees|frenulum)`;
const ORAL_FREE = new RegExp(`^(?!.*\\b${ORAL_WORDS}\\b)`, "i");
const ORAL_NEAR = new RegExp(`\\b${ORAL_WORDS}\\b`, "i");
const VULVA = `(?:(?:\\w+)\\s+)?(?:clit(?:oris)?|pussy|cunt|folds|slit|labia|vulva|sex|cunny|front ?hole|t-?dick)`;
export const FINGERS = `(?:fingers?|digits?|knuckles?|thumb|fingertips?|pointer|pointer fingers?|index fingers?|middle fingers?|ring fingers?)`;

const AUX =
  "(?<aux>(?:(?:was|were|is|are|had|has|have|been|being|be|kept|keeps|started|starts|began|begins|proceeds|proceeded|proceed|went on|goes on|continued|continues|would|could|will|can|might|must|should|shall|wanted|wants|want|needed|needs|need|longed|wished|tried|tries|going|gonna|wanna|got|get|gets|did|does|do|finally|just|then|still|already|almost|barely|never|not|to|also|immediately|eventually|again|always|usually|often|sometimes|only|rarely|soon|now|quickly|really|actually|lazily|happily|greedily|[a-z]+ly|[a-z]+n['’]t|'d|’d|'ll|’ll|used)\\s+){0,4})";

/** Words after a bare "her" that show it's an object, not a possessive ("fucked her hard" vs "her hair"). */
const HER_OBJ =
  "her(?=\\s*(?:[,.;:!?—–)\"”]|$)|\\s+(?:and|as|with|to|in|on|at|up|down|off|out|open|hard|harder|again|deep|deeper|slowly|until|while|so|over|onto|into|back|apart|wide|from|for|through|like|then|now|properly|thoroughly|gently|roughly|senseless|raw|good|before|after|when|if|but|or|without|against|between|inside|all|right|there|here|once|twice|too|that|this|until|deeply|fast|faster|slow)\\b)";

/** Split a regex group body on its top-level "|". */
function topLevelAlts(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "\\") { cur += ch + body[++i]; continue; }
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "|" && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Build a keyword gate from the verb group right after {aux} (skipping filler like "(?:\w+\s+){0,2}?").
 * Every alternative must contain a literal word, so the gate is a necessary condition for a match.
 */
function deriveGate(src: string): string | undefined {
  let i = src.indexOf("{aux}");
  if (i < 0) return undefined;
  i += 5;
  for (;;) {
    if (!src.startsWith("(?:", i)) return undefined;
    let depth = 0;
    let j = i;
    for (; j < src.length; j++) {
      if (src[j] === "\\") { j++; continue; }
      if (src[j] === "(") depth++;
      if (src[j] === ")" && --depth === 0) break;
    }
    const body = src.slice(i + 3, j);
    // Skip "(?:\w+\s+){0,2}?" style filler and try the next group.
    if (/^\\w\+\\s\+$|^\[\\w-\]\+\\s\+$/.test(body)) {
      i = src.indexOf("(?:", j);
      if (i < 0) return undefined;
      continue;
    }
    const words = leadingWords(body);
    return words ? [...words].join("|") : undefined;
  }
}

/** The literal each alternative must start with ("fuck(?:s|ed)?" → "fuck"); undefined if any can't be pinned down. */
function leadingWords(body: string): Set<string> | undefined {
  const words = new Set<string>();
  for (const alt of topLevelAlts(body)) {
    if (alt.startsWith("(?:")) {
      // Nested group at the start: every alternative inside it must have a literal.
      let depth = 0;
      let j = 0;
      for (; j < alt.length; j++) {
        if (alt[j] === "\\") { j++; continue; }
        if (alt[j] === "(") depth++;
        if (alt[j] === ")" && --depth === 0) break;
      }
      if (/^[?*{]/.test(alt.slice(j + 1))) return undefined; // optional group: nothing guaranteed
      const inner = leadingWords(alt.slice(3, j));
      if (!inner) return undefined;
      inner.forEach((w) => words.add(w));
      continue;
    }
    const lit = alt.match(/^[a-z]+/i)?.[0] ?? "";
    // A literal followed by "?" or "*" isn't guaranteed in full; drop its last letter.
    const next = alt[lit.length];
    const sure = next === "?" || next === "*" ? lit.slice(0, -1) : lit;
    if (sure.length < 3) return undefined;
    words.add(sure.toLowerCase());
  }
  return words;
}

const PENIS_KW = "cock|dick|prick|length|shaft|erection|member|hard|manhood|girth|knot|strap|dildo";
const ASS_KW =
  "ass|arse|hole|entrance|rim|opening|pucker|bum|butt|inside|insides|prostate|channel|backside|pussy|cunt|vagina|folds|cervix|sex|anus|sphincter|rosebud|starfish|door|ring|passage|crack|cleft|crease";
const BUTT_KW = "ass|arse|butt|bum|backside|behind|rear|cheeks|glutes";
const CROTCH_KW = "crotch|groin|bulge|package|cock|dick|erection|hard|fly|zip|sweatpants";

/** Gates for patterns that don't start with a verb list (subject is a body part, passive voice, etc.). */
const MANUAL_GATES: Record<string, string> = {
  sucked: "suck|blow|blew|throat|swallow|gag|chok|bob|worship|slurp|nurs",
  "hole-around": ASS_KW,
  inside: " in |inside",
  "penis-inside": PENIS_KW,
  "bottomed-out": "bottom",
  "passive-fucked": "fucked|railed|pounded|bred|knotted|pegged|penetrated|screwed|impaled|breached|topped|plowed|ploughed|filled|stretched",
  "bottomed-for": "bottom",
  topped: "top",
  "fingers-inside": "finger|digit|knuckle|thumb",
  "went-down-on": "down",
  "penis-in-mouth": PENIS_KW,
  "lips-around": "lips|mouth|throat|tongue",
  "lips-around-him": "lips|mouth|throat",
  "passive-sucked": "sucked|blown|throated",
  "tongue-in-hole": "tongue|mouth|lips|face",
  "tongue-verbs-hole": "tongue|mouth|lips",
  "tongue-in-him": "tongue",
  "passive-rimmed": "rimmed|eaten|tongue",
  "tongue-on-vulva": "tongue|mouth|lips",
  "having-inside": "having|feeling|felt|feel|with|of|want|need|crav",
  "full-of": "full|stuffed|filled",
  "tight-around": "tight",
  "head-bobbed": "head",
  "hollowed-cheeks": "hollow",
  "come-dripping": "come|cum|seed|release|load|spunk|spend",
  "hands-and-knees": "hands and knees|stomach|belly|front",
  presented: "present",
  "penis-in-vulva": PENIS_KW,
  "ogle-ass": BUTT_KW,
  "eyes-on-ass": BUTT_KW,
  "ogle-crotch": CROTCH_KW + "|bulge|outline|shape|tent|line",
  "eyes-on-crotch": CROTCH_KW,
  "ogle-crotch-oral": CROTCH_KW + "|bulge|outline|shape|tent|line",
  "eyes-on-crotch-oral": CROTCH_KW,
  "hands-on-ass": "hand",
  "aroused-by-ass": BUTT_KW,
  "mouth-watered": "water",
  "mouth-watered-oral": "water",
};

/** Placeholder that stands in for an epithet inside a sentence ("Epithet0", "Epithet1", ...). */
export const EPITHET_TOKEN = "Epithet\\d+";

export function compilePatterns(defs: PatternDef[], aliasPattern: string): CompiledPattern[] {
  // Epithets ("the tall blond") are swapped for placeholder tokens before matching; see EPITHET_TOKEN.
  const NAMES = `${aliasPattern || "(?!)"}|${EPITHET_TOKEN}`;
  const counters = { t: 0, b: 0 };
  const g = (role: "t" | "b") => `${role}_${++counters[role]}`;
  const bare = (role: "t" | "b") =>
    `(?<${g(role)}>(?:${NAMES})(?!['’]s\\b)|[Hh]e|[Ss]he|[Tt]hey|I|[Yy]ou|him|${HER_OBJ}|them|me)(?![\\w'’])`;
  const objOnly = (role: "t" | "b") => `(?<${g(role)}>(?:${NAMES})(?!['’]s\\b)|him|${HER_OBJ}|them|me|you)(?![\\w'’])`;
  // "Harry's" and, for names ending in s, "Stiles'".
  const POSS_S = `(?:${NAMES})(?:['’]s|(?<=s)['’](?!\\w))`;
  const poss = (role: "t" | "b") => `(?<${g(role)}>${POSS_S}|[Hh]is|[Hh]er|[Tt]heir|[Mm]y|[Yy]our)`;
  const anyPoss = `(?:${POSS_S}|[Hh]is|[Hh]er|[Tt]heir|[Mm]y|[Yy]our|the)`;

  const out: CompiledPattern[] = [];
  for (const def of defs) {
    counters.t = 0;
    counters.b = 0;
    const src = def.src
      .replace(/\{x's\}/g, anyPoss)
      .replace(/\{aux\}/g, AUX)
      .replace(/\{PENIS\}/g, PENIS)
      .replace(/\{ASS\}/g, ASS)
      .replace(/\{MOUTH\}/g, MOUTH)
      .replace(/\{FINGERS\}/g, FINGERS)
      .replace(/\{([TB])(?::(\w+))?\}/g, (_, R: string, kind?: string) => {
        const r = R.toLowerCase() as "t" | "b";
        switch (kind) {
          case undefined:
            return bare(r);
          case "poss":
            return poss(r);
          case "penis":
            return `(?:${poss(r)}\\s+${PENIS}|${objOnly(r)})`;
          case "penisReq":
            return `${poss(r)}\\s+${PENIS}`;
          case "ass":
            return `(?:${poss(r)}\\s+${ASS}|${objOnly(r)})`;
          case "assReq":
            return `${poss(r)}\\s+${ASS}`;
          case "rimReq":
            return `${poss(r)}\\s+${RIM}`;
          case "rimOrObj":
            return `(?:${poss(r)}\\s+${RIM}|${objOnly(r)})`;
          case "mouthReq":
            return `${poss(r)}\\s+${MOUTH}`;
          case "faceReq":
            return `${poss(r)}\\s+${FACE}`;
          case "vulvaReq":
            return `${poss(r)}\\s+${VULVA}`;
          default:
            throw new Error(`Unknown placeholder ${kind}`);
        }
      });
    // "tease Henry's balls and graze his hole": a cock right after such a verb is its object, not the actor.
    const finalSrc = def.src.startsWith("\\b{T:penisReq}")
      ? `(?<!\\b(?:tease|teases|teasing|teased|stroke|strokes|stroking|stroked|cup|cups|cupping|cupped|grab|grabs|grabbing|grabbed|squeeze|squeezes|squeezing|squeezed|touch|touches|touching|touched|lick|licks|licking|licked|suck|sucks|sucking|sucked|fondle|fondles|fondling|fondled|palm|palms|palming|palmed|grip|grips|gripping|gripped|hold|holds|holding|held|kiss|kisses|kissing|kissed|tug|tugs|tugging|tugged|pump|pumps|pumping|pumped|jerk|jerks|jerking|jerked|rub|rubs|rubbing|rubbed|wrap|around|over|on|at|to)\\s+)${src}`
      : src;
    const gateWords = def.kw ?? MANUAL_GATES[def.id] ?? deriveGate(def.src);
    const gate = gateWords ? new RegExp(`(?:${gateWords})`, "i") : undefined;
    out.push({ ...def, re: new RegExp(finalSrc, "g"), gate });

    // Same pattern with the subject left out: "Draco climbed on top and rode him".
    const lead = def.subj === "t" ? "\\b{T}\\s+{aux}" : "\\b{B}\\s+{aux}";
    if (def.src.startsWith(lead)) {
      const rest = src.slice(src.indexOf("(?<aux>"));
      // Also gerunds after "in favor of", "about", "before", "while"... ("in favor of licking his rim").
      const elided = `(?:\\band|\\bthen|,|\\b(?:of|about|before|after|while|by|without|from|to|kept|started|began|continued|finished|enjoyed|loved|tried|resumed))\\s+(?:then\\s+|finally\\s+|\\w+ly\\s+)?${rest}`;
      out.push({ ...def, id: `${def.id}~elided`, elided: true, weight: def.weight * 0.8, re: new RegExp(elided, "g"), gate });
    }
  }
  return out;
}

const SELF = "(?:himself|herself|themself|themselves|myself|yourself)";
const DEPTH = "(?:(?:back|forward|all the way|deep(?:er)?|slowly|carefully|home|fully|further|right|still|gently|roughly|finally|in|up)\\s+)*";

export const PATTERNS: PatternDef[] = [
  // ───────────── ANAL: penetration ─────────────
  {
    id: "fuck",
    cat: "anal",
    act: "anal sex",
    subj: "t",
    weight: 1,
    src: `\\b{T}\\s+{aux}(?:fuck(?:s|ed|ing)?|screw(?:s|ed|ing)?|pound(?:s|ed|ing)?|rail(?:s|ed|ing)?|plough(?:s|ed|ing)?|plow(?:s|ed|ing)?|bang(?:s|ed|ing)?|breed(?:s|ing)?|bred|knot(?:s|ted|ting)?|peg(?:s|ged|ging)?|mount(?:s|ed|ing)?|sodomi[sz](?:e|es|ed|ing)|bugger(?:s|ed|ing)?|nail(?:s|ed|ing)?|ravish(?:es|ed|ing)?|ravag(?:e|es|ed|ing))\\s+{B:ass}(?!\\s+(?:up|over|off|down|to|for (?:being|doing|making|having|that|this|everything|ever)|and (?:his|her|their|the) (?!cock|dick|ass|hole)))`,
  },
  {
    id: "push-into",
    cat: "anal",
    act: "anal sex",
    subj: "t",
    weight: 1,
    needsCtx: true,
    src: `\\b{T}\\s+{aux}(?:push|slid|slide|slip|sink|sank|sunk|thrust|drove|drive|eas|sheath|bur(?:y|ie)|guid|snap|glid|fed|feed|wedg|nudg|forc|shov|plung|slam|pump|seat|slot|rut|ram|pound|fuck|rail|hammer|bang|drill|surg|sli)\\w*\\s+(?:(?:${SELF}|it|{x's}\\s+{PENIS}|{x's}\\s+hips|the\\s+(?:head|tip)(?:\\s+of\\s+{x's}\\s+{PENIS})?|(?:a|the)\\s+(?:strap(?:-?on)?|dildo|toy|plug))\\s+)?${DEPTH}(?:(?:in(?:to|side)?)\\s+{B:ass}|(?:past|through)\\s+{B:assReq})`,
  },
  {
    id: "rock-into",
    cat: "anal",
    act: "anal sex",
    subj: "t",
    weight: 0.6,
    needsCtx: true,
    needsPenis: true,
    src: `\\b{T}\\s+{aux}(?:rock|grind|ground|roll|press|work|edg|nudg|fit|lin)\\w*\\s+(?:(?:${SELF}|it|{x's}\\s+{PENIS}|{x's}\\s+hips)\\s+)?${DEPTH}(?:in(?:to|side)?|past)\\s+{B:ass}`,
  },
  {
    id: "penis-into",
    cat: "anal",
    act: "anal sex",
    subj: "t",
    weight: 1,
    src: `\\b{T:penisReq}\\s+{aux}(?:\\w+\\s+){0,2}?(?:slid|slide|slip|push|sank|sink|press|drove|drive|bur(?:y|ie)|thrust|lock|tied|wedg|glid|plung|disappear|vanish|sheath|work|slam|ram|pound|throb|twitch|puls|swell|swole|knot|lodg|seat|nestl|rest|mov|stay|remain|fill|fit|sat|sit)\\w*\\s+${DEPTH}(?:in(?:to|side)?|past|through)\\s+{B:ass}`,
  },
  {
    id: "penis-fills",
    cat: "anal",
    act: "anal sex",
    subj: "t",
    weight: 0.9,
    needsCtx: true,
    src: `\\b{T:penisReq}\\s+{aux}(?:\\w+\\s+){0,2}?(?:fill|split|stretch|breach|enter|penetrat|open|spread|impal|claim|wreck|ruin|part|invad)\\w*\\s+{B:ass}`,
  },
  {
    id: "penis-against",
    cat: "anal",
    act: "anal sex",
    subj: "t",
    weight: 0.5,
    src: `\\b{T:penisReq}\\s+{aux}(?:\\w+\\s+){0,2}?(?:press|nudg|rub|brush|drag|catch|caught|teas|circl|bump|slid|slide|push|hit|graz|nail|jab|strok|pound|ram|find|found|angl|kiss|slip)\\w*\\s+(?:(?:right|up|directly|insistently|slowly)\\s+)*(?:(?:against|at|over|across|into|on|between)\\s+)?{B:assReq}`,
  },
  {
    id: "press-cock-against",
    cat: "anal",
    act: "anal sex",
    subj: "t",
    weight: 0.7,
    src: `\\b{T}\\s+{aux}(?:press|rub|nudg|lin|drag|teas|slid|slide|push|guid|circl|notch|position|align|rest)\\w*\\s+(?:(?:the\\s+(?:head|tip)\\s+of\\s+)?{x's}\\s+{PENIS}|${SELF})\\s+(?:up\\s+|right\\s+)?(?:against|at|to|over|between|into)\\s+{B:assReq}`,
  },
  {
    id: "hole-around",
    cat: "anal",
    act: "anal sex",
    subj: "b",
    weight: 0.9,
    src: `\\b{B:poss}\\s+${ASS.replace("|body", "")}\\s+(?:(?:\\w+\\s+){0,3}?(?:around|on|over|onto|for|to|with|against)|(?:\\w+\\s+){0,2}?(?:swallow|took|take|accept|squeez|grip|milk|suck|clench|flutter|tighten|clamp)\\w*(?:\\s+(?:in|around|down on|on))?)\\s+{T:penisReq}`,
  },
  {
    id: "inside",
    cat: "anal",
    act: "anal sex",
    subj: "t",
    weight: 0.9,
    needsCtx: true,
    src: `\\b{T}\\s+{aux}(?:(?:was|were|is|'s|’s|being|be|finally|fully|still|all the way|deep|buried|seated|sheathed|balls-deep|balls deep|completely|halfway|already|right|so|now)\\s+)+(?:inside|in)\\s+{B:ass}`,
  },
  {
    id: "penis-inside",
    cat: "anal",
    act: "anal sex",
    subj: "t",
    weight: 1,
    src: `\\b{T:penisReq}\\s+(?:(?:was|is|still|now|finally|fully|deep|all the way|balls-deep|buried|lodged|seated|sheathed|nestled|halfway|already|so)\\s+)*(?:(?<=\\s(?:was|is|still|now|finally|fully|deep|way|balls-deep|buried|lodged|seated|sheathed|nestled|halfway|already|so)\\s+)(?:in|up)|inside)\\s+{B:ass}`,
  },
  {
    id: "came-inside",
    cat: "anal",
    act: "anal sex",
    subj: "t",
    weight: 1,
    src: `\\b{T}\\s+{aux}(?:bottom(?:ed|s|ing)? out|came|comes|come|coming|cum(?:s|med|ming)?|spill(?:ed|s|ing)?|empti(?:ed|es)|emptying|finish(?:ed|es|ing)|unload(?:s|ed|ing)?|knot(?:s|ted|ting)?)\\s+(?:(?:hard|deep|again|right|all the way|deep)\\s+)*(?:in(?:side)?|into)\\s+{B:ass}`,
  },
  {
    id: "bottomed-out",
    cat: "anal",
    act: "anal sex",
    subj: "t",
    weight: 0.6,
    needsCtx: true,
    src: `\\b{T}\\s+{aux}bottom(?:ed|s|ing)? out\\b`,
  },
  {
    id: "enter",
    cat: "anal",
    act: "anal sex",
    subj: "t",
    weight: 0.9,
    needsCtx: true,
    src: `\\b{T}\\s+{aux}(?:enter(?:s|ed|ing)?|penetrat(?:e|es|ed|ing)|breach(?:es|ed|ing)?|impal(?:e|es|ed|ing)|spear(?:s|ed|ing)?)\\s+{B:ass}(?!\\s+with\\s+(?:him|her|them|me|you|us)\\b)(?=\\s*[,.;:!?—–]|\\s*$|\\s+(?:with|in one|in a|slowly|carefully|from behind|hard|deep|all the way|inch|bare|raw|for the first time|again|at last|finally)\\b)`,
  },
  {
    // "Stiles spread his legs and let Derek in"
    id: "let-in",
    cat: "anal",
    act: "anal sex",
    subj: "b",
    weight: 0.6,
    needsCtx: true,
    needs: /\b(?:spread\w*|legs|thighs|knees|hole|ass|arse|inside|open(?:ed|ing)?|lube\w*|slick\w*|cock|dick|stretch\w*)\b/i,
    src: `\\b{B}\\s+{aux}(?:(?:\\w+\\s+){0,6}?and\\s+)?(?:let|lets|letting)\\s+(?!(?:him|her|them|me|you)\\b){T}\\s+(?:in|inside)\\b(?!\\s*(?:to|the|through|on)\\b)`,
  },
  {
    // "Derek's hips snapped against Stiles' ass"
    id: "hips-against-ass",
    cat: "anal",
    act: "anal sex",
    subj: "t",
    weight: 0.7,
    needsCtx: true,
    src: `\\b{T:poss}\\s+(?:hips|pelvis|thighs|balls)\\s+(?:\\w+\\s+)?(?:snap|slap|smack|slam|pound|crash|thrust|stutter|pistol|jerk|bang|smash)\\w*\\s+(?:\\w+\\s+)?(?:against|into|up into|forward into)\\s+{B:assReq}`,
  },
  {
    // "Derek took Stiles from behind". A bare "Aerion took him" is usually the one receiving (often a mouth),
    // and "Stiles took him deep" is the one being entered (took-deep), so a manner word is required.
    id: "take-x",
    cat: "anal",
    act: "anal sex",
    subj: "t",
    weight: 0.45,
    needsCtx: true,
    src: `\\b{T}\\s+{aux}(?:took|take|takes|taking)\\s+{B:ass}(?=\\s+(?:in one|in a single|slowly|carefully|from behind|hard|harder|rough(?:ly)?|bare|raw|for the first time|against|over|on (?:the|his|her|their)|right there)\\b)`,
  },
  {
    id: "fill",
    cat: "anal",
    act: "anal sex",
    subj: "t",
    weight: 0.5,
    needsCtx: true,
    // A cock, or what it leaves: "filled him with his come".
    needs: /\b(?:cock|dick|prick|length|shaft|erection|member|strap|dildo|knot|girth|come|cum|seed|load|spunk)\b/i,
    src: `\\b{T}\\s+{aux}(?:fill(?:s|ed|ing)?|split(?:s|ting)?|claim(?:s|ed|ing)?|wreck(?:s|ed|ing)?|ruin(?:s|ed|ing)?|stuff(?:s|ed|ing)?)\\s+{B:ass}(?:\\s+(?:up|open|apart|full))?`,
  },
  {
    id: "riding",
    cat: "anal",
    act: "anal sex (riding)",
    subj: "b",
    weight: 1,
    needsCtx: true,
    src: `\\b{B}\\s+{aux}(?:rode|ride|rides|riding|ridden|bounc(?:e|es|ed|ing)\\s+on|fuck(?:s|ed|ing)?\\s+${SELF}\\s+(?:back\\s+|down\\s+)*(?:on(?:to)?)|impal(?:e|es|ed|ing)\\s+${SELF}\\s+on|lower(?:s|ed|ing)?\\s+${SELF}\\s+(?:down\\s+)?on(?:to)?|(?:sink|sank|sinks|sinking|sunk)\\s+(?:back\\s+|all the way\\s+|slowly\\s+)*down\\s+on(?:to)?|eas(?:e|es|ed|ing)\\s+${SELF}\\s+(?:down\\s+)?on(?:to)?|seat(?:s|ed|ing)?\\s+${SELF}\\s+on|work(?:s|ed|ing)?\\s+${SELF}\\s+(?:up\\s+and\\s+down\\s+|down\\s+)?on(?:to)?|push(?:es|ed|ing)?\\s+(?:${SELF}\\s+)?back\\s+on(?:to)?)\\s+{T:penis}(?!\\s+(?:thigh|face|mouth|tongue|fingers?|lap|knee|leg|chest|back|shoulders|horse|bike)s?\\b)(?!\\s+through\\b)`,
  },
  {
    id: "grind-down",
    cat: "anal",
    act: "anal sex (riding)",
    subj: "b",
    weight: 0.5,
    needsCtx: true,
    needsPenis: true,
    src: `\\b{B}\\s+{aux}(?:grind(?:s|ing)?|ground|settl(?:e|es|ed|ing)|rock(?:s|ed|ing)?|roll(?:s|ed|ing)?)\\s+(?:back\\s+|all the way\\s+)*down\\s+(?:on(?:to)?|against)\\s+{T:penis}`,
  },
  {
    id: "passive-fucked",
    cat: "anal",
    act: "anal sex",
    subj: "b",
    weight: 0.8,
    needsCtx: true,
    src: `\\b{B}\\s+{aux}(?:was|were|is|got|gets|get|getting|being|been|be)\\s+(?:(?:so|thoroughly|properly|well|roughly|finally|hard|fully|truly|good|completely|absolutely)\\s+)*(?:fucked|railed|pounded|bred|knotted|pegged|penetrated|screwed|impaled|breached|topped|plowed|ploughed|filled|stretched)\\b(?!\\s+(?:up|over|to the brim)\\b)(?!\\s+(?:up\\s+)?with\\s+(?!(?:[\\w-]+\\s+){0,2}(?:cock|dick|come|cum|seed|knot|fingers?|him|it|lube|length|toy|dildo|plug)\\b))(?:\\s+(?:\\w+\\s+){0,4}?by\\s+{T:penis})?`,
  },
  {
    id: "bottomed-for",
    cat: "anal",
    act: "anal sex",
    subj: "b",
    weight: 0.8,
    src: `\\b{B}\\s+{aux}bottom(?:s|ed|ing)?\\b(?!\\s+(?:out|of|up|off|half|lip|drawer|step|line|shelf|teeth|tooth|row|left|right|corner|floor|button|bunk|edge|layer|end|part|side|door|rung|stair|stairs|sheet|dollar|price|feeder)\\b)(?:\\s+for\\s+{T})?`,
  },
  {
    id: "topped",
    cat: "anal",
    act: "anal sex",
    subj: "t",
    weight: 0.8,
    src: `\\b{T}\\s+{aux}top(?:s|ped|ping)?\\b(?!\\s+(?:up|off|of|with|the|it|that|this|out|his|her|their|my|your|a|an|to|and)\\b|\\s*-)(?:\\s+{B})?`,
  },

  // ───────────── ANAL: fingering ─────────────
  {
    id: "fingered",
    cat: "anal",
    act: "fingering",
    subj: "t",
    weight: 1,
    src: `\\b{T}\\s+{aux}(?:finger(?:s|ed|ing)?|finger-?fuck(?:s|ed|ing)?|finger fuck(?:s|ed|ing)?|finger-?bang(?:s|ed|ing)?)\\s+{B:ass}`,
  },
  {
    id: "fingers-into",
    cat: "anal",
    act: "fingering",
    subj: "t",
    weight: 1,
    src: `\\b{T}\\s+{aux}(?:push|slid|slide|slip|eas|press|work|crook|curl|sink|sank|thrust|add|scissor|twist|insert|wiggl|drove|guid|teas|circl|rub)\\w*\\s+(?:(?:a|one|two|three|four|another|the|{x's}|first|second|third|slick|lubed|wet|long|thick|blunt)\\s+){0,3}${FINGERS}\\s+(?:(?:back|deep(?:er)?|slowly|all the way|further|carefully|gently|in|up|down)\\s+)*(?:in(?:to|side)?|past|through|around|against|over|at)\\s+{B:ass}`,
  },
  {
    id: "fingers-inside",
    cat: "anal",
    act: "fingering",
    subj: "t",
    weight: 0.9,
    needsCtx: true,
    src: `\\b{T:poss}\\s+(?:[\\w-]+\\s+){0,2}?${FINGERS}\\s+(?:\\w+\\s+){0,3}?(?:in|into|inside|past|stretching|opening|scissoring|crooked inside|curled inside|pressed into|working|circling|teasing|rubbing)\\s+{B:ass}`,
  },
  {
    id: "stretched-open",
    cat: "anal",
    act: "fingering",
    subj: "t",
    weight: 0.6,
    needsCtx: true,
    src: `\\b{T}\\s+{aux}(?:stretch(?:es|ed|ing)?|open(?:s|ed|ing)?|loosen(?:s|ed|ing)?|work(?:s|ed|ing)?|prep(?:s|ped|ping)?|prepar(?:e|es|ed|ing))\\s+{B:ass}\\s+(?:open|wide|out|up|apart|for)\\b`,
  },
  {
    id: "prostate",
    cat: "anal",
    act: "anal sex",
    subj: "t",
    weight: 0.7,
    src: `\\b{T}\\s+{aux}(?:(?:\\w+ly|just|finally|then|again|still|always|easily|managed to|tried to|trying to|kept)\\s+){0,2}?(?:hit|found|find|brush|nail|graz|nudg|strok|rubb|press|massag|jab|crook|curl|tap|circl|pound|slam|drag|angl|milk|abus|batter|pummel|torment|hammer|drill|aim|target|work|teas|grind|ground|knead|prod|bump|spear|stab|assault|punish|zero(?:ed|es|ing)? in)\\w*\\s+(?:(?:against|over|right|at|on|up against|into|for|in on|across|along|directly|unerringly|relentlessly|mercilessly)\\s+)*{B:poss}\\s+(?:(?:${ASS_ADJ}|swollen|sensitive|abused|oversensitive)\\s+)?prostate`,
  },

  // ───────────── ORAL: blowjobs (top = the one getting sucked) ─────────────
  {
    id: "sucked",
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 1,
    femaleTarget: "drop",
    src: `\\b{B}\\s+{aux}(?:suck(?:s|ed|ing)?|slurp(?:s|ed|ing)?(?=\\s+(?:on|at)\\b)|nurs(?:e|es|ed|ing)(?=\\s+(?:on|at)\\b)|suckl(?:e|es|ed|ing)(?=\\s+(?:on|at)\\b)|blow|blows|blew|blowing|deep-?throat(?:s|ed|ing)?|swallow(?:s|ed|ing)?\\s+(?:down|around)|gag(?:s|ged|ging)?\\s+on|chok(?:e|es|ed|ing)\\s+on|bob(?:s|bed|bing)?\\s+(?:\\w+\\s+){0,2}?on|worship(?:s|ped|ping)?)\\s+(?:\\w+ly\\s+)?(?:on\\s+|at\\s+)?(?:the\\s+(?:[\\w-]+\\s+)?(?:head|tip|crown|base|shaft|length|underside)\\s+of\\s+)?{T:penis}(?!\\s+(?:a kiss|kisses|away|out of the water|off (?:to|for|as)|in(?:to)? (?:his|her|their) arms)\\b)`,
  },
  {
    id: "licked-cock",
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.9,
    src: `\\b{B}\\s+{aux}(?:(?:lick|tongu|mouth|kiss|nuzzl|lap|nos|flick|suckl|nibbl|lav)\\w*\\s+(?:(?:his|her|their|my|your)\\s+(?:tongue|lips|mouth)\\s+)?|(?:trac|swirl|ran|run|drag)\\w*\\s+(?:his|her|their|my|your)\\s+(?:tongue|lips|mouth)\\s+)(?:(?:up|along|over|at|around|down|on|across|against|the (?:tip|head|underside|length|slit|base|vein) of|from (?:the )?base to tip|from root to tip|a\\s+(?:\\w+\\s+){0,2}?(?:stripe|line|path|trail)\\s+(?:up|along|down))\\s+)*{T:penisReq}`,
  },
  {
    id: "took-in-mouth",
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 1,
    src: `\\b{B}\\s+{aux}(?:took|take|takes|taking|swallow(?:s|ed|ing)?|fit(?:s|ted|ting)?|guid(?:e|es|ed|ing)|draw(?:s|ing)?|drew|pull(?:s|ed|ing)?|let|suck(?:s|ed|ing)?|welcom(?:e|es|ed|ing))\\s+{T:penis}\\s+(?:(?:\\w+)\\s+){0,3}?(?:in(?:to)?|down|between|past|to the back of|deep(?:er)? into)\\s+(?:{x's}\\s+)?(?:mouth|throat|lips)`,
  },
  {
    id: "swallowed-down",
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 1,
    src: `\\b{B}\\s+{aux}(?:swallow(?:s|ed|ing)?|suck(?:s|ed|ing)?|gulp(?:s|ed|ing)?)\\s+{T:penis}\\s+(?:(?:all the way|right|deep|whole)\\s+)*(?:down|whole|deep|to the root|to the base)\\b`,
  },
  {
    // "Stiles bounced in Derek's lap, taking every inch"
    id: "bounce-in-lap",
    cat: "anal",
    act: "anal sex (riding)",
    subj: "b",
    weight: 0.7,
    needsCtx: true,
    needs: /\b(?:inch|inches|cock|dick|inside|deep|fuck\w*|knot|stretch\w*|full)\b/i,
    src: `\\b{B}\\s+{aux}(?:bounc(?:e|es|ed|ing)|rock(?:s|ed|ing)?|grind(?:s|ing)?|ground)\\s+(?:in|on)\\s+{T:poss}\\s+lap\\b`,
  },
  {
    // "Stiles took Derek to the hilt" (riding); "down to the root" or with a mouth in sight is oral (took-down-root).
    id: "took-to-hilt",
    cat: "anal",
    act: "anal sex (riding)",
    subj: "b",
    weight: 0.7,
    needsCtx: true,
    // "The Englishman hummed around him, taking him all the way to the root" is a blowjob (took-to-root).
    needs: ORAL_FREE,
    src: `\\b{B}\\s+{aux}(?:took|take|takes|taking)\\s+(?:{T}|{T:penisReq}|him|it)\\s+(?:all the way\\s+)?(?:in\\s+)?(?:to the hilt|to the base|to the root|balls[- ]deep)\\b`,
  },
  {
    // "Stiles took him deep, rocking in his lap": "deep" alone could be a blowjob, so the sentence must say
    // it's anal and mustn't mention a mouth.
    id: "took-deep",
    cat: "anal",
    act: "anal sex (riding)",
    subj: "b",
    weight: 0.6,
    needsCtx: true,
    needs: new RegExp(`^(?=${ORAL_FREE.source}).*\\b(?:ass|arse|hole|rim|lap|hips|thighs|rode|rid(?:e|es|ing)|sank|sink\\w*|stretch\\w*|inside|clench\\w*|prostate)\\b`, "i"),
    src: `\\b{B}\\s+{aux}(?:took|take|takes|taking)\\s+(?:{T}|{T:penisReq}|him|it)\\s+(?:deep(?:er)?|all the way(?:\\s+in)?|every inch|inch by inch)\\b`,
  },
  {
    id: "took-down-root",
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.7,
    needsCtx: true,
    src: `\\b{B}\\s+{aux}(?:took|take|takes|taking|swallow(?:s|ed|ing)?)\\s+(?:{T}|{T:penisReq}|him|it)\\s+(?:all the way\\s+)?down\\s+to\\s+the\\s+(?:root|base|hilt)\\b`,
  },
  {
    // "hummed around him, taking him all the way to the root"
    id: "took-to-root",
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.8,
    needsCtx: true,
    needs: ORAL_NEAR,
    src: `\\b{B}\\s+{aux}(?:took|take|takes|taking|swallow(?:s|ed|ing)?)\\s+(?:{T}|{T:penisReq}|him|it)\\s+(?:all the way\\s+)?(?:in\\s+)?(?:to the hilt|to the base|to the root|balls[- ]deep|deep(?:er)?|all the way)\\b`,
  },
  {
    id: "took-down",
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.6,
    src: `\\b{B}\\s+{aux}(?:took|take|takes|taking|swallow(?:s|ed|ing)?)\\s+{T:penisReq}\\s+(?:(?:all the way|deep(?:er)?|further|whole|to the root|to the base|to the hilt)\\s+)*down\\b(?!\\s+(?:on|onto)\\b)`,
  },
  {
    id: "went-down-on",
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 1,
    femaleTarget: "flip",
    src: `\\b{B}\\s+{aux}(?:went|go|goes|going|gone|get|got|getting|slid|slide|slides|sliding|kneel|knelt|dropped|drop|drops|dropping|moved|move|moves|moving|kiss(?:ed|es|ing)? (?:his|her|their|my|your) way)\\s+down\\s+(?:on|to)\\s+{T}\\b(?!\\s+(?:one|both|the|a|his|her)\\b)`,
  },
  {
    id: "gave-head",
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 1,
    femaleTarget: "flip",
    src: `\\b{B}\\s+{aux}(?:gave|give|gives|giving|given)\\s+{T}\\s+(?:a\\s+|the\\s+|some\\s+)?(?:\\w+\\s+){0,2}?(?:blow ?jobs?|head|bj|blowie|hummer)\\b`,
  },
  {
    id: "penis-in-mouth",
    cat: "oral",
    act: "blowjob",
    subj: "t",
    weight: 1,
    src: `\\b{T:penisReq}\\s+{aux}(?:\\w+\\s+){0,2}?(?:slid|slide|slip|push|sank|sink|press|drove|drive|fill|stretch|bump|hit|nudg|pound|thrust|disappear|vanish|rest|sat|sit|throb|twitch|puls|leak|drag|rub|brush|fuck|was|is|felt|feel|lay|lie|hit)\\w*\\s+${DEPTH}(?:in(?:to|side)?\\s+|between\\s+|past\\s+|down\\s+|against\\s+|on\\s+|over\\s+|(?:at |to |against )?the back of\\s+|across\\s+)?{B:mouthReq}`,
  },
  {
    id: "cock-to-lips",
    cat: "oral",
    act: "blowjob",
    subj: "t",
    weight: 0.8,
    needsPenis: true,
    src: `\\b{T}\\s+{aux}(?:guid|press|rub|push|nudg|bring|brought|offer|tap|slid|slide|drag|paint|smear|feed|fed|ease|eas|aim|point)\\w*\\s+(?:the\\s+(?:\\w+\\s+){0,2}?(?:head|tip)(?:\\s+of\\s+{x's}\\s+{PENIS})?|{x's}\\s+{PENIS}|it)\\s+(?:\\w+\\s+){0,2}?(?:to|against|across|over|between|along|past|into|at)\\s+{B:mouthReq}`,
  },
  {
    // "…until the head of his cock rests against my bottom lip"
    id: "cock-at-lips",
    cat: "oral",
    act: "blowjob",
    subj: "t",
    weight: 0.7,
    src: `\\b(?:the\\s+(?:\\w+\\s+)?(?:head|tip)\\s+of\\s+)?{T:penisReq}\\s+(?:\\w+\\s+)?(?:rest|brush|press|nudg|bump|tap|prod|poke|slid|slip|push)\\w*\\s+(?:\\w+\\s+){0,2}?(?:against|at|on|across|between|past|into|over)\\s+{B:mouthReq}`,
  },
  {
    // "Peter pulls his mouth off my dick": he'd been sucking it.
    id: "mouth-off",
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.9,
    src: `\\b{B}\\s+{aux}(?:pull|pop|slid|slide|draw|drew|lift|eas|ease|come|came|tear|tore|wrench)\\w*\\s+(?:(?:his|her|their|my|your)\\s+(?:mouth|lips)\\s+off\\s+(?:of\\s+)?{T:penis}|off\\s+(?:of\\s+)?{T:penisReq})`,
  },
  {
    // "Alex opens for him, giving him a soft, slow suck"
    id: "give-a-suck",
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.8,
    needsPenis: true,
    src: `\\b{B}\\s+{aux}(?:giv|gave)\\w*\\s+{T}\\s+(?:a|another|one)\\s+(?:[\\w-]+,?\\s+){0,3}?(?:suck|blowjob|blow job|lick)\\b`,
  },
  {
    // "taking in the head", "took down the rest of him"
    id: "take-in-head",
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.7,
    needsPenis: true,
    needs: /\b(?:mouth|lips|tongue|throat|suck\w*|swallow\w*)\b/i,
    src: `\\b{B}\\s+{aux}(?:tak|took|suck|draw|drew)\\w*\\s+(?:in|down)\\s+(?:the\\s+(?:\\w+\\s+)?(?:head|tip|crown|length|rest of (?:him|it))|{T:penisReq})\\b`,
  },
  {
    // "he comes between those soft lips", "spilled across Alex's tongue"
    id: "come-in-mouth",
    cat: "oral",
    act: "blowjob",
    subj: "t",
    weight: 0.8,
    src: `\\b{T}\\s+{aux}(?:come|came|comes|coming|cum(?:s|med|ming)?|spill\\w*|empt\\w*|shoot\\w*|shot)\\s+(?:\\w+\\s+){0,2}?(?:between|on|across|into|down|in|over)\\s+(?:{B:poss}|those|the)\\s+(?:(?:${MOUTH_ADJ})\\s+){0,2}(?:lips|tongue|mouth|throat)`,
  },
  {
    // "Alex takes the head between his lips", "took him into his mouth"
    id: "takes-between-lips",
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.9,
    needsPenis: true,
    src: `\\b{B}\\s+{aux}(?:take|took|taking|draw|drew|pull|suck|guid|eas|let|sucked)\\w*\\s+(?:the\\s+(?:\\w+\\s+)?(?:head|tip)(?:\\s+of\\s+{T:penisReq})?|{T:penisReq}|it|him|her|them)\\s+(?:\\w+\\s+){0,2}?(?:between|into|past|in)\\s+(?:his|her|their|my|your)\\s+(?:(?:${MOUTH_ADJ})\\s+)?(?:lips|mouth)\\b`,
  },
  {
    // "Alex parts his lips, and wraps them around his girth"
    id: "wraps-them-around",
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.9,
    needs: /\b(?:lips|mouth)\b/i,
    src: `\\b{B}\\s+{aux}(?:part|open)\\w*\\s+(?:his|her|their|my|your)\\s+(?:\\w+\\s+)?(?:lips|mouth)\\s*,?\\s+(?:and\\s+)?(?:\\w+\\s+)?(?:wrap|close|seal|slid|slide|slip|sink|sank|stretch|fit)\\w*\\s+(?:them|it)\\s+(?:around|over|down on|onto)\\s+{T:penisReq}`,
  },
  {
    id: "lips-around",
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 1,
    src: `\\b{B:poss}\\s+(?:(?:${MOUTH_ADJ})\\s+){0,2}(?:lips|mouth|throat|tongue)\\s+(?:\\w+\\s+){0,3}?(?:around|over|on|onto|along|down|against|engulf\\w*|envelop\\w*|swallow\\w*|closed around|sealed around|stretched around|wrapped around|tightened around|sank down on|slid down)\\s+{T:penisReq}`,
  },
  {
    id: "lips-around-him",
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.6,
    needsPenis: true,
    src: `\\b{B:poss}\\s+(?:lips|mouth|throat)\\s+(?:\\w+\\s+){0,3}?(?:around|engulf\\w*|swallow\\w*|closed around|sealed around|stretched around|wrapped around|down on|sank down on|slid down)\\s+{T}\\b`,
  },
  {
    id: "fucked-mouth",
    cat: "oral",
    act: "face-fucking",
    subj: "t",
    weight: 1,
    // Only "fuck" can take the mouth as a direct object; the other verbs need "into/past/down…", so kisses
    // ("slid his mouth to Aerion's", "snapped his mouth shut", "slammed their mouths together") don't count.
    src: `\\b{T}\\s+{aux}(?:fuck(?:s|ed|ing)?\\s+(?:(?:${SELF}|{x's}\\s+{PENIS}|{x's}\\s+hips)\\s+)?${DEPTH}(?:(?:in(?:to|side)?|between|past|down)\\s+)?|(?:thrust(?:s|ing)?|push(?:es|ed|ing)?|rock(?:s|ed|ing)?|snap(?:s|ped|ping)?|pump(?:s|ed|ing)?|slid|slide|slides|sliding|drove|drive|drives|driving|slam(?:s|med|ming)?)\\s+(?:(?:${SELF}|{x's}\\s+{PENIS}|{x's}\\s+hips)\\s+)?${DEPTH}(?:in(?:to|side)?|between|past|down)\\s+){B:faceReq}(?!\\s+with\\s+(?:his|her|their|my|your)\\s+(?:tongue|fingers?|thumb))`,
  },
  {
    id: "face-fucked",
    cat: "oral",
    act: "face-fucking",
    subj: "t",
    weight: 1,
    src: `\\b{T}\\s+{aux}(?:face|throat|skull|mouth)-?fuck(?:s|ed|ing)?\\s+{B}`,
  },
  {
    id: "came-in-mouth",
    cat: "oral",
    act: "blowjob",
    subj: "t",
    weight: 1,
    src: `\\b{T}\\s+{aux}(?:came|comes|come|coming|cum(?:s|med|ming)?|spill(?:s|ed|ing)?|finish(?:es|ed|ing)?|shot|emptied|unload(?:s|ed|ing)?)\\s+(?:(?:hard|deep|right|again|all over)\\s+)*(?:in(?:to)?|down|on|over)\\s+{B:mouthReq}`,
  },
  {
    id: "passive-sucked",
    cat: "oral",
    act: "blowjob",
    subj: "t",
    weight: 0.8,
    femaleTarget: "drop",
    src: `\\b{T}\\s+{aux}(?:was|were|is|got|gets|get|getting|being|been|be)\\s+(?:(?:\\w+ly|so|thoroughly|properly)\\s+)*(?:sucked(?:\\s+off)?|blown|deep-?throated)\\b(?!\\s+(?:in|into|away|under|back)\\b)(?:\\s+(?:\\w+\\s+){0,3}?by\\s+{B})?`,
  },
  {
    id: "fed-cock",
    cat: "oral",
    act: "blowjob",
    subj: "t",
    weight: 0.9,
    src: `\\b{T}\\s+{aux}(?:fed|feeds|feed|feeding|guid(?:e|es|ed|ing)|push(?:es|ed|ing)?|press(?:es|ed|ing)?|slid|slide|slides|sliding)\\s+(?:{x's}\\s+{PENIS}|${SELF})\\s+(?:(?:\\w+)\\s+){0,2}?(?:in(?:to)?|between|past|to|against)\\s+{B:mouthReq}`,
  },
  {
    id: "fed-him",
    cat: "oral",
    act: "blowjob",
    subj: "t",
    weight: 0.9,
    src: `\\b{T}\\s+{aux}(?:fed|feeds|feed|feeding)\\s+{B}\\s+{x's}\\s+{PENIS}`,
  },

  {
    // "Stiles had Derek's cock in his mouth", "with Derek's cock between his lips"
    id: "had-cock-in-mouth",
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.9,
    src: `\\b{B}\\s+{aux}(?:had|has|have|having|held|holds|hold|kept|keeps|keep)\\s+{T:penisReq}\\s+(?:\\w+\\s+){0,2}?(?:in|between|past|down|inside)\\s+(?:his|her|their|my|your)\\s+(?:mouth|lips|throat)\\b`,
  },
  {
    // "Stiles tongued at Derek's slit", "licked at the slit of Derek's cock"
    id: "licked-slit",
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.9,
    src: `\\b{B}\\s+{aux}(?:lick|tongu|lap|flick|prob|dip|kiss|suck|mouth|nuzzl)\\w*\\s+(?:(?:his|her|their)\\s+tongue\\s+)?(?:(?:at|over|across|into|against|along|around|up)\\s+)?(?:{T:poss}\\s+(?:slit|frenulum|balls|sac|foreskin)|the\\s+(?:slit|frenulum)\\s+(?:of|on)\\s+{T:penisReq})\\b`,
  },

  {
    // "wrapped his mouth around him and went as low as he could", "closed his lips around Steve"
    id: "mouth-around-him",
    dedupe: true,
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.9,
    needsCtx: true,
    src: `\\b{B}\\s+{aux}(?:wrap|clos|seal|fasten|latch)\\w*\\s+(?:his|her|their|my|your)\\s+(?:mouth|lips)\\s+(?:around|over|on|onto)\\s+(?:{T:penis}|{T}\\b(?!['’]s))`,
  },
  {
    // "bobbed his head a few times", "bobbing his head up and down"
    id: "bobbed-head",
    dedupe: true,
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.7,
    needsCtx: true,
    src: `\\b{B}\\s+{aux}bob(?:s|bed|bing)?\\s+(?:his|her|their|my|your)\\s+head(?=\\s+(?:up and down|a few times|a couple (?:of )?times|slowly|faster|harder|lower|down|back and forth|again|once more|over|on|along|between)\\b|\\s*[,.;!]|\\s*$)`,
  },
  {
    // "took more into his mouth", "took half of him into her mouth"
    id: "took-more-in-mouth",
    dedupe: true,
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.9,
    needsCtx: true,
    src: `\\b{B}\\s+{aux}(?:took|take|takes|taking)\\s+(?:more|most|all|half|the rest|as much|another inch|a little more|a bit more)(?:\\s+of\\s+(?:him|it|{T}))?\\s+(?:in(?:to)?|down)\\s+(?:his|her|their|my|your)\\s+(?:mouth|throat)`,
  },
  {
    // "pressed his tongue against Steve's underwear", "mouthed at the bulge in Steve's jeans"
    id: "mouth-on-clothed",
    dedupe: true,
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.8,
    needsCtx: true,
    src: `\\b{B}\\s+{aux}(?:(?:press|drag|run|ran|rub|slid|slide|trac|swip)\\w*\\s+(?:his|her|their|my|your)\\s+(?:tongue|lips|mouth|face|nose)\\s+(?:\\w+\\s+)?(?:against|along|over|across|on|into)|(?:mouth|nuzzl|lick|kiss|suck|mouth)\\w*\\s+(?:at|along|over|against|on))\\s+(?:the\\s+(?:\\w+\\s+)?(?:bulge|outline|erection|hardness|tent|front|fly)\\s+(?:in|of|under|beneath|through)\\s+)?{T:poss}\\s+(?:\\w+\\s+)?(?:underwear|boxers|briefs|jeans|pants|trousers|shorts|sweatpants|cotton|fly|zipper|crotch)\\b`,
  },
  {
    // "rolled his tongue around the head of Steve's cock", "swirled his tongue around the tip"
    id: "tongue-around-head",
    dedupe: true,
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.9,
    needsCtx: true,
    src: `\\b{B}\\s+{aux}(?:roll|swirl|circl|flick|trac|run|ran|slid|slip|work|press|drag|lap)\\w*\\s+(?:his|her|their|my|your)\\s+tongue\\s+(?:\\w+\\s+)?(?:around|over|across|along|against|on|up|down)\\s+(?:the\\s+(?:\\w+\\s+)?(?:head|tip|crown|slit|underside|shaft|length|base)(?:\\s+of\\s+{T:penis})?|{T:penisReq})`,
  },
  {
    // "licked a long stripe up the shaft", "licked the tip", "licked his way from the base to the tip of Steve's cock"
    id: "licked-shaft",
    dedupe: true,
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.8,
    needsCtx: true,
    src: `\\b{B}\\s+{aux}(?:(?:lick|tongu|lap)\\w*\\s+(?:(?:a\\s+(?:\\w+\\s+)?(?:stripe|line|trail)|(?:his|her|their)\\s+way)\\s+)?(?:(?:up|down|along|over|across)\\s+)*(?:the\\s+(?:\\w+\\s+)?(?:tip|head|shaft|length|underside|slit|crown)\\b|(?:from\\s+the\\s+(?:base|bottom|root)\\s+)?to\\s+the\\s+(?:tip|top)\\b)|(?:kiss|nuzzl|suck|mouth)\\w*\\s+(?:at\\s+|along\\s+|on\\s+)?(?:the\\s+(?:\\w+\\s+)?(?:tip|head|base|shaft|length|crown)\\s+of\\s+{T:penis}|{T:penisReq}))`,
  },
  {
    // "pressed an open-mouthed kiss to the head of Steve's cock"
    id: "kiss-to-head",
    dedupe: true,
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.9,
    src: `\\b{B}\\s+{aux}(?:press|plant|plac|drop|lay|laid)\\w*\\s+(?:a|an|one|another)\\s+(?:[\\w-]+\\s+){0,2}?kiss(?:es)?\\s+(?:to|on|against|onto)\\s+(?:the\\s+(?:\\w+\\s+)?(?:head|tip|base|shaft|length|crown|slit)\\s+of\\s+)?{T:penisReq}`,
  },
  {
    // "opened his mouth and began to suck lazily on the head", "started sucking on the tip of Laurent's cock"
    id: "began-to-suck",
    dedupe: true,
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.9,
    needsCtx: true,
    src: `\\b{B}\\s+{aux}(?:(?:began|begin|begins|started|starts|start|proceeded|proceeds)\\s+(?:to\\s+)?)(?:suck|lick|lap|mouth|nurs|kiss)\\w*(?:\\s+(?:\\w+ly\\s+)?(?:(?:on|at)\\s+)?(?:the\\s+(?:\\w+\\s+)?(?:head|tip|crown|shaft|length)(?:\\s+of\\s+{T:penis})?|{T:penisReq})|(?=\\s*(?:[,.;!]|$|\\s+and\\b)))`,
  },
  {
    // "Damen groaned around Laurent", "hummed around his length", "moaned around him"
    id: "groaned-around",
    dedupe: true,
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.8,
    needsCtx: true,
    src: `\\b{B}\\s+{aux}(?:groan|moan|hum|mumbl|murmur|whimper|growl|purr|chuckl|laugh)\\w*\\s+around\\s+(?:{T:penis}|{T}\\b(?!['’]s))`,
  },
  {
    // "dropped his head down almost fully", "lowered his head all the way", "pushed his head down deeper"
    id: "head-down-fully",
    dedupe: true,
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.7,
    needsCtx: true,
    src: `\\b{B}\\s+{aux}(?:dropp?|lower|sank|sink|push|press|bob|duck)\\w*\\s+(?:his|her|their|my|your)\\s+head\\s+(?:down\\s+)?(?:almost\\s+|nearly\\s+)?(?:fully|all the way|deeper)\\b(?!\\s+(?:back|up|to|against|onto|into|on|and (?:laughed|sighed|groaned|closed)|then (?:laughed|sighed|looked))\\b)`,
  },
  {
    // "Korra suddenly looked up from her spot between her legs", "lifted his head from between Laurent's thighs"
    id: "looked-up-from-between",
    dedupe: true,
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.7,
    femaleTarget: "flip",
        src: `\\b{B}\\s+{aux}(?:\\w+ly\\s+)?(?:look|glanc|peek|pull|lift|rais|came|come|surfac|emerg)\\w*\\s+(?:up\\s+)?(?:her|his|their)?\\s*(?:head\\s+)?(?:up\\s+)?from\\s+(?:(?:her|his|their)\\s+(?:spot\\s+)?)?between\\s+{T:poss}\\s+(?:legs|thighs)\\b`,
  },
  {
    // "settled between Robin's thighs and licked her slowly", "knelt between his legs, mouthing at him"
    id: "between-thighs-licked",
    dedupe: true,
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.8,
    femaleTarget: "flip",
    needsCtx: true,
    src: `\\b{B}\\s+{aux}(?:settl\\w*|knelt|kneel\\w*|lay|laid|moved|slid|slipped|got|crawled|dropped|positioned\\s+\\w+self)\\s+(?:\\w+\\s+){0,2}?between\\s+{T:poss}\\s+(?:thighs?|legs)\\b[^.!?]{0,40}?\\b(?:lick|lap|suck|tongu|nuzzl|devour|feast)\\w*`,
  },
  {
    // "Nancy and Robin scissored until they both came"
    id: "scissoring-pair",
    cat: "vaginal",
    act: "scissoring",
    subj: "t",
    weight: 0.9,
    needsCtx: true,
    src: `\\b{T}\\s+and\\s+{B}\\s+{aux}(?:scissor(?:s|ed|ing)?\\b(?!\\s+(?:(?:his|her|their|my|your|the|two|three|them)\\s+)?(?:fingers?|digits?|apart|open|them|his|her))|tribad\\w*)`,
  },
  {
    // "lowered his head between Laurent's thighs", "settled between his legs and lowered his mouth"
    id: "head-between-thighs",
    dedupe: true,
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.6,
    femaleTarget: "flip",
    needsCtx: true,
    src: `\\b{B}\\s+{aux}(?:lower|dip|dropp?|bent|bend|duck|settl|sank|sink)\\w*\\s+(?:his|her|their|my|your)\\s+(?:head|mouth|face|lips)\\s+(?:down\\s+)?(?:between|to|towards?)\\s+{T:poss}\\s+(?:thighs|legs|hips|lap|groin|crotch)\\b`,
  },
  {
    // "slowly leaned his head forward and took Eddie as deep as he could", "lowered his head and swallowed him"
    id: "head-down-took",
    dedupe: true,
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.9,
    needsCtx: true,
    src: `\\b{B}\\s+{aux}(?:\\w+ly\\s+)?(?:lean|lower|bend|dip|duck|dropp?)\\w*\\s+(?:his|her|their|my|your)\\s+head\\s+(?:forward\\s+|down\\s+)?(?:and\\s+)?(?:took|take|swallow|suck|sank|sink)\\w*\\s+(?:{T}|{T:penis}|him)\\b(?!['’]s\\s+(?:hand|face|arm|shoulder|lap|neck|hair|mouth|lips))`,
  },
  {
    // "Damianos still let Laurent bounce on it", "had Laurent ride him", "let Cas sink down on his cock"
    id: "let-bounce-on-it",
    cat: "anal",
    act: "anal sex (riding)",
    subj: "t",
    weight: 0.8,
    needsCtx: true,
    src: `\\b{T}\\s+{aux}(?:let|lets|letting|had|has|having|made|makes|making|watched|watching)\\s+{B}\\s+(?:bounc|ride|rid|rock|grind|sink|sit|sat|lower|impal|work)\\w*\\s+(?:\\w+\\s+)?(?:on|onto|down on|upon)\\s+(?:it|him|his\\s+(?:cock|dick|lap|length)|{T:penisReq})\\b`,
  },
  {
    // "Peter held his legs open and bobbed slowly", "bobbing up and down"
    id: "bobs-slowly",
    dedupe: true,
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.7,
    needsCtx: true,
    src: `\\b{B}\\s+{aux}bob(?:s|bed|bing)\\s+(?:slowly|lazily|faster|harder|steadily|eagerly|up and down|back and forth)\\b(?!\\s+(?:in|on|along|across|over|with|to)\\s+(?:the|a)\\b)`,
  },
  {
    // "Stiles tried to suck harder", "sucking harder", "swallowed eagerly"
    id: "sucked-harder",
    dedupe: true,
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.6,
    needsCtx: true,
    needs: /\b(?:mouth|lips|tongue|throat|cock|dick|length|hips|thrust\w*|knees|pre-?come|precum|gag\w*|swallow\w*)\b/i,
    src: `\\b{B}\\s+{aux}(?:suck|swallow|hollow)\\w*\\s+(?:(?:his|her|their)\\s+cheeks\\s+)?(?:harder|deeper|faster|lazily|slowly|greedily|eagerly|hungrily|obediently|desperately)\\b`,
  },
  {
    // "The first time Peter worked him open and pushed inside", "worked Stiles open with two fingers, then slid inside him"
    id: "worked-open-pushed-in",
    cat: "anal",
    act: "anal sex",
    subj: "t",
    weight: 0.9,
    src: `\\b{T}\\s+{aux}(?:work|open|stretch|prep|loosen)\\w*\\s+{B}\\s+(?:open\\s+|up\\s+)?(?:with\\s+[^,.;]{0,30}?)?(?:,\\s*)?(?:and\\s+)?(?:then\\s+)?(?:push|slid|slip|sink|eas|press|sheath|slide)\\w*\\s+(?:in|inside|into)\\b`,
  },
  {
    // "Eddie's mouth closed around the head", "his lips slid down Steve's cock"
    id: "mouth-closed-around",
    dedupe: true,
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.9,
    src: `\\b{B:poss}\\s+(?:mouth|lips)\\s+(?:closed|wrapped|sealed|slid|slipped|sank|settled|slid)\\s+(?:around|over|down|onto)\\s+(?:the\\s+(?:head|tip|crown)|{T:penis})`,
  },

  // ───────────── ORAL: rimming (top = the one eating ass) ─────────────
  {
    id: "rimmed",
    cat: "oral",
    act: "rimming",
    subj: "t",
    weight: 1,
    src: `\\b{T}\\s+{aux}(?:rim(?:s|med|ming)?|tongue-?fuck(?:s|ed|ing)?|tongue fuck(?:s|ed|ing)?)\\s+{B:rimOrObj}`,
  },
  {
    id: "ate-out",
    cat: "oral",
    act: "rimming",
    subj: "t",
    weight: 1,
    src: `\\b{T}\\s+{aux}(?:ate|eat|eats|eating|eaten)\\s+(?:{B}\\s+out\\b|out\\s+{B:poss}\\s+(?:\\w+\\s+)?(?:ass|arse|hole|butt|bum)\\b)`,
  },
  {
    id: "ate-ass",
    cat: "oral",
    act: "rimming",
    subj: "t",
    weight: 1,
    src: `\\b{T}\\s+{aux}(?:ate|eat|eats|eating|eaten|devour(?:s|ed|ing)?|feast(?:s|ed|ing)? on)\\s+{B:rimReq}`,
  },
  {
    id: "licked-hole",
    cat: "oral",
    act: "rimming",
    subj: "t",
    weight: 1,
    src: `\\b{T}\\s+{aux}(?:(?:lick|tongu|lap|kiss|suck|nuzzl|mouth|nibbl|lav|flick|swirl)\\w*\\s+(?:(?:his|her|their|my|your)\\s+tongue\\s+)?(?:\\w+ly\\s+)?|(?:drag|ran|run|trac|slid|slide|slip|press|push|work|dip|delv|point|thrust|stab|flatten)\\w*\\s+(?:(?:his|her|their|my|your)\\s+)?(?:\\w+\\s+)?tongue\\s+)(?:(?:into|at|over|across|around|along|against|inside|in|up|down|on|between|past|the rim of|the length of|a\\s+(?:\\w+\\s+){0,2}?(?:stripe|line|path|trail)\\s+(?:with\\s+(?:his|her|their|my|your)\\s+tongue\\s+)?(?:up|along|down|over|across))\\s+)*{B:rimReq}`,
  },
  {
    id: "licked-into",
    cat: "oral",
    act: "rimming",
    subj: "t",
    weight: 0.8,
    needsCtx: true,
    src: `\\b{T}\\s+{aux}(?:lick|lap|tongu)\\w*\\s+(?:(?:deep(?:er)?|slowly|right|back|further)\\s+)*(?:in(?:to|side)?|past)\\s+{B:ass}`,
  },
  {
    id: "tongue-into",
    cat: "oral",
    act: "rimming",
    subj: "t",
    weight: 0.9,
    src: `\\b{T}\\s+{aux}(?:push|press|work|fuck|thrust|delv|wriggl|slid|slip|dip|curl|eas|spear|drove|plung|sank|sink|circl|teas|flick|swirl|run|ran|drag|lap|prob)\\w*\\s+(?:his|her|their|my|your)\\s+tongue\\s+(?:\\w+\\s+){0,2}?(?:in(?:to|side)?|past|against|over|across|at|around|along)\\s+{B:ass}`,
  },
  {
    id: "tongue-in-hole",
    cat: "oral",
    act: "rimming",
    subj: "t",
    weight: 1,
    src: `\\b{T:poss}\\s+(?:tongue|mouth|lips|face)\\s+(?:\\w+\\s+){0,3}?(?:in|into|inside|against|on|at|over|between|across|buried in|pressed to|around)\\s+{B:rimReq}`,
  },
  {
    id: "tongue-verbs-hole",
    cat: "oral",
    act: "rimming",
    subj: "t",
    weight: 1,
    src: `\\b{T:poss}\\s+(?:tongue|mouth|lips)\\s+(?:\\w+\\s+)?(?:circl|lick|lap|flick|trac|swirl|teas|prob|press|push|work|slid|slip|delv|fuck|breach|penetrat|open|wet|lav|found|find|explor|dip)\\w*\\s+(?:(?:at|over|around|into|against|across|along|inside|past)\\s+)*{B:rimReq}`,
  },
  {
    id: "tongue-in-him",
    cat: "oral",
    act: "rimming",
    subj: "t",
    weight: 0.7,
    needsCtx: true,
    src: `\\b{T:poss}\\s+tongue\\s+(?:\\w+\\s+){0,2}?(?:in|into|inside|deep in|deep inside|past)\\s+{B}\\b`,
  },
  {
    id: "face-between-cheeks",
    cat: "oral",
    act: "rimming",
    subj: "t",
    weight: 0.9,
    src: `\\b{T}\\s+{aux}(?:buri\\w*|bury|press(?:es|ed|ing)?|shov\\w*|nuzzl\\w*|push(?:es|ed|ing)?)\\s+(?:his|her|their|my|your)\\s+(?:face|tongue|mouth|nose)\\s+(?:in|between|against|into)\\s+(?:{B:rimReq}|{B:poss}\\s+(?:ass\\s+|arse\\s+)?cheeks)`,
  },
  {
    // "Derek licked Stiles open"
    id: "licked-open",
    cat: "oral",
    act: "rimming",
    subj: "t",
    weight: 0.9,
    needsCtx: true,
    src: `\\b{T}\\s+{aux}(?:lick|tongu|eat|ate)\\w*\\s+{B}\\s+(?:open|loose|wet|sloppy)\\b`,
  },
  {
    // "Stiles sat on Derek's face", "rode his face", "ground back against Derek's tongue"
    id: "sat-on-face",
    cat: "oral",
    act: "rimming",
    subj: "b",
    weight: 0.8,
    needsCtx: true,
    src: `\\b{B}\\s+{aux}(?:(?:sat|sit|sits|sitting|squat\\w*|settl\\w*|lower\\w*\\s+(?:himself|herself|themselves|myself|yourself)|rode|ride|rides|riding)\\s+(?:down\\s+)?(?:on|onto)\\s+{T:poss}\\s+(?:face|mouth|tongue)|rode\\s+{T:poss}\\s+(?:face|tongue)|straddl\\w*\\s+{T:poss}\\s+(?:face|mouth)|(?:ride|rides|riding)\\s+{T:poss}\\s+(?:face|tongue)|(?:grind|grinds|grinding|ground|push\\w*|rock\\w*|press\\w*|roll\\w*|arch\\w*)\\s+(?:his\\s+(?:ass|arse|hips)\\s+)?(?:back\\s+)?(?:against|onto|on|into)\\s+{T:poss}\\s+(?:tongue|(?<=back\\s+(?:against|onto|on|into)\\s+\\S+\\s+)(?:face|mouth)))\\b(?![^.]*\\b(?:cock|dick|prick|cunt|pussy|clit)\\b)`,
  },
  {
    id: "passive-rimmed",
    cat: "oral",
    act: "rimming",
    subj: "b",
    weight: 0.8,
    src: `\\b{B}\\s+{aux}(?:was|were|got|gets|get|getting|being|been|be|is)\\s+(?:\\w+ly\\s+)?(?:rimmed|eaten out|tongue-?fucked)\\b(?:\\s+(?:\\w+\\s+){0,3}?by\\s+{T})?`,
  },

  // ───────────── ORAL: cunnilingus (licker = top, by analogy with rimming) ─────────────
  {
    id: "licked-vulva",
    cat: "oral",
    act: "cunnilingus",
    subj: "t",
    weight: 1,
    src: `\\b{T}\\s+{aux}(?:lick|lap|suck|tongu|eat|ate|kiss|nuzzl|mouth|devour|feast|flick|circl)\\w*\\s+(?:(?:at|over|along|up|into|around|on|between|across)\\s+)*{B:vulvaReq}(?!\\s+with\\s+(?:his|her|their|my|your)\\s+(?:thumbs?|fingers?|fingertips?|hands?|knuckles?|palms?|cock|dick|length))`,
  },
  {
    // "buried her face in Nancy's pussy", "pressed her mouth against Robin's cunt"
    id: "face-in-vulva",
    cat: "oral",
    act: "cunnilingus",
    subj: "t",
    weight: 1,
    src: `\\b{T}\\s+{aux}(?:bur(?:y|ied|ies|ying)|press\\w*|push\\w*|put|nestl\\w*|shov\\w*|smush\\w*|dove|dived|dive|dip\\w*)\\s+(?:(?:his|her|their|my|your)\\s+(?:\\w+\\s+)?)?(?:face|head|nose|mouth|lips)\\s+(?:\\w+\\s+){0,2}?(?:in(?:to)?|against|between|on|at)\\s+{B:vulvaReq}`,
  },
  {
    // "they scissored", "scissoring their legs together", "ground their pussies together"
    id: "scissoring",
    cat: "vaginal",
    act: "scissoring",
    subj: "t",
    weight: 0.9,
    needsCtx: true,
    src: `\\b{T}\\s+{aux}(?:scissor(?:s|ed|ing)?\\b(?!\\s+(?:(?:his|her|their|my|your|the|two|three|them)\\s+)?(?:fingers?|digits?|apart|open|them|his|her))|tribad\\w*|(?:ground|grind|grinds|grinding|rubb?ed|rub|rubs|rubbing)\\s+(?:their|her|our)\\s+(?:pussies|cunts|clits)\\s+together)`,
  },
  {
    id: "tongue-on-vulva",
    cat: "oral",
    act: "cunnilingus",
    subj: "t",
    weight: 1,
    src: `\\b{T:poss}\\s+(?:tongue|mouth|lips)\\s+(?:\\w+\\s+){0,3}?(?:on|against|over|in|around|inside|between)\\s+{B:vulvaReq}`,
  },

  // ───────────── round 4: heat-of, up, gerunds, object-less verbs, fullness/tightness ─────────────
  {
    id: "into-heat-of",
    cat: "anal",
    act: "anal sex",
    subj: "t",
    weight: 1,
    src: `\\b{T}\\s+{aux}(?:push|slid|slide|slip|sink|sank|sunk|thrust|drove|drive|eas|sheath|bur(?:y|ie)|fuck|pound|rock|snap|work|plung|guid)\\w*\\s+(?:(?:${SELF}|{x's}\\s+{PENIS})\\s+)?${DEPTH}(?:in(?:to|side)?)\\s+the\\s+(?:(?:tight|wet|hot|slick|velvet|welcoming|clenching|perfect|waiting|eager|silken|silky|warm|scorching|blazing|impossible)\\s+){0,3}(?:heat|warmth|tightness|clutch|grip|wetness|body)\\s+of\\s+{B:ass}`,
  },
  {
    id: "into-heat-of-mouth",
    cat: "oral",
    act: "blowjob",
    subj: "t",
    weight: 1,
    src: `\\b{T}\\s+{aux}(?:push|slid|slide|slip|sink|sank|sunk|thrust|drove|drive|eas|fuck|rock|snap|plung|guid)\\w*\\s+(?:(?:${SELF}|{x's}\\s+{PENIS})\\s+)?${DEPTH}(?:in(?:to|side)?)\\s+the\\s+(?:(?:tight|wet|hot|slick|velvet|welcoming|perfect|waiting|eager|silken|silky|warm)\\s+){0,3}(?:heat|warmth|tightness|wetness|suction|clutch)\\s+of\\s+{B:mouthReq}`,
  },
  {
    id: "having-inside",
    cat: "anal",
    act: "anal sex",
    subj: "t",
    weight: 0.9,
    needsCtx: true,
    src: `\\b(?<lead>having|feeling|felt|feel|feels|with|of|want(?:ed|s)?|need(?:ed|s)?|crav(?:ed|es)?)\\s+{T}\\s+(?:(?:(?:deep|so deep|buried|all the way|finally|still|right)\\s+)*inside|(?:(?:deep|so deep|buried|all the way|balls-deep)\\s+)+in)\\s+{B:ass}`,
  },
  {
    id: "pushed-in",
    cat: "anal",
    act: "anal sex",
    subj: "t",
    weight: 0.7,
    needsCtx: true,
    src: `\\b{T}\\s+{aux}(?:push|slid|slide|slip|sink|sank|thrust|eas|sheath|guid|rock|snap|fuck|press)\\w*\\s+(?:${SELF}\\s+)?(?:(?:back|forward|slowly|carefully|deep|all the way|right|finally|gently)\\s+)*(?:in|inside|home)(?![\\w-])(?!\\s*(?:to|the|a|an|his|her|their|my|your|front|back|line|time|place|close|closer|between|with|for|on|at|of|and then the)\\b)(?!\\s+[\\w-]+['’]s\\b)`,
  },
  {
    // "Cas was scorching and slick and snug around Dean's cock"
    id: "snug-around",
    cat: "anal",
    act: "anal sex (riding)",
    subj: "b",
    weight: 0.8,
    needsPenis: true,
    src: `\\b{B}\\s+{aux}(?:was|were|is|felt|feels|feel)\\s+(?:[\\w-]+,?\\s+(?:and\\s+)?){0,5}?(?:snug|tight|clenched|wrapped|hot|wet|slick)\\s+(?:and\\s+[\\w-]+\\s+)?around\\s+{T:penisReq}`,
  },
  {
    // "Cas slowly rose and fell around him", "rising and falling on Dean's cock"
    id: "rise-and-fall",
    cat: "anal",
    act: "anal sex (riding)",
    subj: "b",
    weight: 0.8,
    needsCtx: true,
    src: `\\b{B}\\s+{aux}(?:rose|rise|rises|rising)\\s+and\\s+(?:fell|fall|falls|falling)\\s+(?:around|on|over)\\s+{T:penis}`,
  },
  {
    id: "sank-down",
    cat: "anal",
    act: "anal sex (riding)",
    subj: "b",
    weight: 0.7,
    needsCtx: true,
    needs: /straddl|astride|on top|\blap\b|cock|dick|knot|\brid(?:e|ing)\b|\brode\b/i,
    src: `\\b{B}\\s+{aux}(?:sank|sink|sinks|sinking|lowered\\s+${SELF}|lowers\\s+${SELF}|lowering\\s+${SELF}|eased\\s+${SELF}|settled|seated\\s+${SELF})\\s+(?:(?:slowly|all the way|carefully|back|finally|inch by inch)\\s+)*down\\b(?!\\s+(?:on(?:to)?|into|in|to|beside|next|at|onto|the|a)\\b)`,
  },
  {
    id: "full-of",
    cat: "anal",
    act: "anal sex",
    subj: "b",
    weight: 0.9,
    needsCtx: true,
    src: `\\b{B}\\s+{aux}(?:was|felt|is|feels|were|been|so)\\s+(?:(?:so|impossibly|deliciously|completely|achingly|perfectly|incredibly|already)\\s+)*(?:full|stuffed|filled)\\s+(?:up\\s+)?(?:of|with)\\s+{T:penis}`,
  },
  {
    id: "clenched-around",
    cat: "anal",
    act: "anal sex",
    subj: "b",
    weight: 0.9,
    needsCtx: true,
    src: `\\b{B}\\s+{aux}(?:clench|tighten|flutter|squeez|clamp|spasm|contract|pulse|cinch)\\w*\\s+(?:(?:down|hard|helplessly|tight|rhythmically)\\s+)*(?:around|on)\\s+{T:penis}`,
  },
  {
    id: "tight-around",
    cat: "anal",
    act: "anal sex",
    subj: "b",
    weight: 0.9,
    src: `\\b{B}\\s+{aux}(?:was|felt|is|feels|were)\\s+(?:(?:so|impossibly|incredibly|unbelievably|deliciously|perfectly|still|hot and|wet and)\\s+)*tight\\s+(?:around|on)\\s+{T:penis}`,
  },
  {
    id: "head-bobbed",
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.9,
    src: `\\b{B:poss}\\s+head\\s+(?:\\w+\\s+){0,2}?(?:bobb|mov|bounc|work|ros|fell|dipp|sank|sink|lower)\\w*\\s+(?:(?:up and down|eagerly|steadily|faster|slowly)\\s+)*(?:in|between|over|on|above)\\s+{T:poss}\\s+(?:lap|legs|thighs|crotch|groin|${PENIS})`,
  },
  {
    id: "hollowed-cheeks",
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.9,
    src: `\\b{B}\\s+{aux}hollow(?:ed|s|ing)?\\s+(?:his|her|their|my|your)\\s+cheeks(?:\\s+(?:around|on)\\s+{T:penis})?`,
  },
  {
    id: "come-dripping",
    cat: "anal",
    act: "anal sex",
    subj: "t",
    weight: 0.8,
    src: `\\b{T:poss}\\s+(?:come|cum|seed|release|load|spunk|spend)\\s+(?:\\w+\\s+){0,2}?(?:dripp|leak|trickl|slid|ran|run|spill|seep|ooz|drool|slipp)\\w*\\s+(?:out\\s+of|from|down)\\s+{B:ass}`,
  },
  {
    id: "made-love-to",
    cat: "anal",
    act: "anal sex",
    subj: "t",
    weight: 0.6,
    needsCtx: true,
    src: `\\b{T}\\s+{aux}(?:made|make|makes|making)\\s+love\\s+to\\s+{B}\\b`,
  },

  // ───────────── SIGNALS: lead-up that suggests who'll top ─────────────
  {
    id: "lined-up",
    cat: "anal",
    act: "lining up",
    subj: "t",
    weight: 0.8,
    needsCtx: true,
    signal: { kind: "prep", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:lin(?:e|es|ed|ing)|position(?:s|ed|ing)?|align(?:s|ed|ing)?)\\s+(?:${SELF}|{x's}\\s+{PENIS})\\s+up(?!\\s+(?:with|against|at|for|behind|beside|next to)\\s+(?:the|a|an|his|her|their|my|your)\\b(?!\\s+(?:\\w+\\s+)?(?:hole|ass|arse|entrance|rim)\\b))(?:\\s+(?:with|against|at)\\s+{B:ass})?`,
  },
  {
    id: "slicked-self",
    cat: "anal",
    act: "slicking up",
    subj: "t",
    weight: 0.8,
    needsCtx: true,
    signal: { kind: "prep", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:(?:slick|lube|coat|slather)\\w*\\s+(?:${SELF}|{x's}\\s+{PENIS})(?:\\s+up)?|roll(?:s|ed|ing)?\\s+(?:on\\s+)?a\\s+condom(?:\\s+on)?|(?:put|puts|putting)\\s+(?:on\\s+)?a\\s+condom)`,
  },
  // ───────────── hints: sucking fingers (oral bottom) and playing with oneself (anal bottom) ─────────────
  {
    // "Peter licks and sucks at Wade's gloved fingers", "sucked on the fingers"
    id: "suck-fingers",
    cat: "oral",
    act: "sucking on fingers",
    subj: "b",
    weight: 0.5,
    needsCtx: true,
    kw: "suck|lick|lap|nibbl|mouth|lav",
    signal: { kind: "fingers", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:(?:lick|lap|nibbl|mouth|lav)\\w*\\s+and\\s+)?(?:suck|suckl|lick|lav|mouth|nibbl|lap)\\w*\\s+(?:(?:on|at)\\s+)?(?:(?:two|three|a couple|one) of\\s+)?(?:{T:poss}|the|two|three|a|those)\\s+(?:[\\w-]+\\s+){0,2}?(?:fingers?|thumb|digits?|fingertips?)\\b`,
  },
  {
    // "Henry sucks two fingers into his mouth", "took Wade's thumb between his lips"
    id: "fingers-into-own-mouth",
    cat: "oral",
    act: "sucking on fingers",
    subj: "b",
    weight: 0.5,
    needsCtx: true,
    signal: { kind: "fingers", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:suck|draw|drew|took|take|pull|guid)\\w*\\s+(?:(?:two|three|a couple|one) of\\s+)?(?:{T:poss}|the|two|three|a|one|those)\\s+(?:[\\w-]+\\s+){0,2}?(?:fingers?|thumb|digits?)\\s+(?:\\w+\\s+)?(?:into|in|between)\\s+(?:his|her|their|my|your)\\s+(?:mouth|lips)`,
  },
  {
    // "Deadpool shoved two leather-covered fingers into his mouth": the mouth's owner gets the hint.
    id: "fingers-into-mouth",
    cat: "oral",
    act: "sucking on fingers",
    subj: "t",
    weight: 0.5,
    needsCtx: true,
    signal: { kind: "fingers", actorRole: "bottom", actor: "b" },
    src: `\\b{T}\\s+{aux}(?:shov|push|slid|slip|stuck|stick|press|put|fed|feed|eas|hook|jamm|jam|work|slot|tuck)\\w*\\s+(?:(?:his|her|their|my|your|two|three|a|one|the|another)\\s+)?(?:[\\w-]+\\s+){0,2}?(?:fingers?|thumb|digits?)\\s+(?:\\w+\\s+)?(?:into|in|between|past)\\s+{B:poss}\\s+(?:(?:${MOUTH_ADJ})\\s+)?(?:mouth|lips)`,
  },
  {
    // "He fingered himself open", "stretched himself"
    id: "self-finger",
    cat: "anal",
    act: "fingering himself",
    subj: "b",
    weight: 0.6,
    needsCtx: true,
    signal: { kind: "solo", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:finger(?:s|ed|ing)?|finger-?fuck(?:s|ed|ing)?|stretch(?:es|ed|ing)?|prep(?:s|ped|ping)?|open(?:s|ed|ing)?)\\s+${SELF}(?:\\s+(?:open|wide|loose|up))?(?!\\s+(?:out|on|across|along|to|for|from|about|with (?:a|the) (?:question|thought)))`,
  },
  {
    // "slides a finger into himself", "eased the dildo inside himself"
    id: "self-insert",
    cat: "anal",
    act: "fingering himself",
    subj: "b",
    weight: 0.6,
    needsCtx: true,
    signal: { kind: "solo", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:push|slid|slide|slip|press|thrust|sink|sank|eas|insert|add|crook|curl|scissor|work|fuck|rock|guid|feed|fed)\\w*\\s+(?:(?:a|one|two|three|four|another|the|his|her|my|their|a second|a third)\\s+)?(?:own\\s+)?(?:[\\w-]+\\s+){0,2}?(?:fingers?|digits?|dildo|toy|vibrator|vibe|plug)\\s+(?:\\w+\\s+){0,2}?(?:into|inside|in)\\s+${SELF}`,
  },
  {
    // "fucks himself on the dildo", "rides the plug", "sank down onto the toy"
    id: "self-toy",
    cat: "anal",
    act: "using a toy on himself",
    subj: "b",
    weight: 0.6,
    needsCtx: true,
    signal: { kind: "solo", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:fuck|rid|rode|bounc|rock|grind|ground|sink|sank|thrust|lower|work|impal)\\w*\\s+(?:${SELF}\\s+)?(?:\\w+ly\\s+)?(?:back\\s+|down\\s+)*(?:(?:on(?:to)?|with)\\s+)?(?:a|the|his|her|my|their)\\s+(?:own\\s+)?(?:[\\w-]+\\s+){0,2}?(?:dildo|toy|vibrator|vibe|plug)s?\\b(?!\\s+(?:\\w+\\s+)?(?:into|inside|in|up|against)\\s+(?!himself|herself|themself|themselves|myself|his|her|their|my|the)\\w)`,
  },
  {
    // "thrusts down on his own finger", "fucked himself on his own fingers"
    id: "self-own-fingers",
    cat: "anal",
    act: "fingering himself",
    subj: "b",
    weight: 0.5,
    needsCtx: true,
    needs: /\b(?:rim|hole|ass|arse|entrance|prostate|inside|himself|herself|thrust\w*|open\w*|stretch\w*)\b/i,
    signal: { kind: "solo", actorRole: "bottom" },
    src: `\\b(?:down\\s+)?(?:on(?:to)?|with|into|inside)\\s+{B:poss}\\s+own\\s+(?:[\\w-]+\\s+)?(?:fingers?|digits?)\\b`,
  },
  {
    id: "spread-legs",
    cat: "anal",
    act: "spreading their legs",
    subj: "b",
    weight: 0.7,
    needsCtx: true,
    signal: { kind: "prep", actorRole: "bottom" },
    // Not "spreading his legs to stand between them": that's someone else's legs.
    src: `\\b{B}\\s+{aux}(?:spread|parted|opened|spreads|parts|opens|spreading|parting|opening)\\s+(?:his|her|their|my|your)\\s+(?:legs|thighs|knees)(?!${BETWEEN_THEM})(?:\\s+(?:wider\\s+|wide\\s+)?for\\s+{T})?`,
  },
  {
    // "hoisted him onto the counter, spreading his legs to stand between them"
    id: "spread-their-legs",
    cat: "anal",
    act: "spreading someone's legs",
    subj: "t",
    weight: 0.5,
    signal: { kind: "prep", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:spread|parted|opened|pushed|nudged|pried|spreads|parts|opens|pushes|nudges|spreading|parting|opening|pushing|nudging|prying)\\s+(?:(?:his|her|their)\\s+(?:legs|thighs|knees)(?=${BETWEEN_THEM})|{B:poss}\\s+(?:legs|thighs|knees)(?:\\s+(?:apart|open|wide|wider))?)`,
  },
  {
    id: "hands-and-knees",
    cat: "anal",
    act: "getting on hands and knees",
    subj: "b",
    weight: 0.6,
    needsCtx: true,
    signal: { kind: "prep", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:got|get|gets|getting|went|go|goes|dropped|climbed|crawled|settled|was|were|is|rolled|turned|flipped)\\s+(?:over\\s+)?(?:down\\s+)?on(?:to)?\\s+(?:his|her|their|my|your)\\s+(?:hands and knees|stomach|belly|front)`,
  },
  {
    id: "bent-over-furniture",
    cat: "anal",
    act: "bending over",
    subj: "b",
    weight: 0.6,
    needsCtx: true,
    signal: { kind: "prep", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:bent|bends|bending|draped\\s+${SELF})\\s+over\\s+the\\s+(?:desk|bed|table|counter|couch|sofa|sink|car|hood|arm|back)\\b`,
  },
  {
    id: "presented",
    cat: "anal",
    act: "presenting",
    subj: "b",
    weight: 0.8,
    needsCtx: true,
    signal: { kind: "prep", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}present(?:ed|s|ing)?\\s+(?:${SELF}(?!\\s+(?:well|nicely|properly|professionally|as\\b|in\\b|at\\b|better|best|so\\b|to the\\b))|{x's}\\s+(?:ass|arse|hole))`,
  },
  {
    id: "pushed-head-down",
    cat: "oral",
    act: "pushing a head down",
    subj: "t",
    weight: 0.7,
    needsCtx: true,
    signal: { kind: "prep", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:push|press|guid|pull|forc|shov|tug|urg)\\w*\\s+{B:poss}\\s+(?:head|face|mouth)\\s+(?:back\\s+)?(?:down\\b|lower\\b|(?:onto|toward|towards|against|to|into)\\s+(?:(?:his|her|their|my|your|\\w+['’]s)\\s+)?(?:\\w+\\s+)?(?:crotch|cock|dick|groin|lap|erection|bulge|length|prick|shaft))`,
  },
  {
    id: "knelt-before",
    cat: "oral",
    act: "kneeling in front of someone",
    subj: "b",
    weight: 0.7,
    needsCtx: true,
    signal: { kind: "prep", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:dropped|drop|drops|dropping|sank|sink|sinks|sinking|fell|falls|falling|got|gets|getting|went|going|knelt|kneels|kneeling)\\s+(?:down\\s+)?(?:to|on(?:to)?)\\s+(?:his|her|their|my|your)\\s+knees\\s+(?:in front of|before)\\s+{T}`,
  },
  {
    id: "knelt-between",
    cat: "oral",
    act: "kneeling between someone's legs",
    subj: "b",
    weight: 0.7,
    needsCtx: true,
    signal: { kind: "prep", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:knelt|kneel|kneels|kneeling|settled|crouched|crawled|slid|moved)\\s+(?:down\\s+)?between\\s+{T:poss}\\s+(?:legs|thighs|knees)`,
  },

  // ───────────── VAGINAL: generic sex that's only counted when the pair can have vaginal sex ─────────────
  {
    id: "had-sex-together",
    cat: "vaginal",
    act: "vaginal sex",
    subj: "t",
    weight: 0.7,
    src: `\\b{T}\\s+and\\s+{B}\\s+{aux}(?:had sex|made love|fucked|slept together|screwed|banged)\\b`,
  },
  {
    id: "had-sex-with",
    cat: "vaginal",
    act: "vaginal sex",
    subj: "t",
    weight: 0.6,
    src: `\\b{T}\\s+{aux}(?:had sex|made love|slept|hooked up)\\s+with\\s+{B}\\b(?!\\s+(?:on|in)\\s+(?:the|a)\\s+(?:couch|sofa|floor|chair))`,
  },
  {
    id: "penis-in-vulva",
    cat: "vaginal",
    act: "vaginal sex",
    subj: "t",
    weight: 1,
    src: `\\b{T:penisReq}\\s+{aux}(?:\\w+\\s+){0,3}?(?:in(?:to|side)?|between)\\s+{B:vulvaReq}`,
  },

  // ───────────── SIGNALS (not acts): ogling or grabbing an ass → top; a crotch/bulge → bottom ─────────────
  {
    id: "ogle-ass",
    cat: "anal",
    act: "checking out an ass",
    subj: "t",
    weight: 0.7,
    signal: { kind: "ogling", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:check(?:s|ed|ing)? out|ogl(?:e|es|ed|ing)|star(?:e|es|ed|ing) at|ey(?:e|es|ed|eing|ing)(?: up)?|admir(?:e|es|ed|ing)|watch(?:es|ed|ing)|gawk(?:s|ed|ing)? at|leer(?:s|ed|ing)? at|gaz(?:e|es|ed|ing) at|look(?:s|ed|ing)? at|glanc(?:e|es|ed|ing) at|appreciat(?:e|es|ed|ing)|(?:couldn['’]t|could not|can['’]t|cannot) (?:stop (?:staring|looking) at|take (?:his|her|their|my|your) eyes off|help (?:staring|looking) at|look away from)|stole a (?:glance|look) at|sneaked a (?:glance|look) at)\\s+{B:poss}\\s+(?:\\w+\\s+){0,2}?(?:ass|arse|butt|bum|backside|behind|rear|cheeks|glutes)\\b`,
  },
  {
    id: "eyes-on-ass",
    cat: "anal",
    act: "checking out an ass",
    subj: "t",
    weight: 0.7,
    signal: { kind: "ogling", actorRole: "top" },
    src: `\\b{T:poss}\\s+(?:eyes|gaze|attention|stare|eyeline)\\s+(?:\\w+\\s+){0,2}?(?:dropp|drift|linger|wander|stray|fell|fall|slid|slipp|travel|flick|dart|rak|sweep|swept|went|go|caught|snag|land|follow|track|stuck|glu|fix)\\w*\\s+(?:(?:down|back|over|again|right|straight)\\s+)*(?:to|on|over|across|along|down|onto)\\s+{B:poss}\\s+(?:\\w+\\s+){0,2}?(?:ass|arse|butt|bum|backside|behind|rear)\\b`,
  },
  {
    id: "ogle-crotch",
    cat: "anal",
    act: "checking out a crotch",
    subj: "t",
    weight: 0.7,
    signal: { kind: "ogling", actorRole: "bottom" },
    src: `\\b{T}\\s+{aux}(?:check(?:s|ed|ing)? out|ogl(?:e|es|ed|ing)|star(?:e|es|ed|ing) at|ey(?:e|es|ed|eing|ing)|admir(?:e|es|ed|ing)|gawk(?:s|ed|ing)? at|leer(?:s|ed|ing)? at|gaz(?:e|es|ed|ing) at|look(?:s|ed|ing)? at|glanc(?:e|es|ed|ing) at|(?:couldn['’]t|could not|can['’]t|cannot) (?:stop (?:staring|looking) at|take (?:his|her|their|my|your) eyes off|help (?:staring|looking) at)|stole a (?:glance|look) at)\\s+(?:{B:poss}\\s+(?:\\w+\\s+){0,2}?(?:crotch|groin|bulge|package|cock|dick|erection|hard-?on|fly|zipper|sweatpants)|the\\s+(?:\\w+\\s+)?(?:bulge|outline|shape|tent|line)\\s+(?:of\\s+{B:poss}\\s+(?:cock|dick|erection)|in\\s+{B:poss}\\s+(?:jeans|trousers|pants|sweatpants|shorts|boxers|briefs|joggers|slacks|underwear)))\\b`,
  },  {
    id: "ogle-crotch-oral",
    cat: "oral",
    act: "checking out a crotch",
    subj: "t",
    weight: 0.7,
    signal: { kind: "ogling", actorRole: "bottom" },
    src: `\\b{T}\\s+{aux}(?:check(?:s|ed|ing)? out|ogl(?:e|es|ed|ing)|star(?:e|es|ed|ing) at|ey(?:e|es|ed|eing|ing)|admir(?:e|es|ed|ing)|gawk(?:s|ed|ing)? at|leer(?:s|ed|ing)? at|gaz(?:e|es|ed|ing) at|look(?:s|ed|ing)? at|glanc(?:e|es|ed|ing) at|(?:couldn['’]t|could not|can['’]t|cannot) (?:stop (?:staring|looking) at|take (?:his|her|their|my|your) eyes off|help (?:staring|looking) at)|stole a (?:glance|look) at)\\s+(?:{B:poss}\\s+(?:\\w+\\s+){0,2}?(?:crotch|groin|bulge|package|cock|dick|erection|hard-?on|fly|zipper|sweatpants)|the\\s+(?:\\w+\\s+)?(?:bulge|outline|shape|tent|line)\\s+(?:of\\s+{B:poss}\\s+(?:cock|dick|erection)|in\\s+{B:poss}\\s+(?:jeans|trousers|pants|sweatpants|shorts|boxers|briefs|joggers|slacks|underwear)))\\b`,
  },
  {
    id: "eyes-on-crotch",
    cat: "anal",
    act: "checking out a crotch",
    subj: "t",
    weight: 0.7,
    signal: { kind: "ogling", actorRole: "bottom" },
    src: `\\b{T:poss}\\s+(?:eyes|gaze|attention|stare|eyeline)\\s+(?:\\w+\\s+){0,2}?(?:dropp|drift|linger|wander|stray|fell|fall|slid|slipp|travel|flick|dart|rak|sweep|swept|went|go|caught|snag|land|stuck|glu|fix)\\w*\\s+(?:(?:down|back|over|again|right|straight)\\s+)*(?:to|on|over|across|along|down|onto)\\s+(?:{B:poss}\\s+(?:\\w+\\s+){0,2}?(?:crotch|groin|bulge|package|cock|dick|erection|hard-?on|fly|zipper|sweatpants)|the\\s+(?:\\w+\\s+)?bulge\\s+in\\s+{B:poss}\\s+\\w+)\\b`,
  },  {
    id: "eyes-on-crotch-oral",
    cat: "oral",
    act: "checking out a crotch",
    subj: "t",
    weight: 0.7,
    signal: { kind: "ogling", actorRole: "bottom" },
    src: `\\b{T:poss}\\s+(?:eyes|gaze|attention|stare|eyeline)\\s+(?:\\w+\\s+){0,2}?(?:dropp|drift|linger|wander|stray|fell|fall|slid|slipp|travel|flick|dart|rak|sweep|swept|went|go|caught|snag|land|stuck|glu|fix)\\w*\\s+(?:(?:down|back|over|again|right|straight)\\s+)*(?:to|on|over|across|along|down|onto)\\s+(?:{B:poss}\\s+(?:\\w+\\s+){0,2}?(?:crotch|groin|bulge|package|cock|dick|erection|hard-?on|fly|zipper|sweatpants)|the\\s+(?:\\w+\\s+)?bulge\\s+in\\s+{B:poss}\\s+\\w+)\\b`,
  },
  {
    id: "grab-ass",
    cat: "anal",
    act: "grabbing an ass",
    subj: "t",
    weight: 0.6,
    signal: { kind: "touch", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:grab|squeez|grop|palm|slap|smack|knead|cup|fondl|pinch|spank|clutch|swat)\\w*\\s+(?:a\\s+handful\\s+of\\s+)?{B:poss}\\s+(?:\\w+\\s+){0,2}?(?:ass|arse|butt|bum|backside|behind(?!\\s+(?:his|her|their|my|your|the|a|an|him|them|me|us|[A-Z]\\w*)\\b)|cheeks)\\b`,
  },
  {
    id: "hands-on-ass",
    cat: "anal",
    act: "grabbing an ass",
    subj: "t",
    weight: 0.6,
    signal: { kind: "touch", actorRole: "top" },
    src: `\\b{T:poss}\\s+hands?\\s+(?:\\w+\\s+){0,2}?(?:on|cupping|squeezing|groping|kneading|grabbing|cupped|squeezed|groped|kneaded|grabbed|found|slid (?:down )?to|moved (?:down )?to|settled on)\\s+{B:poss}\\s+(?:\\w+\\s+){0,2}?(?:ass|arse|butt|bum|backside|cheeks)\\b`,
  },
  {
    id: "aroused-by-ass",
    cat: "anal",
    act: "aroused by an ass",
    subj: "t",
    weight: 0.7,
    signal: { kind: "ogling", actorRole: "top" },
    src: `\\b{T:poss}\\s+(?:cock|dick|prick|erection)\\s+(?:\\w+\\s+){0,2}?(?:twitch|harden|stir|jump|throb|ach|perk|swell|fill|jerk|leap)\\w*\\s+(?:\\w+\\s+){0,5}?{B:poss}\\s+(?:\\w+\\s+){0,1}?(?:ass|arse|butt|backside|bum)\\b`,
  },
  {
    id: "mouth-watered",
    cat: "anal",
    act: "wanting a cock",
    subj: "t",
    weight: 0.7,
    signal: { kind: "ogling", actorRole: "bottom" },
    src: `\\b{T:poss}\\s+mouth\\s+(?:\\w+\\s+){0,2}?water(?:ed|s|ing)?\\s+(?:\\w+\\s+){0,5}?{B:poss}\\s+(?:\\w+\\s+){0,2}?(?:cock|dick|bulge|crotch|package|erection)`,
  },
  {
    id: "mouth-watered-oral",
    cat: "oral",
    act: "wanting to suck",
    subj: "t",
    weight: 0.7,
    signal: { kind: "ogling", actorRole: "bottom" },
    src: `\\b{T:poss}\\s+mouth\\s+(?:\\w+\\s+){0,2}?water(?:ed|s|ing)?\\s+(?:\\w+\\s+){0,5}?{B:poss}\\s+(?:\\w+\\s+){0,2}?(?:cock|dick|bulge|crotch|package|erection)`,
  },
  {
    id: "bend-over",
    cat: "anal",
    act: "bending someone over",
    subj: "t",
    weight: 0.6,
    needsCtx: true,
    signal: { kind: "touch", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:bend|bent|bending|bends)\\s+{B}\\s+over\\b`,
  },
  {
    id: "grind-ass-back",
    cat: "anal",
    act: "grinding back",
    subj: "b",
    weight: 0.6,
    signal: { kind: "touch", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:push|press|grind|ground|rock|arch|wiggl|shimm|back|rut)\\w*\\s+(?:his|her|their|my|your)\\s+(?:ass|arse|butt|bum|hips)\\s+(?:back\\s+|up\\s+)?(?:against|into|onto|toward|towards)\\s+{T:penis}`,
  },
  {
    id: "grind-cock-on-ass",
    cat: "anal",
    act: "grinding against an ass",
    subj: "t",
    weight: 0.6,
    signal: { kind: "touch", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:grind|ground|rut|press|rock|rubb?)\\w*\\s+(?:his|her|their|my|your)\\s+(?:${PENIS}|crotch|hips|groin|bulge)\\s+(?:\\w+\\s+){0,2}?(?:against|into|between|along)\\s+{B:poss}\\s+(?:\\w+\\s+){0,1}?(?:ass|arse|butt|cheeks|backside)`,
  },

  // ───────────── BEHAVIOUR: dominant or submissive, in or out of bed (feeds the "vibe" rating only) ─────────────
  {
    id: "dom-pin",
    cat: "vibe",
    act: "pinning someone",
    subj: "t",
    weight: 0.6,
    signal: { kind: "behavior", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:pinn?ed|pins|pinning|press(?:ed|es|ing)|shov(?:ed|es|ing)|slam(?:med|s|ming)|back(?:ed|s|ing)|crowd(?:ed|s|ing))\\s+{B}\\s+(?:up\\s+)?(?:against|to|onto|into|down\\s+(?:on|onto|against|into))\\b`,
  },
  {
    id: "dom-take-control",
    cat: "vibe",
    act: "taking control",
    subj: "t",
    weight: 0.6,
    signal: { kind: "behavior", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:took|takes|taking|seiz(?:ed|es|ing))\\s+(?:control|charge|the lead|command)\\b`,
  },
  {
    id: "dom-grip",
    cat: "vibe",
    act: "gripping firmly",
    subj: "t",
    weight: 0.6,
    signal: { kind: "behavior", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:grip(?:ped|s|ping)?|grabb?ed|grabs|grabbing|caught|catch(?:es)?|tilt(?:ed|s|ing)|tugg?ed|tugs|tugging|yank(?:ed|s|ing)|fisted)\\s+{B:poss}\\s+(?:\\w+\\s+)?(?:chin|jaw|hair|wrists?|nape|neck|throat|collar)\\b`,
  },
  {
    id: "dom-order",
    cat: "vibe",
    act: "giving orders",
    subj: "t",
    weight: 0.5,
    signal: { kind: "behavior", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:order(?:ed|s)?|command(?:ed|s)?)\\s+{B}\\b`,
  },
  {
    id: "dom-carry",
    cat: "vibe",
    act: "lifting or carrying someone",
    subj: "t",
    weight: 0.5,
    signal: { kind: "behavior", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:lift(?:ed|s|ing)|carr(?:ied|ies|ying)|hoist(?:ed|s|ing)|scoop(?:ed|s|ing)|swept)\\s+{B}\\s+(?:up\\s+)?(?:into|onto|off|over|against|in|to)\\b`,
  },
  {
    id: "dom-protect",
    cat: "vibe",
    act: "protecting someone",
    subj: "t",
    weight: 0.5,
    signal: { kind: "behavior", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:shield\\w*|protect\\w*|stepp?ed\\s+in\\s+front\\s+of|stood\\s+in\\s+front\\s+of)\\s+{B}\\b`,
  },
  {
    id: "dom-lead",
    cat: "vibe",
    act: "leading someone",
    subj: "t",
    weight: 0.5,
    signal: { kind: "behavior", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:led|leads|leading|dragged|drags|dragging|steered|steers|guided|guides)\\s+{B}\\s+(?:by\\s+the\\s+(?:hand|wrist|arm|collar)|to\\s+the\\s+(?:bed|bedroom)|into\\s+the\\s+bedroom|upstairs)\\b`,
  },
  {
    id: "sub-melt",
    cat: "vibe",
    act: "going pliant",
    subj: "b",
    weight: 0.6,
    signal: { kind: "behavior", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:melt(?:ed|s|ing)|sag(?:ged|s)|went|goes|go)\\s+(?:soft|pliant|limp|boneless|still|pliable)\\b`,
  },
  {
    id: "sub-yield",
    cat: "vibe",
    act: "submitting",
    subj: "b",
    weight: 0.6,
    signal: { kind: "behavior", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:submit(?:ted|s)?|yield(?:ed|s)?|surrender(?:ed|s)?)\\b`,
  },
  {
    id: "sub-let-lead",
    cat: "vibe",
    act: "letting someone lead",
    subj: "b",
    weight: 0.6,
    signal: { kind: "behavior", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:let|lets|allow(?:ed|s)?)\\s+{T}\\s+(?:take|lead|take\\s+over|take\\s+charge|set|decide|undress|strip)\\b`,
  },
  {
    id: "sub-pinned",
    cat: "vibe",
    act: "being pinned",
    subj: "b",
    weight: 0.6,
    signal: { kind: "behavior", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:was|were|is|got|gets)\\s+(?:pinn?ed|pushed|pressed|shoved|slammed|backed|manhandled|hauled)\\s+(?:up\\s+)?(?:against|to|onto|down)\\b`,
  },
  {
    id: "sub-squirm",
    cat: "vibe",
    act: "squirming under someone",
    subj: "b",
    weight: 0.5,
    signal: { kind: "behavior", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:whimper(?:ed|s)?|keen(?:ed|s)?|mewl(?:ed|s)?|squirm(?:ed|s)?|trembl(?:ed|es))\\s+(?:under|beneath|at|against)\\s+{T:poss}\\s+(?:touch|gaze|stare|hands|weight|mouth)\\b`,
  },
  {
    id: "sub-lashes",
    cat: "vibe",
    act: "looking up through lashes",
    subj: "b",
    weight: 0.4,
    signal: { kind: "behavior", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:looked|glanced|peered|gazed)\\s+up\\s+(?:at\\s+{T}\\s+)?through\\s+(?:his|her|their)\\s+lashes\\b`,
  },
  // ───────────── TOYS: dildos, vibrators, plugs and strap-ons (whoever is penetrated is the bottom) ─────────────
  {
    // "pushed the dildo into Dean", "slid a vibrator inside her", "fucked the toy into him", "worked a plug into Cas"
    id: "toy-in",
    cat: "anal",
    act: "anal sex (toy)",
    subj: "t",
    weight: 1,
    needsCtx: true,
    src: `\\b{T}\\s+{aux}(?:push|press|slid|slide|slip|work|eas|insert|guid|fed|feed|sink|sank|shov|nudg|pump|fuck|drove|drive|thrust|stuff|ram)\\w*\\s+(?:(?:a|an|the|his|her|their|that|this|one|another|my|your)\\s+)?(?:[\\w-]+\\s+){0,2}?(?:dildo|vibrator|vibe|butt\\s*plug|plug|beads|wand|bullet|toy|strap-?on|strap)\\s+(?:(?:slowly|deep(?:er)?|all the way|gently|carefully|roughly|further|back|firmly|easily)\\s+)*(?:in(?:to)?|inside|up)\\s+{B:ass}`,
  },
  {
    // "pressed the vibrator against Dean's hole", "teased the plug at her entrance"
    id: "toy-at-hole",
    cat: "anal",
    act: "toy at the hole",
    subj: "t",
    weight: 0.6,
    needsCtx: true,
    signal: { kind: "prep", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:press|nudg|rub|trac|circl|teas|touch|brush|line|lin)\\w*\\s+(?:up\\s+)?(?:(?:a|an|the|his|her|their|that|this|my|your)\\s+)?(?:[\\w-]+\\s+){0,2}?(?:dildo|vibrator|vibe|butt\\s*plug|plug|beads|wand|bullet|toy|strap-?on|strap)\\s+(?:\\w+\\s+)?(?:against|to|at|along|over|between)\\s+{B:assReq}`,
  },
  {
    // "Dean was wearing a plug", "had a vibrator in him all day"
    id: "wearing-plug",
    cat: "anal",
    act: "wearing a plug",
    subj: "b",
    weight: 0.7,
    needsCtx: true,
    signal: { kind: "prep", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:was|were|is|had|has|wore|wears|wearing|kept)\\s+(?:a\\s+|the\\s+|his\\s+|her\\s+|their\\s+)?(?:[\\w-]+\\s+){0,2}?(?:butt\\s*plug|plug(?!\\s+in\\b|-in)|vibrator|vibe|beads)\\b(?!-)`,
  },
  {
    // "strapped on the harness", "buckled the strap-on", "wearing a dildo": the wearer is the top
    id: "strapped-on",
    cat: "anal",
    act: "strapping on",
    subj: "t",
    weight: 0.8,
    needsCtx: true,
    signal: { kind: "prep", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:strapp?ed\\s+(?:on|in)|buckl\\w+\\s+(?:on|up|in)|put\\s+on|donn\\w+|wore|wears|wearing)\\s+(?:the\\s+|a\\s+|his\\s+|her\\s+|their\\s+)?(?:[\\w-]+\\s+){0,2}?(?:strap-?on|harness|dildo)\\b(?!\\s+(?:for|on)\\s+(?:the\\s+|his\\s+|her\\s+)?(?:dog|horse|baby|kid|child|cat|puppy|climb\\w*|rope|ride))`,
  },

  // ───────────── LESS-EXPLICIT CUES: staring, groping, handling ─────────────
  {
    // "stared where Steve's fat cock stretched out his briefs", "glanced down to where his dick poked from his jeans"
    id: "ogle-crotch-where",
    cat: "anal",
    act: "staring at a bulge",
    subj: "t",
    weight: 0.7,
    signal: { kind: "ogling", actorRole: "bottom" },
    src: `\\b{T}\\s+{aux}(?:star|gaz|look|glanc|eye|watch|ogl|peer)\\w*\\s+(?:down\\s+)?(?:at\\s+|to\\s+)?where\\s+{B:poss}\\s+(?:[\\w-]+\\s+){0,2}?(?:cock|dick|erection|hard-?on|bulge|prick)\\b`,
  },
  {
    // "watching Steve bend over the hood", "stared as he leaned across the table"
    id: "ogle-bend-over",
    cat: "anal",
    act: "watching someone bend over",
    subj: "t",
    weight: 0.7,
    signal: { kind: "ogling", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:watch|stare|gaze|ogle|eye|admire)\\w*\\s+{B}\\s+(?:bend|lean|bent|leaned|stretch|reach)\\w*\\s+(?:over|down|across|forward)\\b`,
  },
  {
    // "grabbed Steve's hips and pulled him close", "gripped his waist and hauled him in"
    id: "dom-hips-pull",
    cat: "vibe",
    act: "grabbing hips and pulling close",
    subj: "t",
    weight: 0.6,
    signal: { kind: "behavior", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:grabb?ed|grabs|grabbing|grip(?:ped|s|ping)?|held|holds|caught|catch(?:es)?|seiz\\w*|clutch\\w*|squeez\\w*)\\s+{B:poss}\\s+(?:hips?|waist|thighs?|ribs|sides)\\s*,?\\s*(?:and\\s+)?(?:then\\s+)?(?:pull|haul|drag|yank|tug|hoist|lift|flip|push|turn|bend|slam|press|jerk)\\w*`,
  },
  {
    // "cupped Steve's jaw and tilted his head back", "tilted Steve's chin up"
    id: "dom-tilt",
    cat: "vibe",
    act: "tilting someone's face up",
    subj: "t",
    weight: 0.5,
    signal: { kind: "behavior", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:(?:cupp?ed|cups|held|holds|gripp?ed|grips|caught)\\s+{B:poss}\\s+(?:jaw|chin|face)\\s*,?\\s*(?:and\\s+)?(?:then\\s+)?)?(?:tilt|lift|angl|tip|jerk)\\w*\\s+(?:{B:poss}\\s+(?:chin|head|face)|{B:poss}\\s+(?:jaw))\\s+(?:up|back|toward|towards|to)\\b`,
  },
  {
    // "slid a hand down the back of Steve's jeans and squeezed", "pushed a hand into his waistband"
    id: "hand-in-pants",
    cat: "anal",
    act: "hand down the back of the pants",
    subj: "t",
    weight: 0.6,
    signal: { kind: "touch", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:slid|slipp|dipp|shov|push|sneak|snak|work|slid)\\w*\\s+(?:a|one|his|her|their)\\s+hand\\s+(?:\\w+\\s+){0,2}?(?:down|into|under|inside)\\s+(?:the\\s+back\\s+of\\s+)?{B:poss}\\s+(?:jeans|pants|trousers|boxers|briefs|waistband|shorts|underwear|sweats|sweatpants)\\b`,
  },
  {
    // "Eddie's hand slipped down the back of Steve's jeans"
    id: "hand-in-pants-poss",
    cat: "anal",
    act: "hand down the back of the pants",
    subj: "t",
    weight: 0.6,
    signal: { kind: "touch", actorRole: "top" },
    src: `\\b{T:poss}\\s+hand\\s+(?:slid|slipp|dipp|shov|push|sneak|snak|work|crept|trail)\\w*\\s+(?:\\w+\\s+){0,2}?(?:down|into|under|inside)\\s+(?:the\\s+back\\s+of\\s+)?{B:poss}\\s+(?:jeans|pants|trousers|boxers|briefs|waistband|shorts|underwear|sweats|sweatpants)\\b`,
  },
  {
    // "rubbed his palm over the bulge in Eddie's jeans", "cupped the bulge in his pants"
    id: "grope-bulge",
    cat: "anal",
    act: "touching a bulge",
    subj: "t",
    weight: 0.6,
    signal: { kind: "touch", actorRole: "bottom" },
    src: `\\b{T}\\s+{aux}(?:rubb?ed|palm\\w*|cupp?ed|cups|squeez\\w*|stroked|strokes|grop\\w*|massag\\w*|pressed)\\s+(?:(?:his|her|their)\\s+(?:palm|hand|fingers?)\\s+)?(?:over|against|along|on)?\\s*(?:the\\s+)?(?:bulge|outline|hardness|erection|tent)\\s+(?:in|of|under)\\s+{B:poss}\\b`,
  },
  {
    // "Eddie poured lube over his dick and rubbed it over himself", "slathered lube on his fingers"
    id: "lube-up",
    cat: "anal",
    act: "slicking up",
    subj: "t",
    weight: 0.7,
    signal: { kind: "prep", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:pour|squirt|drizzl|smear|slather|spread|coat|rub|dribbl)\\w*\\s+(?:some\\s+|a\\s+(?:bit|little|lot)\\s+of\\s+|the\\s+|more\\s+)?lube\\s+(?:over|onto|on|across|along)\\s+(?:his|her|their)\\s+(?:own\\s+)?(?:cock|dick|length|shaft|erection|prick)\\b`,
  },
  // ───────────── TOYS ON ONESELF: whoever uses a dildo, plug or vibrator on themselves is bottoming ─────────────
  {
    // "pushed the dildo into his ass", "slid the plug inside his own hole" (no one else named: his own)
    id: "self-toy-own-hole",
    cat: "anal",
    act: "using a toy on himself",
    subj: "b",
    weight: 0.8,
    needsCtx: true,
    signal: { kind: "solo", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:push|press|slid|slide|slip|work|eas|insert|guid|fed|feed|sink|sank|shov|nudg|thrust|ram|stuff)\\w*\\s+(?:(?:a|an|the|his|her|their|that|this|one|another|my)\\s+)?(?:[\\w-]+\\s+){0,2}?(?:dildo|vibrator|vibe|butt\\s*plug|plug|beads|wand|bullet|toy)\\s+(?:(?:slowly|deep(?:er)?|all the way|gently|carefully|roughly|further|back|firmly|easily)\\s+)*(?:in(?:to)?|inside|up)\\s+(?:(?:his|her|their)\\s+(?:own\\s+)?(?:ass|arse|hole|entrance|body|pussy|cunt)|${SELF})`,
  },
  {
    // "worked it into himself" (the toy named just before)
    id: "self-toy-it",
    cat: "anal",
    act: "using a toy on himself",
    subj: "b",
    weight: 0.8,
    needsCtx: true,
    needs: /\b(?:dildo|vibrator|vibe|plug|beads|toy|wand)\b/i,
    signal: { kind: "solo", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:[\\w-]+\\s+){0,6}?(?:push|press|slid|slide|slip|work|eas|insert|guid|fed|feed|sink|sank|shov|nudg|thrust)\\w*\\s+(?:it|them)\\s+(?:\\w+\\s+){0,2}?(?:in(?:to)?|inside|up)\\s+(?:(?:his|her|their)\\s+(?:own\\s+)?(?:ass|arse|hole|body)|${SELF})`,
  },
  {
    // "teased his hole with the tip of the vibe before pressing it in"
    id: "self-toy-tease",
    cat: "anal",
    act: "using a toy on himself",
    subj: "b",
    weight: 0.7,
    needsCtx: true,
    signal: { kind: "solo", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:teas|press|rub|trac|circl|brush|touch)\\w*\\s+(?:(?:his|her|their)\\s+(?:own\\s+)?)(?:hole|entrance|rim|ass|pucker)\\s+(?:with|against|on)\\s+(?:the\\s+(?:\\w+\\s+){0,2}?(?:tip|head|end)\\s+of\\s+)?(?:(?:a|the|his|her|their|that)\\s+)?(?:[\\w-]+\\s+){0,2}?(?:dildo|vibrator|vibe|butt\\s*plug|plug|beads|wand|bullet|toy)\\b`,
  },
];

// ───────────── Dialogue: what a speaker asks for or says they want ─────────────

export interface DialogueDef {
  cat: Cat;
  act: string;
  /** Role this line implies for the SPEAKER. */
  role: "top" | "bottom";
  kind: "said" | "identity" | "ogling";
  /** How much it counts (default 1). */
  weight?: number;
  re: RegExp;
}

const WANT = "(?:i\\s+)?(?:want|need|wanna|gonna|going|let me|i'm gonna|i’m gonna|i'll|i’ll|can i|could i|may i|i'd love|i’d love|i would love|i will|i'd like|i’d like|i've been dying|i’ve been dying|dying|desperate)";

export const DIALOGUE: DialogueDef[] = [
  // anal — speaker bottom
  { cat: "anal", act: "anal sex", role: "bottom", kind: "said", re: /(?<!\b(?:oh|well|ah|god|jesus)[,!]?\s)\bfuck me\b(?!\s+(?:with (?:your|that|those) (?:tongue|mouth|fingers?)|up|over|sideways|running|dead|this is|that's|that’s|i)\b)(?![,!]?\s*(?:that|this|it)(?:'s|’s| is| was)\b)/ },
  { cat: "anal", act: "anal sex", role: "bottom", kind: "said", re: new RegExp(`\\b${WANT}\\s+(?:to\\s+)?(?:feel\\s+)?(?:you|your (?:cock|dick)|it)\\s+(?:in(?:side)?|in me|deep(?:er)? in(?:side)?)\\s+me\\b`) },
  { cat: "anal", act: "anal sex", role: "bottom", kind: "said", re: /\b(?:want|need|wanna)\s+(?:you\s+)?to\s+(?:fuck|be inside|be in|breed|knot|fill|take|peg)\s+me\b/ },
  { cat: "anal", act: "anal sex", role: "bottom", kind: "said", re: /\b(?:want|need)\s+you\s+(?:inside|in)\s+me\b/ },
  { cat: "anal", act: "anal sex", role: "bottom", kind: "said", re: /(?:^|[.!?,]\s*|please,?\s+)(?:fill|breed|knot|pound|peg|wreck)\s+me\b/ },
  { cat: "anal", act: "anal sex", role: "bottom", kind: "said", re: new RegExp(`\\b${WANT}\\s+(?:to\\s+)?ride\\s+(?:you|your (?:cock|dick))\\b`) },
  { cat: "anal", act: "anal sex", role: "bottom", kind: "said", re: /\b(?:you|u) (?:can|could|should|get to|gotta|have to|wanna|want to) top\b|\blet you top\b/ },
  { cat: "anal", act: "anal sex", role: "bottom", kind: "said", re: /(?:^|[.!?,]\s*|please,?\s+|just\s+|now,?\s+)get (?:in|inside|in side) me\b|\bget in me\b/ },
  { cat: "anal", act: "anal sex", role: "bottom", kind: "identity", re: /\bi(?:'m|’m| am) (?:a |such a |more of a |usually a |kind of a |kinda a |total |power |a total |a power )?bottom\b/ },
  { cat: "anal", act: "anal sex", role: "bottom", kind: "identity", re: /\bi (?:usually |always |only |mostly |prefer to |like to |love to |want to |wanna |'d like to |’d like to |would like to |'d rather |’d rather )bottom\b/ },
  // anal — speaker top
  { cat: "anal", act: "anal sex", role: "top", kind: "said", re: new RegExp(`\\b${WANT}\\s+(?:to\\s+)?(?:fuck|breed|knot|be inside|be in|get inside|get in|peg|bend you over and fuck)\\s+you\\b(?!\\s+(?:up|over)\\b)`) },
  { cat: "anal", act: "anal sex", role: "top", kind: "said", re: /(?:^|[.!?,]\s*|please,?\s+|now,?\s+|c'mon,?\s+|come on,?\s+)ride me\b/ },
  { cat: "anal", act: "anal sex", role: "top", kind: "said", weight: 0.8, re: /\b(?:i'd|i would|i'll|i will|i'm gonna|i want to|i wanna) (?:have|get|bend|put) you (?:on the bed |on your back |on your knees |on your stomach |right )?(?:bent over|on your knees|on your back|on your stomach|spread out|face-down|face down)\b/ },
  { cat: "anal", act: "anal sex", role: "top", kind: "said", re: /\b(?:if anyone(?:'s| is) (?:going to|gonna) bottom|whoever bottoms),? it(?:'s| is| will be|'ll be) you\b/ },
  { cat: "anal", act: "anal sex", role: "top", kind: "said", re: new RegExp(`\\b${WANT}\\s+(?:to\\s+)?(?:come|cum)\\s+(?:in(?:side)?)\\s+you\\b`) },
  { cat: "anal", act: "anal sex", role: "top", kind: "said", re: /\b(?:you|u) (?:can|could|should|get to|gotta|have to|wanna|want to) bottom\b/ },
  { cat: "anal", act: "anal sex", role: "top", kind: "identity", re: /\bi(?:'m|’m| am) (?:a |such a |more of a |usually a |kind of a |kinda a |total |a total )?top\b(?!\s+(?:of|off|first|half|layer|shelf|drawer|floor|secret|priority|speed|dollar|notch))/ },
  { cat: "anal", act: "anal sex", role: "top", kind: "identity", re: /\bi (?:usually |always |only |mostly |prefer to |like to |love to |want to |wanna |'d like to |’d like to |would like to |'d rather |’d rather )top\b/ },
  // anal — said during sex: "you're so tight" (speaker is inside), "you're so big" (speaker is receiving)
  { cat: "anal", act: "anal sex", role: "top", kind: "said", weight: 0.8, re: /\byou(?:'re| are| feel| felt| were)\s+(?:so\s+|fucking\s+|still\s+|always\s+|perfect\s+and\s+)*tight\b|\byou feel (?:so )?(?:good|amazing|perfect|incredible|fucking good)? ?around me\b|\b(?:clench|squeez|tighten)\w* (?:around|on) me\b|(?<!\b(?:i|i'll|i’ll|i will|i'd|i’d|we|we'll|we’ll|i can|i could|i'd rather|i’d rather|i guess i'll|i guess i’ll)\s+)\btake (?:it(?=\s*(?:[,.!?]|$|\s+(?:all|deep|like|for me|baby|sweetheart|good|so well)\b))|my (?:cock|dick|knot)\b)/ },
  { cat: "anal", act: "anal sex", role: "bottom", kind: "said", weight: 0.8, re: /\byou(?:'re| are| feel| felt)\s+(?:so\s+|fucking\s+)*(?:big|huge|deep|thick)\b|\b(?:i'm|i’m|i am|i feel|feel|feels|i'm just)\s+so (?:full|deep)\b|^\W*so (?:full|deep)\b|\bso full of (?:you|your)\b|\bstretch(?:ing)? me\b|\b(?:need|want|crave)\s+(?:your|that)\s+(?:cock|dick|knot)\b(?!\s+in my mouth)/ },
  { cat: "anal", act: "anal sex", role: "top", kind: "said", weight: 0.7, re: /(?:^|[.!?,]\s*|now,?\s+|please,?\s+|just\s+)(?:bend over|turn over|on your (?:stomach|hands and knees)|spread (?:your legs|'em|them)|present yourself|show me (?:your|that) (?:hole|ass))\b/ },
  // oral — said during sex
  { cat: "oral", act: "blowjob", role: "top", kind: "said", weight: 0.8, re: /\byour mouth (?:feels|is|was|felt) (?:so )?(?:good|amazing|perfect|incredible|hot|fucking good)\b|\b(?:suck|swallow) (?:it|harder|deeper)\b/ },
  // anal — compliments as signals: an ass suggests the speaker tops, a cock that they bottom
  { cat: "anal", act: "checking out an ass", role: "top", kind: "ogling", re: /\b(?:nice|great|fantastic|gorgeous|perfect|amazing|fine|hot|sexy|incredible|unreal|cute|pretty|tight|fucking) (?:little )?(?:ass|arse|butt|bum)\b|\byour (?:ass|arse|butt) (?:is|looks)\b/ },
  { cat: "anal", act: "checking out a cock", role: "bottom", kind: "ogling", re: /\b(?:nice|great|gorgeous|perfect|amazing|big|huge|thick|beautiful|pretty|fucking) (?:fucking )?(?:cock|dick)\b|\byour (?:cock|dick) (?:is|looks|feels)\b/ },
  { cat: "oral", act: "checking out a cock", role: "bottom", kind: "ogling", re: /\b(?:nice|great|gorgeous|perfect|amazing|big|huge|thick|beautiful|pretty|fucking) (?:fucking )?(?:cock|dick)\b|\byour (?:cock|dick) (?:is|looks|feels)\b/ },
  // oral — speaker top (getting sucked, or eating ass)
  { cat: "oral", act: "blowjob", role: "top", kind: "said", re: /(?:^|[.!?,]\s*|please,?\s+|now,?\s+|c'mon,?\s+|come on,?\s+|just\s+)(?:suck (?:me|my (?:cock|dick))|blow me|swallow me|choke on (?:it|me|my (?:cock|dick)))\b/ },
  { cat: "oral", act: "blowjob", role: "top", kind: "said", re: new RegExp(`\\b${WANT}\\s+(?:to\\s+)?(?:fuck|use)\\s+your\\s+(?:mouth|throat|face)\\b`) },
  { cat: "oral", act: "blowjob", role: "top", kind: "said", re: new RegExp(`\\b${WANT}\\s+(?:to\\s+)?(?:come|cum)\\s+(?:in|down)\\s+your\\s+(?:mouth|throat)\\b`) },
  { cat: "oral", act: "blowjob", role: "top", kind: "said", re: /\b(?:want|need|wanna)\s+(?:you\s+)?to\s+(?:suck|blow)\s+me\b/ },
  { cat: "oral", act: "rimming", role: "top", kind: "said", re: new RegExp(`\\b${WANT}\\s+(?:to\\s+)?(?:eat you out|eat your (?:ass|arse)|rim you|taste your (?:ass|arse|hole)|lick (?:you|your hole) open|tongue-?fuck you|get my (?:mouth|tongue) on your (?:ass|arse|hole))\\b`) },
  { cat: "oral", act: "rimming", role: "top", kind: "said", re: /\bsit on my face\b/ },
  // oral — speaker bottom (sucking, or getting eaten)
  { cat: "oral", act: "blowjob", role: "bottom", kind: "said", re: new RegExp(`\\b${WANT}\\s+(?:to\\s+)?(?:suck (?:you(?: off)?|your (?:cock|dick))|blow you|taste your (?:cock|dick)|go down on you|get my mouth on (?:you|your (?:cock|dick))|choke on (?:you|your (?:cock|dick))|deep-?throat you)\\b`) },
  { cat: "oral", act: "blowjob", role: "bottom", kind: "said", re: /(?:^|[.!?,]\s*|please,?\s+|just\s+)(?:fuck|use) my (?:mouth|throat|face)\b/ },
  { cat: "oral", act: "blowjob", role: "bottom", kind: "said", re: /\b(?:come|cum) (?:in|down) my (?:mouth|throat)\b/ },
  { cat: "oral", act: "rimming", role: "bottom", kind: "said", re: /(?:^|[.!?,]\s*|please,?\s+|just\s+)(?:eat me out|rim me|lick me open|eat my (?:ass|arse)|tongue-?fuck me)\b/ },
  { cat: "oral", act: "rimming", role: "bottom", kind: "said", re: /\b(?:want|need|wanna)\s+(?:you\s+)?to\s+(?:eat me out|rim me|eat my (?:ass|arse))\b/ },
  { cat: "oral", act: "rimming", role: "bottom", kind: "said", re: /\b(?:want|need)\s+your\s+(?:tongue|mouth)\s+(?:in|on)\s+(?:me|my (?:ass|arse|hole))\b/ },
];

/** Sex-context vocabulary for patterns with innocent readings ("pushed into him" in a crowd). */
export const SEX_CTX =
  /\b(?:cock|dick|prick|hole|ass|arse|lube|lubed|slick|slicked|naked|thrust(?:s|ed|ing)?|moan(?:s|ed|ing)?|groan(?:s|ed|ing)?|fuck\w*|cum|come|came|coming|hard|erection|inside|prostate|butt-?hole|anus|nerves|stretch\w*|condom|bed|sheets|hips|orgasm|climax|rim\w*|tongue|knot|whimper\w*|gasp\w*|panting|pant\w*|sweat\w*|filthy|tight|wet|aching|strap|dildo|pussy|clit)\b/i;

export const PENIS_CTX = /\b(?:cock|dick|prick|length|shaft|erection|hard-?on|member|manhood|strap|dildo|knot|girth)\b/i;
export const ANAL_CTX =
  /\b(?:ass|arse|anal|anus|asshole|arsehole|butt-?hole|sphincter|rosebud|starfish|back ?door|back entrance|rings? of muscles?|(?:ass|arse|butt) crack|(?<!front[ -]?)hole|prostate|rim\w*|pegg\w*|cheeks|bum|butt)\b/i;
/** Vaginal vocabulary. Used instead of gender, since male omegas and trans men may have vaginas. */
export const VULVA_CTX =
  /\b(?:pussy|cunt|vagina\w*|labia|clit(?:oris)?|front[ -]?hole|vulva|cervix|t-?dick|(?:her|wet|slick|swollen) folds|(?:his|her|their|my|your)\s+(?:\w+\s+)?seam(?!\s+of))\b/i;
export const FINGER_CTX = new RegExp(`\\b${FINGERS}\\b`, "i");
