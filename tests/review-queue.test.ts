// Picks the next hits worth labelling: the ones the context model trusts least (where a mistake is most likely) and a few it
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

describe.skipIf(!dir)("review queue", () => {
  it("lists the hits to label next", () => {
    const done = labelled();
    type Cand = { key: string; via: string; fic: string; para: number; a: string; b?: string; act: string; kind: string; sentence: string; p: number; before: string; at: string; after: string };
    const cands: Cand[] = [];
    const seen = new Set<string>();
    for (const f of readdirSync(dir!).filter((x) => x.endsWith(".html")).sort()) {
      const work = extractFromHtml(readFileSync(join(dir!, f), "utf8"));
      let paras: string[] = [];
      const hits: Parameters<NonNullable<Parameters<typeof analyzeWithPatterns>[2]>["audit"] & ((h: never) => void)>[0][] = [];
      analyzeWithPatterns(work.text, work.meta, { quiet: true, debug: (d) => (paras = d.paras), audit: (h) => hits.push(h as never) });
      for (const h of hits as { via: string; f?: number[]; para: number; a: string; b?: string; act: string; kind: string; sentence: string }[]) {
        if (!h.f) continue;
        const key = `${h.via}#${hash(h.sentence).toString(16)}`;
        if (done.has(key) || seen.has(key)) continue;
        seen.add(key);
        const para = paras[h.para] ?? "";
        const s = h.sentence.trim();
        const at = para.includes(s) ? para.replace(s, `【${s}】`) : `【${para}】`;
        cands.push({ key, via: h.via, fic: f.replace(/\.html$/, ""), para: h.para, a: h.a, b: h.b, act: h.act, kind: h.kind, sentence: s, p: probability(precisionOf(h.via), h.f), before: cap(paras[h.para - 1] ?? ""), at: cap(at, 900), after: cap(paras[h.para + 1] ?? "") });
      }
    }
    const low = Number(process.env.QUEUE_LOW ?? 40), high = Number(process.env.QUEUE_HIGH ?? 20);
    const unsure = pick([...cands].sort((x, y) => x.p - y.p), low, 3);
    const chosen = new Set(unsure.map((c) => c.key));
    const sure = pick(cands.filter((c) => !chosen.has(c.key) && c.p >= 0.9).sort((x, y) => hash(x.key) - hash(y.key)), high, 1);
    const rows = [...unsure, ...sure].map((c, i) => ({
      n: i + 1, key: c.key, pattern: c.via, fic: c.fic, a: c.a, b: c.b, act: c.act, kind: c.kind,
      before: c.before, para: c.at, after: c.after,
      note: `The model gives this a ${Math.round(c.p * 100)}% chance of being right${i < unsure.length ? " (one of the least sure)" : " (one of the surest, as a check)"}.`,
    }));
    writeFileSync(join(dir!, "REVIEW_QUEUE.json"), JSON.stringify({ candidates: cands.length, rows }, null, 1));
    expect(rows.length).toBeGreaterThan(0);
  }, 1_500_000);
  it("takes at most a few rows per pattern", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ via: i < 8 ? "a" : "b~elided", i }));
    expect(pick(rows, 10, 3).map((r) => r.via)).toEqual(["a", "a", "a", "b~elided", "b~elided", "b~elided"]);
  });
});
