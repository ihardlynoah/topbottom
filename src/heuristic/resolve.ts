import { type Cast, type Character, type Gender } from "./characters";
import { canonEpithet } from "./epithets";
import { Basis } from "./hits";

// ───────────── character resolution ─────────────

export type PronounInfo = { gender: Gender | "any" } | { fixed: "I" | "you" };

export function pronoun(tok: string): PronounInfo | undefined {
  switch (tok.toLowerCase()) {
    case "he": case "him": case "his": return { gender: "m" };
    case "she": case "her": return { gender: "f" };
    case "they": case "them": case "their": return { gender: "any" };
    case "i": case "me": case "my": return { fixed: "I" };
    case "you": case "your": return { fixed: "you" };
  }
  return undefined;
}

export class Ctx {
  recent: Character[] = [];
  lastSubject?: Character;
  /** Learned epithets ("the blond" → Draco). */
  epithets = new Map<string, Character>();
  /** How each unlearned epithet was resolved, for learning on a second pass. */
  votes = new Map<string, Map<Character, number>>();
  /** Epithets resolved in the current sentence, so they mean the same thing throughout it. */
  private sentence = new Map<string, Character | undefined>();
  /** The epithets replaced by "Epithet<n>" tokens in the current sentence. */
  epiTable: string[] = [];
  constructor(private cast: Cast) {}

  reset() {
    this.recent = [];
    this.lastSubject = undefined;
    this.sentence.clear();
  }

  newSentence(epiTable: string[] = []) {
    this.sentence.clear();
    this.epiTable = epiTable;
  }

  /** Resolve an "Epithet<n>" placeholder token, if that's what this is. */
  token(tok: string): Character | undefined | null {
    const m = /^Epithet(\d+)$/.exec(tok);
    if (!m) return null;
    const text = this.epiTable[Number(m[1])];
    return text ? this.epithet(text) : undefined;
  }

  /** "The blond", "the taller man": a learned mapping, else the person who isn't the current subject. */
  epithet(tok: string): Character | undefined {
    const { keys, gender, other } = canonEpithet(tok);
    // "his husband", "her lover": always the possessor's partner, never one fixed person.
    if (keys[0]?.startsWith("rel:")) {
      const ck = keys[0];
      if (this.sentence.has(ck)) return this.sentence.get(ck);
      const possessor = this.sentMentions[0]?.c ?? this.lastSubject;
      const c = possessor ? this.partnerOf(possessor, gender) : this.recent.find((r) => Ctx.compatible(r, gender));
      this.sentence.set(ck, c);
      return c;
    }
    for (const k of keys) {
      const known = this.epithets.get(k);
      if (known && Ctx.compatible(known, gender)) return known;
    }
    const cacheKey = keys[0] ?? tok.toLowerCase();
    if (this.sentence.has(cacheKey)) return this.sentence.get(cacheKey);
    const c = this.lastSubject ? this.partnerOf(this.lastSubject, gender) : this.recent.find((r) => Ctx.compatible(r, gender));
    this.sentence.set(cacheKey, c);
    // "The other man" is always relative, so it never becomes a fixed mapping.
    if (c && keys.length && !other) {
      for (const k of keys) {
        const v = this.votes.get(k) ?? new Map<Character, number>();
        v.set(c, (v.get(c) ?? 0) + 1);
        this.votes.set(k, v);
      }
    }
    return c;
  }

  /** Adopt epithet mappings that were consistent on the first pass. Returns true if anything was learned. */
  learnFromVotes(): boolean {
    let learned = false;
    for (const [key, v] of this.votes) {
      if (this.epithets.has(key)) continue;
      const total = [...v.values()].reduce((a, b) => a + b, 0);
      const [best, n] = [...v.entries()].sort((a, b) => b[1] - a[1])[0];
      if (total >= 3 && n / total >= 0.7) {
        this.epithets.set(key, best);
        learned = true;
      }
    }
    this.votes.clear();
    return learned;
  }

