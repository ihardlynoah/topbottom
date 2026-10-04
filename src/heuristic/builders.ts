import { type Ao3Meta } from "../ao3";
import { type ActResult, type Confidence, type Desire, type Instance, type DynamicRating, type ManualAct, type ManualResult, type Role, type SoloAct, type SoloResult, type VaginalResult, type VibeRating, confidenceLabel } from "../types";
import { rateDynamic, rateVibe, type VibeItem } from "../vibe";
import { tagPriors } from "./ao3-prior";
import { type Character } from "./characters";
import { ANAL_CTX, type Cat, VULVA_CTX } from "./patterns";
import { type TagInfo } from "./tags";
import { type OralKind, ROLE_WORDS, type RoleEvidence, roleOdds, roleSummary } from "../roles";
import { ActHit, DesireHit } from "./hits";
import { SOLO_TOY, selfToyStrength, usesToyOnSelf } from "./markers";
import { pronoun } from "./resolve";

// ───────────── solo acts ─────────────

/** Whether a self-fingering or toy sentence is about an ass: always for someone with no vulva, only when the words say so for someone with one. */
export function soloIsAnal(d: { who: Character; sentence: string }): boolean {
  if (ANAL_CTX.test(d.sentence)) return true;
  const vulvaHolder = d.who.vulva === true || (d.who.gender === "f" && d.who.penis !== true);
  if (VULVA_CTX.test(d.sentence)) return false;
  return !vulvaHolder;
}

export function soloLabel(d: { act: string; kind: string; sentence: string }): string {
  if (d.kind === "masturbation") return "Masturbation";
  if (/toy|dildo|plug|vibrator|ride|rode/i.test(d.act) || SOLO_TOY.test(d.sentence)) return "Toy on self";
  return "Self-fingering";
}

export function buildSolo(pair: [Character, Character], hits: DesireHit[], where: (pi: number) => string): SoloResult {
  const seen = new Set<string>();
  const instances: SoloAct[] = [];
  for (const d of hits) {
    if (!d.wants || !pair.includes(d.who)) continue;
    const key = `${d.who.name}\u0000${d.para}\u0000${d.sentence}`;
    if (seen.has(key)) continue;
    seen.add(key);
    instances.push({ who: d.who.name, act: soloLabel(d), evidence: truncate(d.sentence), where: where(d.para), context: d.context });
  }
  const people = pair.map((c) => {
    const mine = instances.filter((i) => i.who === c.name);
    const acts = [...new Set(mine.map((i) => i.act))].map((act) => ({ act, count: mine.filter((i) => i.act === act).length }));
    return { name: c.name, total: mine.length, acts };
  });
  const listed = people.filter((p) => p.total).map((p) => `${p.name}: ${p.acts.map((a) => `${a.act.toLowerCase()} ×${a.count}`).join(", ")}`);
  return {
    occurs: instances.length > 0,
    summary: listed.length ? listed.join("; ") : "No solo acts recognized.",
    people,
    instances,
  };
}

