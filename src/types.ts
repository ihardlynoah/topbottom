// Result shape shared by the free pattern-matching engine and the optional Claude analysis.

export type Verdict = "none" | "one_way" | "switch" | "unclear";
export type Role = "top" | "bottom";

export interface Instance {
  top: string;
  bottom: string;
  act: string;
  where: string;
  evidence: string;
  /** How the people were identified: both named, via pronouns, or inferred from context. */
  basis?: "named" | "pronoun" | "inferred";
}

/**
 * A hint about roles that isn't a completed act: a character wanting, imagining, or asking for a role
 * (or saying they don't want it), or behaviour that suggests one, like checking out an ass (top) or a
 * bulge (bottom), grabbing an ass, fingering someone (the fingerer is likelier to top), or lead-up like
 * lining up or slicking up (top) and spreading one's legs or kneeling (bottom).
 */
export interface Desire {
  who: string;
  role: Role;
  /** false = the character explicitly does NOT want this role. */
  wants: boolean;
  kind: "said" | "wanted" | "fantasy" | "hypothetical" | "identity" | "ogling" | "touch" | "fingering" | "prep" | "fingers" | "solo";
  act: string;
  where: string;
  evidence: string;
}

export interface Confidence {
  /** 0–1 */
  score: number;
  label: "High" | "Medium" | "Low";
  reasons: string[];
}

export interface ActResult {
  verdict: Verdict;
  top: string;
  bottom: string;
  summary: string;
  instances: Instance[];
  desires: Desire[];
  confidence: Confidence;
}

/** Vaginal sex is only detected (whether it happens and between whom), not ranked top/bottom. */
export interface VaginalResult {
  occurs: boolean;
  /** Whether it's worth showing (it happens, or one of the pair can have vaginal sex). */
  applicable: boolean;
  summary: string;
  instances: Instance[];
  confidence: Confidence;
}

export interface PairingResult {
  pairing: string;
  anal: ActResult;
  /** All oral sex together, with top = the penetrating partner (getting sucked, or doing the licking). */
  oral: ActResult;
  /** Oral sex per act, reported as who sucks / gets sucked and who eats / gets eaten. */
  blowjob: ActResult;
  rimming: ActResult;
  cunnilingus: ActResult;
  vaginal: VaginalResult;
}

export interface Analysis {
  source: "patterns" | "claude";
  fandom: string;
  main_pairing: string;
  pairings: PairingResult[];
  notes: string;
}

export function confidenceLabel(score: number): Confidence["label"] {
  return score >= 0.75 ? "High" : score >= 0.45 ? "Medium" : "Low";
}
