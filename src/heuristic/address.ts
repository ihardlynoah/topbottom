// Terms of address a fic builds up: "sir", "baby", "your highness", "half man", "little dragon". When one character keeps
// using the same term for another, that says something about the pair (a title from one side, an endearment from the other)
// and the term itself becomes a way to tell who is being spoken to, so an untagged line that uses it was said by the other one.

import type { Character } from "./characters";

/** Words that look like a form of address but aren't. */
const NOT_TERMS = new Set(
  "yes no yeah yep nope well so and but or then okay ok oh ah ha hm hmm huh hey hi hello please sorry thanks thank god jesus christ fuck fucking shit damn hell right wait look listen come stop just now here there too either though anyway again maybe sure fine good great nice whatever really honestly seriously actually basically exactly obviously apparently also still even only that this it you i me he she we they what why how when where who which not never always one two three something nothing everything anything nobody everyone".split(" "),
);
/** First words that make a phrase a command or a clause, not a form of address ("come here", "right now", "you know"). */
const VERBISH = new Set(
  "come go get let look listen wait stop take give tell show say hold keep put make try see hear sit stand stay move turn open close breathe relax fuck kiss touch lick suck feel do dont don't cant can't wont won't i i'm you're we're it's that's what why how here there now then right just so not you know guess think mean been being please tonight today tomorrow yesterday tho though anyway everyone someone".split(" "),
);
const FUNCTION_WORD = /^(?:the|a|an|to|of|in|on|at|for|with|by|from|is|are|was|were|be|been|do|does|did|have|has|had|will|would|can|could|should|my|your|his|her|our|their|if|as|than|like|know|think|mean|guess|said|says|just|got|get)$/;