  mention(c: Character | undefined) {
    if (!c) return;
    this.recent = [c, ...this.recent.filter((r) => r !== c)].slice(0, 10);
  }

  static compatible(c: Character, g: Gender | "any") {
    return g === "any" || c.gender === "u" || c.gender === g;
  }

  /** Who a subject pronoun (he/she) most likely refers to: the last subject, or the last-mentioned match. */
  subjectFor(g: Gender | "any"): Character | undefined {
    if (this.lastSubject && Ctx.compatible(this.lastSubject, g)) return this.lastSubject;
    return this.recent.find((c) => Ctx.compatible(c, g));
  }

  /** The other person in a two-person scene. */
  /** Characters named in the current sentence, in order. */
  sentMentions: { c: Character; at: number }[] = [];
  /** Where the current match ends: people named after it aren't its partner ("Riddle fucks him, though Voldemort watches"). */
  cutoff = Infinity;
  /** "Harry and I fucked him": people sharing the subject, who can't be the object. */
  coSubjects = new Set<Character>();
  /** Each person's most recent partner, per kind of act ("" = any). */
  partners = new Map<string, Map<Character, Character>>();
  /** The kind of act being resolved right now. */
  curCat = "";

  lastPartner(x: Character): Character | undefined {
    return this.partners.get(this.curCat)?.get(x) ?? this.partners.get("")?.get(x);
  }

  setPartners(cat: string, a: Character, b: Character) {
    for (const k of [cat, ""]) {
      const m = this.partners.get(k) ?? new Map<Character, Character>();
      m.set(a, b);
      m.set(b, a);
      this.partners.set(k, m);
    }
  }

  partnerOf(x: Character, g: Gender | "any" = "any", exclude: Set<Character> = new Set()): Character | undefined {
    const ok = (c: Character) => c !== x && !exclude.has(c) && !this.coSubjects.has(c) && Ctx.compatible(c, g);
    // Someone else named earlier in the same sentence is the likeliest partner (matters in threesomes).
    const last = this.lastPartner(x);
    // …unless their current partner is named in it too ("…thrusts into him as Harry is forced up").
    if (last && ok(last) && this.sentMentions.some((m) => m.c === last)) return last;
    const inSentence = this.sentMentions.find((m) => m.at < this.cutoff && ok(m.c));
    if (inSentence) return inSentence.c;
    // Mid-scene, "him" is whoever x was just having sex with, not whoever last spoke.
    if (last && ok(last) && this.recent.slice(0, 6).includes(last)) return last;
    const paired = new Set(this.cast.pairings.filter((p) => p.includes(x)).map((p) => (p[0] === x ? p[1] : p[0])));
    const near = this.recent.slice(0, 6).filter(ok);
    return (
      near.find((c) => paired.has(c)) ??
      near[0] ??
      [...paired].find(ok) ??
      this.cast.pairings.flat().find(ok)
    );
  }

  /** Whose "I" this stretch is, when sections are headed by the narrator's name ("Scott - Saturday, September 6, 2014"). */
  narratorNow: Character | undefined;
  /** The point-of-view character of this stretch of the text, when known (see pov.ts). */
  povNow: Character | undefined;

  fixed(kind: "I" | "you"): Character | undefined {
    return kind === "I" ? (this.narratorNow ?? this.cast.narrator) : this.cast.secondPerson;
  }
}

