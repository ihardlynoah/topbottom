// How often each pattern's hits were right in hand-labelled samples (tests/labels/*.json). A pattern that is often wrong
// counts for less. Do not edit by hand: relabel samples and run `WRITE_RELIABILITY=1 npx vitest run tests/reliability.test.ts`.
// Value = share of a pattern's labelled hits that were read correctly, smoothed toward 0.9 and scaled so 1 means "trust it".

export const RELIABILITY: Record<string, number> = {
  "abo-bare-neck": 0.94,
  "aftercare-clean": 0.98,
  "bent-over-furniture": 0.85,
  "between-thighs-licked": 0.8,
  "body-sore-ass": 0.89,
  "care-bring": 0.96,
  "care-soothe": 0.92,
  "dialogue:anal sex": 0.98,
  "dialogue:asking to be held": 0.57,
  "dialogue:blowjob": 0.8,
  "dialogue:calling someone a good boy/girl": 0.98,
  "dom-carry": 0.98,
  "dom-pin": 0.92,
  "dom-take-control": 0.81,
  "fingers-in-out-mouth": 0.85,
  "hj-stroke": 0.81,
  "hollowed-cheeks": 0.98,
  "let-in": 0.85,
  "lips-around": 0.98,
  "made-love-to": 0.92,
  "mast-own": 0.98,
  "ogle-crotch": 0.97,
  "ogle-crotch-where": 0.85,
  "penis-fills": 0.98,
  "pos-wrists-held": 0.92,
  "pushed-in": 0.92,
  "sank-down": 0.96,
  "sinks-to-floor": 0.97,
  "stated-bottom-pref": 0.8,
  "sub-pinned": 0.98,
  "taste-precum-throat": 0.89,
  "tongue-on-cock-area": 0.92,
};

/** Multiplier for a hit's weight: 1 for patterns with no labels or good records, less for ones that are often wrong. */
export const reliabilityOf = (id: string): number => RELIABILITY[id.replace(/~elided$/, "")] ?? 1;
