// Gold-label evaluation: hand-checked readings of real fics (verdicts, which scenes are real and who tops, who the point of
// view is by section, who sent which text), scored against what the engine says now. Unlike the sample-fic diff, this says
// whether a change was an improvement, not only that something changed.
//   AO3_DIR=ao3-samples npx vitest run tests/gold-eval.test.ts
// Gold files live in tests/gold/*.json and hold paragraph numbers plus a hash of the paragraph, never the fic's own text.
// If the engine's paragraph splitting changes, the hash lets the file shift itself; regenerate when a hash can't be found.
// Set GOLD_STRICT=1 to fail on any miss. Writes GOLD_REPORT.md into AO3_DIR.
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractFromHtml } from "../src/extract";
import { analyzeWithPatterns } from "../src/heuristic";
import type { Instance, PairingResult } from "../src/types";

const dir = process.env.AO3_DIR;
const strict = !!process.env.GOLD_STRICT;
export const paraHash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(16); };

type ActKey = "anal" | "blowjob" | "rimming" | "cunnilingus";
interface Gold {
  fic: string;
  note?: string;
  verdicts?: { pairing: string; act: ActKey; verdict: string; top?: string; bottom?: string }[];
  /** A real scene: some reported scene of this act, in this pairing's order or the other, lies within [from-2, to+2]. */
  scenes?: { act: ActKey; from: number; to: number; top: string; bottom: string; h: string }[];
  /** Acts whose scene list above is complete: any other reported scene of that act counts as a false positive. */
  complete?: ActKey[];
  /** A paragraph the engine must not report as this act (already fixed false positives). */
  notScenes?: { act: ActKey; para: number; h: string }[];
  pov?: { from: number; to: number; pov: string; h: string }[];
  texts?: { para: number; from: string; h: string }[];
}

const goldFiles = existsSync(join(__dirname, "gold")) ? readdirSync(join(__dirname, "gold")).filter((f) => f.endsWith(".json")) : [];

