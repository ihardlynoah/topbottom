// Works out who the characters are, what names/pronouns refer to them, and whose POV the story is in.

import type { Ao3Meta } from "../ao3";
import { applyCanon, detectFandoms } from "./canon";

export type Gender = "m" | "f" | "u";

export type Anatomy = boolean | "maybe";

export interface Character {
  name: string;
  aliases: string[];
  gender: Gender;
  /** Has a vagina. Women by default; men when the text says so (omegaverse, trans men). */
  vulva: Anatomy;
  /** Has a penis. Men by default; women when the text says so (trans women, futa). */
  penis: Anatomy;
  /** An original character (not from the source canon), named from the text or an OC tag. */
  original?: boolean;
}

export interface Cast {
  chars: Character[];
  /** Narrator for first-person ("I") stories. */
  narrator?: Character;
  /** The "you" of second-person / reader-insert stories. */
  secondPerson?: Character;
  /** Pairings from relationship tags (or guessed), in tag order. */
  pairings: [Character, Character][];
  byAlias: Map<string, Character>;
  /** Regex alternation matching any alias (case-sensitive, longest first). */
  aliasPattern: string;
  /** The text gives at least one man a vagina ("his cunt", "his front hole"). */
  maleVulva: boolean;
}

const TITLE_WORDS = new Set(
  "Mr Mrs Ms Miss Mx Dr Sir Lord Lady Captain Cap The of de la le du van von der den da di Jr Sr II III IV King Queen Prince Princess Agent Detective Professor Doctor Officer Sergeant Commander General Major Saint St Aunt Uncle Father Mother Brother Sister and Original Character Characters Male Female OC OFC OMC Other Various Everyone".split(
    " ",
  ),
);

/** Names that are also ordinary words; only safe because matching is case-sensitive. */
const NOT_NAMES = new Set(
  "I I'm I'd I'll I've A An The He She They It We You His Her Their My Your Our This That There Then When What Where Why How Who Oh Ah God Christ Jesus Fuck Yes No Not But And Or So If Just Okay OK Ok Well Now Still Even Maybe Please Thank Thanks Sorry Hey Hi Hello Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December English French Chapter Mr Mrs Ms Dr Sir Lord Lady TV Page Pages Part New House Year Prologue Epilogue Interlude Christmas Halloween Easter Lent Advent Passover Hanukkah Thanksgiving Valentine Valentine's Sabbath Mass Mum Mom Dad Mama Papa Uncle Aunt Grandma Grandpa Instead Later Before After Once Twice Something Nothing Everything Anything Someone Everyone Nobody Neither Either Both Every Each Some Any Too Also Because While Since Until Though Although Yeah Yep Nope Shit Damn Hell Wait Look Listen Come Go Stop Don't Can't Won't Didn't Wasn't Isn't It's That's There's He's She's They're We're You're Let's Alpha Alphas Omega Omegas Beta Betas Sir Ma'am Mister Alright Yeah Hey Wow Dude Man Babe Baby Sweetheart Honey Darling Christ Lord Heaven Hell Jesus Mary Angel Hmm Hmmm Mmm Mm Um Uh Ugh Huh Gods Seven Ser Littles Little Bigs Big Pledge Pledges Frat Delta Gamma Kappa Sigma Theta Phi Psi Chi Epsilon Zeta Lambda Tau Rho Iota Upsilon Omicron".split(
    " ",
  ),
);

