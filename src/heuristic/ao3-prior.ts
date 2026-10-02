// A very faint prior on who tops or bottoms, from how often AO3 tags a character each way (ao3-prior-data.ts). It is only
// consulted for characters in a fandom the work is tagged with, and counts for very little next to anything in the text.

import type { Ao3Meta } from "../ao3";
import { AO3_PRIOR_RAW } from "./ao3-prior-data";
import { norm, variants } from "./canon";

export interface TagPrior {
  top: number;
  bottom: number;
  /** Share of the character's top/bottom tags that are "top", 0–1. */
  pTop: number;
}

interface Entry {
  keys: Set<string>;
  top: number;
  bottom: number;
}

interface Section {
  match: RegExp;
  entries: Entry[];
}

const SECTIONS: Section[] = (() => {
  const out: Section[] = [];
  let cur: Section | undefined;
  for (const raw of AO3_PRIOR_RAW.split("\n")) {
    if (!raw.trim()) continue;
    if (raw.startsWith("@")) {
      const body = raw.slice(1).trim();
      const i = body.indexOf(" | ");
      cur = { match: new RegExp(body.slice(i + 3).trim(), "i"), entries: [] };
      out.push(cur);
      continue;
    }
    if (!cur) continue;
    const [names, counts] = raw.trim().split(" | ");
    const [top, bottom] = counts.trim().split(/\s+/).map(Number);
    cur.entries.push({ keys: new Set(names.split(";").flatMap((n) => variants(n.trim()))), top, bottom });
  }
  return out;
})();

/** Prior for each named character (by name, then aliases), for the fandoms the work is tagged with. */
export function tagPriors(meta: Ao3Meta, chars: { name: string; aliases: string[] }[]): Map<string, TagPrior> {
  const out = new Map<string, TagPrior>();
  const tagText = meta.fandoms.join(" | ");
  if (!tagText) return out;
  const sections = SECTIONS.filter((s) => s.match.test(tagText));
  if (!sections.length) return out;
  for (const c of chars) {
    const keys = new Set([c.name, ...c.aliases].flatMap(variants).map(norm));
    let best: { e: Entry; score: number } | undefined;
    for (const s of sections)
      for (const e of s.entries) {
        let score = 0;
        for (const k of keys) if (e.keys.has(k)) score += k.includes(" ") ? 3 : 1;
        if (score && (!best || score > best.score)) best = { e, score };
      }
    if (best) out.set(c.name, { top: best.e.top, bottom: best.e.bottom, pTop: best.e.top / (best.e.top + best.e.bottom) });
  }
  return out;
}
