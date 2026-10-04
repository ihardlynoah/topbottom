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
  /** How sure we are that this scene is read correctly (0–1), and why. Feeds the role odds. */
  confidence?: number;
  reasons?: string[];
  /** The passage around the evidence sentence. */
  context?: string;
  /** Paragraph number of the evidence sentence (for the gold-label eval). */
  para?: number;
  /** The internal pattern behind the evidence sentence (for mistake reports). */
  via?: string;
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
  kind: "said" | "wanted" | "fantasy" | "hypothetical" | "identity" | "history" | "ogling" | "touch" | "fingering" | "prep" | "fingers" | "solo" | "behavior" | "stated" | "body" | "aftercare" | "position" | "petname" | "masturbation" | "handjob";
  act: string;
  where: string;
  evidence: string;
  /** How sure the engine is that this line says what it was read as (0–1). */
  confidence?: number;
  /** Why: strength of the wording, how the people were found, hedging, and whether other lines agree. */
  reasons?: string[];
  /** The internal pattern behind this line (for mistake reports, so the right pattern can be fixed). */
  via?: string;
  /** The passage around the line (for mistake reports). Quoted lines also carry the paragraphs on either side. */
  context?: string;
}

export interface Confidence {
  /** 0–1 */
  score: number;
  label: "High" | "Medium" | "Low";
  reasons: string[];
}

/** How likely one person is to take each role in an act (0–1 each, independent: a switch scores high on both). */
export interface RoleOdds {
  name: string;
  top: number;
  bottom: number;
}

export interface ActResult {
  verdict: Verdict;
  top: string;
  bottom: string;
  summary: string;
  instances: Instance[];
  desires: Desire[];
  confidence: Confidence;
  /** Per-person confidence for each role, one entry per member of the pairing. */
  people?: RoleOdds[];
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

/** One character's overall top/bottom "vibe" in a pairing. */
/** One piece of evidence behind a vibe rating, with the text it came from. */
export interface VibeFactor {
  tier: number;
  tierName: string;
  role: Role;
  weight: number;
  /** What was found ("anal sex", "tag: Power Bottom Dean", "good boy"). */
  what: string;
  /** The sentence, line or tag it came from. */
  source?: string;
  where?: string;
  /** True when it counts for this person because of what the other person did or was ("held close" credits the one holding). */
  fromOther?: boolean;
}

export interface VibeRating {
  name: string;
  label: "Total top" | "Vers top" | "Vers" | "Vers bottom" | "Total bottom" | "Unclear";
  /** −1 (total bottom) … +1 (total top). */
  score: number;
  confidence: Confidence;
  /** What it rests on, strongest evidence first. */
  basis: string[];
  /** Every piece of evidence, with its source text, highest tier first. */
  factors?: VibeFactor[];
}

/** Things a character does alone: masturbation, fingering themself, using a toy on themself. */
export interface SoloAct {
  who: string;
  /** "Masturbation", "Self-fingering" or "Toy on self". */
  act: string;
  evidence: string;
  where: string;
  context?: string;
}

/** Text messages between characters (chat-log lines or narrated texting). */
export interface TextingResult {
  occurs: boolean;
  summary: string;
  total: number;
  /** Messages shown as chat lines vs. told in narration ("he texted", "his phone buzzed"). */
  chat: number;
  narrated: number;
  /** Chat messages that are sexual (sexting). */
  sexual: number;
  pairs: { from: string; to: string; count: number }[];
  examples: { from: string; to: string; text: string; where: string; how: "chat" | "narrated"; sexual: boolean }[];
}

export interface SoloResult {
  /** Whether anything solo was found. */
  occurs: boolean;
  summary: string;
  /** Per person: how many times each kind of solo act was found. */
  people: { name: string; total: number; acts: { act: string; count: number }[] }[];
  instances: SoloAct[];
}

/** Hand sex between the pair: handjobs and frottage. Not ranked top/bottom; shown as who does what to whom. */
export interface ManualAct {
  /** The one whose hand it is (or either, when mutual). */
  giver: string;
  receiver: string;
  /** "Handjob", "Mutual handjob", "Frottage", "Thigh sex" or "Chest sex" (giver = whose thighs or chest). */
  act: string;
  mutual: boolean;
  evidence: string;
  where: string;
  context?: string;
}

export interface ManualResult {
  occurs: boolean;
  summary: string;
  people: { name: string; gives: number; gets: number; mutual: number }[];
  instances: ManualAct[];
}

/** Who leads and who follows in everyday life, scored apart from who tops and who bottoms. */
export interface DynamicRating extends Omit<VibeRating, "label"> {
  label: "Leads" | "Leans leading" | "Balanced" | "Leans following" | "Follows" | "Unclear";
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
  /** Solo acts by either partner. These are shown on their own; self-fingering and toy use also count toward anal bottom evidence for people with an ass. */
  solo?: SoloResult;
  /** Handjobs and frottage between the pair. */
  manual?: ManualResult;
  /** Overall vibe for each partner, from every kind of evidence. */
  vibe?: VibeRating[];
  /** The same vibe with everyday-dynamic cues folded in at tier 6, as before the two-axis display (the "single vibe" view). */
  vibeCombined?: VibeRating[];
  /** Everyday power dynamic for each partner: caretaking, leading, protecting and yielding, apart from the sexual vibe. */
  dynamic?: DynamicRating[];
}

/** One AO3 tag checked against the text. */
export interface TagCheck {
  tag: string;
  kind: "act" | "role" | "kink" | "dynamic";
  status: "supported" | "not_found" | "contradicted" | "cant_tell";
  note: string;
  evidence: { text: string; where: string }[];
}

export interface Analysis {
  source: "patterns" | "claude";
  fandom: string;
  main_pairing: string;
  pairings: PairingResult[];
  /** AO3 tags that name an act, role or kink, checked against what the text shows. */
  tagCheck?: TagCheck[];
  texting?: TextingResult;
  notes: string;
}

export function confidenceLabel(score: number): Confidence["label"] {
  return score >= 0.75 ? "High" : score >= 0.45 ? "Medium" : "Low";
}