export function stripPoss(tok: string) {
  return tok.replace(/['’]s?$/, "");
}


export interface Slot {
  char?: Character;
  pron?: PronounInfo;
  /** Came from an epithet ("the blond"), so it's less certain than a name. */
  epithet?: boolean;
}

export function readSlot(tok: string | undefined, cast: Cast, ctx: Ctx): Slot | undefined {
  if (!tok) return undefined;
  const name = stripPoss(tok);
  const byName = cast.byAlias.get(name);
  if (byName) return { char: byName };
  const viaEpithet = ctx.token(name);
  if (viaEpithet !== null) return viaEpithet ? { char: viaEpithet, epithet: true } : undefined;
  const p = pronoun(name);
  if (!p) return undefined;
  if ("fixed" in p) {
    const c = ctx.fixed(p.fixed);
    return c ? { char: c } : undefined;
  }
  return { pron: p };
}

export function slotGender(s: Slot): Gender | "any" {
  return s.pron && "gender" in s.pron ? s.pron.gender : "any";
}

/** Turn the matched T/B tokens into characters. */
export function resolvePair(
  tTok: string | undefined,
  bTok: string | undefined,
  subj: "t" | "b",
  cast: Cast,
  ctx: Ctx,
  /** For elided-subject matches: the subject found earlier in the sentence. */
  subjChar?: Character,
  /** For pronoun subjects mid-sentence: the nearest preceding clause subject. */
  nearSubj?: Character,
): { top?: Character; bottom?: Character; basis: Basis } | undefined {
  const subjectFor = (g: Gender | "any") => (nearSubj && Ctx.compatible(nearSubj, g) ? nearSubj : ctx.subjectFor(g));
  let t = readSlot(tTok, cast, ctx);
  let b = readSlot(bTok, cast, ctx);
  if (subjChar) {
    if (subj === "t") t = { char: subjChar };
    else b = { char: subjChar };
  }
  if (tTok && !t) return undefined;
  if (bTok && !b) return undefined;
  // "…he spills over Riddle's thigh as he clenches around Voldemort": the pronoun subject is the clause's subject.
  let viaNear = false;
  if (nearSubj && t && b) {
    const [s, o] = subj === "t" ? [t, b] : [b, t];
    if (s.pron && o.char && o.char !== nearSubj && Ctx.compatible(nearSubj, slotGender(s))) {
      if (subj === "t") t = { char: nearSubj };
      else b = { char: nearSubj };
      viaNear = true;
    }
  }

  let top = t?.char;
  let bottom = b?.char;
  let basis: Basis = viaNear ? "pronoun" : "named";

  if (t && b) {
    if (top && !bottom) {
      bottom = ctx.partnerOf(top, slotGender(b));
      basis = "pronoun";
    } else if (bottom && !top) {
      top = ctx.partnerOf(bottom, slotGender(t));
      basis = "pronoun";
    } else if (!top && !bottom) {
      const [s, o] = subj === "t" ? [t, b] : [b, t];
      const sc = subjectFor(slotGender(s));
      const oc = sc ? ctx.partnerOf(sc, slotGender(o)) : undefined;
      [top, bottom] = subj === "t" ? [sc, oc] : [oc, sc];
      basis = "pronoun";
    }
  } else {
    // Only one side mentioned ("he bottomed out", "he was fucked"): the other is the scene partner.
    const only = (t ?? b)!;
    // "…was probably him fingering himself": an object pronoun on its own is the other person, not the subject.
    const objectForm = /^(?:him|her|them)$/i.test((tTok ?? bTok) ?? "");
    const subj0 = subjectFor(slotGender(only));
    const c = only.char ?? (objectForm && subj0 ? (ctx.partnerOf(subj0, slotGender(only)) ?? subj0) : subj0);
    const other = c ? ctx.partnerOf(c) : undefined;
    if (t) [top, bottom] = [c, other];
    else [top, bottom] = [other, c];
    basis = "inferred";
  }
  if (!top || !bottom || top === bottom) return undefined;
  if (basis === "named" && (t?.epithet || b?.epithet)) basis = "pronoun";
  return { top, bottom, basis };
}


export function groupValue(groups: Record<string, string | undefined> | undefined, role: "t" | "b") {
  if (!groups) return undefined;
  for (const [k, v] of Object.entries(groups)) if (v !== undefined && k.startsWith(`${role}_`)) return v;
  return undefined;
}

