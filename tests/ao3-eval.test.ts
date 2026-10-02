// Evaluation on real AO3 downloads. Skipped unless AO3_DIR points at a folder of AO3 .html files.
//   AO3_DIR=ao3-samples npx vitest run tests/ao3-eval.test.ts
// Runs the engine "blind" (no AO3 tags at all, so characters are guessed from the text), then prints
// the tags separately so the result can be checked against them afterwards.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import { emptyMeta } from "../src/ao3";
import { extractFromHtml } from "../src/extract";
import { analyzeWithPatterns } from "../src/heuristic";
import { type ActKind, ROLE_WORDS } from "../src/roles";
import type { ActResult, PairingResult } from "../src/types";

const dir = process.env.AO3_DIR;

const fmtAct = (a: ActResult, kind: ActKind = "anal") => {
  const w = ROLE_WORDS[kind];
  const roles = kind === "blowjob" ? `${a.bottom} ${w.bottomVerb} / ${a.top} ${w.topVerb}` : kind === "anal" ? `top ${a.top} / bottom ${a.bottom}` : `${a.top} ${w.topVerb} / ${a.bottom} ${w.bottomVerb}`;
  return `${a.verdict}${a.top ? ` (${roles})` : ""} · ${a.confidence.label} ${Math.round(a.confidence.score * 100)}% · ${a.instances.length} scenes, ${a.desires.length} hints`;
};
const fmtOral = (p: PairingResult) =>
  `blowjobs: ${fmtAct(p.blowjob, "blowjob")} · rimming: ${fmtAct(p.rimming, "rimming")}${p.cunnilingus.verdict !== "none" ? ` · cunnilingus: ${fmtAct(p.cunnilingus, "cunnilingus")}` : ""}`;

describe.skipIf(!dir)("AO3 evaluation", () => {
  it("analyzes each fic blind, then shows its tags", () => {
    const files = readdirSync(dir!).filter((f) => f.endsWith(".html")).sort();
    const out: string[] = [];
    for (const f of files) {
      const work = extractFromHtml(readFileSync(join(dir!, f), "utf8"));
      const blind = { ...emptyMeta() }; // no tags, no rating, no relationships
      const a = analyzeWithPatterns(work.text, blind, { quiet: true });
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
      out.push("### With tags");
      for (const p of tagged.pairings.slice(0, 3)) out.push(`- **${p.pairing}** anal: ${fmtAct(p.anal)} · ${fmtOral(p)}${p.vaginal.applicable ? ` · vaginal: ${p.vaginal.occurs ? "yes" : "no"}` : ""}`);
      out.push("### Tags (checked afterwards)");
      out.push(`Fandom: ${work.meta.fandoms.join(", ")}`);
      out.push(`Relationships: ${work.meta.relationships.join(", ")}`);
      out.push(`Additional tags: ${work.meta.freeforms.join(", ")}`);
      out.push("");
    }
    const report = out.join("\n");
    writeFileSync(join(dir!, "REPORT.md"), report);
    console.log(report);
  }, 120_000);
});
