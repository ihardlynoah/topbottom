// Works out who the characters are, what names/pronouns refer to them, and whose POV the story is in.

import type { Ao3Meta } from "../ao3";

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
  "I I'm I'd I'll I've A An The He She They It We You His Her Their My Your Our This That There Then When What Where Why How Who Oh Ah God Christ Jesus Fuck Yes No Not But And Or So If Just Okay OK Ok Well Now Still Even Maybe Please Thank Thanks Sorry Hey Hi Hello Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December English French Chapter Mr Mrs Ms Dr Sir Lord Lady TV Christmas Halloween Mum Mom Dad Mama Papa Uncle Aunt Grandma Grandpa Instead Later Before After Once Twice Something Nothing Everything Anything Someone Everyone Nobody Neither Either Both Every Each Some Any Too Also Because While Since Until Though Although Yeah Yep Nope Shit Damn Hell Wait Look Listen Come Go Stop Don't Can't Won't Didn't Wasn't Isn't It's That's There's He's She's They're We're You're Let's Alpha Alphas Omega Omegas Beta Betas Sir Ma'am Mister".split(
    " ",
  ),
);

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanTagName(tag: string): string {
  return tag
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isReaderTag(name: string): boolean {
  return /^(reader|you|y\/n|original reader character)$/i.test(name);
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
export function guessNames(text: string): string[] {
  const caps = new Map<string, number>();
  const lower = new Map<string, number>();
  for (const m of text.matchAll(/\b([\p{L}][\p{L}'’-]{1,20})\b/gu)) {
    const w = m[1].replace(/['’]s$/, "");
    if (/^\p{Lu}\p{Ll}/u.test(w)) caps.set(w, (caps.get(w) ?? 0) + 1);
    else if (/^\p{Ll}/u.test(w)) lower.set(w, (lower.get(w) ?? 0) + 1);
  }
  const words = text.split(/\s+/).length;
  const min = Math.max(4, Math.round(words / 3000));
  return [...caps.entries()]
    .filter(([w, n]) => n >= min && !NOT_NAMES.has(w) && !TITLE_WORDS.has(w) && (lower.get(w.toLowerCase()) ?? 0) <= n * 0.05)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([w]) => w);
}

function guessGenders(chars: Character[], meta: Ao3Meta, narration: string) {
  const cats = meta.categories.map((c) => c.toUpperCase());
  const allMale = cats.length > 0 && cats.every((c) => c === "M/M" || c === "GEN");
  const allFemale = cats.length > 0 && cats.every((c) => c === "F/F" || c === "GEN");
  const sentences = narration.split(/(?<=[.!?])\s+/);
  for (const c of chars) {
    if (c.name === "Reader") continue;
    if (allMale) { c.gender = "m"; continue; }
    if (allFemale) { c.gender = "f"; continue; }
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
    if (he >= 2 && he > she * 2) c.gender = "m";
    else if (she >= 2 && she > he * 2) c.gender = "f";
  }
}

export function buildCast(meta: Ao3Meta, narration: string): Cast {
  const pairNames: string[][] = [];
  for (const rel of meta.relationships) {
    const sep = rel.includes("/") ? "/" : "&";
    const names = rel.split(sep).map(cleanTagName).filter(Boolean);
    if (sep === "/" && names.length >= 2) pairNames.push(names);
  }
  let names = [...pairNames.flat(), ...meta.characters];
  if (!names.length) names = guessNames(narration);
  const chars = makeChars(names);

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
    const cs = names.map(find).filter((c): c is Character => !!c);
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
  const secondPerson = (narration.match(/\b(?:you|your|You|Your)\b/g) ?? []).length / words;

  for (const c of chars) for (const a of c.aliases) if (!byAlias.has(a)) byAlias.set(a, c);

  const mentions = (c: Character) => {
    if (!c.aliases.length) return 0;
    return (narration.match(new RegExp(`\\b(?:${c.aliases.map(escapeRe).join("|")})\\b`, "g")) ?? []).length;
  };

  let reader = chars.find((c) => c.name === "Reader");
  let you: Character | undefined;
  if (reader || secondPerson > 0.012) {
    if (!reader) {
      reader = { name: "Reader", aliases: [], gender: "u", vulva: "maybe", penis: "maybe" };
      chars.push(reader);
    }
    you = reader;
  }

  let narrator: Character | undefined;
  if (firstPerson > 0.006) {
    // The narrator is the main character whose name rarely appears in narration.
    const candidates = (pairings[0] ?? chars.slice(0, 2)).filter((c) => c !== reader);
    narrator = candidates.sort((a, b) => mentions(a) - mentions(b))[0];
  }

  // Anatomy: default by gender, overridden when the text names a character's parts.
  const VULVA_WORDS = "pussy|cunt|front ?hole|clit|clitoris|folds|vagina|labia|t-?dick";
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

  const aliasPattern = [...byAlias.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRe)
    .join("|");

  // Guess a pairing when tags don't give one: the two most-mentioned characters.
  if (!pairings.length && chars.length >= 2) {
    const top = [...chars].sort((a, b) => mentions(b) - mentions(a)).slice(0, 2);
    pairings.push([top[0], top[1]]);
  }

  return { chars, narrator, secondPerson: you, pairings, byAlias, aliasPattern, maleVulva };
}