/** Deferential: the speaker defers to the one addressed (said sincerely; teasing uses of the same words are why it is only a light cue). */
const TITLE = /^(?:sir|master|mistress|ma['’]am|madam|my lord|my lady|my king|my queen|your (?:majesty|highness|grace|lordship|ladyship|excellency|honou?r)|daddy|mommy|mama|papa|mistress)$/;
/** Endearments and pet names that look after or lead: the speaker is the one doing the cherishing. */
const ENDEARMENT = /^(?:baby|babe|sweetheart|sweetie|darling|honey|love|dear|princess|pet|kitten|sunshine|angel|sweetpea|precious|treasure|cutie|beautiful|gorgeous|handsome|pretty boy|pretty girl|little one|good boy|good girl|mon amour|mi amor|amor|cher|chéri|cheri)$/;

export type TermKind = "title" | "endearment" | "other";
export const termKind = (t: string): TermKind => (TITLE.test(t) ? "title" : ENDEARMENT.test(t) ? "endearment" : "other");

/** Forms of address in one line of dialogue: a term set off by commas at the start, the end or the middle. */
export function vocatives(line: string, isName: (w: string) => boolean): string[] {
  const text = line.replace(/[“”"]/g, "").replace(/’/g, "'").trim();
  const out: string[] = [];
  const add = (raw: string | undefined) => {
    if (!raw) return;
    const t = raw.toLowerCase().trim();
    const words = t.split(/\s+/);
    if (!t || words.length > 3 || words.some((w) => !/^[a-z][a-z'-]*$/.test(w))) return;
    if (words.length === 1 && (NOT_TERMS.has(t) || FUNCTION_WORD.test(t))) return;
    if (VERBISH.has(words[0]) || NOT_TERMS.has(words[0])) return;
    if (words.some((w) => FUNCTION_WORD.test(w) && !/^(?:my|your)$/.test(w)) && !/^(?:my|your) /.test(t)) return;
    if (words.some(isName)) return;
    out.push(t);
  };
  // "Sir, yes sir." / "Baby, come here." / "Yes, baby."
  add(/^(?:(?:yes|no|okay|ok|hey|oh|thanks|thank you|please|sure|fine|well|alright|come on|good morning|goodnight|good night)[,!]?\s+)?([a-zA-Z][\w'-]*(?:\s+[a-zA-Z][\w'-]*){0,2})\s*[,!]/.exec(text)?.[1]);
  // "…, sweetheart." / "Thank you, your highness."
  add(/,\s*((?:my\s+|your\s+)?[a-zA-Z][\w'-]*(?:\s+[a-zA-Z][\w'-]*){0,2})\s*[.!?…]+\s*$/.exec(text)?.[1]);
  // "Hey, babe, listen."
  for (const m of text.matchAll(/,\s*((?:my\s+|your\s+)?[a-zA-Z][\w'-]*(?:\s+[a-zA-Z][\w'-]*){0,2}),\s/g)) add(m[1]);
  return [...new Set(out)];
}

interface Use { count: number; example: string; para: number }

export class AddressBook {
  private byPair = new Map<string, Map<string, Use>>();
  private listeners = new Map<string, Map<Character, number>>();
  private people = new Map<string, Character>();

  clear() { this.byPair.clear(); }

  /** `speaker` said `line` to `listener` (both certain: the line was tagged, not guessed). */
  record(speaker: Character, listener: Character | undefined, line: string, para: number, sentence: string, isName: (w: string) => boolean) {
    if (!listener || listener === speaker) return;
    for (const term of vocatives(line, isName)) {
      const key = `${speaker.name}\u0000${listener.name}`;
      this.people.set(speaker.name, speaker);
      this.people.set(listener.name, listener);
      const terms = this.byPair.get(key) ?? new Map<string, Use>();
      const u = terms.get(term) ?? { count: 0, example: sentence, para };
      u.count++;
      terms.set(term, u);
      this.byPair.set(key, terms);
      const l = this.listeners.get(term) ?? new Map<Character, number>();
      l.set(listener, (l.get(listener) ?? 0) + 1);
      this.listeners.set(term, l);
    }
  }

  /** Who a line is addressed to, when it uses a term that has been used for one person at least three times. */
  listenerOf(line: string, isName: (w: string) => boolean): Character | undefined {
    for (const term of vocatives(line, isName)) {
      const l = this.listeners.get(term);
      if (!l) continue;
      const total = [...l.values()].reduce((a, b) => a + b, 0);
      const [top] = [...l.entries()].sort((a, b) => b[1] - a[1]);
      if (top && top[1] >= 3 && top[1] >= 0.8 * total) return top[0];
    }
    return undefined;
  }

  /** Terms one character keeps using for another (three times or more), most used first. */
  recurring(speaker: Character, listener: Character): { term: string; count: number; kind: TermKind; example: string; para: number }[] {
    const terms = this.byPair.get(`${speaker.name}\u0000${listener.name}`);
    return terms
      ? [...terms.entries()].filter(([, u]) => u.count >= 3).map(([term, u]) => ({ term, count: u.count, kind: termKind(term), example: u.example, para: u.para })).sort((a, b) => b.count - a.count)
      : [];
  }

  /**
   * Lopsided use of titles or endearments within a pair, as hints for the everyday-dynamic axis. A title said three times
   * as often one way as the other means the sayer defers; an endearment used that lopsidedly means the sayer leads.
   */
  asymmetries(a: Character, b: Character): { who: Character; partner: Character; kind: "title" | "endearment"; terms: string[]; count: number; example: string; para: number }[] {
    const out: ReturnType<AddressBook["asymmetries"]> = [];
    for (const [x, y] of [[a, b], [b, a]] as const) {
      for (const kind of ["title", "endearment"] as const) {
        const mine = this.recurring(x, y).filter((t) => t.kind === kind);
        const theirs = this.recurring(y, x).filter((t) => t.kind === kind);
        const n = mine.reduce((s, t) => s + t.count, 0);
        const m = theirs.reduce((s, t) => s + t.count, 0);
        if (n >= 3 && n >= 3 * m) out.push({ who: x, partner: y, kind, terms: mine.map((t) => t.term), count: n, example: mine[0].example, para: mine[0].para });
      }
    }
    return out;
  }

  /** Recurring terms that are neither titles nor endearments: the pair's own nicknames. */
  nicknames(): { speaker: string; listener: string; term: string; count: number }[] {
    const out: { speaker: string; listener: string; term: string; count: number }[] = [];
    for (const [key, terms] of this.byPair) {
      const [speaker, listener] = key.split("\u0000");
      for (const [term, u] of terms) if (u.count >= 3 && termKind(term) === "other") out.push({ speaker, listener, term, count: u.count });
    }
    return out.sort((x, y) => y.count - x.count);
  }
}
