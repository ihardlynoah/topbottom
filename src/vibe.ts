// A single "vibe" rating per character in a pairing: total top / vers top / vers / vers bottom / total bottom.
//
// Evidence comes in seven tiers, in descending order of importance:
//   1 sex acts in the work   2 stating they are or prefer a role (and AO3 role tags)   3 groping and similar behaviour
//   4 desires, plans, fantasies   5 other hints (ogling…)   6 other behaviour (taking control, being protective…)
//   7 AO3 tag counts for the character.
// Each tier votes top or bottom with a strength that saturates as items pile up; tiers are weighted so a higher tier
// dominates a lower one. Confidence grows with how much evidence there is and how well it agrees.

import { type Confidence, confidenceLabel, type DynamicRating, type Role, type VibeFactor, type VibeRating } from "./types";

export interface VibeItem {
  tier: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  role: Role;
  weight: number;
  what?: string;
  source?: string;
  where?: string;
  fromOther?: boolean;
}

export const VIBE_TIERS: { name: string; weight: number; tau: number }[] = [
  { name: "Sex acts", weight: 1, tau: 1 },
  { name: "Says what they are or prefer", weight: 0.55, tau: 0.8 },
  { name: "Groping and similar", weight: 0.35, tau: 1.5 },
  { name: "Desires, plans and fantasies", weight: 0.22, tau: 2 },
  { name: "Other hints", weight: 0.12, tau: 2.5 },
  { name: "Positions and cuddling", weight: 0.08, tau: 3 },
  { name: "AO3 tag counts", weight: 0.04, tau: 0.5 },
];

const LABELS = ["Total bottom", "Vers bottom", "Vers", "Vers top", "Total top"] as const;

interface Scale<L extends string> {
  tiers: { name: string; weight: number; tau: number }[];
  labels: readonly [L, L, L, L, L];
  unclear: L | "Unclear";
  /** Tiers up to this many count as real evidence (the rest are priors or faint behaviour). */
  realTiers: number;
  /** Tiers at or past this index (1-based) count as "only background" when they are all there is. */
  backgroundFrom: number;
  /** Evidence strength at which a lean is fully believed (below it, the lean is damped toward the middle). */
  dampAt: number;
}

/** The second axis: who leads and who follows in everyday life, apart from who tops and who bottoms. */
export const DYNAMIC_TIERS: { name: string; weight: number; tau: number }[] = [
  { name: "Stated dynamic (tags and statements)", weight: 0.5, tau: 0.8 },
  { name: "Taking charge: leading, ordering, pinning", weight: 0.5, tau: 1.2 },
  { name: "Caring, protecting and praising", weight: 0.4, tau: 1.5 },
  { name: "Yielding, deferring and flustered", weight: 0.4, tau: 1.5 },
];
export const DYNAMIC_LABELS = ["Follows", "Leans following", "Balanced", "Leans leading", "Leads"] as const;
export type DynamicLabel = (typeof DYNAMIC_LABELS)[number] | "Unclear";

export function rateDynamic(name: string, items: VibeItem[]): DynamicRating {
  return rateScale(name, items, { tiers: DYNAMIC_TIERS, labels: DYNAMIC_LABELS, unclear: "Unclear", realTiers: 4, backgroundFrom: 5, dampAt: 0.3 }) as DynamicRating;
}

/** The single-vibe view folds behaviour into tier 6, so tier 6 is named for what is in it. */
const COMBINED_TIERS = VIBE_TIERS.map((t, i) => (i === 5 ? { ...t, name: "Dominant or submissive behaviour, positions and cuddling" } : t));

export function rateVibe(name: string, items: VibeItem[], combined = false): VibeRating {
  return rateScale(name, items, { tiers: combined ? COMBINED_TIERS : VIBE_TIERS, labels: LABELS, unclear: "Unclear", realTiers: 4, backgroundFrom: 7, dampAt: 0.5 }) as VibeRating;
}

function rateScale<L extends string>(name: string, items: VibeItem[], scale: Scale<L>): Omit<VibeRating, "label"> & { label: L | "Unclear" } {
  let strength = 0; // Σ weight·mass
  let signed = 0; // Σ weight·direction·mass
  const basis: string[] = [];
  const factors: VibeFactor[] = items
    .map((x) => ({ tier: x.tier, tierName: scale.tiers[x.tier - 1].name, role: x.role, weight: Math.round(x.weight * 100) / 100, what: x.what ?? "", source: x.source, where: x.where, fromOther: x.fromOther }))
    .sort((a, b) => a.tier - b.tier || b.weight - a.weight);
  let hasReal = false; // evidence from tiers 1–4
  let onlyPrior = true;
  scale.tiers.forEach((t, i) => {
    const mine = items.filter((x) => x.tier === i + 1);
    const T = mine.filter((x) => x.role === "top").reduce((n, x) => n + x.weight, 0);
    const B = mine.filter((x) => x.role === "bottom").reduce((n, x) => n + x.weight, 0);
    const n = T + B;
    if (!n) return;
    const x = (T - B) / (n + 0.2);
    const m = 1 - Math.exp(-n / t.tau);
    strength += t.weight * m;
    signed += t.weight * x * m;
    if (i < scale.realTiers) hasReal = true;
    if (i < scale.backgroundFrom - 1) onlyPrior = false;
    const nt = mine.filter((y) => y.role === "top").length;
    const nb = mine.filter((y) => y.role === "bottom").length;
    basis.push(`${t.name}: ${[nt ? `top ×${nt}` : "", nb ? `bottom ×${nb}` : ""].filter(Boolean).join(", ")}`);
  });

  if (strength < 0.06) {
    const c = { score: 0.05, label: "Low" as const, reasons: ["not enough to go on"] };
    return { name, label: scale.unclear, score: 0, confidence: c, basis, factors };
  }
  // Direction in −1…1, damped when the evidence is thin so a single faint hint can't make anyone a "total".
  const dir = (signed / strength) * Math.min(1, strength / scale.dampAt);
  const L = scale.labels;
  const label = dir >= 0.6 ? L[4] : dir >= 0.2 ? L[3] : dir > -0.2 ? L[2] : dir > -0.6 ? L[1] : L[0];

  const base = 1 - Math.exp(-strength / 0.5);
  // A total needs one-sided evidence; a "vers" needs real evidence of both sides.
  const agreement = label === L[2] ? 1 - Math.abs(signed / strength) : Math.abs(signed / strength);
  let score = base * (0.5 + 0.5 * agreement);
  if (!hasReal) score = Math.min(score, 0.4);
  if (onlyPrior) score = Math.min(score, 0.12);
  score = Math.round(Math.max(0.03, Math.min(0.97, score)) * 100) / 100;
  const confidence: Confidence = { score, label: confidenceLabel(score), reasons: [] };
  return { name, label, score: Math.round(dir * 100) / 100, confidence, basis, factors };
}