const REL_QUALIFIER = /^(?:brief|briefly|past|background|implied|mentioned|minor|referenced|one-sided|unrequited|eventual|temporary|former|ex-|pre-)\s+/i;

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanTagName(tag: string): string {
  return tag
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+-\s+(?:Relationship|Character)s?\b/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isReaderTag(name: string): boolean {
  return /^(reader|you|y\/n|original reader character)$/i.test(name);
}

export interface OcTag {
  /** The OC's name, when the tag gives one ("Kyle (Original Character)", "Original Male Character - Kyle"). */
  name?: string;
  gender: Gender;
  /** "Original Male Character(s)": possibly more than one. */
  plural: boolean;
}

const OC_WORDS = /^original\s+(?:(male|female|non-?binary|nb|trans(?:gender)?\s+(?:male|female)|man|woman)\s+)?(?:characters?|char)\b/i;
const OC_ABBR = /^O([MF])?Cs?\b/;

/** Recognize AO3's original-character tags; undefined for anything else. */
export function parseOc(raw: string): OcTag | undefined {
  const tag = raw.trim();
  if (isReaderTag(cleanTagName(tag)) || /reader/i.test(tag)) return undefined;
  const plural = /\(s\)|characters\b|\bO[MF]?Cs\b/i.test(tag);
  const genderOf = (w?: string): Gender => {
    const x = (w ?? "").toLowerCase();
    if (/^(?:trans(?:gender)?\s+)?(?:male|man|m)$/.test(x)) return "m";
    if (/^(?:trans(?:gender)?\s+)?(?:female|woman|f)$/.test(x)) return "f";
    return "u";
  };
  // "Kyle (Original Character)", "Mira (OFC)"
  for (const m of tag.matchAll(/\(([^)]*)\)/g)) {
    const inner = m[1].trim();
    const w = OC_WORDS.exec(inner) ?? OC_ABBR.exec(inner);
    const base = cleanTagName(tag);
    if (w && base && !OC_WORDS.test(base) && !OC_ABBR.test(base)) return { name: base, gender: genderOf(w[1]), plural: false };
  }
  const base = tag.replace(/\(s\)/gi, "").replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  const m = OC_WORDS.exec(base) ?? OC_ABBR.exec(base);
  if (!m) return undefined;
  // "Original Male Character - Kyle", "OMC: Kyle", "Original Character Kyle"
  const rest = base.slice(m[0].length).replace(/^s?\s*(?:[-–—:|,]\s*)?/, "").trim();
  const name = /^\p{Lu}/u.test(rest) && !/^(?:Characters?|Work)$/i.test(rest) ? rest : undefined;
  return { name, gender: genderOf(m[1]), plural: plural && !name };
}

function nameParts(name: string): string[] {
  const parts: string[] = [];
  // Nicknames in quotes: James "Bucky" Barnes
  for (const m of name.matchAll(/["“']([^"”']+)["”']/g)) parts.push(m[1].trim());
  const plain = name.replace(/["“'][^"”']+["”']/g, " ");
  for (const tok of plain.split(/[\s]+/)) {
    const t = tok.replace(/[.,]/g, "");
    if (t.length >= 2 && /^\p{Lu}/u.test(t) && !TITLE_WORDS.has(t)) parts.push(t);
  }
  return parts;
}

function makeChars(names: string[]): Character[] {
  const seen = new Map<string, Character>();
  for (const raw of names) {
    const name = cleanTagName(raw);
    if (!name || /original (?:male |female )?character/i.test(name) || /^(?:other|various|everyone)/i.test(name)) continue;
    if (isReaderTag(name)) {
      if (!seen.has("Reader")) seen.set("Reader", { name: "Reader", aliases: ["Reader", "Y/N"], gender: "u", vulva: "maybe", penis: "maybe" });
      continue;
    }
    const key = name.toLowerCase();
    if (!seen.has(key)) seen.set(key, { name, aliases: [], gender: "u", vulva: "maybe", penis: "maybe" });
  }
  const chars = [...seen.values()];

  // Merge "Harry" into "Harry Potter" when both appear (e.g. from different tags).
  const merged = chars.filter(
    (c) => !chars.some((o) => o !== c && o.name.length > c.name.length && nameParts(o.name).includes(c.name)),
  );

  // Count how many characters share each name part; shared parts (surnames in families) are ambiguous.
  const partCount = new Map<string, number>();
  for (const c of merged) for (const p of new Set(nameParts(c.name))) partCount.set(p, (partCount.get(p) ?? 0) + 1);
  for (const c of merged) {
    if (c.name === "Reader") continue;
    const aliases = new Set<string>();
    if (!/["“]/.test(c.name)) aliases.add(c.name);
    for (const p of nameParts(c.name)) if (partCount.get(p) === 1 && !NOT_NAMES.has(p)) aliases.add(p);
    c.aliases = [...aliases];
  }
  return merged;
}

/**
 * Guess the main characters when the file has no AO3 tags: words that are capitalized wherever they
 * appear (including at sentence starts) and almost never show up in lowercase.
 */
/** Do two names begin alike enough to be forms of one name (Damen/Damianos, Steve/Steven)? */
export function similarNames(a: string, b: string): boolean {
  if (a.length < 4 || b.length < 4 || a[0].toLowerCase() !== b[0].toLowerCase()) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i].toLowerCase() === b[i].toLowerCase()) i++;
  // At least half of the shorter name must match: Damen/Damianos (3 of 5) yes, Harrington/Hargrove (3 of 8) no.
  return i >= 3 && i >= Math.min(a.length, b.length) / 2;
}

