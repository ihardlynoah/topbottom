import { type Desire, type Instance, type Role } from "../types";
import { type Character } from "./characters";
import { type Cat } from "./patterns";

export type Basis = NonNullable<Instance["basis"]>;

export interface ActHit {
  cat: Cat;
  act: string;
  top: Character;
  bottom: Character;
  weight: number;
  basis: Basis;
  para: number;
  sentence: string;
  /** The sentence didn't say which hole, and the bottom may have a vagina: settled later by their other scenes. */
  holeGuess?: "anal" | "vaginal" | "ambiguous";
  /** Why this reading could be wrong ("rode him" can be said of either partner); lowers the scene's confidence. */
  shaky?: string;
  /** The text around the sentence, so a reader (or Claude) can check the reading. */
  context?: string;
  /** The pattern that produced it (for the audit report). */
  via?: string;
  /** Context features (learned.ts), kept for the audit and the model's training. */
  feat?: number[];
}

export interface DesireHit {
  /** The speaker of a quoted line was guessed from the narration rather than named by a tag. */
  guessed?: boolean;
  cat: Cat;
  act: string;
  who: Character;
  partner?: Character;
  role: Role;
  wants: boolean;
  kind: Desire["kind"];
  /** How much this hint counts toward confidence (a stated desire > a glance). */
  weight: number;
  para: number;
  sentence: string;
  /** The passage around the sentence (filled in once all hits are found, for mistake reports). */
  context?: string;
  /** A solo act worded with “himself” / “his own”: certainly the actor’s own body, no partner in it. */
  reflexive?: boolean;
  /** How the people in the sentence were found (names, pronouns, inference). */
  basis?: Basis;
  /** The pattern that produced it (for the audit report). */
  via?: string;
  /** Context features (learned.ts), kept for the audit and the model's training. */
  feat?: number[];
}

// ───────────── text helpers ─────────────

