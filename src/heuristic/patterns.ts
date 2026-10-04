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
  /** Only read in an omegaverse work (alpha/beta/omega), where these gestures mean dominance or submission. */
  abo?: boolean;
  /** Only read in a work whose tags name a chastity device or cock cage, where being locked up means submission and holding the key means control. */
  chastity?: boolean;
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
  signal?: { kind: "ogling" | "touch" | "prep" | "fingers" | "solo" | "masturbation" | "handjob" | "behavior" | "stated" | "body" | "aftercare" | "position" | "petname"; actorRole: "top" | "bottom"; actor?: "t" | "b" };
}

export interface CompiledPattern extends PatternDef {
  re: RegExp;
  /** Cheap pre-check: the sentence must contain one of the pattern's verbs/nouns. */
  gate?: RegExp;
  /** Patterns with the same gate share an id, so a sentence is tested against each distinct gate only once. */
  gateId?: number;
  /** The subject isn't in the match; it's the nearest subject earlier in the sentence. */
  elided?: boolean;
}

const PENIS_ADJ =
  "hypersensitive|oversensitive|sensitive|hot|eager|desperate|needy|heavy|hard|thick|aching|leaking|throbbing|swollen|heavy|wet|slick|stiff|big|long|huge|rigid|straining|twitching|flushed|full|whole|fat|enormous|massive|monstrous|giant|gigantic|immense|wide|broad|tremendous|colossal|veiny|dripping|weeping|pretty|perfect|lubed|slicked|neglected|own|entire|impressive|spit-slick|spit-slicked|knotted|swelling|cut|uncut|red|angry|caged|locked|oversized|intrusive";
const ASS_ADJ =
  "puckered|winking|trembling|spasming|fucked-out|well-used|tender|velvety|silky|tiny|furled|tight|slick|wet|loose|puffy|stretched|sensitive|twitching|fluttering|clenching|quivering|eager|needy|empty|furled|pink|swollen|little|perfect|lubed|slicked|gaping|greedy|virgin|own|pretty|spit-slick|spit-slicked|dry|sloppy|abused|used|sore|hot|warm|soft|willing|waiting|untouched|clenched";
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
  // Patterns that begin with a possessive or a narrow phrase, where the gate can't be read off the verb group.
  "spread-open-nudge": "spread",
  "let-in": "let",
  "hips-against-ass": "hips|pelvis|thighs|balls",
  prostate: "prostate",
  "cock-at-lips": "mouth|lips|throat|tongue|face|teeth|cheek",
  "bobbed-head": "bob",
  "bobs-slowly": "bob",
  "looked-up-from-between": "between",
  "head-down-took": "head",
  "mouth-closed-around": "mouth|lips",
  "snug-around": "around",
  "self-own-fingers": "own",
  "sub-melt": "soft|pliant|limp|boneless|pliable",
  "sub-pinned": "pin|pushed|pressed|shoved|slammed|backed|manhandled|hauled",
  "wearing-plug": "plug|vibrator|vibe|beads",
  "hand-in-pants-poss": "hand",
  "cum-in-throat": "cum|come|spunk|jizz",
  "tongue-on-cock-area": "tongue|mouth|lips",
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
  const gateIds = new Map<string, number>();
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
    let gateId: number | undefined;
    if (gate) {
      gateId = gateIds.get(gate.source);
      if (gateId === undefined) { gateId = gateIds.size; gateIds.set(gate.source, gateId); }
    }
    out.push({ ...def, re: new RegExp(finalSrc, "g"), gate, gateId });

    // Same pattern with the subject left out: "Draco climbed on top and rode him".
    const lead = def.subj === "t" ? "\\b{T}\\s+{aux}" : "\\b{B}\\s+{aux}";
    if (def.src.startsWith(lead)) {
      const rest = src.slice(src.indexOf("(?<aux>"));
      // Also gerunds after "in favor of", "about", "before", "while"... ("in favor of licking his rim").
      const elided = `(?:\\band|\\bthen|,|\\b(?:of|about|before|after|while|by|without|from|to|kept|started|began|continued|finished|enjoyed|loved|tried|resumed))\\s+(?:then\\s+|finally\\s+|\\w+ly\\s+)?${rest}`;
      out.push({ ...def, id: `${def.id}~elided`, elided: true, weight: def.weight * 0.8, re: new RegExp(elided, "g"), gate, gateId });
    }
  }
  return out;
}

