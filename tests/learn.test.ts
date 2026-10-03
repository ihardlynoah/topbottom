// Trains the context model in src/heuristic/learned.ts from the hand-labelled audit samples (tests/labels/*.json), and says
// whether it beats the plain per-pattern record on held-out labels.
//   AO3_DIR=ao3-samples npx vitest run tests/learn.test.ts --testTimeout=1500000          cross-validation report only
//   AO3_DIR=ao3-samples WRITE_LEARNED=1 npx vitest run tests/learn.test.ts ...            also writes the model into learned.ts
// The model is switched on only when it improves held-out log loss; the report goes to LEARN_REPORT.md in AO3_DIR.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractFromHtml } from "../src/extract";
import { analyzeWithPatterns } from "../src/heuristic";
import { FEATURES, MODEL, probability } from "../src/heuristic/learned";

const dir = process.env.AO3_DIR;
const labelDir = join(__dirname, "labels");
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const PRIOR_MEAN = 0.9, PRIOR_STRENGTH = 4;

type Row = { key: string; id: string; f: number[]; y: number };

function loadLabels(): Map<string, "ok" | "wrong"> {
  const out = new Map<string, "ok" | "wrong">();
  for (const f of readdirSync(labelDir).filter((x) => x.endsWith(".json")).sort()) {
    const { labels } = JSON.parse(readFileSync(join(labelDir, f), "utf8")) as { labels: Record<string, "ok" | "wrong" | "unclear"> };
    for (const [k, v] of Object.entries(labels)) if (v !== "unclear") out.set(k, v);
  }
  return out;
}

const baseId = (id: string) => id.replace(/~elided$/, "");
const logit = (p: number) => Math.log(p / (1 - p));
const sig = (z: number) => 1 / (1 + Math.exp(-z));

/** Smoothed precision of each pattern from the rows given, leaving out `skip` (its own label) when set. */
function precisions(rows: Row[], skip?: Row): (id: string) => number {
  const c = new Map<string, [number, number]>();
  for (const r of rows) {
    if (r === skip) continue;
    const v = c.get(baseId(r.id)) ?? [0, 0];
    v[0] += r.y; v[1] += 1;
    c.set(baseId(r.id), v);
  }
  return (id) => { const [ok, n] = c.get(baseId(id)) ?? [0, 0]; return (ok + PRIOR_MEAN * PRIOR_STRENGTH) / (n + PRIOR_STRENGTH); };
}

/** Ridge logistic regression by Newton steps. x rows are [logit(precision), ...features]; returns [bias, ...weights]. */
function fit(X: number[][], y: number[], lambda: number): number[] {
  const d = X[0].length + 1;
  const w = new Array(d).fill(0);
  w[1] = 1; // start by trusting the pattern record as it is
  for (let it = 0; it < 30; it++) {
    const g = new Array(d).fill(0);
    const H = Array.from({ length: d }, () => new Array(d).fill(0));
    for (let n = 0; n < X.length; n++) {
      const x = [1, ...X[n]];
      let z = 0;
      for (let k = 0; k < d; k++) z += w[k] * x[k];
      const p = sig(z);
      for (let k = 0; k < d; k++) {
        g[k] += (p - y[n]) * x[k];
        for (let l = 0; l < d; l++) H[k][l] += p * (1 - p) * x[k] * x[l];
      }
    }
    // Ridge on everything except the intercept and the pattern-record coefficient (which is shrunk toward 1).
    for (let k = 2; k < d; k++) { g[k] += lambda * w[k]; H[k][k] += lambda; }
    g[1] += lambda * (w[1] - 1); H[1][1] += lambda;
    H[0][0] += 1e-6;
    const step = solve(H, g);
    let big = 0;
    for (let k = 0; k < d; k++) { w[k] -= step[k]; big = Math.max(big, Math.abs(step[k])); }
    if (big < 1e-6) break;
  }
  return w;
}

function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    [M[i], M[p]] = [M[p], M[i]];
    for (let r = i + 1; r < n; r++) {
      const f = M[r][i] / M[i][i];
      for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let c = i + 1; c < n; c++) s -= M[i][c] * x[c];
    x[i] = s / M[i][i];
  }
  return x;
}

const clampP = (p: number) => Math.min(0.995, Math.max(0.005, p));
const logloss = (ps: number[], ys: number[]) => -ps.reduce((s, p, i) => s + (ys[i] ? Math.log(clampP(p)) : Math.log(1 - clampP(p))), 0) / ps.length;
const brier = (ps: number[], ys: number[]) => ps.reduce((s, p, i) => s + (p - ys[i]) ** 2, 0) / ps.length;
function auc(ps: number[], ys: number[]): number {
  // Probability a right hit scores above a wrong one (ties count half).
  let win = 0, tot = 0;
  for (let i = 0; i < ps.length; i++) if (ys[i] === 1) for (let j = 0; j < ps.length; j++) if (ys[j] === 0) { tot++; win += ps[i] > ps[j] ? 1 : ps[i] === ps[j] ? 0.5 : 0; }
  return tot ? win / tot : NaN;
}

