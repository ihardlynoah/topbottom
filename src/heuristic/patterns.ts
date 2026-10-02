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

export type Cat = "anal" | "oral" | "vaginal";

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
  needsPenis?: boolean;
  /** Sentence must match this too. */
  needs?: RegExp;
  /** Words at least one of which must appear (for patterns whose verbs can't be read off automatically). */
  kw?: string;
  /** Oral patterns whose receiver might be a woman: "went down on her" is cunnilingus, licker = top. */
  femaleTarget?: "flip" | "drop";
  /** Not an act: a hint about who'd top (ogling an ass, grabbing it, staring at a bulge). */
  signal?: { kind: "ogling" | "touch" | "prep"; actorRole: "top" | "bottom" };
}

export interface CompiledPattern extends PatternDef {
  re: RegExp;
  /** Cheap pre-check: the sentence must contain one of the pattern's verbs/nouns. */
  gate?: RegExp;
  /** The subject isn't in the match; it's the nearest subject earlier in the sentence. */
  elided?: boolean;
}

const PENIS_ADJ =
  "hard|thick|aching|leaking|throbbing|swollen|heavy|wet|slick|stiff|big|long|huge|rigid|straining|twitching|flushed|full|whole|fat|dripping|weeping|pretty|perfect|lubed|slicked|neglected|own|entire|impressive|spit-slick|spit-slicked|knotted|swelling|cut|uncut|red|angry";
const ASS_ADJ =
  "tight|slick|wet|loose|puffy|stretched|sensitive|twitching|fluttering|clenching|quivering|eager|needy|empty|furled|pink|swollen|little|perfect|lubed|slicked|gaping|greedy|virgin|own|pretty|spit-slick|spit-slicked|sloppy|abused|used|sore|hot|warm|soft|willing|waiting|untouched|clenched";
const MOUTH_ADJ = "hot|wet|warm|open|eager|pretty|soft|swollen|perfect|waiting|willing|own|sweet|tight|filthy|slack|stretched|talented|clever|sinful|greedy";

export const PENIS = `(?:(?:${PENIS_ADJ})\\s+){0,2}(?:cock(?:head)?|dick|prick|length|shaft|erection|member|hard-?on|manhood|girth|knot|strap(?:-?on)?|dildo|balls)`;
export const ASS = `(?:(?:${ASS_ADJ})\\s+){0,2}(?:ass(?:hole)?|arse(?:hole)?|front ?hole|hole|entrance|rim|opening|pucker|bum|butt|insides?|prostate|body|backside|channel|pussy|cunt|vagina|folds|cervix|sex)`;
const RIM = `(?:(?:${ASS_ADJ})\\s+){0,2}(?:ass(?:hole)?|arse(?:hole)?|hole|entrance|rim|pucker|crack|cleft|taint|perineum)`;
const MOUTH = `(?:(?:${MOUTH_ADJ})\\s+){0,2}(?:mouth|lips|throat|tongue)`;
const FACE = `(?:(?:${MOUTH_ADJ})\\s+){0,2}(?:mouth|throat|face)`;
const VULVA = `(?:(?:\\w+)\\s+)?(?:clit(?:oris)?|pussy|cunt|folds|slit|labia|vulva|sex|cunny|front ?hole|t-?dick)`;
export const FINGERS = `(?:fingers?|digits?|knuckles?|thumb|fingertips?)`;