const SELF = "(?:himself|herself|themself|themselves|myself|yourself)";
const DEPTH = "(?:(?:back|forward|all the way|deep(?:er)?|slowly|carefully|home|fully|further|right|still|gently|roughly|finally|in|up|halfway|half-?way|partway|part way|a little|a bit|just|a few inches|an inch|inch by inch|slow|easily|swiftly|suddenly|so far|so deep|so deeply|as deep|as far|as deeply)\\s+)*";

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
    id: "lined-up-pressed-in",
    cat: "anal",
    act: "anal sex",
    subj: "t",
    weight: 0.9,
    needsCtx: true,
    src: `\\b{T}\\s+{aux}(?:lin(?:e|es|ed|ing)|position(?:s|ed|ing)?)\\s+(?:${SELF}\\s+)?up,?\\s+(?:and\\s+)?(?:then\\s+)?(?:press|push|slid|slide|sink|sank|eas)\\w*\\s+(?:slowly\\s+|carefully\\s+|gently\\s+)?(?:in|into|inside)\\s+{B}\\b`,
  },
  {
    id: "push-into",
    cat: "anal",
    act: "anal sex",
    subj: "t",
    weight: 1,
    needsCtx: true,
    src: `\\b{T}\\s+{aux}(?:push|slid|slide|slip|sink|sank|sunk|thrust|drove|drive|eas|sheath|bur(?:y|ie)|guid|snap|glid|fed|feed|wedg|nudg|forc|shov|plung|slam|pump|seat|slot|rut|ram|pound|fuck|rail|hammer|bang|drill|surg|sli|cram|stuff|jam|stab|shunt)\\w*\\s+(?:(?:${SELF}|it|{x's}\\s+{PENIS}|{x's}\\s+hips|the\\s+(?:head|tip)(?:\\s+of\\s+{x's}\\s+{PENIS})?|(?:a|the)\\s+(?:strap(?:-?on)?|dildo|toy|plug))\\s+)?(?:(?:\\w+ly|hard|harder|faster|fast|rough|roughly)\\s+)*${DEPTH}(?:(?:in(?:to|side)?(?:\\s+of)?)\\s+{B:ass}|(?:past|through)\\s+{B:assReq})`,
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
    id: "penis-into-him",
    cat: "anal",
    act: "anal sex",
    subj: "t",
    weight: 0.85,
    needsCtx: true,
    src: `\\b{T:penisReq}\\s+{aux}(?:\\w+\\s+){0,2}?(?:stab|slam|ram|driv|drove|pound|thrust|plung|surg|slid|slide|sank|sink|push)\\w*\\s+${DEPTH}(?:in(?:to|side)?|past)\\s+{B}(?![\\w'’])(?!\\s+(?:and|or)\\b)`,
  },
  {
    id: "spread-open-nudge",
    cat: "anal",
    act: "anal sex",
    subj: "t",
    weight: 0.6,
    needsCtx: true,
    src: `\\b{T}\\s+{aux}spread\\w*\\s+{B}(?:\\s+(?:legs|thighs|cheeks))?\\s+(?:open|apart|wide),?\\s+(?:\\w+\\s+){0,2}?(?:against|at|into)\\s+(?:his|her|their)\\s+(?:${ASS_ADJ}\\s+)?(?:hole|entrance|rim|ass)\\b`,
  },
  {
    id: "penis-fills",
    cat: "anal",
    act: "anal sex",
    subj: "t",
    weight: 0.9,
    needsCtx: true,
    src: `\\b{T:penisReq}\\s+{aux}(?:\\w+\\s+){0,2}?(?:fill|split|stretch|breach|enter|penetrat|open|spread|impal|claim|wreck|ruin|part|invad|spear|pierc|skewer)\\w*\\s+{B:ass}`,
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
    src: `\\b{T:penisReq}\\s+(?:(?:was|is|still|now|finally|fully|deep|all the way|balls-deep|buried|lodged|seated|sheathed|nestled|halfway|already|so)\\s+)*(?:(?<=\\s(?:was|is|still|now|finally|fully|deep|way|balls-deep|buried|lodged|seated|sheathed|nestled|halfway|already|so)\\s+)(?:in|up)|inside|within)\\s+{B:ass}`,
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
    src: `\\b{T}\\s+{aux}(?:enter(?:s|ed|ing)?|penetrat(?:e|es|ed|ing)|breach(?:es|ed|ing)?|impal(?:e|es|ed|ing)|spear(?:s|ed|ing)?)\\s+{B:ass}(?!\\s+with\\s+(?:him|her|them|me|you|us|(?:his|her|their|my|your)\\s+(?:tongue|fingers?|hands?|mouth))\\b)(?=\\s*[,.;:!?—–]|\\s*$|\\s+(?:with|in one|in a|slowly|carefully|from behind|hard|deep|all the way|inch|bare|raw|for the first time|again|at last|finally)\\b)`,
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
    // "the urge to sink down onto it": the cock is the one just mentioned.
    id: "riding-it",
    cat: "anal",
    act: "anal sex (riding)",
    subj: "b",
    weight: 0.7,
    needsCtx: true,
    src: `\\b{B}\\s+{aux}(?:(?:sink|sank|sinks|sinking|sunk|lower|lowers|lowered|lowering|ease|eases|eased|easing|slid|slide|slides|sliding|settl\\w*)\\s+(?:${SELF}\\s+)?(?:slowly\\s+|back\\s+|all the way\\s+)*down\\s+(?:on|onto)|ride|rode|riding|rides)\\s+it\\b(?!\\s+(?:out|off|like|as if|through|to\\b))`,
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
    src: `\\b{B}\\s+{aux}bottom(?:s|ed|ing)?\\b(?!\\s+(?:out|of|up|off|half|lip|arm|arms|hand|hands|leg|legs|drawer|step|line|shelf|teeth|tooth|row|left|right|corner|floor|button|bunk|edge|layer|end|part|side|door|rung|stair|stairs|sheet|dollar|price|feeder)\\b)(?:\\s+for\\s+{T})?`,
  },
  {
    id: "topped",
    cat: "anal",
    act: "anal sex",
    subj: "t",
    weight: 0.8,
    src: `\\b{T}\\s+{aux}top(?:s|ped|ping)?\\b(?!\\s+(?:up|off|of|with|the|it|that|this|out|his|her|their|my|your|a|an|to|and|grades?|marks?|scores?|rankings?|charts?)\\b|\\s*-)(?:\\s+{B})?`,
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
    src: `\\b{T}\\s+{aux}(?:push|slid|slide|slip|eas|press|work|crook|curl|sink|sank|thrust|add|scissor|twist|insert|wiggl|drove|driv|guid|teas|circl|rub)\\w*\\s+(?:(?:a|one|two|three|four|another|the|{x's}|first|second|third|slick|lubed|wet|long|thick|blunt|slender|slim|thin|gloved|calloused|single|index|middle)\\s+){0,3}${FINGERS}\\s+(?:(?:back|deep(?:er)?|slowly|all the way|further|carefully|gently|in|up|down)\\s+)*(?:in(?:to|side)?(?:\\s+of)?|past|through|around|against|over|at)\\s+{B:ass}(?!-?\\s*cheeks?\\b)`,
  },
  {
    id: "fingers-inside",
    cat: "anal",
    act: "fingering",
    subj: "t",
    weight: 0.9,
    needsCtx: true,
    src: `\\b{T:poss}\\s+(?:[\\w-]+\\s+){0,2}?${FINGERS}\\s+(?:\\w+\\s+){0,3}?(?:in|into|inside|past|stretching|opening|scissoring|crooked inside|curled inside|pressed into|working|circling|teasing|rubbing)\\s+{B:ass}(?!-?\\s*cheeks?\\b)`,
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
    kw: "suck|slurp|nurs|blow|blew|mouth|deep-?throat|swallow|gag|chok|bob|worship",
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 1,
    femaleTarget: "drop",
    src: `\\b{B}\\s+{aux}(?:suck(?:s|ed|ing)?|slurp(?:s|ed|ing)?(?=\\s+(?:on|at)\\b)|nurs(?:e|es|ed|ing)(?=\\s+(?:on|at)\\b)|suckl(?:e|es|ed|ing)(?=\\s+(?:on|at)\\b)|blow|blows|blew|blowing|mouth(?:s|ed|ing)?(?=\\s+(?:\\w+ly\\s+)?at\\b)|deep-?throat(?:s|ed|ing)?|swallow(?:s|ed|ing)?\\s+(?:down|around)|gag(?:s|ged|ging)?\\s+on|chok(?:e|es|ed|ing)\\s+on|bob(?:s|bed|bing)?\\s+(?:\\w+\\s+){0,2}?on|worship(?:s|ped|ping)?)\\s+(?:\\w+ly\\s+)?(?:on\\s+|at\\s+|over\\s+)?(?:the\\s+(?:[\\w-]+\\s+)?(?:head|tip|crown|base|shaft|length|underside)\\s+of\\s+)?{T:penis}(?!\\s+(?:a kiss|kisses|away|out of the water|off (?:to|for|as)|in(?:to)? (?:his|her|their) arms)\\b)`,
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
    src: `\\b{T}\\s+{aux}(?:fed|feeds|feed|feeding|guid(?:e|es|ed|ing)|push(?:es|ed|ing)?|press(?:es|ed|ing)?|slid|slide|slides|sliding|slip|slips|slipped|slipping)\\s+(?:{x's}\\s+{PENIS}|${SELF})\\s+(?:(?:\\w+)\\s+){0,2}?(?:in(?:to)?|between|past|to|against)\\s+{B:mouthReq}`,
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
    src: `\\b{B}\\s+{aux}(?:(?:press|drag|run|ran|rub|slid|slide|trac|swip)\\w*\\s+(?:his|her|their|my|your)\\s+(?:(?:open|parted|hot|wet|warm)\\s+)?(?:tongue|lips|mouth|face|nose)\\s+(?:\\w+\\s+)?(?:against|along|over|across|on|into)|(?:mouth|nuzzl|lick|kiss|suck|mouth)\\w*\\s+(?:at|along|over|against|on))\\s+(?:the\\s+(?:\\w+\\s+)?(?:bulge|outline|erection|hardness|tent|front|fly)\\s+(?:in|of|under|beneath|through)\\s+)?{T:poss}\\s+(?:\\w+\\s+)?(?:underwear|boxers|briefs|jeans|pants|trousers|shorts|sweatpants|cotton|fly|zipper|crotch)\\b`,
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
    src: `\\b{B}\\s+{aux}(?:roll|swirl|circl|flick|trac|run|ran|slid|slip|work|press|drag|lap)\\w*\\s+(?:the\\s+(?:back|flat|tip)\\s+of\\s+)?(?:his|her|their|my|your)\\s+tongue\\s+(?:\\w+\\s+)?(?:around|over|across|along|against|on|up|down)\\s+(?:the\\s+(?:\\w+\\s+)?(?:head|tip|crown|slit|underside|shaft|length|base)(?:\\s+of\\s+{T:penis})?|{T:penisReq})`,
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
    src: `\\b{T}\\s+{aux}(?:(?:lick|tongu|lap|kiss|suck|nuzzl|mouth|nibbl|lav|flick|swirl)\\w*\\s+(?:(?:his|her|their|my|your)\\s+tongue\\s+)?(?:\\w+ly\\s+)?|(?:drag|ran|run|trac|slid|slide|slip|press|push|work|dip|delv|point|thrust|stab|flatten)\\w*\\s+(?:(?:his|her|their|my|your)\\s+)?(?:\\w+\\s+)?tongue\\s+)(?:(?:into|at|over|across|around|along|against|inside|in|up|down|on|between|past|the rim of|the length of|a\\s+(?:\\w+\\s+){0,2}?(?:stripe|line|path|trail)\\s+(?:with\\s+(?:his|her|their|my|your)\\s+tongue\\s+)?(?:up|along|down|over|across))\\s+)*{B:rimReq}(?!-?\\s*cheeks?\\b)`,
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
    src: `\\b{T:poss}\\s+tongue\\s+(?:\\w+,?\\s+){0,4}?(?:in|into|inside|deep in|deep inside|past)\\s+{B}\\b`,
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
    src: `\\b{T}\\s+{aux}(?:push|slid|slide|slip|sink|sank|thrust|eas|sheath|guid|rock|snap|fuck|press)\\w*\\s+(?:${SELF}\\s+)?(?:(?:back|forward|slowly|carefully|deep|all the way|right|finally|gently)\\s+)*(?:in|inside|home)(?![\\w-])(?!\\s*(?:to|the|a|an|his|her|their|my|your|front|back|line|time|place|close|closer|between|with|for|on|at|of|and then the|next|beside|quietly|silently|unnoticed|behind|alongside|among|near|opposite|across|beneath|under|over|after|before|through|from|hesitantly|nervously|awkwardly|response|return|reply|answer|anger|fear|surprise|kind|turn|retaliation|defen[cs]e|reaction)\\b)(?!\\s+[\\w-]+['’]s\\b)`,
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
    // "The count stroked his fingers in and out of Jack's mouth": the mouth's owner is sucking them.
    id: "fingers-in-out-mouth",
    cat: "oral",
    act: "sucking on fingers",
    subj: "t",
    weight: 0.5,
    needsCtx: true,
    signal: { kind: "fingers", actorRole: "bottom", actor: "b" },
    src: `\\b{T}\\s+{aux}(?:strok|fuck|work|pump|slid|slide|slip|push|thrust|press|dipp?|mov|rubb?)\\w*\\s+(?:(?:his|her|their|my|your|two|three|a|one|the|another)\\s+)?(?:[\\w-]+\\s+){0,2}?(?:fingers?|thumb|digits?)\\s+(?:\\w+\\s+)?(?:in\\s+and\\s+out\\s+of|in\\s+and\\s+out|over|across|along|against)\\s+{B:poss}\\s+(?:(?:${MOUTH_ADJ})\\s+)?(?:mouth|lips|tongue)`,
  },
  {
    // "his cock rutted against the line of Steve's ass": dry humping, the one rubbing is on top.
    id: "rut-against-ass",
    cat: "anal",
    act: "grinding against an ass",
    subj: "t",
    weight: 0.6,
    signal: { kind: "touch", actorRole: "top" },
    src: `\\b(?:{T}|{T:penisReq})\\s+{aux}(?:rut|grind|ground|rock|rubb?|press|hump)\\w*\\s+(?:(?:\\w+ly|harder|closer|slowly)\\s+)?(?:(?:his|her|their)\\s+(?:${PENIS}|crotch|hips|groin|bulge)\\s+)?(?:up\\s+)?(?:against|into|on|along|over)\\s+(?:the\\s+(?:line|curve|swell|crease|cleft|seam)\\s+of\\s+)?{B:poss}\\s+(?:\\w+\\s+)?(?:ass|arse|butt|cheeks|backside)`,
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
    src: `\\b{B}\\s+{aux}(?:fuck|rid|rode|bounc|rock|grind|ground|sink|sank|thrust|lower|work|impal)\\w*\\s+(?:${SELF}\\s+)?(?:\\w+ly\\s+)?(?:back\\s+|down\\s+)*(?:(?:on(?:to)?|with)\\s+)?(?:a|the|his|her|my|their)\\s+(?:own\\s+)?(?:[\\w-]+\\s+){0,2}?(?:dildo|toy|vibrator|vibe|plug)s?\\b(?!\\s+out\\b)(?!\\s+(?:\\w+\\s+)?(?:into|inside|in|up|against)\\s+(?!himself|herself|themself|themselves|myself|his|her|their|my|the)\\w)`,
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
    src: `\\b{B}\\s+{aux}(?:spread|parted|opened|spreads|parts|opens|spreading|parting|opening)\\s+(?:his|her|their|my|your)\\s+(?:legs|thighs|knees)(?!(?:\\s+(?:apart|wide|open|further|farther))?${BETWEEN_THEM})(?:\\s+(?:wider\\s+|wide\\s+)?for\\s+{T})?`,
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
    src: `\\b{B}\\s+{aux}(?:got|get|gets|getting|went|go|goes|dropped|climbed|crawled|settled|was|were|is|rolled|turned|flipped)\\s+(?:over\\s+)?(?:down\\s+)?on(?:to)?\\s+(?:his|her|their|my|your)\\s+(?:hands and knees|(?:stomach|belly|front)(?=[^.!?]{0,40}\\b(?:ass|arse|hips|butt|presenting)\\b))`,
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
    // "arched his back", "his back arched off the bed", "arching up into him": a bottom's yielding posture
    id: "arch-back",
    cat: "anal",
    kw: "arch",
    act: "arching their back",
    subj: "b",
    weight: 0.3,
    needsCtx: true,
    signal: { kind: "touch", actorRole: "bottom" },
    src: `\\b(?:{B}\\s+{aux}arch\\w*\\s+(?:his|her|their|my|your)\\s+(?:back|spine)|{B:poss}\\s+(?:back|spine)\\s+(?:arch|bow)\\w*)(?![\\w-])`,
  },
  {
    // "arched his ass up", "arching his hips back toward Dean": offering the ass
    id: "arch-ass",
    cat: "anal",
    kw: "arch",
    act: "arching their ass up",
    subj: "b",
    weight: 0.5,
    needsCtx: true,
    signal: { kind: "touch", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}arch\\w*\\s+(?:his|her|their|my|your)\\s+(?:ass|arse|butt|bum|hips|backside)\\s+(?:up|back|higher|toward|towards|into|against|off|for)(?![\\w-])`,
  },
  {
    id: "grind-ass-back",
    cat: "anal",
    act: "grinding back",
    subj: "b",
    weight: 0.6,
    signal: { kind: "touch", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:push|press|grind|ground|rock|arch|wiggl|shimm|back|rut)\\w*\\s+(?:his|her|their|my|your)\\s+(?:(?:ass|arse|butt|bum)\\s+(?:back\\s+|up\\s+)?|hips\\s+back\\s+)(?:against|into|onto|toward|towards)\\s+{T:penis}`,
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
    src: `\\b{T}\\s+{aux}(?:pinn?ed|pins|pinning|press(?:ed|es|ing)|shov(?:ed|es|ing)|slam(?:med|s|ming)|back(?:ed|s|ing)|crowd(?:ed|s|ing))\\s+{B}\\s+(?:up\\s+)?(?:against|to(?!\\s+(?:the\\s+)?(?:side|ground|floor)\\b)|onto|into\\s+(?:the\\s+)?(?:wall|door|bed|mattress|couch|sofa|counter|table|desk|floor|car|hood|locker|pillow|sheets|cushions?)|down\\s+(?:on|onto|against|into))\\b`,
  },
  {
    id: "dom-take-control",
    cat: "vibe",
    act: "taking control",
    subj: "t",
    weight: 0.6,
    signal: { kind: "behavior", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:took|takes|taking|seiz(?:ed|es|ing))\\s+(?:control|charge|the lead|command)\\b(?!\\s+of\\s+(?!him\\b|her\\b|them\\b|the\\s+(?:kiss|pace|moment)\\b))`,
  },
  {
    id: "dom-grip",
    cat: "vibe",
    act: "gripping firmly",
    subj: "t",
    weight: 0.6,
    signal: { kind: "behavior", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:grip(?:ped|s|ping)?|grabb?ed|grabs|grabbing|caught|catch(?:es)?|tugg?ed|tugs|tugging|yank(?:ed|s|ing)|fisted)\\s+{B:poss}\\s+(?:\\w+\\s+)?(?:chin|jaw|hair|wrists?|nape|neck|throat|collar)\\b`,
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
    src: `\\b{T}\\s+{aux}(?:lift(?:ed|s|ing)|carr(?:ied|ies|ying)|hoist(?:ed|s|ing)|scoop(?:ed|s|ing)|swept|heav(?:ed|es|ing))\\s+{B}\\s+(?:up\\s+)?(?:into|onto|off|over|against|in|to|out\\s+of|up\\s+(?:the|to)|down)\\b`,
  },
  {
    id: "dom-protect",
    cat: "vibe",
    act: "protecting someone",
    subj: "t",
    weight: 0.5,
    signal: { kind: "behavior", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:shield\\w*|protect\\w*|stepp?ed\\s+in\\s+front\\s+of|stood\\s+in\\s+front\\s+of|(?:stepp?ed|moved|put\\s+(?:himself|herself|themselves))\\s+between)\\s+{B}\\b`,
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
    src: `\\b{B}\\s+{aux}(?:melt(?:ed|s|ing)|sag(?:ged|s)|went|goes|go)\\s+(?:soft|pliant|limp|boneless|pliable)\\b`,
  },
  {
    id: "sub-yield",
    cat: "vibe",
    act: "submitting",
    subj: "b",
    weight: 0.6,
    signal: { kind: "behavior", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:submit(?:ted|s)?|yield(?:ed|s)?|surrender(?:ed|s)?)\\s+(?:(?:completely|utterly|fully|willingly|instantly|beautifully|totally|finally|easily)\\s+)*to\\s+{T}(?![\\w'’])`,
  },
  {
    id: "sub-yield-self",
    cat: "vibe",
    act: "submitting",
    subj: "b",
    weight: 0.6,
    signal: { kind: "behavior", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:submit(?:ted|s)?|yield(?:ed|s)?|surrender(?:ed|s)?)\\s+(?:${SELF}|completely|utterly|fully|totally|entirely)(?![\\w-])`,
  },
  {
    id: "sub-let-lead",
    cat: "vibe",
    act: "letting someone lead",
    subj: "b",
    weight: 0.6,
    signal: { kind: "behavior", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:let|lets|allow(?:ed|s)?)\\s+{T}\\s+(?:take|lead|take\\s+over|take\\s+charge|set|decide|undress|strip)\\b(?!\\s+(?:over\\s+)?(?:the|a|an|his|her|their|my|your)\\s+(?:job|shop|store|business|route|territory|campaign|game|band|show|town|run|operation|work|shift|class|club|case|dungeon|table|plan|lead))`,
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
    src: `\\b{T}\\s+{aux}(?:(?:cupp?ed|cups|held|holds|gripp?ed|grips|caught)\\s+{B:poss}\\s+(?:jaw|chin|face)\\s*,?\\s*(?:and\\s+)?(?:then\\s+)?(?:tilt|lift|angl|tip|jerk)\\w*\\s+(?:(?:his|her|their|the)\\s+)?(?:chin|head|face|jaw)|(?:tilt|lift|angl|tip|jerk)\\w*\\s+[A-Z][\\w-]*['’]s\\s+(?:chin|head|face|jaw))\\s+(?:up|back|toward|towards|to)\\b`,
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
    src: `\\b{T}\\s+{aux}(?:rubb?ed|palm\\w*|cupp?ed|cups|squeez\\w*|stroked|strokes|grop\\w*|massag\\w*|pressed|trac\\w*|follow\\w*)\\s+(?:(?:his|her|their)\\s+(?:palm|hand|fingers?)\\s+)?(?:over|against|along|on)?\\s*(?:the\\s+)?(?:bulge|outline|hardness|erection|tent)\\s+(?:in|of|under)\\s+{B:poss}\\b`,
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
  {
    // "licked lightly at the head of Eddie's dick", "licks at the head"
    id: "licked-head-at",
    dedupe: true,
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.8,
    needsCtx: true,
    src: `\\b{B}\\s+{aux}(?:lick|lap|tongu|nuzzl|kiss|suck|swirl|flick)\\w*\\s+(?:\\w+ly\\s+)?(?:at|around|on|over)\\s+the\\s+(?:[\\w-]+\\s+){0,2}?(?:head|tip|slit|crown)\\b(?:\\s+of\\s+{T:poss}\\s+(?:[\\w-]+\\s+)?(?:cock|dick|prick|length))?`,
  },
  {
    // "took the head into his mouth", "sucked the tip between his lips"
    id: "took-head-mouth",
    dedupe: true,
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.9,
    needsCtx: true,
    src: `\\b{B}\\s+{aux}(?:took|takes|taking|sucked|sucks|sucking|drew|draws|pulled|guided)\\s+the\\s+(?:[\\w-]+\\s+){0,2}?(?:head|tip|crown)(?:\\s+of\\s+{T:poss}\\s+(?:[\\w-]+\\s+)?(?:cock|dick|prick|length))?\\s+(?:in(?:to)?|between)\\s+(?:{x's}\\s+)?(?:mouth|lips)`,
  },
  {
    // "hot cum hit the back of Steve's throat", "cum filled his mouth"
    id: "cum-in-throat",
    dedupe: true,
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.9,
    src: `\\b(?:hot|warm|thick|sticky|salty|bitter)?\\s*(?:cum|come|spunk|jizz)\\s+(?:hit|hits|splash\\w*|fill\\w*|flood\\w*|coat\\w*|spurt\\w*|shot|shoots|pulse\\w*|spill\\w*)\\s+(?:the\\s+back\\s+of\\s+|in(?:to)?\\s+|down\\s+|across\\s+)?{B:poss}\\s+(?:throat|mouth|tongue|lips)`,
  },
  {
    // "Steve's tongue burying itself … under his dick and over his balls"
    id: "tongue-on-cock-area",
    dedupe: true,
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.7,
    needsCtx: true,
    src: `\\b{B:poss}\\s+(?:tongue|mouth|lips)\\s+(?:[\\w,-]+\\s+){0,18}?(?:over|under|along|against|around|on|down)\\s+{T:poss}\\s+(?:balls|sac|dick|cock|shaft|length|crotch)\\b`,
  },
  {
    // "Steve's ass strangles his cock", "his hole squeezed around Eddie's cock"
    id: "ass-grips-cock",
    cat: "anal",
    act: "anal sex",
    subj: "b",
    weight: 0.9,
    needsCtx: true,
    src: `\\b{B:assReq}\\s+{aux}(?:strangl|squeez|grip|clench|hug|constrict|milk|swallow|choke|flutter|pulse|tighten|clamp|suck)\\w*\\s+(?:(?:around|on|down on|over)\\s+)?{T:penisReq}`,
  },
  // ───────────── VIBE: stated preference, body after sex, position and initiative, aftercare, pet names ─────────────
  {
    // "He liked being on top", "she loved being in control", "preferred topping"
    id: "stated-top-pref",
    kw: "like|love|prefer|enjoy|crave",
    cat: "anal",
    act: "saying they like to top",
    subj: "t",
    weight: 0.8,
    signal: { kind: "stated", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:\\w+\\s+){0,2}?(?:like[sd]?|love[sd]?|prefer(?:s|red)?|enjoy(?:s|ed)?|crave[sd]?)\\s+(?:being\\s+(?:(?:the\\s+one|Epithet\\d+)\\s+)?(?:on\\s+top|in\\s+control|in\\s+charge|the\\s+top|(?:(?:the\\s+one|Epithet\\d+)\\s+)?(?:who\\s+)?(?:fuck(?:s|ed|ing)?|top(?:s|ped)?|in\\s+charge))|topping(?![\\w-])|taking\\s+charge|being\\s+(?:the\\s+one|Epithet\\d+)\\s+(?:who\\s+)?(?:fuck(?:s|ed|ing)?|top(?:s|ped)?))(?![\\w-])`,
  },
  {
    // "He liked being fucked", "loved getting filled", "preferred to bottom"
    id: "stated-bottom-pref",
    kw: "like|love|prefer|enjoy|crave",
    cat: "anal",
    act: "saying they like to bottom",
    subj: "b",
    weight: 0.8,
    signal: { kind: "stated", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:\\w+\\s+){0,2}?(?:like[sd]?|love[sd]?|prefer(?:s|red)?|enjoy(?:s|ed)?|crave[sd]?)\\s+(?:being\\s+(?:fucked|filled|taken(?!\\s+care)|stretched|bottomed|topped|bred|railed|pounded|used\\s+(?:and|like)|on\\s+the\\s+bottom|underneath)|getting\\s+(?:fucked|filled|taken|stretched|pounded|railed|bred|topped)|to\\s+be\\s+(?:fucked|filled|taken|topped|stretched|bred)|bottoming(?![\\w-])|to\\s+bottom(?![\\w-])|taking\\s+(?:it|cock|dick))(?![\\w-])`,
  },
  {
    // "He had always been the one who topped", "he's always been the type to take charge"
    id: "always-the-one-top",
    kw: "always",
    cat: "anal",
    act: "always the one who tops",
    subj: "t",
    weight: 0.8,
    signal: { kind: "stated", actorRole: "top" },
    src: `\\b{T}(?:['’]s|['’]d|\\s+(?:had|has|was|is|would|will))\\s+always\\s+(?:been\\s+)?(?:(?:the\\s+)?(?:one|type|kind|guy|man|person)|Epithet\\d+)\\s+(?:who|to|that)\\s+(?:top(?:s|ped)?|fuck(?:s|ed)?|tak(?:e|es)\\s+charge|took\\s+charge|lead|led|call(?:s|ed)?\\s+the\\s+shots|be\\s+on\\s+top|do\\s+the\\s+fucking|was\\s+on\\s+top)(?![\\w-])`,
  },
  {
    // "He had always been the one who got fucked", "the type to bottom"
    id: "always-the-one-bottom",
    kw: "always",
    cat: "anal",
    act: "always the one who bottoms",
    subj: "b",
    weight: 0.8,
    signal: { kind: "stated", actorRole: "bottom" },
    src: `\\b{B}(?:['’]s|['’]d|\\s+(?:had|has|was|is|would|will))\\s+always\\s+(?:been\\s+)?(?:(?:the\\s+)?(?:one|type|kind|guy|man|person)|Epithet\\d+)\\s+(?:who|to|that)\\s+(?:bottom(?:s|ed)?|got\\s+fucked|get\\s+fucked|took\\s+it|take\\s+it|was\\s+fucked|be\\s+fucked|submit(?:s|ted)?|follow(?:s|ed)?|let\\s+(?:the\\s+other|someone|others)|was\\s+on\\s+the\\s+bottom|be\\s+on\\s+the\\s+bottom)(?![\\w-])`,
  },
  {
    id: "body-sore-ass",
    kw: "sore|raw|tender|stretched|used|loose|open|empty|aching|achy|fucked|wrecked",
    cat: "anal",
    act: "loose or sore after sex",
    subj: "b",
    weight: 0.8,
    needsCtx: true,
    signal: { kind: "body", actorRole: "bottom" },
    src: `\\b{B:assReq}\\s+{aux}(?:was|were|felt|feels|ached|throbbed|burned|stung|hurt)\\s+(?:\\w+\\s+){0,2}?(?:sore|raw|tender|stretched|used|loose|open|empty|aching|achy|well-fucked|fucked-out|wrecked)(?![\\w-])`,
  },
  {
    // "still slightly sore from being stretched open", "aching from being fucked"
    id: "body-sore-from",
    kw: "sore|aching|tender|raw",
    cat: "anal",
    act: "loose or sore after sex",
    subj: "b",
    weight: 0.7,
    needsCtx: true,
    signal: { kind: "body", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:(?:\\w+ly\\s+)?(?:squirm|shift|wince|winc)\\w*\\s+(?:in\\s+(?:the|his|her|their)\\s+\\w+,?\\s+)?)?(?:still\\s+)?(?:\\w+ly\\s+)?(?:sore|aching|achy|tender|raw)\\s+(?:from|after)\\s+(?:being\\s+|having\\s+been\\s+)(?:stretched|fucked|opened|taken|filled|used|ridden|pounded|bred|knotted|plowed|wrecked)\\b`,
  },
  {
    id: "body-sore-person",
    kw: "sore|tender",
    cat: "anal",
    act: "loose or sore after sex",
    subj: "b",
    weight: 0.7,
    needsCtx: true,
    needs: /\b(?:ass|arse|hole|rim|fucked|inside|thighs|cock|dick|last night|night before|morning after)\b/i,
    signal: { kind: "body", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:was|were|felt|feel|still|got|woke|ached)\\s+(?:up\\s+)?(?:\\w+\\s+){0,2}?(?:sore|tender)(?![\\w-])`,
  },
  {
    id: "body-walk-funny",
    kw: "walk|mov|limp|hobbl|stagger|shuffl|waddl|sat|sit|lower|wince",
    cat: "anal",
    act: "walking gingerly after sex",
    subj: "b",
    weight: 0.8,
    needsCtx: true,
    needs: /\b(?:ass|arse|hole|rim|fucked|inside|thighs|cock|dick|last night|night before|morning after|come|cum)\b/i,
    signal: { kind: "body", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:(?:walk|mov|limp|hobbl|stagger|shuffl|waddl)\\w*\\s+(?:\\w+\\s+){0,2}?(?:funny|gingerly|stiffly|bowlegged|bow-legged|carefully|with a (?:slight |small |faint |noticeable )?(?:limp|wince|hitch|waddle))|(?:sat|sit|sits|sitting|lower(?:ed|s|ing)\\s+${SELF})\\s+(?:down\\s+)?(?:gingerly|carefully|slowly|with a (?:wince|hiss|grimace))|wince[ds]?\\s+(?:as|when|while)\\s+(?:he|she|they)\\s+(?:sat|sit|lowered|moved|shifted))`,
  },
  {
    id: "body-full",
    kw: "full|filled|stuffed|stretched|split",
    cat: "anal",
    act: "feeling full",
    subj: "b",
    weight: 0.7,
    needsCtx: true,
    needs: /\b(?:cock|dick|prick|knot|inside|ass|hole|fucked|fucking|thrust\w*|buried|deep)\b/i,
    signal: { kind: "body", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:felt|feels|feel|was|were|is)\\s+(?:so\\s+|deliciously\\s+|wonderfully\\s+|incredibly\\s+|obscenely\\s+|completely\\s+|impossibly\\s+)*(?:full|filled|stuffed|stretched\\s+(?:wide|open|around)|split\\s+open)(?![\\w-])`,
  },
  {
    id: "body-leaking-from",
    kw: "leak|drip|dribbl|trickl|seep|ooz|slid|slipp|spill|ran|run",
    cat: "anal",
    act: "leaking come",
    subj: "b",
    weight: 0.8,
    needsCtx: true,
    signal: { kind: "body", actorRole: "bottom" },
    src: `\\b(?:[Cc]ome|[Cc]um|[Ss]eed|[Ss]lick|[Ll]ube|[Rr]elease)\\s+(?:was\\s+|were\\s+|began\\s+to\\s+|started\\s+to\\s+)?(?:leak|dripp?|dribbl|trickl|seep|ooz|slid|slipp|spill|run|ran|spilled)\\w*\\s+(?:out\\s+of|from|down|out\\s+of\\s+and\\s+down)\\s+{B:assReq}`,
  },
  {
    id: "body-leaking-ass",
    kw: "leak|drip|dribbl|ooz",
    cat: "anal",
    act: "leaking come",
    subj: "b",
    weight: 0.8,
    needsCtx: true,
    signal: { kind: "body", actorRole: "bottom" },
    src: `\\b{B:poss}\\s+(?:\\w+\\s+)?(?:ass|arse|hole|entrance|rim|opening|pussy|cunt)\\s+{aux}(?:leak|dripp?|dribbl|ooz)\\w*`,
  },
  {
    id: "body-clench-empty",
    kw: "nothing|air|empty|something|more",
    cat: "anal",
    act: "clenching around nothing",
    subj: "b",
    weight: 0.8,
    needsCtx: true,
    signal: { kind: "body", actorRole: "bottom" },
    src: `\\b{B:assReq}\\s+{aux}(?:clench|flutter|twitch|spasm|pulse|squeez|tighten|contract|ach)\\w*\\s+(?:\\w+\\s+){0,2}?(?:around\\s+(?:nothing|empty\\s+air|the\\s+empty\\s+air|the\\s+emptiness|air)|on\\s+(?:nothing|air|empty\\s+air)|for\\s+(?:something|more|him|her|them))`,
  },
  {
    id: "body-felt-empty",
    kw: "empty|hollow",
    cat: "anal",
    act: "feeling empty",
    subj: "b",
    weight: 0.6,
    needsCtx: true,
    needs: /\b(?:cock|dick|prick|knot|inside|ass|hole|fucked|pulled out|withdr\w+|slid out)\b/i,
    signal: { kind: "body", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:felt|feel|feels|was|were)\\s+(?:so\\s+|suddenly\\s+|painfully\\s+|unbearably\\s+|achingly\\s+)*(?:empty|hollow)(?![\\w-])`,
  },
  {
    id: "pos-pull-lap",
    kw: "lap|thighs|knee",
    cat: "vibe",
    act: "pulling someone onto their lap",
    subj: "t",
    weight: 0.5,
    signal: { kind: "position", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:pull|haul|drag|tug|guid|lift|coax|settl|gather|dr[ae]w)\\w*\\s+{B}\\s+(?:\\w+\\s+){0,2}?(?:onto|into|on)\\s+(?:his|her|their)\\s+(?:lap|thighs|knee|knees)(?![\\w-])`,
  },
  {
    id: "pos-climb-lap",
    kw: "lap|thighs|hips",
    cat: "vibe",
    act: "climbing into someone's lap",
    subj: "b",
    weight: 0.3,
    needsCtx: true,
    signal: { kind: "position", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:climb|crawl|settl|sink|sank|slid|slip|scrambl)\\w*\\s+(?:\\w+\\s+){0,2}?(?:into|onto|in)\\s+{T:poss}\\s+lap(?![\\w-])`,
  },
  {
    id: "pos-pin-wrists",
    kw: "wrist|hands|arms",
    cat: "vibe",
    act: "pinning someone's wrists",
    subj: "t",
    weight: 0.55,
    signal: { kind: "position", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:pinn?|held|hold|trapp?|restrain|cuff|bound|bind|tied|tie)\\w*\\s+{B:poss}\\s+(?:wrists?|hands|arms)\\s+(?:\\w+\\s+){0,2}?(?:above|over|against|down|behind)(?![\\w-])`,
  },
  {
    id: "pos-wrists-held",
    kw: "wrist|hands|arms",
    cat: "vibe",
    act: "having their wrists held",
    subj: "b",
    weight: 0.45,
    signal: { kind: "position", actorRole: "bottom" },
    src: `\\b{B:poss}\\s+(?:wrists?|hands|arms)\\s+(?:were|was|got|are|is)\\s+(?:pinn?ed|held|pressed|trapped|bound|tied|cuffed|restrained)\\s+(?:\\w+\\s+){0,2}?(?:above|over|against|to|down|behind)(?![\\w-])`,
  },
  {
    id: "aftercare-clean",
    kw: "clean|wip|wash|bath|towel|dab|sponge",
    cat: "vibe",
    act: "cleaning someone up",
    subj: "t",
    weight: 0.5,
    needsCtx: true,
    signal: { kind: "aftercare", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:clean|wip|wash|bath|towel|dab|sponge)\\w*\\s+{B}\\s+(?:\\w+\\s+){0,2}?(?:up|off|down|clean)(?![\\w-])`,
  },
  {
    id: "aftercare-wrap",
    kw: "wrap|tuck|cover|drap",
    cat: "vibe",
    act: "wrapping someone up",
    subj: "t",
    weight: 0.5,
    needsCtx: true,
    signal: { kind: "aftercare", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:wrapp?|tucked?|cover|drap)\\w*\\s+{B}\\s+(?:up\\s+)?(?:in|with|under)\\s+(?:a|the|his|her|their)\\s+(?:blanket|towel|robe|sheet|duvet|quilt|jacket|cloak)`,
  },
  {
    id: "aftercare-held",
    kw: "close|chest|arms",
    cat: "vibe",
    act: "being held afterwards",
    subj: "t",
    weight: 0.35,
    needsCtx: true,
    signal: { kind: "aftercare", actorRole: "bottom", actor: "b" },
    src: `\\b{T}\\s+{aux}(?:gather|tuck|cradl|hold|held|cuddl)\\w*\\s+{B}\\s+(?:\\w+\\s+){0,2}?(?:close|to\\s+(?:his|her|their)\\s+chest|against\\s+(?:his|her|their)\\s+chest|into\\s+(?:his|her|their)\\s+arms)(?![\\w-])(?!(?:\\s+[\\w,'’-]+){0,6}?\\s+(?:lick|suck|thrust|hump|fuck|eat|stroke|pound|grind)\\w*)`,
  },
  {
    id: "aftercare-nestle",
    kw: "chest|side|arms|shoulder|neck",
    cat: "vibe",
    act: "curling up against someone afterwards",
    subj: "b",
    weight: 0.3,
    needsCtx: true,
    signal: { kind: "aftercare", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:curl|nestl|snuggl|cuddl|burrow)\\w*\\s+(?:\\w+\\s+){0,2}?(?:into|against)\\s+{T:poss}\\s+(?:chest|side|arms|shoulder|neck)(?![\\w-])`,
  },
  {
    id: "petname-praise",
    kw: "good|pretty|sweet",
    cat: "vibe",
    act: "calling someone a good boy/girl",
    subj: "t",
    weight: 0.45,
    needsCtx: true,
    signal: { kind: "petname", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:call|called|calls|calling|told|tell|tells|telling|praised|praise|praises)\\s+{B}\\s+(?:a\\s+|his\\s+|her\\s+|their\\s+|such\\s+a\\s+)?(?:good\\s+(?:boy|girl|pet|kitten|puppy)|pretty\\s+(?:boy|thing|baby)|sweet\\s+boy)(?![\\w-])`,
  },
  {
    id: "petname-daddy",
    kw: "daddy|sir|master|mistress|mommy",
    cat: "vibe",
    act: "calling someone daddy/sir",
    subj: "b",
    weight: 0.45,
    needsCtx: true,
    signal: { kind: "petname", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:call|called|calls|calling|whimper|whimpered|moan|moaned|gasp|gasped|beg|begged|breath|breathed|whisper|whispered)\\w*\\s+(?:out\\s+)?{T:poss}?\\s*(?:name\\s+)?(?:as\\s+)?["“]?(?:daddy|sir|master|mistress|mommy)(?![\\w-])`,
  },

  {
    // "Dean rested his head on Cas's chest", "Dean slept with his cheek against Cas's chest": the one resting is the bottom.
    id: "cuddle-head-on-chest",
    cat: "vibe",
    kw: "chest",
    act: "resting their head on someone's chest",
    subj: "b",
    weight: 0.45,
    signal: { kind: "position", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:\\w+\\s+){0,2}?(?:rest|lay|laid|lain|put|press|nestl|burrow|bur(?:y|ied)|tuck|snuggl|cuddl|lean|settl|slump|pillow|dropp?|lower|slept|sleep|asleep|doz|nap)\\w*\\s+(?:\\w+\\s+){0,3}?(?:head|cheek|face|ear|temple|forehead)\\s+(?:\\w+\\s+)?(?:on|against|upon|to|over|onto|in|into)\\s+{T:poss}\\s+(?:\\w+\\s+)?chest(?![\\w-])`,
  },
  {
    id: "cuddle-head-on-chest-poss",
    cat: "vibe",
    kw: "chest",
    act: "resting their head on someone's chest",
    subj: "b",
    weight: 0.45,
    signal: { kind: "position", actorRole: "bottom" },
    src: `\\b{B:poss}\\s+(?:head|cheek|face|ear|temple|forehead)\\s+(?:\\w+\\s+){0,2}?(?:on|against|upon|to|over|onto|in|into)\\s+{T:poss}\\s+(?:\\w+\\s+)?chest(?![\\w-])`,
  },
  {
    id: "cuddle-asleep-on-chest",
    cat: "vibe",
    kw: "asleep|slept|sleep|doz|nap|drift",
    act: "falling asleep on someone's chest",
    subj: "b",
    weight: 0.45,
    signal: { kind: "position", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:fell\\s+asleep|dozed(?:\\s+off)?|slept|sleeping|napped|drifted\\s+(?:off|to\\s+sleep)|fall\\s+asleep)\\s+(?:\\w+\\s+){0,2}?(?:on|against|upon|onto)\\s+{T:poss}\\s+(?:\\w+\\s+)?chest(?![\\w-])`,
  },
  {
    // "Cas spooned Dean from behind"
    id: "cuddle-spooned",
    cat: "vibe",
    kw: "spoon",
    act: "being the big spoon",
    subj: "t",
    weight: 0.45,
    signal: { kind: "position", actorRole: "top" },
    src: `\\b{T}\\s+{aux}spoon(?:s|ed|ing)?\\s+(?:up\\s+(?:behind|against)\\s+)?{B}(?![\\w'’])`,
  },
  {
    id: "cuddle-big-spoon",
    cat: "vibe",
    kw: "big spoon",
    act: "being the big spoon",
    subj: "t",
    weight: 0.45,
    signal: { kind: "position", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:was|were|is|as|being|be|played|plays|playing|took|takes|taking|always\\s+(?:was|is))\\s+(?:\\w+\\s+){0,2}?(?:the\\s+)?big\\s+spoon`,
  },
  {
    id: "cuddle-little-spoon",
    cat: "vibe",
    kw: "little spoon",
    act: "being the little spoon",
    subj: "b",
    weight: 0.45,
    signal: { kind: "position", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:was|were|is|as|being|be|played|plays|playing|took|takes|taking|always\\s+(?:was|is))\\s+(?:\\w+\\s+){0,2}?(?:the\\s+)?little\\s+spoon`,
  },
  {
    // "Cas curled around Dean from behind" in bed or while sleeping: the big spoon.
    id: "cuddle-from-behind",
    cat: "vibe",
    kw: "behind|back",
    act: "holding someone from behind",
    subj: "t",
    weight: 0.4,
    needs: /\b(?:sleep\w*|asleep|cuddl\w*|snuggl\w*|spoon\w*|bed|nap\w*|dozed|drift\w*)\b/i,
    signal: { kind: "position", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:curl|wrap|press|mold|fit|nestl|tuck|held|hold|holding|pull|gather)\\w*\\s+(?:himself\\s+|herself\\s+|themself\\s+)?(?:\\w+\\s+){0,3}?(?:around|against|behind)?\\s*{B}(?:['’]s\\s+back)?\\s+from\\s+behind`,
  },
  {
    // "Dean curled back against Cas's chest", "his back pressed to Cas's chest": the little spoon.
    id: "cuddle-back-to-chest",
    cat: "vibe",
    kw: "back",
    act: "being the little spoon",
    subj: "b",
    weight: 0.4,
    needs: /\b(?:sleep\w*|asleep|cuddl\w*|snuggl\w*|spoon\w*|bed|nap\w*|dozed|drift\w*|curl\w*)\b/i,
    signal: { kind: "position", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:\\w+\\s+){0,7}?(?:back)\\s+(?:\\w+\\s+)?(?:against|to|into)\\s+{T:poss}\\s+(?:chest|front|stomach)(?![\\w-])`,
  },

  // ───────────── sweep of two fics: less-common phrasings ─────────────
  {
    // "Anakin moans into the covers and tries thrusting back"
    id: "thrust-back",
    cat: "anal",
    kw: "back",
    act: "pushing back",
    subj: "b",
    weight: 0.6,
    needsCtx: true,
    signal: { kind: "touch", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:thrust|push|press|rock|roll|arch|shov)\\w*\\s+(?:\\w+ly\\s+)?back(?![\\w-])(?=\\s*(?:[,.;!?]|$|\\s+(?:against|into|onto|toward|towards|until|with|harder|further|eagerly|desperately|hungrily|greedily)\\b))`,
  },
  {
    // "Anakin can feel him twitch inside him"
    id: "feel-him-inside",
    cat: "anal",
    kw: "feel|felt",
    act: "anal sex",
    subj: "b",
    weight: 0.8,
    needsCtx: true,
    src: `\\b{B}\\s+{aux}(?:can\\s+)?(?:feel|felt|feels)\\s+{T}\\s+(?:twitch|pulse|throb|swell|jerk|harden|thicken|come|cum|shudder|spill|move|stir)\\w*\\s+(?:\\w+\\s+){0,2}?(?:inside|within|in)\\s+(?:him|her|them|me)\\b`,
  },
  {
    // "Anakin meets the thrusts of Obi-Wan's fingers"
    id: "meets-finger-thrusts",
    cat: "anal",
    kw: "thrusts?|strokes?",
    act: "fingering",
    subj: "b",
    weight: 0.9,
    needsCtx: true,
    src: `\\b{B}\\s+{aux}(?:meet|meets|met|match|matches|matched)\\w*\\s+(?:the\\s+)?(?:thrusts?|strokes?)\\s+of\\s+{T:poss}\\s+(?:\\w+\\s+)?(?:fingers?|digits?)`,
  },
  {
    // "scissors him open"
    id: "scissors-open",
    cat: "anal",
    kw: "scissor",
    act: "fingering",
    subj: "t",
    weight: 0.9,
    needsCtx: true,
    src: `\\b{T}\\s+{aux}scissor\\w*\\s+{B}\\s+(?:open|apart|wide)`,
  },
  {
    // "his hole clenching around Obi-Wan"
    id: "hole-around-name",
    cat: "anal",
    kw: "hole|entrance|rim|ass",
    act: "anal sex",
    subj: "b",
    weight: 0.8,
    needsCtx: true,
    src: `\\b{B:poss}\\s+${ASS.replace("|body", "")}\\s+(?:\\w+\\s+){0,1}?(?:clench|tighten|flutter|squeez|grip|clamp|pulse)\\w*\\s+around\\s+{T}(?![\\w'’])`,
  },
  {
    // "every stroke brushing against Anakin's prostate"
    id: "stroke-prostate",
    cat: "anal",
    kw: "prostate",
    act: "anal sex",
    subj: "b",
    weight: 0.8,
    needsCtx: true,
    src: `\\b(?:every|each|a)\\s+(?:slow\\s+|deep\\s+|hard\\s+)?(?:stroke|thrust|drag|slide)\\s+(?:\\w+\\s+){0,2}?(?:brush|hit|nail|graz|press|rub|catch|find|drag)\\w*\\s+(?:against\\s+|across\\s+|over\\s+)?{B:poss}\\s+prostate`,
  },
  {
    // "the tongue probing into him"
    id: "tongue-probing",
    cat: "oral",
    kw: "tongue",
    act: "rimming",
    subj: "b",
    weight: 0.8,
    needsCtx: true,
    src: `\\b[Tt]he\\s+(?:\\w+\\s+)?tongue\\s+(?:probing|pushing|delving|pressing|thrusting|wriggling|working|slipping|sliding)\\s+(?:in(?:to|side)?)\\s+{B:ass}`,
  },
  {
    // "his cock … nudges against his cheek"
    id: "cock-against-face",
    cat: "oral",
    kw: "cheek|lips|face|chin",
    act: "cock against the face",
    subj: "t",
    weight: 0.5,
    needsCtx: true,
    signal: { kind: "touch", actorRole: "top" },
    src: `\\b{T:penisReq}\\s+{aux}(?:\\w+\\s+){0,2}?(?:nudg|press|brush|rub|slap|smear|drag)\\w*\\s+(?:against|on|across|along)\\s+{B:poss}\\s+(?:cheek|lips|face|chin)`,
  },
  {
    // "the satisfying weight of cock on his tongue"
    id: "weight-on-tongue",
    cat: "oral",
    kw: "tongue",
    act: "blowjob",
    subj: "b",
    weight: 0.8,
    needsCtx: true,
    src: `\\b[Tt]he\\s+(?:\\w+\\s+)?(?:weight|taste|heat|feel|salt)\\s+of\\s+(?:{T:poss}\\s+)?(?:cock|dick|prick)\\s+on\\s+{B:poss}\\s+tongue`,
  },
  {
    // "Obi-Wan comes across his face"
    id: "comes-on-face",
    cat: "oral",
    kw: "come|came|cum|coming",
    act: "coming on someone's face",
    subj: "t",
    weight: 0.5,
    needsCtx: true,
    signal: { kind: "touch", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:come|comes|came|cum|cums|cummed|coming)\\s+(?:all\\s+)?(?:across|over|on)\\s+{B:poss}\\s+(?:face|cheeks|lips|tongue|chin)`,
  },
  {
    // "sinks down to the cold floor", "dropped to the ground" in front of someone
    id: "sinks-to-floor",
    cat: "oral",
    kw: "floor|knees|ground",
    act: "kneeling",
    subj: "b",
    weight: 0.4,
    needsCtx: true,
    signal: { kind: "prep", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:sink|sank|sinks|drop|dropped|drops)\\w*\\s+(?:down\\s+)?(?:to|onto)\\s+(?:(?:his|her|their|my|your)\\s+knees(?!\\s+(?:beside|next\\s+to)\\b)|(?:the\\s+)?(?:cold\\s+|hard\\s+)?(?:floor|ground)(?=\\s+(?:in front of|before|between|at)\\b))`,
  },
  {
    // "nuzzles against the line of Obi-Wan's cock"
    id: "nuzzle-cock",
    cat: "oral",
    kw: "nuzzl|nose",
    act: "nuzzling a cock",
    subj: "t",
    weight: 0.5,
    needsCtx: true,
    signal: { kind: "touch", actorRole: "bottom" },
    src: `\\b{T}\\s+{aux}(?:nuzzl|nos)\\w*\\s+(?:\\w+\\s+){0,1}?(?:against|into|along|at)\\s+(?:the\\s+(?:line|outline|bulge|length)\\s+of\\s+)?{B:poss}\\s+(?:cock|dick|cockhead|bulge|erection|crotch|length)`,
  },
  {
    // "brings two slick fingers to Anakin's hole"
    id: "fingers-to-hole",
    cat: "anal",
    kw: "fingers?",
    act: "fingering",
    subj: "t",
    weight: 0.7,
    needsCtx: true,
    src: `\\b{T}\\s+{aux}(?:bring|brings|brought|bringing|press|presses|pressed|pressing|touch|touches|touched|touching|trac|rub|rubs|rubbed)\\w*\\s+(?:\\w+\\s+){0,3}?fingers?\\s+(?:to|at|against)\\s+{B:ass}`,
  },

  {
    // "the thrust of his cock into Dean"
    id: "thrust-of-cock",
    cat: "anal",
    kw: "thrust|push|slide|drive|stroke",
    act: "anal sex",
    subj: "t",
    weight: 0.9,
    needsCtx: true,
    src: `\\b[Tt]he\\s+(?:\\w+\\s+)?(?:thrusts?|pushes|push|slides?|drives?|strokes?)\\s+of\\s+{T:poss}\\s+(?:\\w+\\s+)?(?:cock|dick|prick|length)\\s+(?:in(?:to|side)?|within)\\s+{B:ass}`,
  },
  {
    // "His body clenches around the intrusive cock and milks it"
    id: "body-clenches-cock",
    cat: "anal",
    kw: "body",
    act: "anal sex",
    subj: "b",
    weight: 0.8,
    needsCtx: true,
    src: `\\b{B:poss}\\s+body\\s+(?:clench|tighten|grip|squeez|milk|flutter|clamp|suck)\\w*\\s+(?:down\\s+)?(?:on|around)\\s+(?:the\\s+|his\\s+|her\\s+|their\\s+)?(?:\\w+\\s+)?(?:cock|dick|knot|length|shaft)`,
  },
  {
    // "the alpha sinks in a third finger", "adds a second finger"
    id: "adds-finger",
    cat: "anal",
    kw: "finger",
    act: "fingering",
    subj: "t",
    weight: 0.8,
    needsCtx: true,
    src: `\\b{T}\\s+{aux}(?:sink|sank|sinks|slip|slips|slid|slide|slides|push|pushes|pushed|add|adds|added|work|works|worked)\\s+(?:in\\s+)?(?:another|a\\s+(?:second|third|fourth)|one\\s+more|a\\s+single|a)\\s+(?:slick\\s+|slender\\s+|thick\\s+)?(?:finger|digit)(?!\\s+(?:into|inside|up|over|across|along|against|through))`,
  },
  {
    // "his first spurt of cum enters Dean"
    id: "cum-enters",
    cat: "anal",
    kw: "enters?|fills?|floods?",
    act: "anal sex",
    subj: "b",
    weight: 0.7,
    needsCtx: true,
    src: `\\b(?:[Cc]um|[Cc]ome|[Ss]eed|release|spurt|load)\\s+(?:enters?|fills?|floods?|spills?\\s+into|spurts?\\s+into)\\s+{B:ass}`,
  },
  {
    // "Stretching Dean beautifully open with his oversized dick"
    id: "stretching-open-with-cock",
    cat: "anal",
    kw: "stretch",
    act: "anal sex",
    subj: "t",
    weight: 0.8,
    needsCtx: true,
    src: `\\b[Ss]tretch\\w*\\s+{B}\\s+(?:\\w+ly\\s+)?(?:open|wide|apart)\\s+(?:with|on)\\s+{T:poss}\\s+${PENIS}`,
  },
  {
    // "finally taking it inside him", "sits it all inside him"
    id: "takes-it-inside",
    cat: "anal",
    kw: "inside",
    act: "anal sex",
    subj: "b",
    weight: 0.6,
    needsCtx: true,
    src: `\\b{B}\\s+{aux}(?:take|takes|took|taking|sit|sits|sat|sitting|seat|seats|seated|sink|sinks|sank)\\s+(?:it|all of it|it all|him)\\s+(?:all\\s+)?(?:the way\\s+)?(?:in|inside)\\s+(?:him|her|them)`,
  },
  {
    // "applies pressure to his hole", "rubs over his dry hole"
    id: "pressure-at-hole",
    cat: "anal",
    kw: "hole|entrance|rim",
    act: "teasing a hole",
    subj: "t",
    weight: 0.5,
    needsCtx: true,
    signal: { kind: "touch", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:rub|press|apply|applies|applied|touch|trace|circle|tap|probe|prod|nudg)\\w*\\s+(?:\\w+\\s+){0,2}?(?:over|to|on|against|at|around)\\s+{B:assReq}`,
  },
  {
    // "keep his mouth full of cock"
    id: "mouth-full-of-cock",
    cat: "oral",
    kw: "full of",
    act: "blowjob",
    subj: "b",
    weight: 0.8,
    needsCtx: true,
    src: `\\b{B:poss}\\s+mouth\\s+full\\s+of\\s+(?:{T:poss}\\s+)?(?:\\w+\\s+)?(?:cock|dick|prick)`,
  },
  {
    // "his hole begs", "his hole throbs": the ache of an empty or used hole
    id: "body-hole-ache",
    cat: "anal",
    kw: "beg|ache|throb|pulse|flutter|twitch|clench|spasm|clutch",
    act: "aching hole",
    subj: "b",
    weight: 0.5,
    needsCtx: true,
    signal: { kind: "body", actorRole: "bottom" },
    src: `\\b{B:poss}\\s+(?:\\w+\\s+)?(?:ass|arse|hole|entrance|rim|opening|pussy|cunt)\\s+{aux}(?:beg(?:s|ged|ging)?|ache\\w*|throb\\w*|puls\\w*|flutter\\w*|twitch\\w*|clench\\w*|spasm\\w*|clutch\\w*)(?![\\w-])(?!\\s+(?:around|on|down|onto))`,
  },
  // ───────────── sweep of Steve & Eddie: oral phrasings ─────────────
  {
    // "taking Eddie's dick out of his mouth", "pulled Steve's cock out of his mouth with a pop"
    id: "cock-out-of-mouth",
    cat: "oral",
    kw: "out of|from",
    act: "blowjob",
    subj: "t",
    weight: 0.9,
    needsCtx: true,
    src: `\\b(?:tak|pull|slid|slip|let|releas|drew|draw|pop|withdr)\\w*\\s+{T:poss}\\s+(?:\\w+\\s+)?(?:cock|dick|prick|length|shaft)\\s+(?:out\\s+of|from)\\s+{B:poss}\\s+(?:mouth|throat)`,
  },
  {
    // "slowly forcing his cock down his throat" (the cock is the partner's, the throat the subject's)
    id: "forcing-cock-down-throat",
    cat: "oral",
    kw: "down|throat",
    act: "blowjob",
    subj: "b",
    weight: 0.9,
    needsCtx: true,
    src: `\\b{B}\\s+{aux}(?:[\\w-]+\\s+){0,6}?(?:forc|push|shov|guid|pull|drag)\\w*\\s+{T:poss}\\s+(?:\\w+\\s+)?(?:cock|dick|prick|length|shaft|hips)\\s+(?:down|into|deeper\\s+into|further\\s+into)\\s+{B:poss}\\s+throat`,
  },
  {
    // "his throat squeezing around Eddie", "Steve's throat clenched around him"
    id: "throat-around-cock",
    cat: "oral",
    kw: "throat",
    act: "blowjob",
    subj: "b",
    weight: 0.9,
    needsCtx: true,
    src: `\\b{B:poss}\\s+throat\\s+{aux}(?:squeez|clench|tighten|constrict|convuls|flutter|work|clamp|spasm|clos|contract|grip)\\w*\\s+(?:\\w+\\s+)?(?:around|on|about)\\s+(?:{T}|{T:penis}|him|her)\\b`,
  },
  {
    // "fought through the urge to gag", "fighting down his gag reflex"
    id: "fight-gag",
    cat: "oral",
    kw: "gag",
    act: "blowjob",
    subj: "b",
    weight: 0.5,
    needsCtx: true,
    src: `\\b{B}\\s+{aux}(?:fought|fight|fights|fighting|suppress|stifl|swallow|resist|held back|hold back|breath\\w*)\\w*\\s+(?:back\\s+|down\\s+|through\\s+)?(?:the\\s+|his\\s+|her\\s+|their\\s+)?(?:urge\\s+to\\s+gag|need\\s+to\\s+gag|gag\\s+reflex|instinct\\s+to\\s+gag)`,
  },
  {
    // "tasted the precum in the back of his throat"
    id: "taste-precum-throat",
    cat: "oral",
    kw: "tast",
    act: "blowjob",
    subj: "b",
    weight: 0.5,
    needsCtx: true,
    src: `\\b{B}\\s+{aux}(?:could\\s+)?tast(?:e|ed|es|ing)\\s+(?:the\\s+|his\\s+|her\\s+|their\\s+|{T:poss}\\s+)?(?:\\w+\\s+)?(?:precum|pre-?come|pre-?cum|cum|come|salt|bitterness)\\s+(?:\\w+\\s+){0,3}?(?:back\\s+of\\s+(?:his|her|their)\\s+throat|on\\s+(?:his|her|their)\\s+tongue)`,
  },
  {
    // "Eddie grabbed Steve's hair and slowly pushed his hips as far forward as they would go"
    id: "hair-grab-hips-forward",
    cat: "oral",
    kw: "hair",
    act: "blowjob",
    subj: "t",
    weight: 0.8,
    needsCtx: true,
    src: `\\b{T}\\s+{aux}(?:grabb?|grip|fist|tangl|tugg?|pull|clutch|held|hold)\\w*\\s+{B:poss}\\s+hair\\s+(?:and\\s+)?(?:\\w+ly\\s+)?(?:push|thrust|roll|jerk|snap|pump|drove|drive|rock)\\w*\\s+(?:his|her|their)\\s+hips\\s+(?:\\w+\\s+){0,3}?(?:forward|in|up)\\b`,
  },
  // ───────────── solo acts: masturbation (shown on their own card, never counted toward top/bottom) ─────────────
  {
    // "masturbated", "jerked off", "wanked", "jacked off to the thought"
    id: "mast-word",
    cat: "vibe",
    kw: "masturbat|wank|jack|jerk|beat|fap",
    act: "masturbation",
    subj: "b",
    weight: 0.9,
    signal: { kind: "masturbation", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:masturbat(?:e|es|ed|ing)|wank(?:s|ed|ing)?(?!\\s+(?:him|her|them))|(?:jack|jerk|beat)(?:s|ed|ing)?\\s+off|fap(?:s|ped|ping)?)(?!\\s+(?:him|her|them|[A-Z]))`,
  },
  {
    // "jerked himself off", "touched himself", "stroked himself", "pleasured himself"
    id: "mast-himself",
    cat: "vibe",
    kw: "himself|herself|themself|themselves",
    act: "masturbation",
    subj: "b",
    weight: 0.8,
    needsCtx: true,
    signal: { kind: "masturbation", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:jerk|jack|stroke|strok|pump|wank|fist|tug|touch|rub|pleasur|play|squeez|grip|palm|fondl|caress|tease|grind|ground|rock|thrust)\\w*\\s+${SELF}(?:\\s+off)?(?![\\w-])(?!\\s+(?:up|open|wide|loose|on|onto|against|into|with\\s+(?:a|the|his|her|their|my|your)\\s+(?:dildo|toy|vibrator|plug|fingers?))\\b)`,
  },
  {
    // "stroked his own cock", "rubbed her own clit" (touching one's own nipples is nipple play, not masturbation)
    id: "mast-own",
    cat: "vibe",
    kw: "own",
    act: "masturbation",
    subj: "b",
    weight: 0.9,
    needsCtx: true,
    signal: { kind: "masturbation", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:strok|jerk|pump|fist|tug|squeez|grip|palm|rubb?|work|fondl|touch|play(?:ed|s|ing)?\\s+with|pleasur|circl|flick|teas)\\w*\\s+(?:at\\s+|on\\s+)?(?:his|her|their)\\s+own\\s+(?:[\\w-]+\\s+){0,2}?(?:cock|dick|prick|length|shaft|erection|clit|clitoris|pussy|cunt|folds)\\b`,
  },
  {
    // "thrust up into his own fist"
    id: "mast-own-fist",
    cat: "vibe",
    kw: "own",
    act: "masturbation",
    subj: "b",
    weight: 0.8,
    needsCtx: true,
    signal: { kind: "masturbation", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:thrust|fuck|pump|rock|buck|roll|snap)\\w*\\s+(?:\\w+\\s+)?(?:up\\s+)?into\\s+(?:his|her|their)\\s+own\\s+(?:fist|hand|grip)`,
  },
  {
    // "got himself off", "made himself come", "brought himself to orgasm"
    id: "mast-got-off",
    cat: "vibe",
    kw: "himself|herself|themself|themselves",
    act: "masturbation",
    subj: "b",
    weight: 0.8,
    needsCtx: true,
    signal: { kind: "masturbation", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:got|get|gets|getting|brought|bring|brings|bringing|made|make|makes|making|worked|work|works|working)\\s+${SELF}\\s+(?:off(?!\\s+(?:the|a|an|of|his|her|their|my|your|this|that|its|from)\\b)|to\\s+(?:orgasm|climax|completion|the edge)|come|cum)\\b`,
  },
  // ───────────── everyday dynamics between the pair (tier 6, light): caretaking, leading by the hand ─────────────
  {
    // "tucked a blanket around Steve", "wrapped his jacket around Steve", "draped the towel over Steve"
    id: "care-wrap",
    cat: "vibe",
    kw: "blanket|jacket|coat|sweater|hoodie|towel|scarf|quilt|cardigan|shirt",
    act: "looking after someone",
    subj: "t",
    weight: 0.4,
    needsCtx: true,
    signal: { kind: "behavior", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:tuck|drap|wrap|pull|pulled|put|spread|laid|lay|threw|tossed)\\w*\\s+(?:a|the|his|her|their|my|your|an|that|this)\\s+(?:\\w+\\s+){0,2}?(?:blanket|jacket|coat|sweater|hoodie|towel|scarf|quilt|cardigan|comforter)\\s+(?:around|over|across)\\s+{B}\\b`,
  },
  {
    // "handed Eddie the bag of ice", "brought Steve a glass of water", "fed Steve soup"
    id: "care-bring",
    cat: "vibe",
    kw: "ice|water|food|soup|coffee|tea|bandage|aspirin|painkiller|pills|first aid|peas|towel|plate|sandwich|burger|breakfast|lunch|dinner",
    act: "looking after someone",
    subj: "t",
    weight: 0.4,
    signal: { kind: "behavior", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:hand(?:ed|s)?|brought|bring(?:s)?|fetch(?:ed|es)?|got|poured|fed|feed(?:s)?|made|cooked|handed)\\s+{B}\\s+(?:a|an|the|some|his|her|their)?\\s*(?:[\\w-]+\\s+){0,2}?(?:ice|water|food|soup|coffee|tea|bandages?|aspirin|painkillers?|pills|first[- ]aid|peas|towel|plate|sandwich|burger|breakfast|lunch|dinner|bag of ice|glass)\\b`,
  },
  {
    // "rubbed Steve's hands to warm them up", "stroked Steve's hair", "smoothed Steve's hair back"
    id: "care-soothe",
    cat: "vibe",
    kw: "hair|back|hands|shoulders|arm|forehead",
    act: "comforting someone",
    subj: "t",
    weight: 0.4,
    signal: { kind: "behavior", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:rubb?|strok|smooth|carress|caress|pat|massag|squeez|ran\\s+(?:his|her|their)\\s+(?:fingers|hand|knuckles))\\w*\\s+(?:\\w+\\s+)?(?:(?:over|through|along|across|down|on)\\s+)?{B:poss}\\s+(?:\\w+\\s+)?(?:back|hair|hands?|shoulders?|arm|forearm|forehead|cheek|head)\\b(?!\\s+(?:and|as|while)\\s+(?:kissed|moan|gasp))`,
  },
  {
    // "took Steve's hand and led him", "tugged Steve toward the escalators", "dragging him to the other side of the dance floor"
    id: "lead-by-hand",
    cat: "vibe",
    kw: "led|lead|tugg|dragg|steer|guid|pulled|gestur",
    act: "leading someone",
    subj: "t",
    weight: 0.4,
    signal: { kind: "behavior", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:(?:took|grabbed|caught)\\s+{B:poss}\\s+(?:hand|arm|wrist|sleeve)\\s*(?:,\\s*)?(?:and\\s+)?(?:led|pulled|tugged|dragged|steered|guided)|(?:led|steered|guided|tugged|ushered|herded|marched)\\s+{B}\\s+(?:by\\s+the\\s+(?:hand|arm|wrist|sleeve)|toward|towards|to|out|inside|through|into|over|along|down|up|away)|gestur\\w*\\s+for\\s+{B}\\s+to\\s+follow)\\b`,
  },
  // ───────────── fisting and double penetration (anal acts) ─────────────
  {
    // "fisted Eddie", "fisting him": needs sex around so a punch or a fistful of shirt isn't read as one
    id: "fisting-verb",
    cat: "anal",
    kw: "fist",
    act: "fisting",
    subj: "t",
    weight: 1,
    needsCtx: true,
    src: `\\b{T}\\s+{aux}fist(?:ed|s|ing)?\\s+{B}(?![\\w'’-])(?!\\s+(?:in|on|against|into)\\s+(?:the|his|her|their)\\s+(?:face|jaw|chest|stomach|gut|shoulder|arm))`,
  },
  {
    // "worked his whole fist into Eddie's ass", "slid his hand up inside him"
    id: "fist-into",
    cat: "anal",
    kw: "fist|hand",
    act: "fisting",
    subj: "t",
    weight: 1,
    needsCtx: true,
    src: `\\b{T}\\s+{aux}(?:work|push|slid|slide|slip|sink|sank|eas|shov|forc|press|fit|drove|plung|thrust)\\w*\\s+(?:(?:his|her|their)\\s+)?(?:(?:whole|entire|full|slick|lubed|wet|big)\\s+)*(?:fist\\s+(?:slowly\\s+|carefully\\s+|deep\\s+|all\\s+the\\s+way\\s+)*(?:in(?:to|side)?(?:\\s+of)?|up)\\s+{B:ass}|hand\\s+(?:slowly\\s+|carefully\\s+|deep\\s+|all\\s+the\\s+way\\s+)*(?:in(?:to|side)?(?:\\s+of)?|up)\\s+{B:assReq})`,
  },
  {
    // "took them both at once", "took both of them inside him": two people inside one
    id: "dp-took-both",
    cat: "anal",
    kw: "both|two of them|them",
    act: "double penetration",
    subj: "b",
    weight: 0.9,
    needsCtx: true,
    src: `\\b{B}\\s+{aux}(?:took|take|takes|taking|had|has)\\s+(?:them\\s+both|both\\s+of\\s+them|the\\s+two\\s+of\\s+them|both(?:\\s+(?:cocks|dicks))?)\\s+(?:at\\s+once|together|at\\s+the\\s+same\\s+time|inside(?:\\s+(?:him|her|them))?|in\\s+(?:his|her|their)\\s+(?:ass|hole))`,
  },
  // ───────────── hand sex between the pair: handjobs and frottage (shown on their own card) ─────────────
  {
    // "fucked between Eddie's thighs", "slid his cock between Eddie's thighs": thigh sex, not ranked
    id: "thigh-fuck",
    cat: "vibe",
    kw: "thigh|leg",
    act: "thigh-fucking",
    subj: "t",
    weight: 0.8,
    needsCtx: true,
    signal: { kind: "handjob", actorRole: "bottom", actor: "b" },
    src: `\\b{T}\\s+{aux}(?:(?:fuck|thrust|rutt?|pump|hump|rock|grind|ground)\\w*|(?:slid|slide|slip|push|work)\\w*\\s+(?:his|her|their)\\s+(?:cock|dick|length|shaft))\\s+(?:(?:his|her|their)\\s+(?:cock|dick|length|shaft|hips)\\s+)?(?:\\w+ly\\s+)?(?:between|into)\\s+{B:poss}\\s+(?:\\w+\\s+)?(?:thighs|legs)`,
  },
  {
    // "Eddie squeezed his thighs tight around Steve's cock"
    id: "thighs-around-cock",
    cat: "vibe",
    kw: "thigh",
    act: "thigh-fucking",
    subj: "b",
    weight: 0.8,
    needsCtx: true,
    signal: { kind: "handjob", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:squeez|clench|clamp|press|tighten|clos)\\w*\\s+(?:his|her|their)\\s+thighs\\s+(?:\\w+\\s+){0,2}?(?:around|on|over)\\s+{T:poss}\\s+(?:cock|dick|length|shaft)`,
  },
  {
    // "thrust his cock between Eddie's pecs", "fucked her chest", "titfucked her"
    id: "chest-fuck",
    cat: "vibe",
    kw: "pecs|chest|breasts|tits|boobs|cleavage|tit-?fuck",
    act: "titfucking",
    subj: "t",
    weight: 0.8,
    needsCtx: true,
    signal: { kind: "handjob", actorRole: "bottom", actor: "b" },
    src: `\\b{T}\\s+{aux}(?:(?:fuck|thrust|rutt?|pump|hump|rock|slid|slide|slip|push)\\w*\\s+(?:(?:his|her|their)\\s+(?:cock|dick|length|shaft)\\s+)?(?:\\w+ly\\s+)?(?:between|across|against)\\s+{B:poss}\\s+(?:\\w+\\s+)?(?:pecs|chest|breasts|tits|boobs|cleavage)|(?:fuck|rutt?|hump)\\w*\\s+{B:poss}\\s+(?:pecs|chest|breasts|tits|boobs)|tit-?fuck(?:s|ed|ing)?\\s+{B})`,
  },
  {
    // "stroked Steve's cock", "worked Eddie's length", "jerked him slowly" with a cock named
    id: "hj-stroke",
    cat: "vibe",
    kw: "strok|jerk|pump|tug|squeez|grip|fist|palm|work|rub|cup|fondl|wrap|curl|clos|tighten|grab|seiz|clutch",
    act: "handjob",
    subj: "t",
    weight: 0.8,
    needsCtx: true,
    signal: { kind: "handjob", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:(?:strok|jerk|pump|tugg?|squeez|grip|gripp|fist|palm|work|rubb?|cupp?|fondl|grabb?|seiz|clutch)\\w*\\s+{B:poss}\\s+(?:\\w+\\s+){0,2}?(?:cock|dick|prick|length|shaft|erection|hard-?on|member)|(?:wrapp?|curl|clos|wound)\\w*\\s+(?:a|one|his|her|their)\\s+(?:\\w+\\s+)?hands?\\s+around\\s+{B:poss}\\s+(?:\\w+\\s+){0,2}?(?:cock|dick|prick|length|shaft|erection|hard-?on|member)|(?:tighten|loosen)\\w*\\s+(?:his|her|their)\\s+grip\\s+(?:on|around)\\s+{B:poss}\\s+(?:\\w+\\s+){0,2}?(?:cock|dick|prick|length|shaft|erection))\\b`,
  },
  {
    // "shoved a hand into his underwear", "slid a hand down Steve's pants and wrapped it around him"
    id: "hj-hand-in-pants",
    cat: "vibe",
    kw: "hand",
    act: "handjob",
    subj: "t",
    weight: 0.6,
    needsCtx: true,
    signal: { kind: "handjob", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:shov|slid|slip|push|sneak|dip|work|reach|thrust)\\w*\\s+(?:a|one|his|her|their)\\s+(?:\\w+\\s+)?hand\\s+(?:down\\s+|up\\s+)?(?:into|inside|in|down|under)\\s+{B:poss}\\s+(?:underwear|boxers|briefs|shorts|jeans|pants|trousers|sweatpants|waistband)\\b(?!\\s*,?\\s*(?:and\\s+)?(?:squeezed|grabbed|cupped|kneaded)\\s+(?:his|her|their)\\s+(?:ass|butt|cheeks))`,
  },
  {
    // "wrapped his hands around them both" (mutual)
    id: "hj-around-both",
    cat: "vibe",
    kw: "both|together|each other",
    act: "mutual handjob",
    subj: "t",
    weight: 0.8,
    needsCtx: true,
    signal: { kind: "handjob", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:wrapp?|curl|clos|wound)\\w*\\s+(?:a|one|his|her|their|both)\\s+(?:\\w+\\s+)?hands?\\s+around\\s+(?:them\\s+both|both\\s+of\\s+them|the\\s+two\\s+of\\s+them|their\\s+(?:cocks|dicks|erections|lengths))`,
  },
  {
    // "rutted against each other", "ground their cocks together", "rubbed their erections together"
    id: "frottage",
    cat: "vibe",
    kw: "together|each other",
    act: "frottage",
    subj: "t",
    weight: 0.7,
    needsCtx: true,
    signal: { kind: "handjob", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:rubb?|grind|ground|rock|rutt?|slid|slide|press|thrust|roll)\\w*\\s+(?:their\\s+)?(?:cocks|dicks|erections|lengths|hard-?ons)\\s+(?:together|against\\s+each\\s+other)`,
  },
  {
    // "just in time for hot ropes of come to splatter across his face"
    id: "ropes-on-face",
    cat: "oral",
    kw: "ropes|streaks|spurts|jets|strands|splashes",
    act: "blowjob",
    subj: "b",
    weight: 0.6,
    needsCtx: true,
    src: `\\b(?:hot\\s+)?(?:ropes?|streaks?|spurts?|splashes?|jets?|strands?)\\s+of\\s+(?:hot\\s+)?(?:come|cum|spunk|jizz)\\s+(?:to\\s+|that\\s+)?(?:splatter|land|paint|streak|spatter|shoot|hit|spray|splash)\\w*\\s+(?:across|over|on)\\s+{B:poss}\\s+(?:face|lips|cheeks?|chin|tongue|mouth)`,
  },
  {
    // "slowly licking the come from his lips", "swallowed the cum off his fingers": taking it in after
    id: "lick-come-off",
    cat: "vibe",
    kw: "lick|lap|swallow|tast|suck|wip",
    act: "licking up come",
    subj: "b",
    weight: 0.5,
    needsCtx: true,
    signal: { kind: "body", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:[\\w’']+\\s+){0,8}?(?:lick|lap|swallow|tast|suck)\\w*\\s+(?:up\\s+)?(?:the\\s+|his\\s+|her\\s+|their\\s+)?(?:come|cum|spunk|jizz|precum|pre-come)\\s+(?:off|from|on)\\s+(?:of\\s+)?{B:poss}\\s+(?:lips|face|chin|mouth|fingers|hand|tongue)`,
  },
  {
    // "slowly opened his mouth, letting his tongue slip out": offering the mouth
    id: "offer-mouth",
    cat: "vibe",
    kw: "tongue",
    act: "offering their mouth",
    subj: "b",
    weight: 0.5,
    needsCtx: true,
    signal: { kind: "prep", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:\\w+ly\\s+)?(?:open|part)\\w*\\s+(?:his|her|their)\\s+(?:mouth|lips)(?:\\s*,\\s*|\\s+and\\s+)(?:letting|sticking|stick|let)\\w*\\s+(?:his|her|their)\\s+tongue\\s+(?:slip\\s+)?out`,
  },
  {
    // "Cas’s hand snaked down to wrap around Dean’s length"
    id: "hj-hand-subject",
    cat: "vibe",
    kw: "hand",
    act: "handjob",
    subj: "t",
    weight: 0.8,
    needsCtx: true,
    signal: { kind: "handjob", actorRole: "top" },
    src: `\\b{T:poss}\\s+hand\\s+(?:\\w+\\s+){0,3}?(?:wrap|clos|curl|wound|slid|snak|reach|moved|went|settled|found)\\w*\\s+(?:\\w+\\s+){0,3}?(?:around|on|over|to)\\s+{B:poss}\\s+(?:\\w+\\s+){0,2}?(?:cock|dick|prick|length|shaft|erection)(?![\\w-])(?![^.!?]{0,30}\\bcage\\b)`,
  },
  {
    // "He fists Cregan from root to tip", "stroked him from base to tip"
    id: "hj-root-to-tip",
    cat: "vibe",
    kw: "root|base",
    act: "handjob",
    subj: "t",
    weight: 0.8,
    needsCtx: true,
    signal: { kind: "handjob", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:fist|jerk|strok|pump|tugg?|work)\\w*\\s+{B}\\s+(?:slowly\\s+|firmly\\s+|tightly\\s+)?from\\s+(?:the\\s+)?(?:root|base)\\s+to\\s+(?:the\\s+)?(?:tip|head)\\b`,
  },
  {
    // "loosely jerking him", "stroked him slowly", "jerked Dean off"
    id: "hj-jerk-him",
    cat: "vibe",
    kw: "jerk|stroke|strok|pump|tug",
    act: "handjob",
    subj: "t",
    weight: 0.8,
    needsCtx: true,
    signal: { kind: "handjob", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:jerk|strok|pump|tugg?)\\w*\\s+{B}\\s+(?:off|slowly|loosely|lazily|tightly|firmly|faster|hard|gently|steadily)\\b(?!\\s+with\\s+(?:his|her|their)\\s+(?:hole|ass|body|mouth|throat))`,
  },
  {
    // "Eddie blushed", "Steve stammered": flustered, a yielding cue on the everyday-dynamic axis (needs the partner nearby)
    id: "flustered-verb",
    cat: "vibe",
    kw: "blush|flush|stammer|stutter|squeak|sputter|fumbl",
    act: "flustered or blushing",
    subj: "b",
    weight: 0.5,
    signal: { kind: "behavior", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:(?:blush|flush|stammer|stutter|squeak|sputter)\\w*|fumbl\\w*\\s+(?:for|over|with)\\s+(?:(?:his|her|their|the|a)\\s+)?(?:words?|word|right))`,
  },
  {
    // "his face went red", "her cheeks turned pink"
    id: "flustered-face",
    cat: "vibe",
    kw: "red|pink|scarlet|hot|bright",
    act: "flustered or blushing",
    subj: "b",
    weight: 0.5,
    signal: { kind: "behavior", actorRole: "bottom" },
    src: `\\b{B:poss}\\s+(?:face|cheeks|ears|neck)\\s+(?:went|turned|grew|burned|heated|flamed|got)\\s+(?:\\w+\\s+)?(?:red|pink|scarlet|hot|bright)`,
  },
  {
    // "He wanted to be fucked", "needed to get fucked", "got properly fucked": the receiver with no one named doing it
    id: "be-fucked",
    cat: "anal",
    kw: "fucked|plowed|ploughed|pounded|railed|bred|knotted|wrecked|ruined|stretched|filled|stuffed",
    act: "anal sex",
    subj: "b",
    weight: 0.8,
    dedupe: true,
    needsCtx: true,
    src: `\\b{B}\\s+{aux}(?:be|get|got|gets|getting|being|been)\\s+(?:so\\s+|properly\\s+|thoroughly\\s+|really\\s+|finally\\s+|well\\s+)*(?:fucked|plowed|ploughed|pounded|railed|bred|knotted|wrecked|ruined|stretched|filled|stuffed)(?!\\s+(?:up|over|off|around|with|out\\s+of)\\b)(?!(?:\\s+[\\w-]+){0,2}\\s+by\\b)\\b`,
  },
  // ───────────── chastity (only where the tags name a chastity device or cock cage): the one locked up leans bottom, the one with the key leans top ─────────────
  {
    // "locked the cage onto Castiel's cock", "snapped the chastity device around Castiel's dick"
    id: "chastity-lock-on",
    cat: "vibe",
    chastity: true,
    kw: "cage|chastity",
    act: "locking a chastity device on their partner",
    subj: "t",
    weight: 0.7,
    signal: { kind: "behavior", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:lock|snap|clip|click|fit|secur|buckl|slip|slid|put|fasten)\\w*\\s+(?:the\\s+|a\\s+|his\\s+|her\\s+)?(?:\\w+\\s+){0,2}?(?:cock[- ]?cage|chastity(?:\\s+(?:cage|device|belt|tube))?|cage)\\s+(?:on|onto|around|over)\\s+{B:poss}\\s+(?:\\w+\\s+)?(?:cock|dick|prick|length|shaft)\\b`,
  },
  {
    // "locked Castiel's cock in a cage", "put Castiel in chastity", "caged Castiel"
    id: "chastity-lock-up",
    cat: "vibe",
    chastity: true,
    kw: "cage|chastity",
    act: "locking their partner in chastity",
    subj: "t",
    weight: 0.7,
    signal: { kind: "behavior", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:(?:lock|shut|seal)\\w*\\s+{B:poss}\\s+(?:\\w+\\s+)?(?:cock|dick|prick|length)\\s+(?:up\\s+)?(?:in|inside|away in|within)\\s+(?:a|the|his|her)\\s+(?:\\w+\\s+)?(?:cock[- ]?cage|chastity(?:\\s+(?:cage|device|belt|tube))?|cage)|(?:put|placed|keep|kept|had)\\s+{B}\\s+(?:\\w+\\s+)?(?:in|into)\\s+(?:a\\s+|the\\s+)?(?:\\w+\\s+)?(?:cock[- ]?cage|chastity(?:\\s+(?:cage|device|belt|tube))?|cage)|caged\\s+{B})(?![\\w-])`,
  },
  {
    // "unlocked Castiel's cage", "held the key to Castiel's chastity": the keyholder
    id: "chastity-keyholder",
    cat: "vibe",
    chastity: true,
    kw: "cage|chastity|key",
    act: "holding the key to a chastity device",
    subj: "t",
    weight: 0.6,
    signal: { kind: "behavior", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:(?:unlock|undid|undo|unclip|remov|took)\\w*\\s+(?:the\\s+|his\\s+|her\\s+|{B:poss}\\s+)(?:\\w+\\s+)?(?:cock[- ]?cage|chastity(?:\\s+(?:cage|device|belt|tube))?|cage)|(?:held|kept|had|dangled|pocketed|twirled|tucked)\\s+(?:the\\s+|a\\s+|his\\s+|her\\s+)?(?:\\w+\\s+){0,2}?key\\s+(?:to|for|of)\\s+{B:poss}\\s+(?:\\w+\\s+)?(?:cock[- ]?cage|chastity(?:\\s+(?:cage|device|belt|tube))?|cage))(?![\\w-])`,
  },
  {
    // "Castiel was locked in a cage", "Castiel wore the chastity device", "Castiel's cock strained against the cage": the wearer
    id: "chastity-wearer",
    cat: "vibe",
    chastity: true,
    kw: "cage|chastity|caged",
    act: "wearing a chastity device",
    subj: "b",
    weight: 0.5,
    signal: { kind: "behavior", actorRole: "bottom" },
    src: `\\b(?:{B}\\s+{aux}(?:(?:was|is|were|been|being|remained|stayed)\\s+(?:locked|caged|kept)\\s+(?:up\\s+)?(?:in|inside)\\s+(?:a\\s+|the\\s+|his\\s+|her\\s+)?(?:\\w+\\s+)?(?:cock[- ]?cage|chastity(?:\\s+(?:cage|device|belt|tube))?|cage)|(?:wore|wears|wearing|squirmed in|whined in|ached in)\\s+(?:a\\s+|the\\s+|his\\s+|her\\s+)?(?:\\w+\\s+)?(?:cock[- ]?cage|chastity(?:\\s+(?:cage|device|belt|tube))?|cage))|{B:poss}\\s+(?:\\w+\\s+)?(?:cock|dick|prick|length)\\s+(?:\\w+\\s+)?(?:strain|press|push|swell|throb|ach|leak|twitch|pulse)\\w*\\s+(?:\\w+\\s+)?(?:against|in|inside|within|at)\\s+(?:the|its|his|a)\\s+(?:\\w+\\s+)?(?:cock[- ]?cage|chastity(?:\\s+(?:cage|device|belt|tube))?|cage))(?![\\w-])`,
  },
  {
    // "Castiel was locked in a cage", "Castiel wore the chastity device", "Castiel's cock strained against the cage": the wearer
    id: "chastity-wearer-anal",
    cat: "anal",
    chastity: true,
    kw: "cage|chastity|caged",
    act: "wearing a chastity device (hints anal bottom)",
    subj: "b",
    weight: 0.4,
    signal: { kind: "touch", actorRole: "bottom" },
    src: `\\b(?:{B}\\s+{aux}(?:(?:was|is|were|been|being|remained|stayed)\\s+(?:locked|caged|kept)\\s+(?:up\\s+)?(?:in|inside)\\s+(?:a\\s+|the\\s+|his\\s+|her\\s+)?(?:\\w+\\s+)?(?:cock[- ]?cage|chastity(?:\\s+(?:cage|device|belt|tube))?|cage)|(?:wore|wears|wearing|squirmed in|whined in|ached in)\\s+(?:a\\s+|the\\s+|his\\s+|her\\s+)?(?:\\w+\\s+)?(?:cock[- ]?cage|chastity(?:\\s+(?:cage|device|belt|tube))?|cage))|{B:poss}\\s+(?:\\w+\\s+)?(?:cock|dick|prick|length)\\s+(?:\\w+\\s+)?(?:strain|press|push|swell|throb|ach|leak|twitch|pulse)\\w*\\s+(?:\\w+\\s+)?(?:against|in|inside|within|at)\\s+(?:the|its|his|a)\\s+(?:\\w+\\s+)?(?:cock[- ]?cage|chastity(?:\\s+(?:cage|device|belt|tube))?|cage))(?![\\w-])`,
  },
  {
    // "Castiel was locked in a cage", "Castiel wore the chastity device", "Castiel's cock strained against the cage": the wearer
    id: "chastity-wearer-oral",
    cat: "oral",
    chastity: true,
    kw: "cage|chastity|caged",
    act: "wearing a chastity device (hints oral bottom)",
    subj: "b",
    weight: 0.4,
    signal: { kind: "touch", actorRole: "bottom" },
    src: `\\b(?:{B}\\s+{aux}(?:(?:was|is|were|been|being|remained|stayed)\\s+(?:locked|caged|kept)\\s+(?:up\\s+)?(?:in|inside)\\s+(?:a\\s+|the\\s+|his\\s+|her\\s+)?(?:\\w+\\s+)?(?:cock[- ]?cage|chastity(?:\\s+(?:cage|device|belt|tube))?|cage)|(?:wore|wears|wearing|squirmed in|whined in|ached in)\\s+(?:a\\s+|the\\s+|his\\s+|her\\s+)?(?:\\w+\\s+)?(?:cock[- ]?cage|chastity(?:\\s+(?:cage|device|belt|tube))?|cage))|{B:poss}\\s+(?:\\w+\\s+)?(?:cock|dick|prick|length)\\s+(?:\\w+\\s+)?(?:strain|press|push|swell|throb|ach|leak|twitch|pulse)\\w*\\s+(?:\\w+\\s+)?(?:against|in|inside|within|at)\\s+(?:the|its|his|a)\\s+(?:\\w+\\s+)?(?:cock[- ]?cage|chastity(?:\\s+(?:cage|device|belt|tube))?|cage))(?![\\w-])`,
  },
  // ───────────── omegaverse: dominant and submissive gestures outside sex (feed the everyday-dynamic axis) ─────────────
  {
    // "tilted his head, baring his throat", "bared his neck to the alpha", "offered his scent gland"
    id: "abo-bare-neck",
    cat: "vibe",
    abo: true,
    kw: "neck|throat|nape|gland",
    act: "baring their neck",
    subj: "b",
    weight: 0.6,
    signal: { kind: "behavior", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:bar|expos|offer|present|tilt|tipp|crane|arch|lift)\\w*\\s+(?:his|her|their)\\s+(?:neck|throat|nape|scent\\s+gland|gland)\\b`,
  },
  {
    // "submitted to his alpha", "bowed to his mate"
    id: "abo-submit",
    cat: "vibe",
    abo: true,
    kw: "alpha|mate",
    act: "submitting to an alpha",
    subj: "b",
    weight: 0.6,
    signal: { kind: "behavior", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:submitt|yield|bow|kneel|knelt|defer|surrender)\\w*\\s+(?:to\\s+)?(?:the\\s+|his\\s+|her\\s+|their\\s+)?(?:alpha|mate)\\b`,
  },
  {
    // "obeyed the alpha's command"
    id: "abo-obey",
    cat: "vibe",
    abo: true,
    kw: "command|order",
    act: "obeying an order",
    subj: "b",
    weight: 0.5,
    signal: { kind: "behavior", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:obey|complied|comply|followed|follow)\\w*\\s+(?:with\\s+)?(?:the\\s+|his\\s+|her\\s+|their\\s+)?(?:alpha(?:['’]s)?\\s+)?(?:command|order|orders)\\b`,
  },
  {
    // "lowered his eyes", "dropped his gaze": the omega's deference
    id: "abo-lower-gaze",
    cat: "vibe",
    abo: true,
    kw: "eyes|gaze|head",
    act: "lowering their gaze",
    subj: "b",
    weight: 0.3,
    signal: { kind: "behavior", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:lower|drop|avert|cast\\s+down)\\w*\\s+(?:his|her|their)\\s+(?:eyes|gaze)\\b`,
  },
  {
    // "built a nest": an omega's nesting
    id: "abo-nest",
    cat: "vibe",
    abo: true,
    kw: "nest",
    act: "nesting",
    subj: "b",
    weight: 0.3,
    signal: { kind: "behavior", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:built|build|builds|making|made|makes|arranged|arrang\\w+|gathered|gather)\\s+(?:a\\s+|his\\s+|her\\s+|their\\s+)?(?:\\w+\\s+)?nest\\b`,
  },
  {
    // "scented Dean", "scent-marked him"
    id: "abo-scent-him",
    cat: "vibe",
    abo: true,
    kw: "scent",
    act: "scent-marking someone",
    subj: "t",
    weight: 0.6,
    signal: { kind: "behavior", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:scent|scent-?mark)\\w*\\s+{B}\\b`,
  },
  {
    // "growled at Cas", "snarled at him"
    id: "abo-growl-at",
    cat: "vibe",
    abo: true,
    kw: "growl|snarl|rumbl|hiss",
    act: "growling at someone",
    subj: "t",
    weight: 0.5,
    signal: { kind: "behavior", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:growl|snarl|rumbl|hiss)\\w*\\s+(?:at\\s+)?{B}\\b`,
  },
  {
    // "used his alpha voice", "spoke in his commanding tone"
    id: "abo-alpha-voice",
    cat: "vibe",
    abo: true,
    kw: "voice|tone",
    act: "using an alpha voice",
    subj: "t",
    weight: 0.6,
    signal: { kind: "behavior", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:use|used|using|spoke|said|ordered|commanded|growled)\\w*\\s+(?:in\\s+)?(?:his|her|their)\\s+(?:alpha|commanding|command)\\s+(?:voice|tone)\\b`,
  },
  {
    // "grabbed him by the scruff"
    id: "abo-scruff",
    cat: "vibe",
    abo: true,
    kw: "scruff|nape",
    act: "holding someone by the scruff",
    subj: "t",
    weight: 0.5,
    signal: { kind: "behavior", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:grabb?|gripp?|seiz|clamp|held|hold|pinn|caught)\\w*\\s+{B:poss}\\s+(?:scruff|nape)\\b`,
  },
  {
    // "bit his scent gland", "sank his teeth into Dean's neck": a claiming bite
    id: "abo-claiming-bite",
    cat: "vibe",
    abo: true,
    kw: "bit|bite|claim|teeth",
    act: "a claiming bite",
    subj: "t",
    weight: 0.5,
    signal: { kind: "behavior", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:bit|bite|biting|claim\\w*|sank\\s+(?:his|her|their)\\s+teeth\\s+into)\\s+{B:poss}\\s+(?:neck|throat|scent\\s+gland|gland|nape|shoulder)\\b`,
  },
];

// ───────────── Dialogue: what a speaker asks for or says they want ─────────────

export interface DialogueDef {
  cat: Cat;
  act: string;
  /** Role this line implies for the SPEAKER. */
  role: "top" | "bottom";
  kind: "said" | "identity" | "ogling" | "stated" | "position" | "aftercare" | "petname";
  /** How much it counts (default 1). */
  weight?: number;
  re: RegExp;
}

const WANT = "(?:i\\s+)?(?:want|need|(?:i['’]ve|i have|always|have|ive)\\s+(?:always\\s+)?wanted|(?:i['’]ve|i have)\\s+been\\s+wanting|wanted|wanna|gonna|going|let me|i'm gonna|i’m gonna|i'll|i’ll|can i|could i|may i|i'd love|i’d love|i would love|i will|i'd like|i’d like|i've been dying|i’ve been dying|dying|desperate)";

export const DIALOGUE: DialogueDef[] = [
  // anal — speaker bottom
  { cat: "anal", act: "anal sex", role: "bottom", kind: "said", re: /(?<!\b(?:oh|well|ah|god|jesus)[,!]?\s)\bfuck me\b(?!\s+(?:with (?:your|that|those) (?:tongue|mouth|fingers?)|up|over|sideways|running|dead|this is|that's|that’s|i)\b)(?![,!]?\s*(?:that|this|it)(?:'s|’s| is| was)\b)/ },
  { cat: "anal", act: "anal sex", role: "bottom", kind: "said", re: new RegExp(`\\b${WANT}\\s+(?:to\\s+)?(?:feel\\s+)?(?:you|your (?:cock|dick)|it)\\s+(?:in(?:side)?|in me|deep(?:er)? in(?:side)?)\\s+me\\b`) },
  { cat: "anal", act: "anal sex", role: "bottom", kind: "said", re: /\b(?:want|need|wanna)\s+(?:you\s+)?to\s+(?:fuck|be inside|be in|breed|knot|fill|take|peg)\s+me\b/ },
  { cat: "anal", act: "anal sex", role: "bottom", kind: "said", re: /\b(?:want|need)\s+you\s+(?:inside|in)\s+me\b/ },
  { cat: "anal", act: "anal sex", role: "bottom", kind: "said", re: /(?:^|[.!?,]\s*|please,?\s+)(?:fill|breed|knot|pound|peg|wreck)\s+me\b/ },
  { cat: "anal", act: "anal sex", role: "bottom", kind: "said", re: new RegExp(`\\b${WANT}\\s+(?:to\\s+)?ride\\s+(?:you|your (?:cock|dick)|(?:his|her|their|that|this|the|a|[a-z]+['’]s)\\s+(?:[a-z-]+\\s+)?(?:cock|dick|prick))\\b`) },
  { cat: "anal", act: "anal sex", role: "bottom", kind: "said", re: /\b(?:you|u) (?:can|could|should|get to|gotta|have to|wanna|want to) top\b|\blet you top\b/ },
  { cat: "anal", act: "anal sex", role: "bottom", kind: "said", re: /(?:^|[.!?,]\s*|please,?\s+|just\s+|now,?\s+)get (?:in|inside|in side) me\b|\bget in me\b/ },
  { cat: "anal", act: "anal sex", role: "bottom", kind: "identity", re: /\bi(?:'m|’m| am) (?:a |such a |more of a |usually a |kind of a |kinda a |total |power |a total |a power )?bottom\b/ },
  { cat: "anal", act: "anal sex", role: "bottom", kind: "identity", re: /\bi (?:usually |always |only |mostly |prefer to |like to |love to |want to |wanna |'d like to |’d like to |would like to |'d rather |’d rather )bottom\b/ },
  // anal — speaker bottom: wishes and stated tastes about being fucked, whoever the cock belongs to
  { cat: "anal", act: "anal sex", role: "bottom", kind: "said", re: new RegExp(`\\b${WANT}\\s+(?:to\\s+)?(?:get|be|getting|being)\\s+(?:fucked|plowed|plowed|pounded|railed|bred|knotted|filled|stuffed|wrecked|ruined|used|split|stretched|ridden|screwed|nailed|banged|rammed|owned|claimed|ravished|destroyed|mounted|pegged|taken|ploughed|reamed)\\b(?!\\s+(?:up|over|off|around|with|by (?:the|a) (?:system|government|bank))\\b)`) },
  { cat: "anal", act: "anal sex", role: "bottom", kind: "said", re: new RegExp(`\\b${WANT}\\s+(?:him|her|them|someone|somebody|[a-z]+)\\s+to\\s+(?:just\\s+)?(?:fuck|plow|plough|pound|rail|ream|wreck|ruin|destroy|breed|knot|fill|stretch|split|use|take|screw|nail|bang|mount|own|claim|ravish|peg|stuff|ride)\\s+me\\b`) },
  { cat: "anal", act: "anal sex", role: "bottom", kind: "said", re: new RegExp(`\\b${WANT}\\s+(?:his|her|their|that|this|your|a|some)\\s+(?:[a-z-]+\\s+)?(?:cock|dick|prick)\\s+(?:in|inside|up|deep in|buried in|stuffed in)\\s+(?:me|my (?:ass|hole|arse))\\b`) },
  { cat: "anal", act: "anal sex", role: "bottom", kind: "said", re: /\b(?:put|stick|shove|slide|slip|get)\s+(?:it|that|your (?:cock|dick)|him|his (?:cock|dick))\s+(?:in|inside|into)\s+me\b|\b(?:come|cum)\s+(?:in|inside)\s+me\b/ },
  { cat: "anal", act: "anal sex", role: "bottom", kind: "said", re: /(?:^|[.!?,]\s*|please,?\s+|just\s+|now,?\s+)(?:plow|plough|ream|rail|ruin|destroy|split|stuff|wreck)\s+me\b/ },
  { cat: "anal", act: "anal sex", role: "bottom", kind: "said", weight: 0.8, re: /(?:^|[.!?,]\s*|please,?\s+|just\s+|now,?\s+)(?:use|own|claim|take|mount|ride)\s+me\s+(?:hard|rough|raw|like|until|already|now|good)\b|(?:^|[.!?,]\s*|please,?\s+)(?:use|own|claim)\s+me\b(?!\s+(?:as|for|to|in|on|a|an|the)\b)/ },
  { cat: "anal", act: "anal sex", role: "bottom", kind: "stated", weight: 0.9, re: /\bi(?:'m| am)?\s+(?:so |really |totally |just |absolutely |fucking )*(?:love|like|enjoy|crave|need|adore|live for)s?\s+(?:getting|being|to get|to be)\s+(?:fucked|plowed|plowed|ploughed|pounded|railed|bred|knotted|filled|stuffed|wrecked|ruined|used|stretched|split|ridden|screwed|nailed|banged|taken|owned|claimed)\b(?!\s+(?:up|over|off|around|with)\b)|\bi(?:'m| am)?\s+(?:so |really |totally |just |absolutely |fucking )*(?:love|like|enjoy|crave|need|adore)s?\s+(?:taking|riding)\s+(?:a\s+|some\s+|that\s+|big\s+|thick\s+|your\s+)*(?:cock|dick|it)\b/ },
  { cat: "anal", act: "anal sex", role: "bottom", kind: "stated", weight: 0.6, re: /\bi\s+(?:really |just |absolutely |fucking |so |totally |honestly )*(?:love|crave|need|adore|worship|want)\s+(?:a good |some |big |thick |hard |fat |a big |a thick |a hard |a fat )*(?:cock|dick)\b(?!\s+(?:in|inside|up|on|to|out|you)\b)|\bi(?:'m| am)\s+(?:a |such a |an )?(?:cock\s?slut|cock\s?whore|cock-hungry|dick-hungry|slut for (?:cock|dick|your cock|your dick)|addicted to (?:cock|dick|your cock|your dick))\b/ },
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
  { cat: "anal", act: "checking out a cock", role: "bottom", kind: "ogling", re: /(?<!\b(?:this|my|that|his|want|wanted|inside)\s(?:\w+\s)?)\b(?:nice|great|gorgeous|perfect|amazing|big|huge|thick|beautiful|pretty|fucking) (?:fucking )?(?:cock|dick)\b(?!\s+(?:inside|in|up|into|deep|down|in\s+you))|\byour (?:cock|dick) (?:is|looks|feels)\b/ },
  { cat: "oral", act: "checking out a cock", role: "bottom", kind: "ogling", re: /(?<!\b(?:this|my|that|his|want|wanted|inside)\s(?:\w+\s)?)\b(?:nice|great|gorgeous|perfect|amazing|big|huge|thick|beautiful|pretty|fucking) (?:fucking )?(?:cock|dick)\b(?!\s+(?:inside|in|up|into|deep|down|in\s+you))|\byour (?:cock|dick) (?:is|looks|feels)\b/ },
  // oral — speaker top (getting sucked, or eating ass)
  // Offering your mouth to be used: bottom-coded whoever's cock it is (oral hints don't feed the vibe, so this is a vibe cue).
  { cat: "vibe", act: "asking to be fed a cock", role: "bottom", kind: "said", weight: 0.8, re: /\bfeed (?:it|that|your (?:cock|dick)) to me\b|\bfeed me (?:your|that) (?:cock|dick)\b|\b(?:fill|use) my (?:mouth|throat)\b|\bfuck my (?:mouth|throat|face)\b|\bput it in my mouth\b/ },
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
  { cat: "anal", act: "fisting", role: "bottom", kind: "said", re: /(?:^|[.!?,]\s*|please,?\s+)fist me\b|\b(?:want|need|wanna|gonna|going to)\s+(?:you\s+)?to\s+fist\s+me\b/ },
  { cat: "anal", act: "fisting", role: "top", kind: "said", re: /\b(?:want|wanna|gonna|going to|need|let me)\s+(?:to\s+)?fist\s+you\b/ },
  { cat: "oral", act: "rimming", role: "bottom", kind: "said", re: /(?:^|[.!?,]\s*|please,?\s+|just\s+)(?:eat me out|rim me|lick me open|eat my (?:ass|arse)|tongue-?fuck me)\b/ },
  { cat: "oral", act: "rimming", role: "bottom", kind: "said", re: /\b(?:want|need|wanna)\s+(?:you\s+)?to\s+(?:eat me out|rim me|eat my (?:ass|arse))\b/ },
  { cat: "oral", act: "rimming", role: "bottom", kind: "said", re: /\b(?:want|need)\s+your\s+(?:tongue|mouth)\s+(?:in\s+me|(?:in|on)\s+my\s+(?:ass|arse|hole))\b/ },
  { cat: "oral", act: "blowjob", role: "top", kind: "said", weight: 0.8, re: /\b(?:want|need)\s+your\s+(?:mouth|lips)\s+on\s+me\b/ },
  // ── vibe: stated preference ("I like being on top", "I never bottom") ──
  { cat: "anal", act: "saying they like to top", role: "top", kind: "stated", weight: 0.9, re: /\bi (?:really |just |always |do |absolutely )?(?:like|love|prefer|enjoy|need|crave) (?:being (?:the one )?(?:on top|in control|in charge|the top)(?! of)|topping\b|taking charge|(?:fucking|being inside) you\b|being the one (?:who )?(?:fucks|tops|in charge))/ },
  { cat: "anal", act: "saying they never bottom", role: "top", kind: "stated", weight: 0.9, re: /\bi (?:never|don'?t|do not|won'?t|will not|can'?t|cannot|refuse to) (?:ever |really |usually )?bottom\b|\bi(?:'m| am) not (?:a |much of a )?bottom\b/ },
  { cat: "anal", act: "saying they like to bottom", role: "bottom", kind: "stated", weight: 0.9, re: /\bi (?:really |just |always |do |absolutely )?(?:like|love|prefer|enjoy|need|crave) (?:being (?:fucked|filled|taken|stretched|bred|pinned down|used|on the bottom|underneath)|getting (?:fucked|filled|taken|stretched|pounded|railed|bred)|bottoming\b|taking (?:it|cock|dick|you)\b|(?:it when you|when you) (?:fuck|take|use|pin|fill|breed) me)/ },
  { cat: "anal", act: "saying they never top", role: "bottom", kind: "stated", weight: 0.9, re: /\bi (?:never|don'?t|do not|won'?t|will not|can'?t|cannot|refuse to) (?:ever |really |usually )?top\b(?!\s+(?:of|off|up))|\bi(?:'m| am) not (?:a |much of a )?top\b/ },
  { cat: "anal", act: "praising how well someone takes it", role: "top", kind: "said", weight: 0.7, re: /\byou take (?:it|me|my cock|all of me|that|everything) (?:so |just |really |fucking )*(?:well|good|beautifully|perfectly|nicely)\b|\bsuch a good (?:boy|girl|bottom) for (?:me|taking)/ },
  // ── vibe: position and initiative, aftercare, pet names ──
  { cat: "vibe", act: "checking in or leading", role: "top", kind: "position", weight: 0.4, re: /(?:^|[.!?,]\s*)(?:ready\?|you ready\?|are you ready\??|ready for me\??|tell me (?:if|when)|say (?:stop|the word)|is this (?:ok|okay|alright|good)\??|am i hurting you|did i hurt you|does (?:it|that) hurt\??|(?:relax|breathe) for me|let me know if)/ },
  { cat: "vibe", act: "looking after someone", role: "top", kind: "aftercare", weight: 0.4, re: /\blet me (?:clean|take care of|wipe|wash|look after) you\b|\bi(?:'ve| have) got you\b|\byou did (?:so |really |very )?(?:well|good|perfect|beautifully)\b|\bgood job\b/ },
  { cat: "vibe", act: "asking to be held", role: "bottom", kind: "aftercare", weight: 0.4, re: /\b(?:hold me|stay with me|don'?t let go|i can'?t (?:move|feel my legs|walk))\b/ },
  { cat: "vibe", act: "calling someone a good boy/girl", role: "top", kind: "petname", weight: 0.5, re: /\bgood (?:boy|girl|pet|kitten|puppy)\b|\bpretty (?:boy|thing)\b|\bsweet boy\b/ },
  { cat: "vibe", act: "calling someone daddy/sir", role: "bottom", kind: "petname", weight: 0.5, re: /\b(?:please|yes|thank you|thanks),? (?:daddy|sir|master|mistress|mommy)\b|\bdaddy\b(?!\s+(?:issues|long legs))|\byes,? sir\b/ },
];

/** Sex-context vocabulary for patterns with innocent readings ("pushed into him" in a crowd). */
export const SEX_CTX =
  /\b(?:cock|dick|prick|hole|ass|arse|lube|lubed|slick|slicked|naked|thrust(?:s|ed|ing)?|moan(?:s|ed|ing)?|groan(?:s|ed|ing)?|fuck\w*|cum|come|came|coming|hard|erection|inside|prostate|butt-?hole|anus|nerves|stretch\w*|condom|bed|sheets|hips|orgasm|climax|rim\w*|tongue|knot|whimper\w*|gasp\w*|panting|pant\w*|sweat\w*|filthy|tight|wet|aching|strap|dildo|pussy|clit)\b/i;

export const PENIS_CTX = /\b(?:cock|dick|prick|length|shaft|erection|hard-?on|member|manhood|strap|dildo|knot|girth)\b/i;
export const ANAL_CTX =
  /\b(?:ass|arse|anal|anus|asshole|arsehole|butt-?hole|sphincter|rosebud|starfish|back ?door|back entrance|rings? of muscles?|(?:ass|arse|butt) crack|(?<!front[ -]?)hole|prostate|rim\w*|pegg\w*|sodomi[sz]\w*|buggered|buggering|bugger|cheeks|bum|butt)\b/i;
/** Vaginal vocabulary. Used instead of gender, since male omegas and trans men may have vaginas. */
export const VULVA_CTX =
  /\b(?:pussy|cunt|vagina\w*|labia|clit(?:oris)?|front[ -]?hole|vulva|cervix|t-?dick|(?:her|wet|slick|swollen) folds|(?:his|her|their|my|your)\s+(?:\w+\s+)?seam(?!\s+of))\b/i;
export const FINGER_CTX = new RegExp(`\\b${FINGERS}\\b`, "i");