/** How often two names are listed together ("Dean and Deanna", "Dean, Deanna"), which means they're two people. */
export function coordinated(text: string, a: string, b: string): number {
  const ea = escapeRe(a);
  const eb = escapeRe(b);
  const sep = "(?:\\s+and\\s+|\\s*,\\s+(?:and\\s+)?|\\s*&\\s*|\\s+or\\s+|\\s*/\\s*)";
  return (text.match(new RegExp(`\\b(?:${ea}${sep}${eb}|${eb}${sep}${ea})\\b`, "g")) ?? []).length;
}

export function guessNames(text: string): string[] {
  const caps = new Map<string, number>();
  const lower = new Map<string, number>();
  for (const m of text.matchAll(/\b([\p{L}][\p{L}'’-]{1,20})\b/gu)) {
    const w = m[1].replace(/['’]s$/, "");
    // "We’ll", "Don’t": contractions aren't names.
    if (/['’](?:ll|re|ve|d|m|t)$/i.test(w)) continue;
    if (/^\p{Lu}\p{Ll}/u.test(w)) caps.set(w, (caps.get(w) ?? 0) + 1);
    else if (/^\p{Ll}/u.test(w)) lower.set(w, (lower.get(w) ?? 0) + 1);
  }
  const words = text.split(/\s+/).length;
  const min = Math.max(4, Math.round(words / 3000));
  // "Central Park", "Grand Central": words usually followed by a place noun aren't people.
  const placeLike = (w: string) =>
    (text.match(new RegExp(`\\b(?:New|Los|San|Santa|Las|Saint|St|Fort|Port|Mount|Mt|North|South|East|West|Upper|Lower|Great)\\s+${escapeRe(w)}\\b`, "g")) ?? []).length >= (caps.get(w) ?? 0) * 0.5 ||
    (text.match(new RegExp(`\\b${escapeRe(w)}\\s+(?:Park|Street|St|Avenue|Ave|Road|City|Square|Station|Tower|Hall|House|Hospital|School|Academy|University|College|Bay|Lake|River|Island|Bridge|Manor|Castle|Valley|Hills?|Heights|Center|Centre|Mall|Airport|Palace|Hotel|Bar|Club|Restaurant|Cafe|Café|Church|Cathedral|Court|Stadium|Arena|Gardens?|Building|Library|Museum|Market|Lane|Drive|Boulevard)\\b`, "g")) ?? []).length >= (caps.get(w) ?? 0) * 0.5;
  // "in Paris", "from Wimbledon": mostly after a place preposition means a place, not a person.
  const afterPlacePrep = (w: string) =>
    (text.match(new RegExp(`\\b(?:in|from|near|outside|around|across|throughout|visiting|leaving|towards?)\\s+(?:the\\s+)?${escapeRe(w)}\\b|\\(\\s*${escapeRe(w)}\\b|\\b${escapeRe(w)},\\s+(?:US|USA|UK|U\\.S\\.|England|France|Italy|Spain|Germany|Canada|Australia|Japan|Mexico|Texas|California|New York|London|DC)\\b`, "g")) ?? []).length >= (caps.get(w) ?? 0) * 0.35;
  const candidates = [...caps.entries()]
    .filter(([w, n]) => n >= min && !NOT_NAMES.has(w) && !TITLE_WORDS.has(w) && (lower.get(w.toLowerCase()) ?? 0) <= n * 0.05 && !placeLike(w) && !afterPlacePrep(w))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([w]) => w);

  const sentences = text.split(/(?<=[.!?])\s+/);
  const apart = (a: string, b: string) => {
    const ra = new RegExp(`\\b${escapeRe(a)}\\b`);
    const rb = new RegExp(`\\b${escapeRe(b)}\\b`);
    const pair = new RegExp(`\\b${escapeRe(a)}\\s+${escapeRe(b)}\\b`, "g");
    return sentences.filter((x) => ra.test(x.replace(pair, "")) && rb.test(x.replace(pair, ""))).length;
  };
  // "Dean Winchester": a candidate that mostly follows another one is that character's surname.
  const surnameOf = new Map<string, string>();
  for (const a of candidates) {
    for (const b of candidates) {
      if (a === b) continue;
      const together = (text.match(new RegExp(`\\b${escapeRe(a)}\\s+${escapeRe(b)}\\b`, "g")) ?? []).length;
      if (together >= 2 && together >= (caps.get(b) ?? 0) * 0.4) surnameOf.set(b, a);
      // "Draco Malfoy" once, then "Draco" in one POV and "Malfoy" in the other: two names that sit together
      // but almost never share a sentence otherwise are one person.
      else if (together >= 1 && !surnameOf.has(b) && apart(a, b) <= Math.max(1, together)) surnameOf.set(b, a);
    }
  }
  // "Cas" for "Castiel": a short candidate that starts another, longer one is its nickname.
  const nicknameOf = new Map<string, string>();
  for (const a of candidates) {
    const full = candidates.find((b) => b !== a && b.length > a.length && b.startsWith(a) && a.length >= 3);
    if (full) nicknameOf.set(a, full);
  }
  // "Damen" and "Damianos": two names that begin alike (three or more letters), that nobody ever lists together
  // ("Dean and Deanna"), are one person; the commoner one is the name and the other its nickname.
  for (const a of candidates) {
    for (const b of candidates) {
      if (a === b || nicknameOf.has(a) || nicknameOf.has(b) || surnameOf.has(a) || surnameOf.has(b)) continue;
      if ((caps.get(a) ?? 0) < (caps.get(b) ?? 0) || !similarNames(a, b)) continue;
      if (coordinated(text, a, b) >= 2) continue;
      nicknameOf.set(b, a);
    }
  }
  const out: string[] = [];
  for (const w of candidates) {
    if (surnameOf.has(w) || nicknameOf.has(w)) continue;
    const surname = [...surnameOf].find(([, first]) => first === w)?.[0];
    const nick = [...nicknameOf].find(([, full]) => full === w)?.[0];
    out.push([w, nick ? `"${nick}"` : "", surname ?? ""].filter(Boolean).join(" "));
    if (out.length >= 6) break;
  }
  return out;
}

function guessGenders(chars: Character[], meta: Ao3Meta, narration: string) {
  const cats = meta.categories.map((c) => c.toUpperCase());
  const allMale = cats.length > 0 && cats.every((c) => c === "M/M" || c === "GEN");
  const allFemale = cats.length > 0 && cats.every((c) => c === "F/F" || c === "GEN");
  const sentences = narration.split(/(?<=[.!?])\s+/);
  for (const c of chars) {
    if (c.name === "Reader") continue;
    // Votes: "X did something. He/She ..." (subject continuity) and reflexives in X's sentences.
    // Object pronouns ("X smiled at her") usually mean the *other* person, so they're ignored.
    let he = 0;
    let she = 0;
    const startRe = new RegExp(`^(?:${c.aliases.map(escapeRe).join("|")})\\b`);
    for (let i = 0; i < sentences.length; i++) {
      const s = sentences[i].trim();
      if (!startRe.test(s)) continue;
      if (chars.some((o) => o !== c && o.aliases.some((a) => s.includes(a)))) continue;
      he += (s.match(/\bhimself\b/g) ?? []).length;
      she += (s.match(/\bherself\b/g) ?? []).length;
      const next = sentences[i + 1]?.trim() ?? "";
      if (/^He\b/.test(next)) he++;
      else if (/^She\b/.test(next)) she++;
      // "X laughed as she ..." within the same sentence
      if (/^\S+\s+\w+(?:ed|s)?\s+(?:as|while|when|until|and)\s+he\b/.test(s)) he++;
      if (/^\S+\s+\w+(?:ed|s)?\s+(?:as|while|when|until|and)\s+she\b/.test(s)) she++;
    }
    if (/^(?:Mr|Sir|Lord|King|Prince|Father|Brother|Uncle)\b/.test(c.name)) he += 5;
    if (/^(?:Mrs|Ms|Miss|Lady|Queen|Princess|Mother|Sister|Aunt)\b/.test(c.name)) she += 5;
    // In a work tagged only M/M (or F/F) the presumption holds unless the text is clear that someone is the other.
    const [oppositeVotes, ownVotes, presumed] = allMale ? [she, he, "m"] : allFemale ? [he, she, "f"] : [0, 0, ""];
    if (presumed && c.gender === "u") {
      if (oppositeVotes >= 6 && oppositeVotes > ownVotes * 4) c.gender = presumed === "m" ? "f" : "m";
      else c.gender = presumed as Gender;
      continue;
    }
    // A gender known from the canon list needs strong, one-sided evidence to be overturned ("X ... He" often means the
    // other person); one the text alone guessed only needs a lean.
    const [needMin, needRatio] = c.gender === "u" ? [2, 2] : [6, 4];
    if (he >= needMin && he > she * needRatio) c.gender = "m";
    else if (she >= needMin && she > he * needRatio) c.gender = "f";
    // Nothing known and nothing clear in the text: the work's category (M/M, F/F) is the best guess.
    if (c.gender === "u") c.gender = allMale ? "m" : allFemale ? "f" : "u";
  }
}

const GROUP_TAG =
  /['’]s\s+(?:parents?|father|mother|dad|mom|family|siblings?|brothers?|sisters?|friends?|kids?|children|team|crew|exes?|ex-\w+|relatives?|grandparents?)\b|^(?:original|other|various|assorted)\b[^,]*\b(?:children|kids|characters|people|friends|family)\s+of\b|^(?:the\s+)?[\w' ]+\s+(?:family|household|crew|team|pack)(?:\s*\([^)]*\))?$/i;

export function buildCast(meta: Ao3Meta, narration: string, fullText = narration): Cast {
  // Generic OC tags ("Original Male Character(s)") are slots to fill from the text; named ones are just names.
  const OC_SLOT = "\u0000oc";
  const generic: OcTag[] = [];
  const namedOcs = new Map<string, Gender>();
  const readName = (raw: string): string => {
    const oc = parseOc(raw);
    if (!oc) return cleanTagName(raw);
    if (oc.name) {
      namedOcs.set(oc.name.toLowerCase(), oc.gender);
      return oc.name;
    }
    generic.push(oc);
    return `${OC_SLOT}${generic.length - 1}`;
  };
  const pairNames: string[][] = [];
  for (const rel of meta.relationships) {
    const sep = rel.includes("/") ? "/" : "&";
    // "brief Castiel/Meg Masters", "past Steve/Bucky": a qualifier on the tag, not part of the name.
    const names = rel.split(sep).map((n) => n.trim().replace(REL_QUALIFIER, "")).filter(Boolean).map(readName);
    if (sep === "/" && names.length >= 2) pairNames.push(names);
  }
  // "Eddie Diaz's Parents", "Tommy Kinard's Father", "Original Children of Hen Wilson/Karen Wilson" are groups or
  // relatives, not characters: left in, they share first names with the real ones and make them ambiguous.
  const charNames = meta.characters.filter((c) => !GROUP_TAG.test(c)).map(readName);
  let names = [...pairNames.flat(), ...charNames].filter((n) => !n.startsWith(OC_SLOT));
  const guessed = !names.length;
  if (guessed) names = guessNames(fullText);
  const chars = makeChars(names);
  // Guessed names carry their nickname in quotes for alias building; show them without it.
  if (guessed) for (const c of chars) c.name = c.name.replace(/\s*"[^"]+"/, "");
  // Known characters of the fandom this is in: their other names ("Cas", "Damianos", "Deadpool") and genders.
  applyCanon(chars, detectFandoms(meta, guessed ? chars.map((c) => c.name) : []), fullText, {
    skip: (a) => NOT_NAMES.has(a) || TITLE_WORDS.has(a),
    merge: guessed,
  });
  for (const c of chars) {
    const g = namedOcs.get(c.name.toLowerCase());
    if (g !== undefined) {
      c.original = true;
      if (g !== "u") c.gender = g;
    }
  }
  const originalWork = meta.fandoms.some((f) => /^original work$/i.test(f.trim()));
  if (guessed && (generic.length || originalWork)) for (const c of chars) c.original = true;

  // Fill generic OC slots with the most-mentioned names in the text that aren't canon characters.
  const ocPool: Character[] = [];
  if (generic.length && !guessed) {
    const canonParts = (c: Character) => [...nameParts(c.name), ...(c.name.match(/"([^"]+)"/g) ?? []).map((q) => q.slice(1, -1))];
    const known = (n: string) =>
      chars.some((c) => nameParts(n).some((p) => c.aliases.includes(p) || canonParts(c).includes(p)) || c.aliases.includes(n) || canonParts(c).includes(n));
    const count = (n: string) => (fullText.match(new RegExp(`\\b${escapeRe(n.split(" ")[0])}\\b`, "g")) ?? []).length;
    const candidates = guessNames(fullText).filter((n) => !known(n.replace(/\s*"[^"]+"/, "")));
    const wanted = Math.max(
      generic.filter((g, i) => pairNames.some((ns) => ns.includes(`${OC_SLOT}${i}`))).length,
      generic.some((g) => g.plural) ? 4 : 1,
    );
    const top = candidates.length ? count(candidates[0]) : 0;
    for (const n of candidates.filter((n) => count(n) >= Math.max(4, top * 0.15)).slice(0, wanted)) {
      const [c] = makeChars([n]);
      c.name = c.name.replace(/\s*"[^"]+"/, "");
      c.original = true;
      chars.push(c);
      ocPool.push(c);
    }
    // One gender for a slot of OCs tagged "Original Male Character(s)".
    const tagGender = generic.find((g) => g.gender !== "u")?.gender;
    if (tagGender && generic.every((g) => g.gender === tagGender || g.gender === "u")) for (const c of ocPool) c.gender = tagGender;
  }

  // A tagged character who never appears by name ("The Mute") is whoever the text calls the original character it
  // filled in: take over that character's name rather than leaving two people.
  if (ocPool.length && !guessed) {
    const hits = (w: string) => (fullText.match(new RegExp(`\\b${escapeRe(w)}\\b`, "g")) ?? []).length;
    const used = (c: Character) => c.aliases.filter((a) => !TITLE_WORDS.has(a)).reduce((n, a) => n + hits(a), 0);
    for (const c of [...chars]) {
      if (c.name === "Reader" || c.original || !ocPool.length || used(c) > 0) continue;
      const oc = ocPool.shift()!;
      c.name = oc.name;
      c.aliases = [...new Set([...c.aliases, ...oc.aliases])];
      if (c.gender === "u") c.gender = oc.gender;
      c.original = true;
      chars.splice(chars.indexOf(oc), 1);
    }
  }

  const byAlias = new Map<string, Character>();
  const find = (raw: string) => {
    const n = cleanTagName(raw);
    if (isReaderTag(n)) return chars.find((c) => c.name === "Reader");
    return (
      chars.find((c) => c.name.toLowerCase() === n.toLowerCase()) ??
      chars.find((c) => nameParts(c.name).includes(n) || nameParts(n).some((p) => c.aliases.includes(p)))
    );
  };
  const pairings: [Character, Character][] = [];
  for (const names of pairNames) {
    const cs: Character[] = [];
    for (const n of names) {
      if (n.startsWith(OC_SLOT)) {
        // Each OC slot takes the next most-mentioned OC not already in this relationship.
        const oc = ocPool.find((c) => !cs.includes(c));
        if (oc) cs.push(oc);
        continue;
      }
      const c = find(n);
      if (c) cs.push(c);
    }
    // Poly pairings (A/B/C) become every two-person combination.
    for (let i = 0; i < cs.length; i++)
      for (let j = i + 1; j < cs.length; j++) if (cs[i] !== cs[j]) pairings.push([cs[i], cs[j]]);
  }

  guessGenders(chars, meta, narration);
  // In an F/M-only work, a pairing with one known gender implies the other.
  const cats = meta.categories.map((c) => c.toUpperCase());
  if (cats.length && cats.every((c) => c === "F/M" || c === "GEN")) {
    for (const [a, b] of pairings) {
      if (a.gender === "u" && b.gender !== "u") a.gender = b.gender === "m" ? "f" : "m";
      else if (b.gender === "u" && a.gender !== "u") b.gender = a.gender === "m" ? "f" : "m";
    }
  }

  // POV detection, using narration only (dialogue removed).
  const words = Math.max(1, narration.split(/\s+/).length);
  const firstPerson = (narration.match(/\bI\b/g) ?? []).length / words;
  // Second person: many narration sentences start with "You" (not just the odd "you" in thoughts).
  const sentences = narration.split(/(?<=[.!?])\s+/);
  const secondPerson = sentences.filter((x) => /^(?:You|Your)\b/.test(x.trim())).length / Math.max(1, sentences.length);

  // Nicknames the tags don't mention: "Cas" for Castiel, "Ste" no (too short), "Tom" for Tomlinson-style.
  const capCounts = new Map<string, number>();
  for (const m of narration.matchAll(/\b(\p{Lu}\p{Ll}{2,})\b/gu)) capCounts.set(m[1], (capCounts.get(m[1]) ?? 0) + 1);
  // "Damianos" for the tagged "Damen": a frequent unknown name that begins like one tagged character's name (and no
  // one else's), is at least as common as that name, and is never listed alongside it, is the same person.
  const countOf = (w: string) => (fullText.match(new RegExp(`\\b${escapeRe(w)}\\b`, "g")) ?? []).length;
  for (const [w, n] of capCounts) {
    if (n < 20 || NOT_NAMES.has(w) || chars.some((c) => c.aliases.includes(w) || c.name === "Reader")) continue;
    const owners = chars.filter((c) => c.name !== "Reader" && c.aliases.some((a) => similarNames(a, w)));
    if (owners.length !== 1) continue;
    const owner = owners[0];
    const near = owner.aliases.filter((a) => similarNames(a, w));
    if (n < Math.max(...near.map(countOf)) || near.some((a) => coordinated(fullText, a, w) >= 2)) continue;
    owner.aliases.push(w);
  }
  for (const [w, n] of capCounts) {
    if (n < 3 || NOT_NAMES.has(w) || chars.some((c) => c.aliases.includes(w))) continue;
    const owners = chars.filter((c) => c.aliases.some((a) => a.length > w.length && a.startsWith(w)));
    if (owners.length === 1) owners[0].aliases.push(w);
  }
  for (const c of chars) for (const a of c.aliases) if (!byAlias.has(a)) byAlias.set(a, c);

  const mentions = (c: Character) => {
    if (!c.aliases.length) return 0;
    return (narration.match(new RegExp(`\\b(?:${c.aliases.map(escapeRe).join("|")})\\b`, "g")) ?? []).length;
  };

  let reader = chars.find((c) => c.name === "Reader");
  let you: Character | undefined;
  if (reader || secondPerson > 0.08) {
    if (!reader) {
      reader = { name: "Reader", aliases: [], gender: "u", vulva: "maybe", penis: "maybe" };
      chars.push(reader);
    }
    you = reader;
  }

  let narrator: Character | undefined;
  if (firstPerson > 0.006) {
    // "POV Ron Weasley" settles it.
    for (const f of meta.freeforms) {
      const m = /^POV:?\s+(?!first|second|third|alternating|multiple|outsider|switching)(.+)$/i.exec(f.trim());
      const c = m ? find(m[1]) : undefined;
      if (c && c !== reader) { narrator = c; break; }
    }
    if (!narrator) {
      // Otherwise the narrator is a main character whose name shows up in dialogue ("Ron, bed") but rarely in
      // narration, where they're "I".
      const total = (c: Character) =>
        c.aliases.length ? (fullText.match(new RegExp(`\\b(?:${c.aliases.map(escapeRe).join("|")})\\b`, "g")) ?? []).length : 0;
      const inPairs = new Set(pairings.flat());
      const byTotal = [...chars].filter((c) => c !== reader).sort((a, b) => total(b) - total(a));
      const pool = inPairs.size ? chars.filter((c) => inPairs.has(c) && c !== reader) : byTotal.slice(0, 4);
      const ratio = (c: Character) => (mentions(c) + 1) / (total(c) + 1);
      narrator = [...pool].sort((a, b) => ratio(a) - ratio(b) || mentions(a) - mentions(b))[0];
    }
  }

  // Anatomy: default by gender, overridden when the text names a character's parts.
  // Unambiguous words only ("folds" also means sheets, "lips" means a mouth).
  const VULVA_WORDS = "pussy|cunt|front ?hole|clit|clitoris|vagina|labia|t-?dick|seam(?!\\s+of)";
  const PENIS_WORDS = "cock|dick|prick|erection|hard-?on|balls";
  const maleVulva = new RegExp(`\\bhis\\s+(?:[\\w-]+\\s+)?(?:${VULVA_WORDS})\\b`, "i").test(narration);
  const femalePenis = new RegExp(`\\bher\\s+(?:[\\w-]+\\s+)?(?:${PENIS_WORDS})\\b`, "i").test(narration);
  for (const c of chars) {
    const names = c.aliases.map(escapeRe).join("|");
    const own = (words: string) => !!names && new RegExp(`\\b(?:${names})(?:['’]s|(?<=s)['’])\\s+(?:[\\w-]+\\s+)?(?:${words})\\b`).test(narration);
    if (c.gender === "f") {
      c.vulva = true;
      c.penis = own(PENIS_WORDS) ? true : femalePenis ? "maybe" : false;
    } else if (c.gender === "m") {
      c.penis = true;
      c.vulva = own(VULVA_WORDS) ? true : maleVulva ? "maybe" : false;
    } else {
      if (own(VULVA_WORDS)) c.vulva = true;
      if (own(PENIS_WORDS)) c.penis = true;
    }
  }

  // Tags that say who has what. Omegaverses differ a lot in anatomy, so "Omega Dean Winchester" alone says nothing about
  // a vagina; it takes an intersex / "has a vagina" / "pussy" / trans tag. Naming the man in such a tag, or pairing a named
  // omega with a general tag of that kind ("Intersex Omega", "Omegas Have Vaginas"), gives him one. A general tag alone
  // (no names) only makes men's anatomy uncertain. Trans-woman / futa tags give a woman a penis.
  {
    const tagText = [...meta.freeforms, ...meta.characters, ...meta.relationships];
    const namesIn = (tag: string) => chars.filter((c) => c.name !== "Reader" && c.aliases.some((a) => a.length > 2 && new RegExp(`\\b${escapeRe(a)}\\b`, "i").test(tag)));
    const VULVA_TAG = /\b(?:intersex|vagina|vaginas|pussy|pussies|cunt|front hole|vulva|female (?:anatomy|genitalia|parts)|hermaphrodit\w*|dual anatomy|both anatomy|trans(?:masc(?:uline)?|gender)?\s+(?:man|male|boy|guy)|transmasc\w*|transgender|trans\s+(?!w|g)\w+)\b/i;
    const FEMALE_PENIS_TAG = /\b(?:futa(?:nari)?|dickgirl|trans\s+(?:woman|girl|female)|transfem(?:inine)?)\b/i;
    const OMEGA_TAG = /\bomega/i;
    const generic = tagText.filter((t) => VULVA_TAG.test(t) && namesIn(t).length === 0);
    const omegas = new Set<Character>();
    for (const tag of tagText) {
      const hit = namesIn(tag);
      if (FEMALE_PENIS_TAG.test(tag)) {
        for (const c of hit) if (c.gender !== "m") c.penis = true;
      } else if (VULVA_TAG.test(tag)) {
        for (const c of hit) if (c.gender === "m") c.vulva = true;
      } else if (OMEGA_TAG.test(tag)) {
        for (const c of hit) if (c.gender === "m") omegas.add(c);
      }
    }
    for (const c of chars) {
      if (c.gender !== "m" || c.vulva === true) continue;
      if (omegas.has(c) && generic.length) c.vulva = true;
      else if (generic.length && c.vulva === false) c.vulva = "maybe";
    }
  }

  const aliasPattern = [...byAlias.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRe)
    .join("|");

  // Guess pairings when tags don't give any: the two most-mentioned characters, plus a third if
  // they're mentioned nearly as often (threesomes).
  if (!pairings.length && chars.length >= 2) {
    // The narrator counts as mentioned every time they're "I".
    const weight = (c: Character) => (c === narrator ? Math.max(mentions(c), ...chars.map(mentions)) : mentions(c));
    const top = [...chars].sort((a, b) => weight(b) - weight(a)).slice(0, 3);
    pairings.push([top[0], top[1]]);
    if (top[2] && weight(top[2]) >= weight(top[1]) * 0.5) {
      pairings.push([top[0], top[2]], [top[1], top[2]]);
    }
  }

  return { chars, narrator, secondPerson: you, pairings, byAlias, aliasPattern, maleVulva };
}
