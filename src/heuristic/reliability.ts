// How often each pattern's hits were right in hand-labelled samples (tests/labels/*.json). A pattern that is often wrong
// counts for less. Do not edit by hand: relabel samples and run `WRITE_RELIABILITY=1 npx vitest run tests/reliability.test.ts`.
// Value = share of a pattern's labelled hits that were read correctly, smoothed toward 0.9 and scaled so 1 means "trust it".

export const RELIABILITY: Record<string, number> = {};

/** Multiplier for a hit's weight: 1 for patterns with no labels or good records, less for ones that are often wrong. */
export const reliabilityOf = (id: string): number => RELIABILITY[id.replace(/~elided$/, "")] ?? 1;
