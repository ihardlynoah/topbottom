// Epithets: descriptive stand-ins for names ("the blond", "the taller man", "the American", "the older boy").
//
// Each epithet maps to a canonical key ("hair:blond", "cmp:taller", "nat:american") so that variants
// ("the blond", "the blonde man", "the fair-haired boy") are learned together. Mappings come from:
//   - hair:        "Draco's pale blond hair", "Draco was a redhead"
//   - comparisons: "Harry was taller than Draco", "Harry towered over Draco", "Draco was two years older"
//   - absolutes:   "Steve was a big man", "Peter was young"
//   - nationality: "Steve's American accent", "Bucky was Russian", "Bucky was from Russia"
//   - appositives: "Draco, the blond," / "the blond, Draco,"
//   - AO3 tags:    "Alpha Derek Hale", "Omega Stiles Stilinski"
// With exactly two main characters, an opposite is inferred ("taller" known → "shorter" is the other one).

import { type Cast, type Character, type Gender, escapeRe } from "./characters";

interface Descriptor {
  key: string;
  /** Words usable alone after "the" ("the blond", "the taller", "the American"). */
  alone: string[];
  /** Words that need a noun after them ("the tall man", not "the tall"). */
  needsNoun?: string[];
  /** Nouns that are this descriptor by themselves ("the redhead", "the Brit"). */
  nouns?: string[];
}

const HAIR: Descriptor[] = [
  { key: "hair:blond", alone: ["blond", "blonde", "fair-haired", "blond-haired", "blonde-haired", "golden-haired", "platinum-haired", "flaxen-haired", "sandy-haired", "towheaded", "white-blond", "platinum blond"] },
  { key: "hair:dark", alone: ["brunet", "brunette", "dark-haired", "black-haired", "brown-haired", "raven-haired", "darker-haired", "dark-headed"] },
  { key: "hair:red", alone: ["redheaded", "red-haired", "ginger", "auburn-haired", "copper-haired", "strawberry-blond", "strawberry-blonde"], nouns: ["redhead"] },
  { key: "hair:silver", alone: ["silver-haired", "grey-haired", "gray-haired", "white-haired", "salt-and-pepper-haired"] },
  { key: "hair:curly", alone: ["curly-haired", "curly-headed"] },
  { key: "hair:pink", alone: ["pink-haired"] },
  { key: "hair:blue", alone: ["blue-haired"] },
  { key: "hair:green", alone: ["green-haired"] },
  { key: "hair:purple", alone: ["purple-haired"] },
];

const BUILD: Descriptor[] = [
  { key: "cmp:taller", alone: ["taller", "tallest", "lankier"], needsNoun: ["tall", "towering", "lanky", "gangly", "rangy", "long-limbed"] },
  { key: "cmp:shorter", alone: ["shorter", "shortest"], needsNoun: ["short", "petite", "diminutive"] },
  {
    key: "cmp:bigger",
    alone: ["bigger", "biggest", "larger", "largest", "broader", "broadest", "bulkier", "heavier", "stockier", "beefier", "burlier", "brawnier"],
    needsNoun: ["big", "large", "huge", "massive", "hulking", "burly", "brawny", "muscular", "beefy", "bulky", "stocky", "broad-shouldered", "enormous", "hefty"],
    nouns: ["giant", "brute"],
  },
  {
    key: "cmp:smaller",
    alone: ["smaller", "smallest", "slighter", "slimmer", "thinner", "lighter", "leaner", "littler", "skinnier"],
    needsNoun: ["small", "little", "tiny", "slight", "slim", "slender", "skinny", "wiry", "lithe", "scrawny", "willowy"],
  },
  { key: "cmp:older", alone: ["older", "oldest", "elder", "eldest"], needsNoun: ["old", "aging", "ageing", "aged", "middle-aged", "grizzled", "senior", "mature"], nouns: ["veteran"] },
  { key: "cmp:younger", alone: ["younger", "youngest"], needsNoun: ["young", "teenage", "youthful", "junior", "boyish", "baby-faced"], nouns: ["teen", "teenager", "kid", "youngster", "brat"] },
];

