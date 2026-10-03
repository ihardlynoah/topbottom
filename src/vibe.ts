// A single "vibe" rating per character in a pairing: total top / vers top / vers / vers bottom / total bottom.
//
// Evidence comes in seven tiers, in descending order of importance:
//   1 sex acts in the work   2 stating they are or prefer a role (and AO3 role tags)   3 groping and similar behaviour
//   4 desires, plans, fantasies   5 other hints (ogling…)   6 other behaviour (taking control, being protective…)
//   7 AO3 tag counts for the character.
// Each tier votes top or bottom with a strength that saturates as items pile up; tiers are weighted so a higher tier
// dominates a lower one. Confidence grows with how much evidence there is and how well it agrees.

import { type Confidence, confidenceLabel, type Role, type VibeFactor, type VibeRating } from "./types";

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
  { name: "Dominant or submissive behaviour", weight: 0.08, tau: 3 },
  { name: "AO3 tag counts", weight: 0.04, tau: 0.5 },
];

const LABELS = ["Total bottom", "Vers bottom", "Vers", "Vers top", "Total top"] as const;

export function rateVibe(name: string, items: VibeItem[]): VibeRating {
  let strength = 0; // Σ weight·mass
  let signed = 0; // Σ weight·direction·mass
  const basis: string[] = [];
  const factors: VibeFactor[] = items
    .map((x) => ({ tier: x.tier, tierName: VIBE_TIERS[x.tier - 1].name, role: x.role, weight: Math.round(x.weight * 100) / 100, what: x.what ?? "", source: x.source, where: x.where, fromOther: x.fromOther }))
    .sort((a, b) => a.tier - b.tier || b.weight - a.weight);
  let hasReal = false; // evidence from tiers 1–4
  let onlyPrior = true;
  VIBE_TIERS.forEach((t, i) => {
    const mine = items.filter((x) => x.tier === i + 1);
    const T = mine.filter((x) => x.role === "top").reduce((n, x) => n + x.weight, 0);
    const B = mine.filter((x) => x.role === "bottom").reduce((n, x) => n + x.weight, 0);
    const n = T + B;
    if (!n) return;
    const x = (T - B) / (n + 0.2);
    const m = 1 - Math.exp(-n / t.tau);
    strength += t.weight * m;
    signed += t.weight * x * m;
    if (i < 4) hasReal = true;
    if (i < 6) onlyPrior = false;
    const nt = mine.filter((y) => y.role === "top").length;
    const nb = mine.filter((y) => y.role === "bottom").length;
    basis.push(`${t.name}: ${[nt ? `top ×${nt}` : "", nb ? `bottom ×${nb}` : ""].filter(Boolean).join(", ")}`);
  });

  if (strength < 0.06) {
    const c = { score: 0.05, label: "Low" as const, reasons: ["not enough to go on"] };
    return { name, label: "Unclear", score: 0, confidence: c, basis, factors };
  }
  // Direction in −1…1, damped when the evidence is thin so a single faint hint can't make anyone a "total".
  const dir = (signed / strength) * Math.min(1, strength / 0.5);
  const label = dir >= 0.6 ? LABELS[4] : dir >= 0.2 ? LABELS[3] : dir > -0.2 ? LABELS[2] : dir > -0.6 ? LABELS[1] : LABELS[0];

  const base = 1 - Math.exp(-strength / 0.5);
  // A total needs one-sided evidence; a "vers" needs real evidence of both sides.
  const agreement = label === "Vers" ? 1 - Math.abs(signed / strength) : Math.abs(signed / strength);
  let score = base * (0.5 + 0.5 * agreement);
  if (!hasReal) score = Math.min(score, 0.4);
  if (onlyPrior) score = Math.min(score, 0.12);
  score = Math.round(Math.max(0.03, Math.min(0.97, score)) * 100) / 100;
  const confidence: Confidence = { score, label: confidenceLabel(score), reasons: [] };
  return { name, label, score: Math.round(dir * 100) / 100, confidence, basis, factors };
}
