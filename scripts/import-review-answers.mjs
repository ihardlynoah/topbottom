// Turns the answers saved by the review page into a labels file the reliability and context-model tests read.
//   node scripts/import-review-answers.mjs REVIEW_QUEUE.json <answers dir> tests/labels/review-YYYY-MM-DD.json
// The page saves each row's key with its answer, so the queue file is only a fallback (pass "none" to skip it).
// <answers dir> is where ArtifactData saved the page's "reviews" collection (reviews/r1.json, …).
// Page answers: wrong = the analyzer was wrong (label "wrong"), fine = it was right ("ok"), unsure = "unclear". Unanswered rows are left out.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [queuePath, answersDir, out] = process.argv.slice(2);
if (!queuePath || !answersDir || !out) { console.error("usage: import-review-answers.mjs queue.json|none answersDir out.json"); process.exit(2); }
const q = queuePath === "none" ? [] : JSON.parse(readFileSync(queuePath, "utf8"));
const rows = q.rows ?? q;
const byN = new Map(rows.map((r, i) => [r.n ?? i + 1, r]));
const dir = existsSync(join(answersDir, "reviews")) ? join(answersDir, "reviews") : answersDir;
const MAP = { wrong: "wrong", fine: "ok", unsure: "unclear" };
const labels = {};
let skipped = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
  const d = JSON.parse(readFileSync(join(dir, f), "utf8"));
  const a = d.data ?? d;
  const key = a.key || byN.get(a.n)?.key;
  if (!key || !MAP[a.v]) { skipped++; continue; }
  labels[key] = MAP[a.v];
}
const made = new Date().toISOString().slice(0, 10);
writeFileSync(out, JSON.stringify({ made, how: `Review queue ${made}: hits the context model was least sure of, plus a few it trusted, judged by the owner on the review page (wrong = the analyzer was wrong); keys are pattern#hash(sentence)`, labels }, null, 1) + "\n");
console.log(`${Object.keys(labels).length} labels written to ${out} (${skipped} unanswered or unknown)`);
