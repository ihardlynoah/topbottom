// Merge the per-fic result files written by tests/ao3-eval.test.ts into REPORT.md (same text as before) and eval.json.
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export function readResults(outDir) {
  if (!existsSync(outDir)) return [];
  return readdirSync(outDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(outDir, f), "utf8")));
}

/** Writes <dir>/REPORT.md and <dir>/eval.json; returns the results. */
export function mergeEval(outDir, dir) {
  const results = readResults(outDir);
  writeFileSync(join(dir, "REPORT.md"), results.map((r) => r.text).join("\n"));
  writeFileSync(join(dir, "eval.json"), JSON.stringify({ made: new Date().toISOString(), fics: results.map(({ text, ...rest }) => rest) }, null, 1));
  return results;
}
