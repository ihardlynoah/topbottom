// Picks the next hits worth labelling: the ones where a wrong reading would move a result most (chance it is wrong × its share of the
// evidence × how close that verdict is to flipping; QUEUE_RANK=unsure ranks by the context model's doubt alone) and a few it
// trusts most (to check it isn't missing errors), skipping anything already labelled.
//   AO3_DIR=ao3-samples npx vitest run tests/review-queue.test.ts --testTimeout=1500000
// Writes REVIEW_QUEUE.json into AO3_DIR. Build the page with scripts/build-review-page.mjs; bring answers back with
// scripts/import-review-answers.mjs. QUEUE_LOW and QUEUE_HIGH set how many of each (default 40 and 20).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractFromHtml } from "../src/extract";
import { analyzeWithPatterns } from "../src/heuristic";
import { probability } from "../src/heuristic/learned";
import { precisionOf } from "../src/heuristic/reliability";

const dir = process.env.AO3_DIR;
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const labelled = (): Set<string> => {
  const out = new Set<string>();
  const d = join(__dirname, "labels");
  for (const f of readdirSync(d).filter((x) => x.endsWith(".json"))) for (const k of Object.keys(JSON.parse(readFileSync(join(d, f), "utf8")).labels)) out.add(k);
  return out;
};
const cap = (s: string, n = 700) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Pick up to `n` rows in order, at most `per` for each pattern. */
export function pick<T extends { via: string }>(rows: T[], n: number, per: number): T[] {
  const taken = new Map<string, number>();
  const out: T[] = [];
  for (const r of rows) {
    const base = r.via.replace(/~elided$/, "");
    if ((taken.get(base) ?? 0) >= per) continue;
    taken.set(base, (taken.get(base) ?? 0) + 1);
    out.push(r);
    if (out.length >= n) break;
  }
  return out;
}

/** How much a hit counts toward its category's verdict, by what kind of line it is. */
const KIND_WEIGHT: Record<string, number> = { act: 1, said: 0.8, wanted: 0.8, history: 0.5, stated: 0.6, body: 0.5, fantasy: 0.4, hypothetical: 0.4 };
export const kindWeight = (kind: string) => KIND_WEIGHT[kind] ?? 0.4;

/**
 * How much a wrong label on this hit could move a result: the chance it is wrong, times its share of the evidence behind its
 * verdict, times how close that verdict is to flipping (1 − its confidence, with a floor so a "High" verdict still counts a little).
 * `share` is the hit's weight over the total weight of hits in the same fic, pairing and category.
 */
export function verdictImpact(p: number, share: number, confidence: number): number {
  const fragility = 1 - Math.min(1, Math.max(0, confidence));
  return (1 - p) * Math.min(1, Math.max(0, share)) * (0.1 + fragility);
}