const OPPOSITE: Record<string, string> = {
  "cmp:taller": "cmp:shorter",
  "cmp:shorter": "cmp:taller",
  "cmp:bigger": "cmp:smaller",
  "cmp:smaller": "cmp:bigger",
  "cmp:older": "cmp:younger",
  "cmp:younger": "cmp:older",
};

/** Nationality: adjective (usable as "the American"), extra nouns, and countries for "was from X". */
const NATIONS: [adj: string, nouns: string[], countries: string[]][] = [
  ["American", ["Yank", "Yankee"], ["America", "the US", "the U.S.", "the USA", "the States", "the United States"]],
  ["British", ["Brit"], ["Britain", "the UK", "the U.K.", "the United Kingdom"]],
  ["English", ["Englishman", "Englishwoman"], ["England"]],
  ["Scottish", ["Scot", "Scotsman", "Scotswoman"], ["Scotland"]],
  ["Irish", ["Irishman", "Irishwoman"], ["Ireland"]],
  ["Welsh", ["Welshman", "Welshwoman"], ["Wales"]],
  ["Canadian", [], ["Canada"]],
  ["Australian", ["Aussie"], ["Australia"]],
  ["New Zealander", ["Kiwi"], ["New Zealand"]],
  ["French", ["Frenchman", "Frenchwoman"], ["France"]],
  ["German", [], ["Germany"]],
  ["Italian", [], ["Italy"]],
  ["Spanish", ["Spaniard"], ["Spain"]],
  ["Portuguese", [], ["Portugal"]],
  ["Brazilian", [], ["Brazil"]],
  ["Mexican", [], ["Mexico"]],
  ["Argentinian", ["Argentine"], ["Argentina"]],
  ["Colombian", [], ["Colombia"]],
  ["Chilean", [], ["Chile"]],
  ["Cuban", [], ["Cuba"]],
  ["Puerto Rican", [], ["Puerto Rico"]],
  ["Russian", [], ["Russia"]],
  ["Ukrainian", [], ["Ukraine", "the Ukraine"]],
  ["Polish", ["Pole"], ["Poland"]],
  ["Czech", [], ["the Czech Republic", "Czechia"]],
  ["Hungarian", [], ["Hungary"]],
  ["Romanian", [], ["Romania"]],
  ["Bulgarian", [], ["Bulgaria"]],
  ["Serbian", ["Serb"], ["Serbia"]],
  ["Croatian", ["Croat"], ["Croatia"]],
  ["Greek", [], ["Greece"]],
  ["Turkish", ["Turk"], ["Turkey", "Türkiye"]],
  ["Swedish", ["Swede"], ["Sweden"]],
  ["Norwegian", [], ["Norway"]],
  ["Danish", ["Dane"], ["Denmark"]],
  ["Finnish", ["Finn"], ["Finland"]],
  ["Icelandic", ["Icelander"], ["Iceland"]],
  ["Dutch", ["Dutchman", "Dutchwoman"], ["the Netherlands", "Holland"]],
  ["Belgian", [], ["Belgium"]],
  ["Swiss", [], ["Switzerland"]],
  ["Austrian", [], ["Austria"]],
  ["Japanese", [], ["Japan"]],
  ["Chinese", [], ["China"]],
  ["Taiwanese", [], ["Taiwan"]],
  ["Korean", [], ["Korea", "South Korea", "North Korea"]],
  ["Vietnamese", [], ["Vietnam"]],
  ["Thai", [], ["Thailand"]],
  ["Filipino", ["Filipina"], ["the Philippines"]],
  ["Indonesian", [], ["Indonesia"]],
  ["Malaysian", [], ["Malaysia"]],
  ["Indian", [], ["India"]],
  ["Pakistani", [], ["Pakistan"]],
  ["Bangladeshi", [], ["Bangladesh"]],
  ["Iranian", ["Persian"], ["Iran", "Persia"]],
  ["Iraqi", [], ["Iraq"]],
  ["Syrian", [], ["Syria"]],
  ["Lebanese", [], ["Lebanon"]],
  ["Israeli", [], ["Israel"]],
  ["Palestinian", [], ["Palestine"]],
  ["Egyptian", [], ["Egypt"]],
  ["Moroccan", [], ["Morocco"]],
  ["Nigerian", [], ["Nigeria"]],
  ["Kenyan", [], ["Kenya"]],
  ["Ghanaian", [], ["Ghana"]],
  ["Ethiopian", [], ["Ethiopia"]],
  ["South African", [], ["South Africa"]],
  ["Jamaican", [], ["Jamaica"]],
  ["Hawaiian", [], ["Hawaii"]],
  ["Texan", [], ["Texas"]],
  ["Southern", ["Southerner"], ["the South"]],
  ["Northern", ["Northerner"], ["the North"]],
];