describe.skipIf(!dir)("gold labels", () => {
  it("scores the engine against the hand-checked readings", () => {
    const report: string[] = ["# Gold-label report", ""];
    const totals = { verdictOk: 0, verdicts: 0, sceneRight: 0, sceneFlipped: 0, sceneMissed: 0, falsePos: 0, reported: 0, povOk: 0, povN: 0, textOk: 0, textN: 0, stale: 0 };
    for (const gf of goldFiles) {
      const gold = JSON.parse(readFileSync(join(__dirname, "gold", gf), "utf8")) as Gold;
      const path = join(dir!, `${gold.fic}.html`);
      if (!existsSync(path)) { report.push(`## ${gold.fic}: skipped (no ${gold.fic}.html in AO3_DIR)`, ""); continue; }
      const work = extractFromHtml(readFileSync(path, "utf8"));
      let dbg!: Parameters<NonNullable<Parameters<typeof analyzeWithPatterns>[2]>["debug"] & ((d: never) => void)>[0];
      const a = analyzeWithPatterns(work.text, work.meta, { quiet: true, debug: (d) => (dbg = d as never) });
      const paras: string[] = (dbg as { paras: string[] }).paras;
      // Shift the file's paragraph numbers if the engine now numbers paragraphs differently.
      const where = (at: number, h: string): number => {
        if (paras[at] !== undefined && paraHash(paras[at]) === h) return at;
        const hits = paras.map((p, i) => (paraHash(p) === h ? i : -1)).filter((i) => i >= 0);
        if (hits.length === 1) return hits[0];
        totals.stale++;
        return at;
      };
      const lines: string[] = [];
      const pairingOf = (name: string): PairingResult | undefined => { const [x, y] = name.split("/"); return a.pairings.find((p) => (p.pairing.includes(x.split(" ")[0]) && p.pairing.includes(y.split(" ")[0]))); };
      const sceneList = (p: PairingResult, act: ActKey): Instance[] => p[act].instances.filter((i) => i.act !== "fingering");

      for (const v of gold.verdicts ?? []) {
        const p = pairingOf(v.pairing);
        const r = p?.[v.act];
        const ok = !!r && r.verdict === v.verdict && (v.verdict !== "one_way" || (r.top === v.top && r.bottom === v.bottom));
        totals.verdicts++; if (ok) totals.verdictOk++;
        lines.push(`- ${ok ? "✔" : "✘"} verdict ${v.pairing} ${v.act}: expected ${v.verdict}${v.top ? ` (${v.top} / ${v.bottom})` : ""}, got ${r ? `${r.verdict}${r.top ? ` (${r.top} / ${r.bottom})` : ""}` : "no such pairing"}`);
      }
      const pairs = a.pairings;
      const trueRanges: Record<string, [number, number][]> = {};
      for (const s of gold.scenes ?? []) {
        const from = where(s.from, s.h), to = from + (s.to - s.from);
        (trueRanges[s.act] ??= []).push([from - 2, to + 2]);
        let verdict: "right" | "flipped" | "missed" = "missed";
        for (const p of pairs) {
          if (!(p.pairing.includes(s.top.split(" ")[0]) && p.pairing.includes(s.bottom.split(" ")[0]))) continue;
          for (const i of sceneList(p, s.act)) {
            if (i.para === undefined || i.para < from - 2 || i.para > to + 2) continue;
            if (i.top === s.top && i.bottom === s.bottom) verdict = "right";
            else if (i.top === s.bottom && i.bottom === s.top && verdict !== "right") verdict = "flipped";
          }
        }
        if (verdict === "right") totals.sceneRight++; else if (verdict === "flipped") totals.sceneFlipped++; else totals.sceneMissed++;
        if (verdict !== "right") lines.push(`- ✘ ${s.act} scene at ${from}-${to} (${s.top} → ${s.bottom}): ${verdict}`);
      }
      for (const act of gold.complete ?? []) {
        for (const p of pairs) {
          for (const i of sceneList(p, act)) {
            totals.reported++;
            const inRange = (trueRanges[act] ?? []).some(([lo, hi]) => i.para !== undefined && i.para >= lo && i.para <= hi);
            if (!inRange) { totals.falsePos++; lines.push(`- ✘ extra ${act} scene reported at ${i.para} (${i.top} → ${i.bottom}): not in the complete gold list`); }
          }
        }
      }
      for (const n of gold.notScenes ?? []) {
        const at = where(n.para, n.h);
        for (const p of pairs) for (const i of sceneList(p, n.act)) if (i.para === at) { totals.falsePos++; lines.push(`- ✘ ${n.act} scene reported at ${at}, which is a known false positive`); }
      }
      if (gold.pov?.length) {
        let ok = 0, n = 0;
        for (const r of gold.pov) {
          const from = where(r.from, r.h), to = from + (r.to - r.from);
          for (let i = from; i <= to; i++) { n++; if ((dbg as { pov: (string | undefined)[] }).pov[i] === r.pov) ok++; }
        }
        totals.povOk += ok; totals.povN += n;
        lines.push(`- POV: ${ok}/${n} labelled paragraphs right (${n ? Math.round((ok / n) * 100) : 0}%)`);
      }
      if (gold.texts?.length) {
        let ok = 0;
        const texts = (dbg as { texts: { para: number; from?: string }[] }).texts;
        for (const t of gold.texts) {
          const at = where(t.para, t.h);
          const hit = texts.find((x) => x.para === at);
          if (hit?.from === t.from) ok++; else lines.push(`- ✘ text at ${at}: expected sender ${t.from}, got ${hit?.from ?? "none"}`);
        }
        totals.textOk += ok; totals.textN += gold.texts.length;
        lines.push(`- Texts: ${ok}/${gold.texts.length} senders right`);
      }
      report.push(`## ${gold.fic}`, ...(gold.note ? [gold.note] : []), ...lines, "");
    }
    const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "n/a");
    const sceneN = totals.sceneRight + totals.sceneFlipped + totals.sceneMissed;
    report.splice(2, 0,
      `- Verdicts: ${totals.verdictOk}/${totals.verdicts} (${pct(totals.verdictOk, totals.verdicts)})`,
      `- Scene recall: ${totals.sceneRight}/${sceneN} right, ${totals.sceneFlipped} flipped, ${totals.sceneMissed} missed (${pct(totals.sceneRight, sceneN)})`,
      `- Scene precision (complete acts + known false positives): ${totals.falsePos} false positives among ${totals.reported + 0} reported scenes in complete acts`,
      `- POV: ${totals.povOk}/${totals.povN} (${pct(totals.povOk, totals.povN)})`,
      `- Text senders: ${totals.textOk}/${totals.textN} (${pct(totals.textOk, totals.textN)})`,
      `- Stale paragraph numbers that couldn't be relocated: ${totals.stale}`, "");
    writeFileSync(join(dir!, "GOLD_REPORT.md"), report.join("\n"));
    console.log(report.slice(0, 10).join("\n"));
    if (strict) {
      expect(totals.verdictOk).toBe(totals.verdicts);
      expect(totals.sceneFlipped + totals.sceneMissed + totals.falsePos).toBe(0);
    }
  }, 1_500_000);
});
