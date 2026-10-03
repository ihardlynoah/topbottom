#!/usr/bin/env node
// Run the sample-fic evaluation in parallel and merge the results.
//   npm run eval -- [dir=ao3-samples] [--jobs N] [--force] [--only name,name]
// Splits the fics into N shards (longest first, by the time they took last run, else file size) and runs one vitest process
// per shard. A fic is skipped when its result file was made by the same engine source and the same fic file (--force to
// redo). Writes <dir>/REPORT.md (same text as before) and <dir>/eval.json (structured, for scripts/eval-compare.mjs).
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, rmSync } from "node:fs";
import { cpus } from "node:os";
import { join, resolve } from "node:path";
import { mergeEval, readResults } from "./eval-merge.mjs";

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && ["--jobs", "--only"].includes(args[i - 1])));
const dir = resolve(positional[0] ?? "ao3-samples");
const jobs = Number(opt("jobs") ?? Math.max(1, cpus().length));
const only = opt("only")?.split(",");
if (!existsSync(dir)) { console.error(`No such folder: ${dir}`); process.exit(2); }

const sha = (b) => createHash("sha1").update(b).digest("hex").slice(0, 16);
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith(".ts") ? [join(d, e.name)] : []));
const engineKey = sha(walk("src").sort().map((f) => readFileSync(f)).reduce((h, b) => h + sha(b), ""));

const outDir = join(dir, ".eval");
mkdirSync(outDir, { recursive: true });
const files = readdirSync(dir).filter((f) => f.endsWith(".html")).map((f) => f.replace(/\.html$/, "")).filter((n) => !only || only.includes(n)).sort();
const prev = new Map(readResults(outDir).map((r) => [r.file, r]));
const keys = Object.fromEntries(files.map((n) => [n, `${engineKey}:${sha(readFileSync(join(dir, `${n}.html`)))}`]));
const todo = files.filter((n) => flag("force") || prev.get(n)?.key !== keys[n]);
for (const r of prev.values()) if (!files.includes(r.file) && !only) rmSync(join(outDir, `${r.file}.json`), { force: true });
console.log(`${files.length} fics, ${files.length - todo.length} cached, ${todo.length} to run on ${Math.min(jobs, todo.length || 1)} worker(s) (engine ${engineKey.slice(0, 8)})`);

if (todo.length) {
  // Longest first onto the least-loaded shard.
  const cost = (n) => { const p = prev.get(n); return p?.ms ? p.ms.blind + p.ms.tagged : statSync(join(dir, `${n}.html`)).size / 100; };
  const shards = Array.from({ length: Math.min(jobs, todo.length) }, () => ({ load: 0, names: [] }));
  for (const n of [...todo].sort((a, b) => cost(b) - cost(a))) {
    const s = shards.reduce((m, x) => (x.load < m.load ? x : m));
    s.names.push(n); s.load += cost(n);
  }
  const t0 = Date.now();
  const run = (s, i) =>
    new Promise((ok) => {
      const p = spawn("npx", ["vitest", "run", "tests/ao3-eval.test.ts", "--reporter=dot"], {
        env: { ...process.env, AO3_DIR: dir, EVAL_OUT: outDir, EVAL_FILES: s.names.join(","), EVAL_KEYS: JSON.stringify(keys) },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let log = "";
      p.stdout.on("data", (d) => (log += d));
      p.stderr.on("data", (d) => (log += d));
      p.on("close", (code) => { if (code) console.error(`--- shard ${i + 1} failed (${code})\n${log.slice(-3000)}`); ok(code ?? 1); });
    });
  const codes = await Promise.all(shards.map(run));
  console.log(`ran ${todo.length} fics in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (codes.some(Boolean)) { mergeEval(outDir, dir); process.exit(1); }
}
const results = mergeEval(outDir, dir);
const slow = [...results].sort((a, b) => b.ms.blind + b.ms.tagged - (a.ms.blind + a.ms.tagged)).slice(0, 3);
console.log(`wrote ${join(dir, "REPORT.md")} and eval.json (${results.length} fics). Slowest: ${slow.map((r) => `${r.file} ${((r.ms.blind + r.ms.tagged) / 1000).toFixed(0)}s`).join(", ")}`);