const NATIONALITY: Descriptor[] = NATIONS.map(([adj, nouns]) => ({
  key: `nat:${adj.toLowerCase()}`,
  alone: [adj],
  nouns,
}));

const ALL: Descriptor[] = [...HAIR, ...BUILD, ...NATIONALITY];

const MALE_NOUNS = "man|boy|guy|lad|male|gentleman|fellow|bloke|dude|king|prince|wizard";
const FEMALE_NOUNS = "woman|girl|lady|gal|queen|princess|witch";
const ROLE_NOUNS =
  "alpha|omega|beta|werewolf|wolf|vampire|hunter|soldier|agent|detective|captain|knight|demon|angel|hero|villain|auror|doctor|human|elf|mutant|android|god|guard|lieutenant|sergeant|commander|sheriff|deputy|student|officer|cop|pilot|sailor|pirate|assassin|mercenary|singer|idol|player|athlete|boxer|fighter|dancer|actor|writer|artist|professor|teacher|nobleman|lord|servant";
/** Nouns that can follow a descriptor ("the tall man", "the American soldier"). */
const NOUNS = `${MALE_NOUNS}|${FEMALE_NOUNS}|${ROLE_NOUNS}|one|kid|teen|teenager`;

const alt = (words: string[]) =>
  [...new Set(words)]
    .sort((a, b) => b.length - a.length)
    .map((w) => escapeRe(w).replace(/ /g, "\\s+"))
    .join("|");

const ADJ_ALONE = alt(ALL.flatMap((d) => d.alone).concat(["other", "first", "second", "latter", "former"]));
const ADJ_NEEDS_NOUN = alt(ALL.flatMap((d) => d.needsNoun ?? []));
const DESC_NOUNS = alt(ALL.flatMap((d) => d.nouns ?? []));
const ANY_ADJ = `${ADJ_ALONE}|${ADJ_NEEDS_NOUN}`;

/**
 * Regex source for an epithet (case-sensitive; "The" or "the"). Examples it matches:
 * "the blond", "the tall American", "the older blond man", "the taller of the two", "the redhead",
 * "the Brit", "the alpha", "the other man", "the thirty-year-old".
 */
/** "His lover", "her boyfriend": the possessor's partner. */
const REL_NOUNS = "lover|boyfriend|girlfriend|husband|wife|spouse|partner|mate|fiancé|fiance|fiancée|fiancee|beloved|sweetheart|significant other|other half|consort";

export const EPITHET =
  `(?:[Hh]is|[Hh]er|[Tt]heir)\\s+(?:${REL_NOUNS})(?![\\w-])|` +
  `[Tt]he\\s+(?:` +
  // premodifier(s), then a word that can stand alone (+ optional noun) or one that needs a noun
  `(?:(?:very|much|slightly|obviously|clearly|much)\\s+)?(?:(?:${ANY_ADJ})\\s+){0,2}` +
  `(?:(?:${ADJ_ALONE})(?:\\s+(?:${NOUNS}))?|(?:${ADJ_NEEDS_NOUN})\\s+(?:${NOUNS})|(?:${DESC_NOUNS})|(?:${NOUNS}))` +
  `(?:\\s+of\\s+the\\s+(?:two|pair|three)(?:\\s+(?:men|boys|guys|women|girls|of\\s+them))?)?` +
  `|(?:\\d+|[a-z]+(?:-[a-z]+)?)-year-old(?:\\s+(?:${NOUNS}))?` +
  `)(?![\\w-])`;