export function buildManual(pair: [Character, Character], hits: DesireHit[], where: (pi: number) => string): ManualResult {
  const seen = new Set<string>();
  const instances: ManualAct[] = [];
  for (const d of hits) {
    if (!d.wants || !d.partner || !pair.includes(d.who) || !pair.includes(d.partner)) continue;
    const key = `${d.para}\u0000${d.sentence}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const mutual = /^(?:mutual|frottage)/i.test(d.act);
    const act = d.act === "frottage" ? "Frottage" : /^thigh/i.test(d.act) ? "Thigh sex" : /^tit/i.test(d.act) ? "Chest sex" : mutual ? "Mutual handjob" : "Handjob";
    instances.push({ giver: d.who.name, receiver: d.partner.name, act, mutual, evidence: truncate(d.sentence), where: where(d.para), context: d.context });
  }
  const people = pair.map((c) => ({
    name: c.name,
    gives: instances.filter((i) => !i.mutual && i.giver === c.name).length,
    gets: instances.filter((i) => !i.mutual && i.receiver === c.name).length,
    mutual: instances.filter((i) => i.mutual).length,
  }));
  const parts: string[] = [];
  for (const p of people) {
    const hands = instances.filter((i) => !i.mutual && i.giver === p.name && i.act === "Handjob").length;
    if (hands) parts.push(`${p.name} gives a handjob ×${hands}`);
  }
  const mut = instances.filter((i) => i.mutual).length;
  if (mut) parts.push(`mutual/frottage ×${mut}`);
  for (const [act, what] of [["Thigh sex", "between their thighs"], ["Chest sex", "between their chest"]] as const) {
    for (const p of people) {
      const n = instances.filter((i) => i.act === act && i.giver === p.name).length;
      if (n) parts.push(`${instances.find((i) => i.act === act && i.giver === p.name)!.receiver} thrusts ${what.replace("their", `${p.name}’s`)} ×${n}`);
    }
  }
  return { occurs: instances.length > 0, summary: parts.length ? parts.join("; ") : "No handjobs, frottage or other body play recognized.", people, instances };
}

// ───────────── vaginal sex (occurrence only) ─────────────

export function buildVaginal(hits: ActHit[], pair: [Character, Character], meta: Ao3Meta, where: (pi: number) => string): VaginalResult {
  const applicable = hits.length > 0 || pair.some((c) => c.vulva === true);
  const reasons: string[] = [];
  const instances: Instance[] = [];
  for (const scene of groupScenes(hits, where)) {
    const best = [...scene.hits].sort((a, b) => b.weight - a.weight || (a.basis === "named" ? -1 : 1))[0];
    const acts = [...new Set(scene.hits.map((h) => h.act))];
    instances.push({
      top: best.top.name,
      bottom: best.bottom.name,
      act: acts.join(", "),
      where: where(scene.first),
      para: best.para,
      via: best.via,
      evidence: truncate(best.sentence),
      basis: best.basis,
    });
  }
  const sex = hits.filter((h) => h.act !== "fingering");
  const occurs = sex.length > 0;
  const between = `${pair[0].name} & ${pair[1].name}`;
  let summary: string;
  let score: number;
  if (occurs) {
    const scenes = instances.filter((i) => i.act !== "fingering").length;
    const w = sex.reduce((n, h) => n + h.weight, 0);
    summary = `Yes, between ${between} (${plural(scenes, "scene")}).`;
    score = 0.4 + 0.55 * (1 - Math.exp(-w / 1.5));
    const named = sex.filter((h) => h.basis === "named").length;
    reasons.push(`${plural(sex.length, "matching sentence")} (${named} with names)`);
    if (instances.length > scenes) summary += " Also vaginal fingering.";
  } else {
    summary = hits.length ? `Only vaginal fingering (${between}).` : "No vaginal sex recognized.";
    const explicit = /explicit|mature/i.test(meta.rating ?? "");
    score = explicit ? 0.45 : meta.rating ? 0.75 : 0.5;
    reasons.push(explicit ? `rated ${meta.rating}, so something may have been missed` : "no matching sentences");
  }
  return { occurs, applicable, summary, instances, confidence: { score, label: confidenceLabel(score), reasons } };
}

// ───────────── per-act verdicts ─────────────

export interface PairTags {
  roles: { char: Character; role: "top" | "bottom" | "switch"; tag: string; style?: "power" | "service" | "pillow" }[];
  dynamics: { char: Character; lean: "top" | "bottom"; tag: string }[];
  dynamicTags: string[];
  switching: string[];
  actTags: Record<"anal" | "oral" | OralKind, string[]>;
}

export function tagsFor(info: TagInfo, pair: [Character, Character], isMain: boolean): PairTags {
  return {
    roles: info.roles.filter((r) => pair.includes(r.char)),
    dynamics: info.dynamics.filter((r) => pair.includes(r.char)),
    dynamicTags: isMain ? info.dynamicTags : [],
    switching: isMain ? info.switching : [],
    actTags: isMain
      ? { anal: info.anal, oral: info.oral, blowjob: info.blowjobs, rimming: info.rimming, cunnilingus: info.oral.filter((t) => /cunnilingus|eating out|pussy/i.test(t)) }
      : { anal: [], oral: [], blowjob: [], rimming: [], cunnilingus: [] },
  };
}

/**
 * Overall top/bottom "vibe" for each partner, from every kind of evidence, in descending order of importance: sex acts,
 * stating what they are or prefer (and AO3 role tags), groping and similar, desires/plans/fantasies, other hints, dominant
 * or submissive behaviour, then AO3 tag counts for the character.
 */
/**
 * The sexual vibe. With `combined`, everyday-dynamic cues (taking charge, caring, pet names, power bottoms) are folded back
 * in at tier 6, as before the two-axis display: the "single vibe" view.
 */
export function buildVibes(pair: [Character, Character], acts: ActHit[], des: DesireHit[], tags: PairTags, meta: Ao3Meta, where: (pi: number) => string, combined = false): VibeRating[] {
  const other = (c: Character) => (pair[0] === c ? pair[1] : pair[0]);
  const items = new Map<Character, VibeItem[]>(pair.map((c) => [c, []]));
  type Src = Pick<VibeItem, "what" | "source" | "where" | "fromOther">;
  const add = (c: Character, tier: VibeItem["tier"], role: Role, weight: number, src: Src = {}) => items.get(c)?.push({ tier, role, weight, ...src });
  const theirs = (src: Src): Src => ({ ...src, fromOther: true });
  const flip = (r: Role): Role => (r === "top" ? "bottom" : "top");

  // 1. Sex acts: penetration, strap-ons and fingering (oral isn't about topping).
  for (const a of acts) {
    if (a.cat !== "anal" && !(a.cat === "vaginal" && !/scissor/i.test(a.act))) continue;
    const w = (a.basis === "named" ? 1 : a.basis === "pronoun" ? 0.8 : 0.6) * (/fingering/i.test(a.act) ? 0.15 : 0.5) * (a.shaky ? 0.4 : 1);
    const src = { what: `${a.act} (${a.basis === "named" ? "named" : a.basis === "pronoun" ? "via pronouns" : "inferred"}${a.shaky ? `; ${a.shaky}` : ""})`, source: a.sentence, where: where(a.para) };
    add(a.top, 1, "top", w, src);
    add(a.bottom, 1, "bottom", w, theirs(src));
  }
  // 2. Saying what they are or prefer, and AO3 role tags.
  for (const r of tags.roles) {
    if (!items.has(r.char)) continue;
    const src = { what: `AO3 tag “${r.tag}”`, source: r.tag };
    if (r.role === "switch") {
      add(r.char, 2, "top", 0.6, src);
      add(r.char, 2, "bottom", 0.6, src);
    } else {
      add(r.char, 2, r.role, r.style === "pillow" ? 0.9 : 1, src);
      add(other(r.char), 2, flip(r.role), 0.5, theirs(src));
      // A power bottom runs the show; a service top is there to please. (On the two-axis display these are scored on the
      // everyday-dynamic axis instead.)
      if (combined && r.style === "power") add(r.char, 6, "top", 0.5, { ...src, what: `${src.what} (a power bottom takes charge)` });
      if (combined && r.style === "service") add(r.char, 6, "bottom", 0.4, { ...src, what: `${src.what} (a service top gives way)` });
    }
  }
  // "Dominant Dean", "Submissive Cas": a dynamic, which leans that way but isn't the same as topping.
  for (const d of tags.dynamics) {
    if (!items.has(d.char)) continue;
    const src = { what: `AO3 tag “${d.tag}”`, source: d.tag };
    add(d.char, 2, d.lean, 0.6, src);
    add(other(d.char), 2, flip(d.lean), 0.3, theirs(src));
  }
  for (const c of pair) if (tags.switching.length) { const src = { what: `AO3 tag “${tags.switching[0]}”`, source: tags.switching[0] }; add(c, 2, "top", 0.4, src); add(c, 2, "bottom", 0.4, src); }
  const TIER_OF: Partial<Record<Desire["kind"], [VibeItem["tier"], number]>> = {
    identity: [2, 1],
    touch: [3, 0.4], fingering: [3, 0.4], prep: [3, 0.4],
    said: [4, 0.6], wanted: [4, 0.8], fantasy: [4, 0.6], hypothetical: [4, 0.4], history: [4, 0.5],
    ogling: [5, 0.4], fingers: [5, 0.4], solo: [5, 0.4],
    // Says what they are or prefer (tier 2), aftermath of sex (tier 3), position (tier 6). Taking charge, caring, pet
    // names and yielding are scored on the everyday-dynamic axis (buildDynamic), not here.
    stated: [2, 0.8], body: [3, 0.8], position: [6, 0.4],
    ...(combined ? ({ behavior: [6, 0.4], aftercare: [6, 0.3], petname: [6, 0.25] } as const) : {}),
  };
  const selfToyVibe = new Map<string, number>();
  for (const d of des) {
    const dsrc: Src = { what: `${d.act} (${d.kind}${d.wants ? "" : ", not wanted"}${d.guessed ? "; speaker guessed from the narration" : ""})`, source: d.sentence, where: where(d.para) };
    if (usesToyOnSelf(d) && d.wants && items.has(d.who)) {
      const seen = (selfToyVibe.get(`${d.who.name}|${d.para}`) ?? 0) + 1;
      selfToyVibe.set(`${d.who.name}|${d.para}`, seen);
      if (seen <= 2) add(d.who, 1, "bottom", 0.5 * selfToyStrength(d) * (seen === 1 ? 1 : 0.5), dsrc);
      continue;
    }
    const hit = TIER_OF[d.kind];
    if (!hit || !items.has(d.who)) continue;
    if (d.cat === "oral") continue;
    const [tier, w] = hit;
    add(d.who, tier, d.wants ? d.role : flip(d.role), (d.wants ? w : w * 0.5) * (d.kind === "stated" || d.kind === "body" ? Math.min(1, d.weight + 0.2) : 1), dsrc);
    // Position (and, in the combined view, aftercare) is two-sided: the one resting on a chest or held close means the other
    // is the chest or the arms.
    if (d.wants && (d.kind === "position" || (combined && d.kind === "aftercare"))) add(other(d.who), tier, flip(d.role), w * 0.7, theirs(dsrc));
    // A tag that names the pair's dynamic ("Dom/sub", "Praise Kink") backs up who gives the orders, the praise or the care.
    if (combined && tags.dynamicTags.length && d.wants && (d.kind === "petname" || d.kind === "aftercare")) add(d.who, 2, d.role, w * 0.5, { ...dsrc, what: `${dsrc.what}; backed up by a dynamic tag (${tags.dynamicTags[0]})` });
  }
  // 7. How AO3 tags the character overall.
  for (const [name, pr] of tagPriors(meta, pair)) {
    const c = pair.find((x) => x.name === name);
    if (!c) continue;
    const lean = (pr.pTop - 0.5) * 2;
    add(c, 7, lean > 0 ? "top" : "bottom", Math.abs(lean) * 0.6, { what: `AO3 tag counts for ${name}: ${Math.round(pr.pTop * 100)}% of tagged roles are top`, source: "community Top Tops / Top Bottoms / Most Versatile sheets" });
  }
  return pair.map((c) => rateVibe(c.name, items.get(c) ?? [], combined));
}

/** Everyday power dynamic: who leads and who follows, apart from who tops and bottoms. "top" here means leads. */
export function buildDynamic(pair: [Character, Character], des: DesireHit[], tags: PairTags, where: (pi: number) => string): DynamicRating[] {
  const other = (c: Character) => (pair[0] === c ? pair[1] : pair[0]);
  const items = new Map<Character, VibeItem[]>(pair.map((c) => [c, []]));
  type Src = Pick<VibeItem, "what" | "source" | "where" | "fromOther">;
  const add = (c: Character, tier: VibeItem["tier"], role: Role, weight: number, src: Src = {}) => items.get(c)?.push({ tier, role, weight, ...src });
  const theirs = (src: Src): Src => ({ ...src, fromOther: true });
  const flip = (r: Role): Role => (r === "top" ? "bottom" : "top");

  // 1. What the tags say: "Dominant Cas", "Submissive Dean", a power bottom or a service top.
  for (const d of tags.dynamics) {
    if (!items.has(d.char)) continue;
    const src = { what: `AO3 tag “${d.tag}”`, source: d.tag };
    add(d.char, 1, d.lean, 1, src);
    add(other(d.char), 1, flip(d.lean), 0.4, theirs(src));
  }
  for (const r of tags.roles) {
    if (!items.has(r.char)) continue;
    const src = { what: `AO3 tag “${r.tag}”`, source: r.tag };
    if (r.style === "power") add(r.char, 1, "top", 0.6, { ...src, what: `${src.what} (a power bottom takes charge)` });
    if (r.style === "service") add(r.char, 1, "bottom", 0.5, { ...src, what: `${src.what} (a service top gives way)` });
  }
  // 2–4. Behaviour: taking charge, caring and praising, yielding.
  const DYN_KINDS = new Set<Desire["kind"]>(["behavior", "aftercare", "petname"]);
  const BASE_W: Partial<Record<Desire["kind"], number>> = { behavior: 0.4, aftercare: 0.3, petname: 0.25 };
  for (const d of des) {
    if (!DYN_KINDS.has(d.kind) || d.cat === "oral" || !items.has(d.who)) continue;
    const role: Role = d.wants ? d.role : flip(d.role);
    const caring = /protect|looking after|comfort|caring|care for|praising|good boy|good girl|pet name/i.test(d.act) || d.kind === "petname";
    const tier: VibeItem["tier"] = role === "bottom" ? 4 : caring || d.kind === "aftercare" ? 3 : 2;
    const w = (BASE_W[d.kind] ?? 0.3) * (d.wants ? 1 : 0.5);
    const dsrc: Src = { what: `${d.act} (${d.kind}${d.wants ? "" : ", not wanted"}${d.guessed ? "; speaker guessed from the narration" : ""})`, source: d.sentence, where: where(d.para) };
    add(d.who, tier, role, w, dsrc);
    // Leading, carrying, protecting, pinning, holding and praising are things done to the other person: the one on the
    // receiving end follows (and the one holding or looking after credits the one held). Blushing is only one side.
    if (d.wants && !/flustered/.test(d.act)) add(other(d.who), role === "bottom" ? 3 : 4, flip(role), w * (d.kind === "aftercare" ? 0.7 : 0.5), theirs(dsrc));
    // A tag that names the pair's dynamic ("Dom/sub", "Praise Kink") backs up who gives the orders, the praise or the care.
    if (tags.dynamicTags.length && d.wants && (d.kind === "petname" || d.kind === "aftercare")) add(d.who, 1, d.role, w * 0.5, { ...dsrc, what: `${dsrc.what}; backed up by a dynamic tag (${tags.dynamicTags[0]})` });
  }
  return pair.map((c) => rateDynamic(c.name, items.get(c) ?? []));
}

export interface Scene {
  first: number;
  hits: ActHit[];
}

export function groupScenes(hits: ActHit[], chapterOf: (pi: number) => string): Scene[] {
  const scenes: Scene[] = [];
  for (const h of [...hits].sort((a, b) => a.para - b.para)) {
    const last = scenes[scenes.length - 1];
    const lastPara = last?.hits[last.hits.length - 1].para ?? -1e9;
    if (last && h.para - lastPara <= 20 && chapterOf(h.para) === chapterOf(last.first)) last.hits.push(h);
    else scenes.push({ first: h.para, hits: [h] });
  }
  return scenes;
}

export function truncate(s: string, n = 240) {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

export function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// ───────────── how sure each desire / fantasy / hint line is ─────────────

/** How much a line of this kind says, before looking at its wording. */
export const DESIRE_BASE: Partial<Record<Desire["kind"], number>> = {
  said: 0.8, stated: 0.8, identity: 0.85, wanted: 0.75, history: 0.7, fantasy: 0.6, hypothetical: 0.45,
  body: 0.65, masturbation: 0.7, handjob: 0.7, solo: 0.6, fingering: 0.6, touch: 0.55, prep: 0.55, fingers: 0.5,
  ogling: 0.55, behavior: 0.5, aftercare: 0.5, position: 0.5, petname: 0.5,
};
export const DESIRE_NOTE: Partial<Record<Desire["kind"], string>> = {
  said: "said outright in dialogue", stated: "a stated preference", identity: "says what they are", wanted: "a stated want",
  history: "something they have done", fantasy: "a fantasy", hypothetical: "a ‘what if’ or conditional", body: "a bodily sign after sex",
  solo: "a solo act", ogling: "a look", touch: "a touch short of sex", prep: "lead-up", fingers: "fingers and mouth", behavior: "everyday behaviour",
  aftercare: "care or comfort", position: "a position", petname: "a pet name",
};
export const HEDGE = /\b(?:maybe|perhaps|kind of|sort of|almost|might|seemed|as if|as though|probably|supposedly|apparently)\b/i;

/** Per-line confidence for every desire, fantasy and hint of an act. `pointsTo` says who the line makes the top. */
export function scoreDesires(sig: DesireHit[], pointsTo: (d: DesireHit) => string | undefined): Map<DesireHit, { conf: number; reasons: string[] }> {
  const sentencesBy = new Map<string, Set<string>>();
  for (const d of sig) {
    const t = pointsTo(d);
    if (!t) continue;
    if (!sentencesBy.has(t)) sentencesBy.set(t, new Set());
    sentencesBy.get(t)!.add(`${d.para}\u0000${d.sentence}`);
  }
  const out = new Map<DesireHit, { conf: number; reasons: string[] }>();
  for (const d of sig) {
    const reasons: string[] = [];
    let conf = (DESIRE_BASE[d.kind] ?? 0.5) * (0.7 + 0.3 * Math.min(1, d.weight));
    if (DESIRE_NOTE[d.kind]) reasons.push(DESIRE_NOTE[d.kind]!);
    if (d.guessed) { conf -= 0.2; reasons.push("speaker guessed from the narration"); }
    else if (d.basis === "named") conf += 0.05;
    else if (d.basis === "inferred") { conf -= 0.15; reasons.push("people inferred, not named"); }
    else if (d.basis === "pronoun") reasons.push("people found through pronouns");
    if (!d.wants) reasons.push("negated, so it counts the other way");
    if (HEDGE.test(d.sentence)) { conf -= 0.1; reasons.push("hedged wording"); }
    const t = pointsTo(d);
    if (t) {
      const mine = `${d.para}\u0000${d.sentence}`;
      const agree = (sentencesBy.get(t)?.size ?? 1) - 1;
      let conflict = 0;
      for (const [other, set] of sentencesBy) if (other !== t) conflict += set.size - (set.has(mine) ? 1 : 0);
      if (agree) { conf += Math.min(0.09, 0.03 * agree); reasons.push(`${agree} other line${agree === 1 ? "" : "s"} point the same way`); }
      if (conflict) { conf -= Math.min(0.12, 0.04 * conflict); reasons.push(`${conflict} other line${conflict === 1 ? "" : "s"} point the other way`); }
    }
    out.set(d, { conf: Math.max(0.15, Math.min(0.95, conf)), reasons });
  }
  return out;
}
/** A line's weight in the verdict and the odds: 1 at 70% sure, less when shakier, a little more when firm. */
export const confFactor = (conf: number) => Math.max(0.3, Math.min(1.2, conf / 0.7));

export function buildAct(
  cat: Cat,
  hits: ActHit[],
  des: DesireHit[],
  tags: PairTags,
  pair: [Character, Character],
  meta: Ao3Meta,
  where: (pi: number) => string,
  /** One oral act, reported in its own words; without it, oral sex as a whole. */
  kind?: OralKind,
): ActResult {
  const otherOf = (name: string) => pair.find((c) => c.name !== name)?.name;
  const label = kind ? ROLE_WORDS[kind].label : cat === "anal" ? "anal sex" : "oral sex";
  const reasons: string[] = [];
  const instances: Instance[] = [];

  // Scenes, each with a direction (or two, if they switch mid-scene).
  const decisive = hits.filter((h) => !(cat === "anal" && h.act === "fingering"));
  const fingering = hits.filter((h) => cat === "anal" && h.act === "fingering");
  const sceneTops = new Map<string, { char: Character; partner: Character; scenes: number; weight: number; strong: boolean }>();
  // First pass: one record per scene direction, with how sure we are of it.
  interface SceneRec { best: ActHit; hs: ActHit[]; w: number; first: number; conf: number; reasons: string[] }
  const recs: SceneRec[] = [];
  for (const scene of groupScenes(decisive, where)) {
    const dirs = new Map<string, ActHit[]>();
    for (const h of scene.hits) {
      const k = h.top.name;
      dirs.set(k, [...(dirs.get(k) ?? []), h]);
    }
    const total = scene.hits.reduce((n, h) => n + h.weight, 0);
    // For the stray-hit test each sentence counts once, however many patterns read it.
    const once = (hs: ActHit[]) => {
      const best = new Map<string, number>();
      for (const h of hs) best.set(h.sentence, Math.max(best.get(h.sentence) ?? 0, h.weight));
      return [...best.values()].reduce((n, x) => n + x, 0);
    };
    const totalOnce = once(scene.hits);
    for (const [, hs] of dirs) {
      const w = hs.reduce((n, h) => n + h.weight, 0);
      if (once(hs) < Math.max(0.2, totalOnce * 0.3)) continue; // a stray hit against the scene's majority
      const best = [...hs].sort((a, b) => b.weight - a.weight || (a.basis === "named" ? -1 : 1))[0];
      const sentences = new Set(hs.map((h) => h.sentence)).size;
      const against = new Set(scene.hits.filter((h) => h.top.name !== best.top.name).map((h) => h.sentence)).size;
      const reasons: string[] = [];
      let conf = 0.3 + 0.5 * Math.min(1, best.weight);
      if (sentences >= 3) { conf += 0.15; reasons.push(`${sentences} sentences agree`); }
      else if (sentences === 2) { conf += 0.1; reasons.push("2 sentences agree"); }
      else reasons.push("one sentence");
      if (best.basis === "named") conf += 0.05;
      else if (best.basis === "inferred") { conf -= 0.1; reasons.push("people inferred, not named"); }
      else reasons.push("people found through pronouns");
      if (against) { conf -= Math.min(0.3, 0.1 * against); reasons.push(`${against} sentence${against === 1 ? "" : "s"} in the scene point the other way`); }
      const shaky = hs.find((h) => h.shaky && h.sentence === best.sentence)?.shaky;
      if (shaky) { conf -= 0.25; reasons.push(shaky); }
      recs.push({ best, hs, w, first: scene.first, conf: Math.max(0.15, Math.min(0.98, conf)), reasons });
    }
  }
  // A shaky or lone-sentence scene that goes against what nearly every firm scene says is probably the misread one.
  {
    const firm = recs.filter((r) => r.conf >= 0.6);
    const byTop = new Map<string, number>();
    for (const r of firm) byTop.set(r.best.top.name, (byTop.get(r.best.top.name) ?? 0) + r.conf);
    const sum = [...byTop.values()].reduce((n, x) => n + x, 0);
    const lead = [...byTop.entries()].sort((a, b) => b[1] - a[1])[0];
    if (firm.length >= 3 && lead && lead[1] / sum >= 0.85) {
      for (const r of recs) {
        if (r.best.top.name !== lead[0] && r.conf < 0.65) {
          r.conf = Math.max(0.15, r.conf - 0.2);
          r.reasons.push(`goes against ${firm.filter((f) => f.best.top.name === lead[0]).length} firmer scenes the other way`);
        }
      }
    }
  }
  for (const r of recs) {
    const { best, hs, w, conf } = r;
    const acts = [...new Set(hs.map((h) => h.act))];
    instances.push({
      top: best.top.name,
      bottom: best.bottom.name,
      act: acts.join(", "),
      where: where(r.first),
      para: best.para,
      via: best.via,
      evidence: truncate(best.sentence),
      basis: best.basis,
      confidence: Math.round(conf * 100) / 100,
      reasons: r.reasons,
      context: best.context,
    });
    const entry = sceneTops.get(best.top.name) ?? { char: best.top, partner: best.bottom, scenes: 0, weight: 0, strong: false };
    // A shaky scene adds a little weight but doesn't on its own make someone a switch.
    if (conf >= 0.4) entry.scenes++;
    entry.weight += Math.min(w, 3) * (0.4 + 0.6 * conf);
    entry.strong ||= (hs.some((h) => h.basis === "named") || w >= 1.5) && conf >= 0.5;
    sceneTops.set(best.top.name, entry);
  }
  for (const scene of groupScenes(fingering, where)) {
    const best = [...scene.hits].sort((a, b) => b.weight - a.weight)[0];
    instances.push({
      top: best.top.name,
      bottom: best.bottom.name,
      act: "fingering",
      where: where(scene.first),
      para: best.para,
      via: best.via,
      evidence: truncate(best.sentence),
      basis: best.basis,
    });
  }

  const ranked = [...sceneTops.values()].sort((a, b) => b.weight - a.weight);
  const major = ranked[0];
  const minor = ranked[1];

  let verdict: ActResult["verdict"] = "none";
  let top = "";
  let bottom = "";
  let summary = "";
  let base = 0;

  const totalW = ranked.reduce((n, r) => n + r.weight, 0);
  const evidence = 1 - Math.exp(-totalW / 1.8);

  if (major) {
    top = major.char.name;
    bottom = major.partner.name;
    const isSwitch = !!minor && (minor.scenes >= 2 || minor.strong);
    if (isSwitch) {
      verdict = "switch";
      summary = roleSummary(kind ?? "anal", "switch", { name: major.char.name, partner: major.partner.name, scenes: major.scenes }, { name: minor.char.name, scenes: minor.scenes });
      base = evidence * (0.55 + 0.45 * Math.min(1, minor.weight / 2));
      reasons.push(`${plural(major.scenes + minor.scenes, "scene")} found, with each person ${kind ? "in each role" : "on top"} at least once`);
    } else {
      verdict = "one_way";
      const consistency = major.weight / totalW;
      summary = roleSummary(kind ?? "anal", "one_way", { name: major.char.name, partner: major.partner.name, scenes: major.scenes });
      if (minor) summary += ` One possible exception where ${minor.char.name} ${kind ? ROLE_WORDS[kind].topVerb : "tops"} — check the quoted line.`;
      base = evidence * (0.45 + 0.55 * consistency);
      reasons.push(`${plural(major.scenes, "scene")} ${kind ? `where ${ROLE_WORDS[kind].scene(major.char.name, major.partner.name)}` : `with ${major.char.name} on top`}${minor ? `, 1 weak contrary hit` : ""}`);
    }
    const named = decisive.filter((h) => h.basis === "named").length;
    const viaPronoun = decisive.length - named;
    reasons.push(`${plural(decisive.length, "matching sentence")} (${named} with names, ${viaPronoun} worked out from pronouns/context)`);
    if (decisive.length && named / decisive.length < 0.25) {
      base *= 0.85;
      reasons.push("mostly pronoun-based, which is less reliable");
    }
  }

  if (cat === "anal" && fingering.length) {
    const ft = new Map<string, number>();
    for (const f of fingering) ft.set(`${f.top.name} fingers ${f.bottom.name}`, (ft.get(`${f.top.name} fingers ${f.bottom.name}`) ?? 0) + 1);
    const fs = [...ft.keys()].join("; ");
    summary += summary ? ` Fingering: ${fs}.` : `No anal sex recognized; fingering only (${fs}).`;
  }

  // ── tags ──
  const tagTops = tags.roles.filter((r) => r.role === "top");
  const tagBottoms = tags.roles.filter((r) => r.role === "bottom");
  // Someone tagged both "Top X" and "Bottom X" is versatile (with the other person); it never means they have sex with themselves.
  const taggedBoth = tagTops.some((t) => tagBottoms.some((b) => b.char === t.char));
  const tagSwitch = tags.roles.filter((r) => r.role === "switch").length > 0 || tags.switching.length > 0 || taggedBoth;
  const roleTagsApply = cat === "anal"; // AO3 Top/Bottom tags describe anal roles
  let tagAdj = 0;
  if (roleTagsApply) {
    if (verdict === "one_way") {
      const agree = tagTops.some((r) => r.char.name === top) || tagBottoms.some((r) => r.char.name === bottom);
      const conflict = tagTops.some((r) => r.char.name === bottom) || tagBottoms.some((r) => r.char.name === top);
      if (agree && !conflict) { tagAdj += 0.25; reasons.push(`agrees with tag “${[...tagTops, ...tagBottoms][0].tag}”`); }
      if (conflict && !agree) { tagAdj -= 0.3; reasons.push(`conflicts with tag “${[...tagTops, ...tagBottoms].find((r) => r.char.name === top || r.char.name === bottom)!.tag}”`); }
      if (conflict && agree) reasons.push("tags list both people as top/bottom (possible switching)");
      if (tagSwitch) { tagAdj -= 0.1; reasons.push(`tagged “${tags.switching[0] ?? "switch"}” but only one direction found in the text`); }
    } else if (verdict === "switch") {
      if (tagSwitch || (tagTops.length && tagBottoms.length)) { tagAdj += 0.2; reasons.push(`agrees with tag “${tags.switching[0] ?? tags.roles[0].tag}”`); }
      else if (tagTops.length || tagBottoms.length) reasons.push(`tagged “${(tagTops[0] ?? tagBottoms[0]).tag}”, but the text shows switching`);
    }
  }
  const actTags = cat === "anal" ? tags.actTags.anal : kind ? tags.actTags[kind] : tags.actTags.oral;
  if (actTags.length && verdict !== "none") {
    tagAdj += 0.05;
    reasons.push(`tagged “${actTags[0]}”`);
  }

  // ── desire, fantasy & other signals ──
  // Ogling/touching/fingering hints only mean something for same-sex pairs.
  const sameSex = pair[0].gender === pair[1].gender || pair[0].gender === "u" || pair[1].gender === "u";
  const sig: DesireHit[] = des.filter((d) => sameSex || (d.kind !== "ogling" && d.kind !== "touch" && d.kind !== "prep" && d.kind !== "fingers" && d.kind !== "solo" && d.kind !== "body" && d.kind !== "aftercare" && d.kind !== "position" && d.kind !== "petname"));
  if (cat === "anal" && sameSex) {
    for (const f of fingering) {
      sig.push({ cat, act: "fingering", who: f.top, partner: f.bottom, role: "top", wants: true, kind: "fingering", weight: 0.8, para: f.para, sentence: f.sentence });
    }
  }
  // Every hint "points" to a top: wanting to bottom (or not wanting to top) means the partner tops.
  const desireTop = (d: DesireHit) => ((d.role === "top") === d.wants ? d.who.name : d.partner?.name);
  const lineConf = scoreDesires(sig, desireTop);
  const cf = (d: DesireHit) => confFactor(lineConf.get(d)?.conf ?? 0.7);
  const desireOut: Desire[] = sig
    .filter((d) => d.kind !== "fingering") // fingering is already listed under scenes
    .map((d) => ({
      who: d.who.name,
      role: d.role,
      wants: d.wants,
      kind: d.kind,
      act: d.act,
      where: where(d.para),
      evidence: truncate(d.sentence),
      context: d.context,
      via: d.via,
      confidence: Math.round((lineConf.get(d)?.conf ?? 0.5) * 100) / 100,
      reasons: lineConf.get(d)?.reasons ?? [],
    }));
  const isBehaviour = (d: DesireHit) => d.kind === "ogling" || d.kind === "touch" || d.kind === "fingering" || d.kind === "prep" || d.kind === "fingers" || d.kind === "solo" || d.kind === "body" || d.kind === "aftercare" || d.kind === "position" || d.kind === "petname";
  const tally = { desAgree: 0, desConflict: 0, behAgree: 0, behConflict: 0, wAgree: 0, wConflict: 0 };
  for (const d of sig) {
    const pointsTo = desireTop(d);
    if (!pointsTo || verdict === "none") continue;
    const agrees = verdict === "switch" || pointsTo === top;
    if (agrees) { tally.wAgree += d.weight * cf(d); isBehaviour(d) ? tally.behAgree++ : tally.desAgree++; }
    else { tally.wConflict += d.weight * cf(d); isBehaviour(d) ? tally.behConflict++ : tally.desConflict++; }
  }
  let desAdj = Math.min(0.2, tally.wAgree * 0.05) - Math.min(0.2, tally.wConflict * 0.05);
  if (verdict !== "none") {
    if (tally.desAgree) reasons.push(`${plural(tally.desAgree, "desire/fantasy line")} ${tally.desAgree === 1 ? "points" : "point"} the same way`);
    if (tally.desConflict) reasons.push(`${plural(tally.desConflict, "desire/fantasy line")} ${tally.desConflict === 1 ? "points" : "point"} the other way`);
    if (tally.behAgree) reasons.push(`${plural(tally.behAgree, "other signal")} (fingering, ogling, touching, lead-up) ${tally.behAgree === 1 ? "agrees" : "agree"}`);
    if (tally.behConflict) reasons.push(`${plural(tally.behConflict, "other signal")} (fingering, ogling, touching, lead-up) ${tally.behConflict === 1 ? "disagrees" : "disagree"}`);
  }

  {
    const lines = sig.filter((d) => d.kind !== "fingering");
    if (lines.length) {
      const avg = Math.round((lines.reduce((n, d) => n + (lineConf.get(d)?.conf ?? 0.5), 0) / lines.length) * 100);
      reasons.push(`${plural(lines.length, "desire/fantasy/hint line")}, ${avg}% sure on average`);
    }
  }

  // ── nothing found on-page ──
  if (verdict === "none") {
    const hasTagRoles = roleTagsApply && (tagTops.length || tagBottoms.length || tagSwitch);
    const pointing = new Map<string, number>();
    for (const d of sig) {
      const p = desireTop(d);
      if (p) pointing.set(p, (pointing.get(p) ?? 0) + d.weight * cf(d));
    }
    const desireRank = [...pointing.entries()].sort((a, b) => b[1] - a[1]);

    if (hasTagRoles) {
      verdict = tagSwitch ? "switch" : "one_way";
      let t = tagTops[0]?.char.name ?? (tagBottoms[0] ? otherOf(tagBottoms[0].char.name) : "");
      let b = tagBottoms[0]?.char.name ?? (tagTops[0] ? otherOf(tagTops[0].char.name) : "");
      // Tagged both ways: the tops/bottoms are the two different people.
      if (t && t === b) b = otherOf(t) ?? b;
      top = t ?? "";
      bottom = b ?? "";
      summary = `Not found in the text; going by AO3 tags: ${[...tags.roles.map((r) => r.tag), ...tags.switching].join(", ")}.` + (taggedBoth ? " Tagged as both top and bottom, so versatile with each other." : "") + (summary ? ` ${summary}` : "");
      base = 0.45;
      reasons.push("based on AO3 tags only — no matching sentences found");
      if (desireRank.length) {
        const agrees = desireRank[0][0] === top;
        desAdj = agrees ? 0.1 : -0.1;
        reasons.push(agrees ? "desire/fantasy and other hints agree with the tags" : "desire/fantasy and other hints disagree with the tags");
      }
    } else if (desireRank.length) {
      verdict = "unclear";
      const [who, w] = desireRank[0];
      const n = sig.filter((d) => desireTop(d) === who).length;
      const kinds = [...new Set(sig.filter((d) => desireTop(d) === who).map((d) => (isBehaviour(d) ? d.kind : "desire/fantasy")))];
      summary = `No on-page ${label} recognized, but ${plural(n, "hint")} (${kinds.join(", ")}) point to ${kind === "blowjob" ? `${otherOf(who) ?? "the other"} ${ROLE_WORDS.blowjob.bottomIng}` : kind ? `${who} ${ROLE_WORDS[kind].topIng}` : `${who} as the top`}.`;
      base = Math.min(0.45, 0.15 + w * 0.06);
      reasons.push("based only on hints: what characters want, imagine, look at, or do short of sex");
      desAdj = 0;
    } else if (actTags.length) {
      verdict = "unclear";
      summary = `Tagged “${actTags[0]}”, but no matching sentences were recognized.` + (summary ? ` ${summary}` : "");
      base = 0.2;
      reasons.push("the act is tagged but the phrasing wasn't recognized");
    } else {
      summary = summary || `No on-page ${label} recognized.`;
      const explicit = /explicit|mature/i.test(meta.rating ?? "");
      base = explicit ? 0.45 : meta.rating ? 0.75 : 0.5;
      reasons.push(explicit ? `rated ${meta.rating}, so something may have been missed` : meta.rating ? `rated ${meta.rating}` : "no matching sentences");
    }
  }

  const score = Math.max(0.05, Math.min(0.97, base + (verdict === "none" ? 0 : tagAdj + desAdj)));
  const confidence: Confidence = { score, label: confidenceLabel(score), reasons };

  // ── per-person odds ──
  const ev: RoleEvidence[] = [];
  const doubt: RoleEvidence[] = [];
  for (const e of sceneTops.values()) {
    // Scenes worked out only from pronouns count for less.
    const w = e.weight * (e.strong ? 1 : 0.75);
    ev.push({ who: e.char.name, role: "top", weight: w, kind: "scene" }, { who: e.partner.name, role: "bottom", weight: w, kind: "scene" });
  }
  const selfToyCount = new Map<string, number>();
  for (const d of sig) {
    // A toy used on oneself is bottoming, about as telling as a scene.
    if (usesToyOnSelf(d) && d.wants) {
      // “Fucked himself on the dildo” is as telling as a short scene; “pushed the dildo into his ass” with no one else
      // named is the same act but a little less sure. A long solo scene counts at most about twice.
      const seen = (selfToyCount.get(`${d.who.name}|${d.para}`) ?? 0) + 1;
      selfToyCount.set(`${d.who.name}|${d.para}`, seen);
      if (seen <= 2) ev.push({ who: d.who.name, role: "bottom", weight: 0.8 * selfToyStrength(d) * (seen === 1 ? 1 : 0.5), kind: "scene" });
      continue;
    }
    const t = desireTop(d);
    const b = t && otherOf(t);
    if (!t || !b) continue;
    // Behaviour (ogling, touching, lead-up) points a little; saying you want something, or having done it, points more.
    const [kind, w] = isBehaviour(d) ? (["hint", 0.15] as const) : (["desire", d.kind === "history" ? 0.25 : 0.2] as const);
    ev.push({ who: t, role: "top", weight: w * d.weight * cf(d), kind }, { who: b, role: "bottom", weight: w * d.weight * cf(d), kind });
  }
  if (roleTagsApply) {
    // Tags alone reach about 60%; "Top X" also says a little about the partner.
    const tagged = (who: string, role: Role) =>
      tags.roles.some((r) => r.char.name === who && (r.role === role || r.role === "switch")) ||
      tags.roles.some((r) => r.char.name !== who && r.role === (role === "top" ? "bottom" : "top"));
    for (const r of tags.roles) {
      const other = otherOf(r.char.name);
      if (r.role === "switch") {
        for (const role of ["top", "bottom"] as const) ev.push({ who: r.char.name, role, weight: 0.35, kind: "tag" });
        continue;
      }
      const opp = r.role === "top" ? "bottom" : "top";
      ev.push({ who: r.char.name, role: r.role, weight: 0.35, kind: "tag" });
      if (other) ev.push({ who: other, role: opp, weight: 0.25, kind: "tag" });
      // Unless the tags also give them the other role ("Top Castiel", "Top Dean" → they switch).
      if (!tagSwitch && !tagged(r.char.name, opp)) doubt.push({ who: r.char.name, role: opp, weight: 0.3, kind: "tag" });
      if (!tagSwitch && other && !tagged(other, r.role)) doubt.push({ who: other, role: r.role, weight: 0.3, kind: "tag" });
    }
    if (tags.switching.length) for (const c of pair) for (const role of ["top", "bottom"] as const) ev.push({ who: c.name, role, weight: 0.25, kind: "tag" });
  }
  // How AO3 tags the character overall: a very faint nudge (at most about 15% on its own), under everything above.
  if (cat === "anal") {
    for (const [name, pr] of tagPriors(meta, pair)) {
      const lean = (pr.pTop - 0.5) * 2;
      const role: Role = lean > 0 ? "top" : "bottom";
      const w = 0.12 * Math.abs(lean);
      ev.push({ who: name, role, weight: w, kind: "prior" });
      const other = otherOf(name);
      if (other) ev.push({ who: other, role: role === "top" ? "bottom" : "top", weight: w * 0.4, kind: "prior" });
    }
  }
  const people = roleOdds(pair.map((c) => c.name), ev, doubt);
  return { verdict, top, bottom, summary, instances, desires: desireOut, confidence, people };
}