const AUX =
  "(?<aux>(?:(?:was|were|is|are|had|has|have|been|being|be|kept|keeps|started|starts|began|begins|continued|continues|would|could|will|can|might|must|should|shall|wanted|wants|want|needed|needs|need|longed|wished|tried|tries|going|gonna|wanna|got|get|gets|did|does|do|finally|just|then|still|already|almost|barely|never|not|to|also|immediately|eventually|again|always|usually|often|sometimes|only|rarely|soon|now|quickly|really|actually|lazily|happily|greedily|[a-z]+ly|[a-z]+n['’]t|'d|’d|'ll|’ll|used)\\s+){0,4})";

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
const ASS_KW = "ass|arse|hole|entrance|rim|opening|pucker|bum|butt|inside|insides|prostate|channel|backside|pussy|cunt|vagina|folds|cervix|sex";
const BUTT_KW = "ass|arse|butt|bum|backside|behind|rear|cheeks|glutes";
const CROTCH_KW = "crotch|groin|bulge|package|cock|dick|erection|hard|fly|zip|sweatpants";

/** Gates for patterns that don't start with a verb list (subject is a body part, passive voice, etc.). */
const MANUAL_GATES: Record<string, string> = {
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
    const gateWords = def.kw ?? MANUAL_GATES[def.id] ?? deriveGate(def.src);
    const gate = gateWords ? new RegExp(`(?:${gateWords})`, "i") : undefined;
    out.push({ ...def, re: new RegExp(src, "g"), gate });

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
    src: `\\b{T}\\s+{aux}(?:fuck(?:s|ed|ing)?|screw(?:s|ed|ing)?|pound(?:s|ed|ing)?|rail(?:s|ed|ing)?|plough(?:s|ed|ing)?|plow(?:s|ed|ing)?|bang(?:s|ed|ing)?|breed(?:s|ing)?|bred|knot(?:s|ted|ting)?|peg(?:s|ged|ging)?|mount(?:s|ed|ing)?|sodomi[sz](?:e|es|ed|ing)|bugger(?:s|ed|ing)?)\\s+{B:ass}(?!\\s+(?:up|over)\\b)`,
  },
  {
    id: "push-into",
    cat: "anal",
    act: "anal sex",
    subj: "t",
    weight: 1,
    needsCtx: true,
    src: `\\b{T}\\s+{aux}(?:push|slid|slide|slip|sink|sank|sunk|thrust|drove|drive|eas|sheath|bur(?:y|ie)|guid|snap|forc|shov|plung|slam|pump|seat|slot|rut|ram|pound|fuck|rail|hammer|bang|drill|surg|sli)\\w*\\s+(?:(?:${SELF}|it|{x's}\\s+{PENIS}|{x's}\\s+hips|the\\s+(?:head|tip)(?:\\s+of\\s+{x's}\\s+{PENIS})?|(?:a|the)\\s+(?:strap(?:-?on)?|dildo|toy|plug))\\s+)?${DEPTH}(?:in(?:to|side)?|past|through)\\s+{B:ass}`,
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
    src: `\\b{T:penisReq}\\s+{aux}(?:\\w+\\s+){0,2}?(?:slid|slide|slip|push|sank|sink|press|drove|drive|bur(?:y|ie)|thrust|plung|disappear|vanish|sheath|work|slam|ram|pound|throb|twitch|puls|swell|swole|knot|lodg|seat|nestl|rest|mov|stay|remain|fill|fit|sat|sit)\\w*\\s+${DEPTH}(?:in(?:to|side)?|past|through)\\s+{B:ass}`,
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
    src: `\\b{T}\\s+{aux}(?:(?:was|were|is|'s|’s|finally|fully|still|all the way|deep|buried|seated|sheathed|balls-deep|balls deep|completely|halfway|already|right|so|now)\\s+)+(?:inside|in)\\s+{B:ass}`,
  },
  {
    id: "penis-inside",
    cat: "anal",
    act: "anal sex",
    subj: "t",
    weight: 1,
    src: `\\b{T:penisReq}\\s+(?:(?:was|is|still|now|finally|fully|deep|all the way|balls-deep|buried|lodged|seated|sheathed|nestled|halfway|already|so)\\s+)+(?:inside|in|up)\\s+{B:ass}`,
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
    src: `\\b{T}\\s+{aux}(?:enter(?:s|ed|ing)?|penetrat(?:e|es|ed|ing)|breach(?:es|ed|ing)?|impal(?:e|es|ed|ing)|spear(?:s|ed|ing)?|took|take|takes|taking)\\s+{B:ass}(?=\\s*[,.;:!?—–]|\\s*$|\\s+(?:with|in one|in a|slowly|carefully|from behind|hard|deep|all the way|inch|bare|raw|for the first time|again|at last|finally)\\b)`,
  },
  {
    id: "fill",
    cat: "anal",
    act: "anal sex",
    subj: "t",
    weight: 0.5,
    needsCtx: true,
    needsPenis: true,
    src: `\\b{T}\\s+{aux}(?:fill(?:s|ed|ing)?|split(?:s|ting)?|claim(?:s|ed|ing)?|wreck(?:s|ed|ing)?|ruin(?:s|ed|ing)?|stuff(?:s|ed|ing)?)\\s+{B:ass}(?:\\s+(?:up|open|apart|full))?`,
  },
  {
    id: "riding",
    cat: "anal",
    act: "anal sex (riding)",
    subj: "b",
    weight: 1,
    needsCtx: true,
    src: `\\b{B}\\s+{aux}(?:rode|ride|rides|riding|ridden|bounc(?:e|es|ed|ing)\\s+on|fuck(?:s|ed|ing)?\\s+${SELF}\\s+(?:back\\s+|down\\s+)*(?:on(?:to)?)|impal(?:e|es|ed|ing)\\s+${SELF}\\s+on|lower(?:s|ed|ing)?\\s+${SELF}\\s+(?:down\\s+)?on(?:to)?|(?:sink|sank|sinks|sinking|sunk)\\s+(?:back\\s+|all the way\\s+|slowly\\s+)*down\\s+on(?:to)?|eas(?:e|es|ed|ing)\\s+${SELF}\\s+(?:down\\s+)?on(?:to)?|seat(?:s|ed|ing)?\\s+${SELF}\\s+on|work(?:s|ed|ing)?\\s+${SELF}\\s+(?:up\\s+and\\s+down\\s+|down\\s+)?on(?:to)?|push(?:es|ed|ing)?\\s+(?:${SELF}\\s+)?back\\s+on(?:to)?)\\s+{T:penis}(?!\\s+(?:thigh|face|mouth|tongue|fingers?|lap|knee|leg|chest|back|shoulders|horse|bike)s?\\b)`,
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
    src: `\\b{B}\\s+{aux}(?:was|were|is|got|gets|get|getting|being|been|be)\\s+(?:(?:so|thoroughly|properly|well|roughly|finally|hard|fully|truly|good|completely|absolutely)\\s+)*(?:fucked|railed|pounded|bred|knotted|pegged|penetrated|screwed|impaled|breached|topped|plowed|ploughed|filled|stretched)\\b(?!\\s+(?:up|over|with (?:dread|fear|anger|joy|guilt|regret|warmth|affection|longing|emotion|tension|pride|hope|relief))\\b)(?:\\s+(?:\\w+\\s+){0,4}?by\\s+{T:penis})?`,
  },
  {
    id: "bottomed-for",
    cat: "anal",
    act: "anal sex",
    subj: "b",
    weight: 0.8,
    src: `\\b{B}\\s+{aux}bottom(?:s|ed|ing)?\\b(?!\\s+(?:out|of|up|off|half|lip|drawer|step|line|shelf)\\b)(?:\\s+for\\s+{T})?`,
  },
  {
    id: "topped",
    cat: "anal",
    act: "anal sex",
    subj: "t",
    weight: 0.8,
    src: `\\b{T}\\s+{aux}top(?:s|ped|ping)?\\b(?!\\s+(?:up|off|of|with|the|it|that|this|out|his|her|their|my|your|a|an)\\b)(?:\\s+{B})?`,
  },

  // ───────────── ANAL: fingering ─────────────
  {
    id: "fingered",
    cat: "anal",
    act: "fingering",
    subj: "t",
    weight: 1,
    src: `\\b{T}\\s+{aux}(?:finger(?:s|ed|ing)?|finger-?fuck(?:s|ed|ing)?|finger fuck(?:s|ed|ing)?)\\s+{B:ass}`,
  },
  {
    id: "fingers-into",
    cat: "anal",
    act: "fingering",
    subj: "t",
    weight: 1,
    src: `\\b{T}\\s+{aux}(?:push|slid|slide|slip|eas|press|work|crook|curl|sink|sank|thrust|add|scissor|twist|insert|wiggl|drove|guid|teas|circl|rub)\\w*\\s+(?:(?:a|one|two|three|four|another|the|{x's}|first|second|third|slick|lubed|wet|long|thick|blunt)\\s+){0,3}${FINGERS}\\s+(?:(?:back|deep(?:er)?|slowly|all the way|further|carefully|gently|in|up)\\s+)*(?:in(?:to|side)?|past|through|around|against|over|at)\\s+{B:ass}`,
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
    src: `\\b{T}\\s+{aux}(?:\\w+\\s+){0,2}?(?:hit|found|find|brush|nail|graz|nudg|strok|rubb|press|massag|jab|crook|curl|tap|circl|pound|slam|drag|angl)\\w*\\s+(?:(?:against|over|right|at|on|up against|into|for)\\s+)*{B:poss}\\s+prostate`,
  },

  // ───────────── ORAL: blowjobs (top = the one getting sucked) ─────────────
  {
    id: "sucked",
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 1,
    femaleTarget: "drop",
    src: `\\b{B}\\s+{aux}(?:suck(?:s|ed|ing)?|blow|blows|blew|blowing|deep-?throat(?:s|ed|ing)?|swallow(?:s|ed|ing)?\\s+(?:down|around)|gag(?:s|ged|ging)?\\s+on|chok(?:e|es|ed|ing)\\s+on|bob(?:s|bed|bing)?\\s+(?:\\w+\\s+){0,2}?on|worship(?:s|ped|ping)?)\\s+(?:on\\s+|at\\s+)?{T:penis}(?!\\s+(?:a kiss|kisses|away|out of the water|off (?:to|for|as)|in(?:to)? (?:his|her|their) arms)\\b)`,
  },
  {
    id: "licked-cock",
    cat: "oral",
    act: "blowjob",
    subj: "b",
    weight: 0.9,
    src: `\\b{B}\\s+{aux}(?:lick|tongu|mouth|kiss|nuzzl|lap|nos|trac|swirl|flick|ran|run|drag|suckl|nibbl|lav)\\w*\\s+(?:(?:his|her|their|my|your)\\s+(?:tongue|lips|mouth)\\s+)?(?:(?:up|along|over|at|around|down|on|across|against|the (?:tip|head|underside|length|slit|base|vein) of|from (?:the )?base to tip|from root to tip|a\\s+(?:\\w+\\s+){0,2}?(?:stripe|line|path|trail)\\s+(?:up|along|down))\\s+)*{T:penisReq}`,
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
    src: `\\b{B}\\s+{aux}(?:went|go|goes|going|gone|get|got|getting|slid|slide|slides|sliding|kneel|knelt|dropped|drop|drops|dropping|sank|sink|sinks|sinking|moved|move|moves|moving|kiss(?:ed|es|ing)? (?:his|her|their|my|your) way)\\s+down\\s+(?:on|to)\\s+{T}\\b(?!\\s+(?:one|both|the|a|his|her)\\b)`,
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
    src: `\\b{T}\\s+{aux}(?:fuck(?:s|ed|ing)?|thrust(?:s|ing)?|push(?:es|ed|ing)?|rock(?:s|ed|ing)?|snap(?:s|ped|ping)?|pump(?:s|ed|ing)?|slid|slide|slides|sliding|drove|drive|drives|driving|slam(?:s|med|ming)?)\\s+(?:(?:${SELF}|{x's}\\s+{PENIS}|{x's}\\s+hips)\\s+)?${DEPTH}(?:in(?:to|side)?\\s+|between\\s+|past\\s+|down\\s+)?{B:faceReq}`,
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
    src: `\\b{T}\\s+{aux}(?:ate|eat|eats|eating|eaten)\\s+{B}\\s+out\\b`,
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
    src: `\\b{T}\\s+{aux}(?:lick|tongu|lap|kiss|suck|nuzzl|mouth|nibbl|lav|flick|swirl)\\w*\\s+(?:(?:his|her|their|my|your)\\s+tongue\\s+)?(?:(?:into|at|over|across|around|along|against|inside|in|up|down|on|between|past|the rim of|a\\s+(?:\\w+\\s+){0,2}?(?:stripe|line|path|trail)\\s+(?:up|along|down|over|across))\\s+)*{B:rimReq}`,
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
    src: `\\b{T}\\s+{aux}(?:lick|lap|suck|tongu|eat|ate|kiss|nuzzl|mouth|devour|feast|flick|circl)\\w*\\s+(?:(?:at|over|along|up|into|around|on|between|across)\\s+)*{B:vulvaReq}`,
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
    src: `\\b(?<lead>having|feeling|felt|feel|feels|with|of|want(?:ed|s)?|need(?:ed|s)?|crav(?:ed|es)?)\\s+{T}\\s+(?:(?:deep|so deep|buried|all the way|finally|still|right)\\s+)*(?:inside|in)\\s+{B:ass}`,
  },
  {
    id: "pushed-in",
    cat: "anal",
    act: "anal sex",
    subj: "t",
    weight: 0.7,
    needsCtx: true,
    src: `\\b{T}\\s+{aux}(?:push|slid|slide|slip|sink|sank|thrust|eas|sheath|guid|rock|snap|fuck|press)\\w*\\s+(?:${SELF}\\s+)?(?:(?:back|forward|slowly|carefully|deep|all the way|right|finally|gently)\\s+)*(?:in|inside|home)(?![\\w-])(?!\\s*(?:to|the|a|an|his|her|their|my|your|front|back|line|time|place|close|closer|between|with|for|on|at|of|and then the)\\b)`,
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
    src: `\\b{T}\\s+{aux}(?:lin(?:e|es|ed|ing)|position(?:s|ed|ing)?|align(?:s|ed|ing)?)\\s+(?:${SELF}|{x's}\\s+{PENIS})\\s+up(?:\\s+(?:with|against|at)\\s+{B:ass})?`,
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
  {
    id: "spread-legs",
    cat: "anal",
    act: "spreading their legs",
    subj: "b",
    weight: 0.7,
    needsCtx: true,
    signal: { kind: "prep", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}(?:spread|parted|opened|spreads|parts|opens|spreading|parting|opening)\\s+(?:his|her|their|my|your)\\s+(?:legs|thighs|knees)(?:\\s+(?:wider\\s+|wide\\s+)?for\\s+{T})?`,
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
    src: `\\b{B}\\s+{aux}(?:bent|bends|bending|leaned|leaning|draped\\s+${SELF})\\s+over\\s+the\\s+(?:desk|bed|table|counter|couch|sofa|sink|car|hood|arm|back)\\b`,
  },
  {
    id: "presented",
    cat: "anal",
    act: "presenting",
    subj: "b",
    weight: 0.8,
    needsCtx: true,
    signal: { kind: "prep", actorRole: "bottom" },
    src: `\\b{B}\\s+{aux}present(?:ed|s|ing)?\\s+(?:${SELF}|{x's}\\s+(?:ass|arse|hole))`,
  },
  {
    id: "pushed-head-down",
    cat: "oral",
    act: "pushing a head down",
    subj: "t",
    weight: 0.7,
    needsCtx: true,
    signal: { kind: "prep", actorRole: "top" },
    src: `\\b{T}\\s+{aux}(?:push|press|guid|pull|forc|shov|tug|urg)\\w*\\s+{B:poss}\\s+(?:head|face|mouth)\\s+(?:back\\s+)?(?:down|lower|onto|toward|towards|against)`,
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
    src: `\\b{T}\\s+{aux}(?:grab|squeez|grop|palm|slap|smack|knead|cup|fondl|pinch|spank|clutch|swat)\\w*\\s+(?:a\\s+handful\\s+of\\s+)?{B:poss}\\s+(?:\\w+\\s+){0,2}?(?:ass|arse|butt|bum|backside|behind|cheeks)\\b`,
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
  { cat: "anal", act: "anal sex", role: "top", kind: "identity", re: /\bi(?:'m|’m| am) (?:a |such a |more of a |usually a |kind of a |kinda a |total |a total )?top\b/ },
  { cat: "anal", act: "anal sex", role: "top", kind: "identity", re: /\bi (?:usually |always |only |mostly |prefer to |like to |love to |want to |wanna |'d like to |’d like to |would like to |'d rather |’d rather )top\b/ },
  // anal — said during sex: "you're so tight" (speaker is inside), "you're so big" (speaker is receiving)
  { cat: "anal", act: "anal sex", role: "top", kind: "said", weight: 0.8, re: /\byou(?:'re| are| feel| felt| were)\s+(?:so\s+|fucking\s+|still\s+|always\s+|perfect\s+and\s+)*tight\b|\byou feel (?:so )?(?:good|amazing|perfect|incredible|fucking good)? ?around me\b|\b(?:clench|squeez|tighten)\w* (?:around|on) me\b|\btake (?:it(?=\s*(?:[,.!?]|$|\s+(?:all|deep|like|for me|baby|sweetheart|good|so well)\b))|my (?:cock|dick|knot)\b)/ },
  { cat: "anal", act: "anal sex", role: "bottom", kind: "said", weight: 0.8, re: /\byou(?:'re| are| feel| felt)\s+(?:so\s+|fucking\s+)*(?:big|huge|deep|thick)\b|\bso (?:full|deep)\b|\bstretch(?:ing)? me\b|\b(?:need|want|crave)\s+(?:your|that)\s+(?:cock|dick|knot)\b(?!\s+in my mouth)/ },
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
  /\b(?:cock|dick|prick|hole|ass|arse|lube|lubed|slick|slicked|naked|thrust(?:s|ed|ing)?|moan(?:s|ed|ing)?|groan(?:s|ed|ing)?|fuck\w*|cum|come|came|coming|hard|erection|inside|prostate|stretch\w*|condom|bed|sheets|hips|orgasm|climax|rim\w*|tongue|knot|whimper\w*|gasp\w*|panting|pant\w*|sweat\w*|filthy|tight|wet|aching|strap|dildo|pussy|clit)\b/i;

export const PENIS_CTX = /\b(?:cock|dick|prick|length|shaft|erection|hard-?on|member|manhood|strap|dildo|knot|girth)\b/i;
export const ANAL_CTX = /\b(?:ass|arse|anal|anus|asshole|arsehole|(?<!front[ -]?)hole|prostate|rim\w*|backdoor|pegg\w*|cheeks|bum|butt)\b/i;
/** Vaginal vocabulary. Used instead of gender, since male omegas and trans men may have vaginas. */
export const VULVA_CTX =
  /\b(?:pussy|cunt|vagina\w*|labia|clit(?:oris)?|front[ -]?hole|vulva|cervix|t-?dick|(?:her|wet|slick|swollen) folds|(?:his|her|their|my|your)\s+(?:\w+\s+)?seam(?!\s+of))\b/i;
export const FINGER_CTX = new RegExp(`\\b${FINGERS}\\b`, "i");
