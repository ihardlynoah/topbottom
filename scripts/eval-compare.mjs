#!/usr/bin/env node
// Compare two evaluation runs (folders holding eval.json, or the eval.json files themselves).
//   node scripts/eval-compare.mjs <old> <new> [--all]
// Prints verdict changes (anal / blowjob / rimming / cunnilingus, who is top and bottom) and, with --all, every change in
// scene counts, hint counts and confidence. Exit status 1 when any verdict changed.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const [a, b] = process.argv.slice(2).filter((x) => !x.startsWith("--"));
const all = process.argv.includes("--all");
if (!a || !b) { console.error("usage: eval-compare.mjs <old> <new> [--all]"); process.exit(2); }
const load = (p) => JSON.parse(readFileSync(statSync(p).isDirectory() ? join(p, "eval.json") : p, "utf8")).fics;
for (const p of [a, b]) if (!existsSync(p)) { console.error(`missing ${p}`); process.exit(2); }
const old = new Map(load(a).map((f) => [f.file, f]));
const ACTS = ["anal", "blowjob", "rimming", "cunnilingus"];
let verdicts = 0, small = 0;
for (const f of load(b)) {
  const o = old.get(f.file);
  if (!o) { console.log(`+ new fic ${f.file}`); continue; }
  for (const mode of ["blind", "tagged"]) {
    const oldP = new Map(o[mode].map((p) => [p.pairing, p]));
    for (const p of f[mode]) {
      const q = oldP.get(p.pairing);
      if (!q) { console.log(`${f.file} [${mode}] new pairing ${p.pairing}`); continue; }
      for (const act of ACTS) {
        const x = q[act], y = p[act];
        const who = (r) => `${r.verdict}${r.top ? ` ${r.top} / ${r.bottom}` : ""}`;
        if (who(x) !== who(y)) { verdicts++; console.log(`VERDICT ${f.file} [${mode}] ${p.pairing} ${act}: ${who(x)} -> ${who(y)}`); }
        else if (all && (x.scenes !== y.scenes || x.hints !== y.hints || x.confidence !== y.confidence)) { small++; console.log(`  ${f.file} [${mode}] ${p.pairing} ${act}: scenes ${x.scenes}->${y.scenes}, hints ${x.hints}->${y.hints}, confidence ${x.confidence}->${y.confidence}`); }
      }
    }
    for (const q of o[mode]) if (!f[mode].some((p) => p.pairing === q.pairing)) console.log(`${f.file} [${mode}] pairing gone: ${q.pairing}`);
  }
}
for (const [n] of old) if (!load(b).some((f) => f.file === n)) console.log(`- fic gone ${n}`);
console.log(`${verdicts} verdict change${verdicts === 1 ? "" : "s"}${all ? `, ${small} count/confidence change${small === 1 ? "" : "s"}` : ""}`);
process.exit(verdicts ? 1 : 0);