describe.skipIf(!dir)("review queue", () => {
  it("lists the hits to label next", () => {
    const done = labelled();
    type Cand = { impact: number; key: string; via: string; fic: string; para: number; a: string; b?: string; act: string; kind: string; sentence: string; p: number; before: string; at: string; after: string };
    const cands: Cand[] = [];
    const seen = new Set<string>();
    for (const f of readdirSync(dir!).filter((x) => x.endsWith(".html")).sort()) {
      const work = extractFromHtml(readFileSync(join(dir!, f), "utf8"));
      let paras: string[] = [];
      const hits: Parameters<NonNullable<Parameters<typeof analyzeWithPatterns>[2]>["audit"] & ((h: never) => void)>[0][] = [];
      const res = analyzeWithPatterns(work.text, work.meta, { quiet: true, debug: (d) => (paras = d.paras), audit: (h) => hits.push(h as never) });
      // How much each kind of line adds up to in each fic / pairing / category, and how sure that verdict is.
      const bucketOf = (h: { a: string; b?: string; cat: string }) => {
        const first = (n?: string) => (n ?? "").split(/\s+/)[0];
        const pr = res.pairings.find((x) => x.pairing.includes(first(h.a)) || (h.b && x.pairing.includes(first(h.b))));
        const conf = !pr ? 0.5 : h.cat === "anal" ? pr.anal.confidence.score : h.cat === "oral" ? pr.oral.confidence.score : h.cat === "vibe" ? (pr.vibe?.find((v) => v.name.startsWith(first(h.a)))?.confidence.score ?? 0.5) : 0.5;
        return { id: `${pr?.pairing ?? "?"}|${h.cat}`, conf };
      };
      const totals = new Map<string, number>();
      for (const h of hits as { f?: number[]; a: string; b?: string; cat: string; kind: string }[]) if (h.f) totals.set(bucketOf(h).id, (totals.get(bucketOf(h).id) ?? 0) + kindWeight(h.kind));
      for (const h of hits as { via: string; f?: number[]; para: number; a: string; b?: string; cat: string; act: string; kind: string; sentence: string }[]) {
        if (!h.f) continue;
        const bk = bucketOf(h);
        const key = `${h.via}#${hash(h.sentence).toString(16)}`;
        if (done.has(key) || seen.has(key)) continue;
        seen.add(key);
        const para = paras[h.para] ?? "";
        const s = h.sentence.trim();
        const at = para.includes(s) ? para.replace(s, `【${s}】`) : `【${para}】`;
        cands.push({ impact: verdictImpact(probability(precisionOf(h.via), h.f), kindWeight(h.kind) / Math.max(0.001, totals.get(bk.id) ?? 1), bk.conf), key, via: h.via, fic: f.replace(/\.html$/, ""), para: h.para, a: h.a, b: h.b, act: h.act, kind: h.kind, sentence: s, p: probability(precisionOf(h.via), h.f), before: cap(paras[h.para - 1] ?? ""), at: cap(at, 900), after: cap(paras[h.para + 1] ?? "") });
      }
    }
    const low = Number(process.env.QUEUE_LOW ?? 40), high = Number(process.env.QUEUE_HIGH ?? 20);
    // Default: the hits whose being wrong would move a result most. QUEUE_RANK=unsure goes back to the least-sure first.
    const byImpact = (process.env.QUEUE_RANK ?? "impact") === "impact";
    const unsure = pick([...cands].sort((x, y) => (byImpact ? y.impact - x.impact : x.p - y.p)), low, 3);
    const chosen = new Set(unsure.map((c) => c.key));
    const sure = pick(cands.filter((c) => !chosen.has(c.key) && c.p >= 0.9).sort((x, y) => hash(x.key) - hash(y.key)), high, 1);
    const rows = [...unsure, ...sure].map((c, i) => ({
      n: i + 1, key: c.key, pattern: c.via, fic: c.fic, a: c.a, b: c.b, act: c.act, kind: c.kind,
      before: c.before, para: c.at, after: c.after,
      note: `The model gives this a ${Math.round(c.p * 100)}% chance of being right${i < unsure.length ? (byImpact ? " (one where a mistake would move a result most)" : " (one of the least sure)") : " (one of the surest, as a check)"}.`,
    }));
    writeFileSync(join(dir!, "REVIEW_QUEUE.json"), JSON.stringify({ candidates: cands.length, rows }, null, 1));
    expect(rows.length).toBeGreaterThan(0);
  }, 1_500_000);
  it("ranks a doubtful line that decides a shaky verdict above an equally doubtful one that doesn't", () => {
    const decisive = verdictImpact(0.4, 0.5, 0.55);
    expect(decisive).toBeGreaterThan(verdictImpact(0.4, 0.02, 0.55)); // small share of the evidence
    expect(decisive).toBeGreaterThan(verdictImpact(0.4, 0.5, 0.98)); // verdict already far from flipping
    expect(decisive).toBeGreaterThan(verdictImpact(0.9, 0.5, 0.55)); // line is probably right
    expect(verdictImpact(0.4, 0.5, 0.98)).toBeGreaterThan(0); // never zero for a doubtful line that counts
  });
  it("weights acts above fantasies", () => {
    expect(kindWeight("act")).toBeGreaterThan(kindWeight("fantasy"));
    expect(kindWeight("something-new")).toBe(0.4);
  });
  it("takes at most a few rows per pattern", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ via: i < 8 ? "a" : "b~elided", i }));
    expect(pick(rows, 10, 3).map((r) => r.via)).toEqual(["a", "a", "a", "b~elided", "b~elided", "b~elided"]);
  });
});
