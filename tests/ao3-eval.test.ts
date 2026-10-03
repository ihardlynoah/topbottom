// Evaluation on real AO3 downloads. Skipped unless AO3_DIR points at a folder of AO3 .html files.
//   npm run eval -- ao3-samples            (all fics in parallel, cached; see scripts/eval.mjs)
//   AO3_DIR=ao3-samples npx vitest run tests/ao3-eval.test.ts     (one process, no cache)
// Runs the engine "blind" (no AO3 tags at all, so characters are guessed from the text), then with the real tags.
// Each fic's result goes to <AO3_DIR>/.eval/<fic>.json (the report text plus structured verdicts and timings); REPORT.md
// and eval.json are merged from those. EVAL_FILES (comma-separated names) limits a run to some fics.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, it } from "vitest";
import { mergeEval } from "../scripts/eval-merge.mjs";
import { emptyMeta } from "../src/ao3";
import { extractFromHtml } from "../src/extract";
import { analyzeWithPatterns } from "../src/heuristic";
import { type ActKind, ROLE_WORDS } from "../src/roles";
import type { ActResult, PairingResult } from "../src/types";

const dir = process.env.AO3_DIR;
const outDir = process.env.EVAL_OUT ?? (dir ? join(dir, ".eval") : "");
const only = process.env.EVAL_FILES?.split(",").filter(Boolean);
const TIMEOUT = Number(process.env.EVAL_TIMEOUT_MS ?? 20 * 60_000);

const fmtAct = (a: ActResult, kind: ActKind = "anal") => {
  const w = ROLE_WORDS[kind];
  const roles = kind === "blowjob" ? `${a.bottom} ${w.bottomVerb} / ${a.top} ${w.topVerb}` : kind === "anal" ? `top ${a.top} / bottom ${a.bottom}` : `${a.top} ${w.topVerb} / ${a.bottom} ${w.bottomVerb}`;
  const odds = (a.people ?? [])
    .map((p) => `${p.name.split(" ")[0]} ${w.topVerb} ${Math.round(p.top * 100)}%/${w.bottomVerb} ${Math.round(p.bottom * 100)}%`)
    .join(", ");
  return `${a.verdict}${a.top ? ` (${roles})` : ""} · ${a.confidence.label} ${Math.round(a.confidence.score * 100)}% · ${a.instances.length} scenes, ${a.desires.length} hints${odds ? ` [${odds}]` : ""}`;
};
const fmtOral = (p: PairingResult) =>
  `blowjobs: ${fmtAct(p.blowjob, "blowjob")} · rimming: ${fmtAct(p.rimming, "rimming")}${p.cunnilingus.verdict !== "none" ? ` · cunnilingus: ${fmtAct(p.cunnilingus, "cunnilingus")}` : ""}`;
const struct = (p: PairingResult) => {
  const act = (a: ActResult) => ({ verdict: a.verdict, top: a.top, bottom: a.bottom, confidence: Math.round(a.confidence.score * 100), scenes: a.instances.length, hints: a.desires.length });
  return { pairing: p.pairing, anal: act(p.anal), blowjob: act(p.blowjob), rimming: act(p.rimming), cunnilingus: act(p.cunnilingus) };
};

describe.skipIf(!dir)("AO3 evaluation", () => {
  const files = dir ? readdirSync(dir).filter((f) => f.endsWith(".html")).sort().filter((f) => !only || only.includes(f.replace(/\.html$/, ""))) : [];
  if (dir) mkdirSync(outDir, { recursive: true });
  for (const f of files) {
    it(f, () => {
      const out: string[] = [];
      const work = extractFromHtml(readFileSync(join(dir!, f), "utf8"));
      const t0 = performance.now();
      const blind = { ...emptyMeta() }; // no tags, no rating, no relationships
      const a = analyzeWithPatterns(work.text, blind, { quiet: true });
      const t1 = performance.now();
      out.push(`## ${f} (${work.meta.words ?? work.countedWords} words)`);
      out.push("### Blind result");
      out.push(`Characters guessed → pairings: ${a.pairings.map((p) => p.pairing).join("; ") || "none"}`);
      for (const p of a.pairings.slice(0, 2)) {
        out.push(`- **${p.pairing}** anal: ${fmtAct(p.anal)}`);
        out.push(`  ${fmtOral(p)}`);
        if (p.vaginal.applicable) out.push(`  vaginal: ${p.vaginal.summary}`);
        for (const i of [...p.anal.instances, ...p.oral.instances].slice(0, 6)) out.push(`  - ${i.top} → ${i.bottom} · ${i.act} · ${i.basis} · “${i.evidence.slice(0, 140)}”`);
      }
      if (a.notes) out.push(`Notes: ${a.notes}`);
      // Same text with its real AO3 tags (what the website does).
      const tagged = analyzeWithPatterns(work.text, work.meta, { quiet: true });
      const t2 = performance.now();
      out.push("### With tags");
      for (const p of tagged.pairings.slice(0, 3)) out.push(`- **${p.pairing}** anal: ${fmtAct(p.anal)} · ${fmtOral(p)}${p.vaginal.applicable ? ` · vaginal: ${p.vaginal.occurs ? "yes" : "no"}` : ""}`);
      out.push("### Tags (checked afterwards)");
      out.push(`Fandom: ${work.meta.fandoms.join(", ")}`);
      out.push(`Relationships: ${work.meta.relationships.join(", ")}`);
      out.push(`Additional tags: ${work.meta.freeforms.join(", ")}`);
      out.push("");
      const name = f.replace(/\.html$/, "");
      writeFileSync(
        join(outDir, `${name}.json`),
        JSON.stringify({
          file: name,
          key: process.env.EVAL_KEYS ? (JSON.parse(process.env.EVAL_KEYS) as Record<string, string>)[name] : undefined,
          words: work.meta.words ?? work.countedWords,
          ms: { blind: Math.round(t1 - t0), tagged: Math.round(t2 - t1) },
          blind: a.pairings.slice(0, 2).map(struct),
          tagged: tagged.pairings.slice(0, 3).map(struct),
          text: out.join("\n"),
        }),
      );
    }, TIMEOUT);
  }
  // Run on its own (no driver): merge here.
  afterAll(() => {
    if (!only && dir) mergeEval(outDir, dir);
  });
});
