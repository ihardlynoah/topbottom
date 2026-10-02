// Role wording per act, and splitting oral sex into blowjobs, rimming and cunnilingus.
//
// Internally every act has a "top" (the penetrating partner) and a "bottom": for a blowjob the top is the one
// getting sucked, for rimming and cunnilingus the top is the one doing the licking. What people want to read is
// what each person does, so oral results are reported per act with plain verbs.

import { type ActResult, confidenceLabel, type Desire, type Instance } from "./types";

export type ActKind = "anal" | "blowjob" | "rimming" | "cunnilingus";
export type OralKind = Exclude<ActKind, "anal">;
export const ORAL_KINDS: OralKind[] = ["blowjob", "rimming", "cunnilingus"];

export interface RoleWords {
  /** Card title. */
  title: string;
  /** What the result is about, for "No on-page … recognized". */
  label: string;
  /** Short role names: "Top" / "Bottom", "Gets sucked" / "Sucks cock". */
  top: string;
  bottom: string;
  /** "X tops", "X gets sucked". */
  topVerb: string;
  bottomVerb: string;
  /** "wants to top", "wants to suck cock". */
  topInf: string;
  bottomInf: string;
  /** "imagines topping", "imagines sucking cock". */
  topIng: string;
  bottomIng: string;
  /** One scene: "Stiles sucks Derek", "Derek rims Stiles". */
  scene: (top: string, bottom: string) => string;
}

export const ROLE_WORDS: Record<ActKind, RoleWords> = {
  anal: {
    title: "Anal",
    label: "anal sex",
    top: "Top",
    bottom: "Bottom",
    topVerb: "tops",
    bottomVerb: "bottoms",
    topInf: "top",
    bottomInf: "bottom",
    topIng: "topping",
    bottomIng: "bottoming",
    scene: (t, b) => `${t} → ${b}`,
  },
  blowjob: {
    title: "Blowjobs",
    label: "blowjob",
    top: "Gets sucked",
    bottom: "Sucks cock",
    topVerb: "gets sucked",
    bottomVerb: "sucks cock",
    topInf: "get sucked",
    bottomInf: "suck cock",
    topIng: "getting sucked",
    bottomIng: "sucking cock",
    scene: (t, b) => `${b} sucks ${t}`,
  },
  rimming: {
    title: "Rimming",
    label: "rimming",
    top: "Eats ass",
    bottom: "Ass eaten",
    topVerb: "eats ass",
    bottomVerb: "gets their ass eaten",
    topInf: "eat ass",
    bottomInf: "get their ass eaten",
    topIng: "eating ass",
    bottomIng: "getting their ass eaten",
    scene: (t, b) => `${t} eats ${b}'s ass`,
  },
  cunnilingus: {
    title: "Cunnilingus",
    label: "cunnilingus",
    top: "Eats out",
    bottom: "Eaten out",
    topVerb: "eats someone out",
    bottomVerb: "gets eaten out",
    topInf: "eat someone out",
    bottomInf: "get eaten out",
    topIng: "eating someone out",
    bottomIng: "getting eaten out",
    scene: (t, b) => `${t} eats ${b} out`,
  },
};

/** Which oral act an instance or hint is about, from its act label. */
export function oralKindOf(act: string): OralKind {
  if (/cunnilingus|pussy|cunt|clit|eat(?:s|ing)? (?:her|them) out/i.test(act)) return "cunnilingus";
  if (/rim|ass|arse|hole|anilingus/i.test(act)) return "rimming";
  return "blowjob";
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** One-line summary of a verdict in the act's own words. */
export function roleSummary(
  kind: ActKind,
  verdict: "one_way" | "switch",
  major: { name: string; partner: string; scenes: number },
  minor?: { name: string; scenes: number },
): string {
  const w = ROLE_WORDS[kind];
  if (kind === "anal") {
    return verdict === "switch"
      ? `They switch: ${major.name} tops in ${plural(major.scenes, "scene")}, ${minor!.name} in ${plural(minor!.scenes, "scene")}.`
      : `${major.name} tops (${plural(major.scenes, "scene")}).`;
  }
  // Name the active partner first: the one sucking, or the one eating.
  const activeIsTop = kind !== "blowjob";
  if (verdict === "switch") {
    const verb = kind === "blowjob" ? "suck cock" : kind === "rimming" ? "eat ass" : "eat each other out";
    // For blowjobs the one sucking is the bottom, so the main top's partner is the main giver.
    const [a, b] = activeIsTop ? [major.name, minor!.name] : [major.partner, major.name];
    return `Both ${verb}: ${a} in ${plural(major.scenes, "scene")}, ${b} in ${plural(minor!.scenes, "scene")}.`;
  }
  return activeIsTop
    ? `${major.name} ${w.topVerb}; ${major.partner} ${w.bottomVerb} (${plural(major.scenes, "scene")}).`
    : `${major.partner} ${w.bottomVerb}; ${major.name} ${w.topVerb} (${plural(major.scenes, "scene")}).`;
}

/**
 * Split a combined oral result into one result per act, going by each instance's act label. Used for
 * Claude's answers, which report oral sex as a whole; the pattern engine builds each act separately.
 */
export function splitOral(oral: ActResult, pair: string): Record<OralKind, ActResult> {
  const out = {} as Record<OralKind, ActResult>;
  for (const kind of ORAL_KINDS) {
    const instances: Instance[] = oral.instances.filter((i) => oralKindOf(i.act) === kind);
    const desires: Desire[] = oral.desires.filter((d) => oralKindOf(d.act) === kind);
    const tops = new Map<string, { partner: string; scenes: number }>();
    for (const i of instances) {
      const e = tops.get(i.top) ?? { partner: i.bottom, scenes: 0 };
      e.scenes++;
      tops.set(i.top, e);
    }
    const ranked = [...tops.entries()].sort((a, b) => b[1].scenes - a[1].scenes);
    const [major, minor] = ranked;
    const w = ROLE_WORDS[kind];
    let res: ActResult;
    if (major) {
      const verdict = minor ? "switch" : "one_way";
      res = {
        verdict,
        top: major[0],
        bottom: major[1].partner,
        summary: roleSummary(kind, verdict, { name: major[0], ...major[1] }, minor && { name: minor[0], scenes: minor[1].scenes }),
        instances,
        desires,
        confidence: oral.confidence,
      };
    } else {
      const score = desires.length ? Math.min(0.45, oral.confidence.score) : oral.verdict === "none" ? oral.confidence.score : 0.45;
      res = {
        verdict: desires.length ? "unclear" : "none",
        top: "",
        bottom: "",
        summary: desires.length ? `No on-page ${w.label} found; see the hints below.` : `No on-page ${w.label} found.`,
        instances,
        desires,
        confidence: { score, label: confidenceLabel(score), reasons: oral.verdict === "none" ? oral.confidence.reasons : [`no ${w.label} among the oral scenes for ${pair}`] },
      };
    }
    out[kind] = res;
  }
  return out;
}
