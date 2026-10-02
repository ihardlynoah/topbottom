// Uses the list of common fanfiction characters (canon-data.ts) to settle who is who: the other names a tagged
// character goes by ("Cas", "Damianos", "Deadpool"), and their gender. It only switches on for fandoms the work is
// actually in, so a "Sam" in a Supernatural fic is Sam Winchester and a "Sam" elsewhere is left alone.

import type { Ao3Meta } from "../ao3";
import { CANON_RAW } from "./canon-data";

export interface CanonChar {
  name: string;
  gender: "m" | "f";
  aliases: string[];
  /** Lowercased names this character can be found by. */
  keys: Set<string>;
}

export interface CanonFandom {
  id: string;
  match: RegExp;
  chars: CanonChar[];
}

/** The pieces of a cast member that canon lookup needs (a subset of Character). */
export interface CastMember {
  name: string;
  aliases: string[];
  gender: "m" | "f" | "u";
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9'’\- .]/g, "")
    .replace(/\s+/g, " ")
    .trim();

function parse(): CanonFandom[] {
  const fandoms: CanonFandom[] = [];
  let cur: CanonFandom | undefined;
  for (const raw of CANON_RAW.split("\n")) {
    if (!raw.trim()) continue;
    if (raw.startsWith("@")) {
      const body = raw.slice(1).trim();
      const i = body.indexOf(" | ");
      cur = { id: body.slice(0, i).trim(), match: new RegExp(body.slice(i + 3).trim(), "i"), chars: [] };
      fandoms.push(cur);
      continue;
    }
    if (!cur) continue;
    const [name, gender, aliases = ""] = raw.trim().split(" | ");
    const list = aliases.split(";").map((a) => a.trim()).filter(Boolean);
    cur.chars.push({ name, gender: gender === "f" ? "f" : "m", aliases: list, keys: new Set([norm(name), ...list.map(norm)]) });
  }
  // A first or last name finds a character too, when only one character in the fandom has it.
  for (const f of fandoms) {
    const owners = new Map<string, CanonChar[]>();
    for (const c of f.chars) {
      const parts = norm(c.name).split(" ");
      for (const p of new Set([parts[0], parts[parts.length - 1]])) if (p.length >= 3) owners.set(p, [...(owners.get(p) ?? []), c]);
    }
    for (const [p, cs] of owners) if (cs.length === 1) cs[0].keys.add(p);
  }
  return fandoms;
}

const FANDOMS = parse();

/** Ways a tag or text name might be written in the list: "Evan "Buck" Buckley" → "evan buckley", "buck", … */
function variants(name: string): string[] {
  const out = new Set<string>();
  for (const part of name.split("|")) {
    const clean = part.replace(/\([^)]*\)/g, " ").trim();
    if (!clean) continue;
    out.add(norm(clean));
    out.add(norm(clean.replace(/["“”][^"“”]*["“”]/g, " ")));
    for (const q of clean.matchAll(/["“]([^"”]+)["”]/g)) out.add(norm(q[1]));
  }
  out.delete("");
  return [...out];
}

function matchChar(f: CanonFandom, names: string[]): CanonChar | undefined {
  const keys = new Set(names.flatMap(variants));
  let best: { c: CanonChar; score: number }[] = [];
  let top = 0;
  for (const c of f.chars) {
    let score = 0;
    for (const k of keys) if (c.keys.has(k)) score += k.includes(" ") ? 3 : 1;
    if (score > top) {
      top = score;
      best = [{ c, score }];
    } else if (score && score === top) best.push({ c, score });
  }
  return best.length === 1 ? best[0].c : undefined;
}

/**
 * Which listed fandoms the work is in: those its fandom tags name, or, when it has no fandom tags at all (a bare
 * text), those where at least two of the given names are different known characters.
 */
export function detectFandoms(meta: Ao3Meta, names: string[] = []): CanonFandom[] {
  const tagText = meta.fandoms.join(" | ");
  const byTag = FANDOMS.filter((f) => f.match.test(tagText));
  if (byTag.length || meta.fandoms.length) return byTag;
  const all = [...meta.characters, ...meta.relationships.flatMap((r) => r.split(/[/&]/)), ...names];
  return FANDOMS.filter((f) => new Set(all.map((n) => matchChar(f, [n])).filter(Boolean)).size >= 2);
}

export interface CanonOptions {
  /** Is this name a common word or something else that mustn't be taken for a character? */
  skip?: (alias: string) => boolean;
  /**
   * Merge two cast members that are the same character. Off when the author tagged both ("Tom Riddle" and
   * "Voldemort" can be two ages of one man, kept apart on purpose); on for names guessed from the text.
   */
  merge?: boolean;
}

/**
 * Fill in aliases and genders from the list. A known alias is added only if the text uses it (capitalised, at least
 * twice, and not mostly as an ordinary lowercase word) and no one else in the cast already goes by it. Two cast
 * members that turn out to be the same character are merged into the first. Returns the merged-away members.
 */
export function applyCanon(cast: CastMember[], fandoms: CanonFandom[], text: string, opts: CanonOptions = {}): CastMember[] {
  if (!fandoms.length) return [];
  const count = (re: RegExp) => (text.match(re) ?? []).length;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const usable = (a: string) => {
    if (opts.skip?.(a)) return false;
    const caps = count(new RegExp(`(?<![\\p{L}'’-])${esc(a)}(?![\\p{L}-])`, "gu"));
    if (caps < 2) return false;
    if (/\s/.test(a)) return true;
    const lower = count(new RegExp(`(?<![\\p{L}'’-])${esc(a.toLowerCase())}(?![\\p{L}-])`, "gu"));
    return lower <= caps * 0.2;
  };

  const known = new Map<CastMember, CanonChar>();
  for (const m of cast) {
    for (const f of fandoms) {
      const hit = matchChar(f, [m.name, ...m.aliases]);
      if (hit) {
        known.set(m, hit);
        break;
      }
    }
  }

  // The same character under two names.
  const removed: CastMember[] = [];
  const seen = new Map<CanonChar, CastMember>();
  for (const m of [...cast]) {
    const c = known.get(m);
    if (!c) continue;
    const first = seen.get(c);
    if (!first || !opts.merge) {
      if (!first) seen.set(c, m);
      continue;
    }
    for (const a of [m.name, ...m.aliases]) if (!first.aliases.includes(a)) first.aliases.push(a);
    cast.splice(cast.indexOf(m), 1);
    removed.push(m);
  }

  for (const [c, m] of seen) {
    if (m.gender === "u") m.gender = c.gender;
    for (const a of [c.name, ...c.aliases]) {
      if (m.aliases.includes(a) || cast.some((o) => o !== m && o.aliases.includes(a))) continue;
      if (usable(a)) m.aliases.push(a);
    }
  }
  return removed;
}