describe.skipIf(!dir)("context model", () => {
  it("trains on the labels and reports held-out accuracy", () => {
    const labels = loadLabels();
    let rows: Row[] = [];
    const seen = new Set<string>();
    const missing: Record<string, string> = {};
    const cache = process.env.ROWS_CACHE;
    if (cache && existsSync(cache)) rows = JSON.parse(readFileSync(cache, "utf8"));
    else for (const f of readdirSync(dir!).filter((x) => x.endsWith(".html")).sort()) {
      const work = extractFromHtml(readFileSync(join(dir!, f), "utf8"));
      analyzeWithPatterns(work.text, work.meta, {
        quiet: true,
        audit: (h) => {
          const key = `${h.via}#${hash(h.sentence).toString(16)}`;
          const lab = labels.get(key);
          if (!h.f) { if (lab) missing[key] = h.kind; return; }
          if (!lab || seen.has(key)) return;
          seen.add(key);
          rows.push({ key, id: h.via, f: h.f, y: lab === "ok" ? 1 : 0 });
        },
      });
    }
    if (cache && !existsSync(cache)) writeFileSync(cache, JSON.stringify(rows));
    if (process.env.MISSING_OUT) writeFileSync(process.env.MISSING_OUT, JSON.stringify(missing));
    const lines: string[] = ["# Context model", "", `${rows.length} labelled hits found again in the samples (of ${labels.size} labels); ${rows.filter((r) => !r.y).length} wrong.`, ""];
    expect(rows.length).toBeGreaterThan(200);

    const designs = (set: Row[], pre: (id: string, r?: Row) => number) => set.map((r) => [logit(clampP(pre(r.id, r))), ...r.f]);
    // 5-fold cross-validation; pattern precision for a held-out row comes from the other folds only.
    const K = 5, lambda = Number(process.env.LAMBDA ?? 8);
    const fold = (r: Row) => hash(r.key) % K;
    const pb: number[] = [], pm: number[] = [], ys: number[] = [];
    for (let k = 0; k < K; k++) {
      const train = rows.filter((r) => fold(r) !== k), test = rows.filter((r) => fold(r) === k);
      const prec = precisions(train);
      // Inside training, each row's own label is left out of its pattern's precision.
      const Xtr = train.map((r) => [logit(clampP(precisions(train, r)(r.id))), ...r.f]);
      const w = fit(Xtr, train.map((r) => r.y), lambda);
      for (const r of test) {
        const base = prec(r.id);
        const x = [logit(clampP(base)), ...r.f];
        let z = w[0];
        for (let i = 0; i < x.length; i++) z += w[i + 1] * x[i];
        pb.push(base); pm.push(sig(z)); ys.push(r.y);
      }
    }
    const rep = (name: string, ps: number[]) => `| ${name} | ${logloss(ps, ys).toFixed(4)} | ${brier(ps, ys).toFixed(4)} | ${auc(ps, ys).toFixed(3)} |`;
    lines.push(`Held-out (${K}-fold, ridge ${lambda}):`, "", "| | log loss | Brier | AUC |", "|---|---|---|---|", rep("pattern record only", pb), rep("pattern record + context", pm), "");
    const better = logloss(pm, ys) < logloss(pb, ys) - 0.002 && auc(pm, ys) > auc(pb, ys);

    // Final model on everything.
    const precAll = precisions(rows);
    const Xall = rows.map((r) => [logit(clampP(precisions(rows, r)(r.id))), ...r.f]);
    const wAll = fit(Xall, rows.map((r) => r.y), lambda);
    lines.push("Weights:", "", `- bias ${wAll[0].toFixed(3)}, pattern record ${wAll[1].toFixed(3)}`, ...FEATURES.map((n, i) => `- ${n}: ${wAll[i + 2].toFixed(3)}`), "", `Switch on: ${better ? "yes" : "no"} (needs lower held-out log loss and higher AUC).`);
    // What it would do to the wrong rows: share of wrong hits trusted below 0.8, vs right hits.
    const mult = (r: Row) => Math.max(0.4, Math.min(1, probability(precAll(r.id), r.f, { enabled: true, bias: wAll[0], prior: wAll[1], weights: wAll.slice(2) }) / 0.9));
    const low = (set: Row[]) => (set.filter((r) => mult(r) < 0.8).length / Math.max(1, set.length)) * 100;
    lines.push(`In-sample: ${low(rows.filter((r) => !r.y)).toFixed(0)}% of wrong hits trusted below 0.8 vs ${low(rows.filter((r) => r.y)).toFixed(0)}% of right ones.`);
    writeFileSync(join(dir!, "LEARN_REPORT.md"), lines.join("\n"));
    console.log(lines.slice(0, 12).join("\n"));
    if (process.env.WRITE_LEARNED) {
      const p = join(__dirname, "../src/heuristic/learned.ts");
      const src = readFileSync(p, "utf8").replace(
        /export const MODEL: \{[^}]*\} = \{[\s\S]*?\n\};/,
        `export const MODEL: { enabled: boolean; bias: number; prior: number; weights: number[] } = {\n  enabled: ${process.env.FORCE_ENABLE ? "true" : better},\n  bias: ${wAll[0].toFixed(4)},\n  prior: ${wAll[1].toFixed(4)},\n  weights: [${wAll.slice(2).map((v) => v.toFixed(4)).join(", ")}],\n};`,
      );
      writeFileSync(p, src);
    }
    expect(MODEL.weights.length === 0 || MODEL.weights.length === FEATURES.length).toBe(true);
  }, 1_500_000);
});
