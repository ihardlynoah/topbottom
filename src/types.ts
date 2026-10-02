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

/** A character wanting, imagining, or asking for a role (or saying they don't want it). */
export interface Desire {
  who: string;
  role: Role;
  /** false = the character explicitly does NOT want this role. */
  wants: boolean;
  kind: "said" | "wanted" | "fantasy" | "hypothetical" | "identity";
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

export interface PairingResult {
  pairing: string;
  anal: ActResult;
  oral: ActResult;
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