const WORD_TO_KEY = new Map<string, string>();
for (const d of ALL) for (const w of [...d.alone, ...(d.needsNoun ?? []), ...(d.nouns ?? [])]) WORD_TO_KEY.set(w.toLowerCase(), d.key);

/** Canonical keys for an epithet, most specific first, plus the gender its noun implies. */
export function canonEpithet(tok: string): { keys: string[]; gender: Gender | "any"; other: boolean } {
  let s = tok.toLowerCase().replace(/['’]s$/, "").replace(/\s+/g, " ").replace(/^the /, "");
  s = s.replace(/ of the (?:two|pair|three)(?: (?:men|boys|guys|women|girls|of them))?$/, "");
  const male = new RegExp(`(?:^| )(?:${MALE_NOUNS}|englishman|frenchman|irishman|scotsman|welshman|dutchman|nobleman)$`).test(s);
  const female = new RegExp(`(?:^| )(?:${FEMALE_NOUNS}|englishwoman|frenchwoman|irishwoman|scotswoman|welshwoman|dutchwoman|filipina)$`).test(s);
  const gender: Gender | "any" = male ? "m" : female ? "f" : "any";
  const other = /^(?:other|first|second|latter|former)\b/.test(s);
  // "The other man" is always relative to the current subject, never a fixed person.
  if (other) return { keys: [], gender, other };

  const keys: string[] = [];
  const rel = s.match(new RegExp(`^(?:his|her|their) (${REL_NOUNS})$`));
  if (rel) return { keys: [`rel:${rel[1]}`], gender: /^her /.test(s) ? "any" : "any", other: false };
  const age = s.match(/^([\w-]+)-year-old/);
  if (age) keys.push(`age:${age[1]}`);
  // Multi-word entries first ("platinum blond", "new zealander", "south african").
  for (const [w, k] of [...WORD_TO_KEY].sort((a, b) => b[0].length - a[0].length)) {
    if (new RegExp(`(?:^| )${escapeRe(w)}(?: |$)`).test(s) && !keys.includes(k)) keys.push(k);
  }
  // Role nouns as keys of their own ("the alpha", "the auror").
  const last = s.split(" ").pop() ?? "";
  if (!keys.length && new RegExp(`^(?:${ROLE_NOUNS}|${MALE_NOUNS}|${FEMALE_NOUNS}|kid|teen|teenager)$`).test(last)) keys.push(`noun:${last}`);
  return { keys, gender, other };
}

// ───────────── learning from the text ─────────────

/** Count votes for "key → character", then keep keys with one clear owner. */
class Tally {
  private votes = new Map<string, Map<Character, number>>();
  add(key: string, c: Character, n = 1) {
    const v = this.votes.get(key) ?? new Map<Character, number>();
    v.set(c, (v.get(c) ?? 0) + n);
    this.votes.set(key, v);
  }
  winners(): Map<string, Character> {
    const out = new Map<string, Character>();
    for (const [key, v] of this.votes) {
      const ranked = [...v.entries()].sort((a, b) => b[1] - a[1]);
      if (ranked.length === 1 || ranked[0][1] >= ranked[1][1] * 2) out.set(key, ranked[0][0]);
    }
    return out;
  }
}

const COLOUR_TO_KEY: [RegExp, string][] = [
  [/^(?:blond|blonde|platinum|golden|fair|white-blond|pale-blond|flaxen|sandy|honey|wheat|straw|sun-bleached|towheaded|ash-blond|ash-blonde)$/, "hair:blond"],
  [/^(?:dark|black|brown|chestnut|raven|ebony|jet-black|chocolate|mahogany|espresso|inky|coal-black|dark-brown)$/, "hair:dark"],
  [/^(?:red|ginger|auburn|copper|fiery|strawberry|russet|titian|carrot)$/, "hair:red"],
  [/^(?:silver|grey|gray|white|greying|graying|salt-and-pepper)$/, "hair:silver"],
  [/^(?:curly|curls)$/, "hair:curly"],
  [/^(?:pink)$/, "hair:pink"],
  [/^(?:blue)$/, "hair:blue"],
  [/^(?:green)$/, "hair:green"],
  [/^(?:purple|lavender|lilac)$/, "hair:purple"],
];

const CMP_WORDS: Record<string, string> = {
  taller: "cmp:taller",
  shorter: "cmp:shorter",
  older: "cmp:older",
  elder: "cmp:older",
  younger: "cmp:younger",
  bigger: "cmp:bigger",
  larger: "cmp:bigger",
  broader: "cmp:bigger",
  bulkier: "cmp:bigger",
  heavier: "cmp:bigger",
  stockier: "cmp:bigger",
  smaller: "cmp:smaller",
  slighter: "cmp:smaller",
  slimmer: "cmp:smaller",
  thinner: "cmp:smaller",
  lighter: "cmp:smaller",
  leaner: "cmp:smaller",
  skinnier: "cmp:smaller",
};

export function learnEpithets(cast: Cast, freeforms: string[], narration: string): Map<string, Character> {
  const tally = new Tally();
  const chars = cast.chars.filter((c) => c.aliases.length);
  const nameOf = new Map<string, Character>();
  for (const c of chars) for (const a of c.aliases) nameOf.set(a, c);
  if (!chars.length) return new Map();
  const NAME = chars.flatMap((c) => c.aliases).sort((a, b) => b.length - a.length).map(escapeRe).join("|");
  const who = (tok: string) => nameOf.get(tok.replace(/['’]s$/, ""));
  const BE = "(?:was|is|'s|’s|had always been|has always been|had been|seemed|looked|stood|being)";

  // Hair: "Draco's pale blond hair", "Draco ran a hand through his blond hair", "Draco was a redhead".
  const colour = (word: string) => COLOUR_TO_KEY.find(([re]) => re.test(word.toLowerCase()))?.[1];
  for (const m of narration.matchAll(new RegExp(`\\b(${NAME})(?:['’]s|(?<=s)['’])\\s+(?:[\\w-]+\\s+){0,2}?([\\w-]+)\\s+(?:hair|curls|locks|mop|fringe|head of hair|mane)\\b`, "g"))) {
    const k = colour(m[2]);
    const c = who(m[1]);
    if (k && c) tally.add(k, c, 2);
  }
  for (const m of narration.matchAll(new RegExp(`\\b(${NAME})\\s+(?:\\w+\\s+){1,6}?(?:his|her|their)\\s+(?:[\\w-]+\\s+){0,1}?([\\w-]+)\\s+(?:hair|curls|locks|mop|fringe)\\b`, "g"))) {
    const k = colour(m[2]);
    const c = who(m[1]);
    if (k && c) tally.add(k, c);
  }

  // Comparisons: "Harry was taller than Draco", "Draco was two years older than Harry".
  const cmpRe = new RegExp(`\\b(${NAME})\\s+${BE}\\s+(?:[\\w-]+\\s+){0,4}?(${Object.keys(CMP_WORDS).join("|")})\\s+than\\s+(${NAME})\\b`, "g");
  for (const m of narration.matchAll(cmpRe)) {
    const a = who(m[1]);
    const b = who(m[3]);
    const k = CMP_WORDS[m[2].toLowerCase()];
    if (a && b && a !== b) {
      tally.add(k, a, 2);
      tally.add(OPPOSITE[k], b, 2);
    }
  }
  for (const m of narration.matchAll(new RegExp(`\\b(${NAME})\\s+(?:\\w+\\s+)?(?:towered|towers|loomed|looms)\\s+over\\s+(${NAME})\\b`, "g"))) {
    const a = who(m[1]);
    const b = who(m[2]);
    if (a && b && a !== b) {
      tally.add("cmp:taller", a);
      tally.add("cmp:shorter", b);
    }
  }

  // Absolutes: "Steve was a big man", "Peter was young", "Bucky was Russian".
  const absWords = alt(ALL.flatMap((d) => [...d.alone, ...(d.needsNoun ?? [])]));
  for (const m of narration.matchAll(new RegExp(`\\b(${NAME})\\s+${BE}\\s+(?:a\\s+|an\\s+)?(?:(?:very|so|really|quite|rather|much|pretty|incredibly)\\s+)?(${absWords})\\b`, "g"))) {
    const c = who(m[1]);
    const k = WORD_TO_KEY.get(m[2].toLowerCase().replace(/\s+/g, " "));
    if (c && k) tally.add(k, c);
  }

  // Nationality: "Steve's American accent", "Bucky was from Russia".
  for (const m of narration.matchAll(new RegExp(`\\b(${NAME})(?:['’]s|(?<=s)['’])\\s+(?:\\w+\\s+){0,2}?(${alt(NATIONS.map((n) => n[0]))})\\s+(?:accent|drawl|lilt|brogue|passport|roots|upbringing)\\b`, "g"))) {
    const c = who(m[1]);
    if (c) tally.add(`nat:${m[2].toLowerCase()}`, c, 2);
  }
  for (const [adj, , countries] of NATIONS) {
    if (!countries.length) continue;
    const re = new RegExp(`\\b(${NAME})\\s+(?:${BE}|came|comes|hailed|hails|grew up)\\s+(?:originally\\s+)?(?:from|in)\\s+(?:${alt(countries)})\\b`, "g");
    for (const m of narration.matchAll(re)) {
      const c = who(m[1]);
      if (c) tally.add(`nat:${adj.toLowerCase()}`, c, 2);
    }
  }

  // Appositives: "Draco, the blond," and "the blond, Draco,".
  for (const m of narration.matchAll(new RegExp(`\\b(${NAME}),\\s+(${EPITHET})\\s*[,;—–]`, "g"))) {
    const c = who(m[1]);
    if (c) for (const k of canonEpithet(m[2]).keys) tally.add(k, c, 2);
  }
  for (const m of narration.matchAll(new RegExp(`(${EPITHET}),\\s+(${NAME})\\b`, "g"))) {
    const c = who(m[2]);
    if (c) for (const k of canonEpithet(m[1]).keys) tally.add(k, c, 2);
  }

  // Age: "Peter was sixteen years old" → "the sixteen-year-old".
  for (const m of narration.matchAll(new RegExp(`\\b(${NAME})\\s+${BE}\\s+(?:only\\s+|just\\s+|barely\\s+)?([\\w-]+)\\s+years?\\s+old\\b`, "g"))) {
    const c = who(m[1]);
    if (c) tally.add(`age:${m[2].toLowerCase()}`, c, 2);
  }

  const map = tally.winners();

  // AO3 tags like "Alpha Derek Hale", "Omega Stiles Stilinski".
  for (const tag of freeforms) {
    const m = tag.match(/^(alpha|omega|beta)\s+(.+)$/i);
    if (!m) continue;
    const name = m[2].replace(/\([^)]*\)/g, "").trim().toLowerCase();
    const c = cast.chars.find((x) => x.name.toLowerCase() === name || x.aliases.some((a) => a.toLowerCase() === name));
    if (c && !map.has(`noun:${m[1].toLowerCase()}`)) map.set(`noun:${m[1].toLowerCase()}`, c);
  }

  // Two main characters: knowing one side of a comparison gives the other.
  const main = cast.pairings[0];
  if (main) {
    for (const [k, opp] of Object.entries(OPPOSITE)) {
      const c = map.get(k);
      if (c && main.includes(c) && !map.has(opp)) map.set(opp, main[0] === c ? main[1] : main[0]);
    }
  }
  return map;
}
