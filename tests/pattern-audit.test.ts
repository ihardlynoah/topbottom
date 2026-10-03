// Pattern audit: which pattern produced each act / desire hit across a folder of AO3 downloads, with a few sample sentences
// each, so a pattern that is matching the wrong thing shows up without waiting for a bug report.
//   AO3_DIR=ao3-samples npx vitest run tests/pattern-audit.test.ts --testTimeout=1500000
// Writes PATTERN_AUDIT.md into AO3_DIR. Samples are chosen by a fixed hash, so reruns on unchanged code give the same file.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import { extractFromHtml } from "../src/extract";
import { type AuditHit, analyzeWithPatterns } from "../src/heuristic";
import { PATTERNS } from "../src/heuristic/patterns";

const dir = process.env.AO3_DIR;
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const SAMPLES = Number(process.env.AUDIT_SAMPLES ?? 6);

describe.skipIf(!dir)("pattern audit", () => {
  it("lists every pattern's hits with samples", () => {
    const files = readdirSync(dir!).filter((f) => f.endsWith(".html")).sort();
    type Row = { fic: string; hit: AuditHit };
    const byPattern = new Map<string, Row[]>();
    for (const f of files) {
      const work = extractFromHtml(readFileSync(join(dir!, f), "utf8"));
      analyzeWithPatterns(work.text, work.meta, {
        quiet: true,
        audit: (hit) => {
          const rows = byPattern.get(hit.via) ?? [];
          rows.push({ fic: f.replace(/\.html$/, ""), hit });
          byPattern.set(hit.via, rows);
        },
      });
    }
    const out: string[] = ["# Pattern audit", "", `${files.length} fics · ${[...byPattern.values()].reduce((n, r) => n + r.length, 0)} hits · ${byPattern.size} patterns hit`, ""];
    const ids = new Set(PATTERNS.map((p) => p.id ?? "").filter(Boolean));
    const base = (id: string) => id.replace(/~elided$/, "");
    const unused = [...ids].filter((id) => ![...byPattern.keys()].some((k) => base(k) === id));
    const entries = [...byPattern.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [id, rows] of entries) {
      const fics = new Set(rows.map((r) => r.fic)).size;
      const kinds = [...new Set(rows.map((r) => r.hit.kind))].join("/");
      out.push(`## ${id} · ${rows.length} hits in ${fics} fic${fics === 1 ? "" : "s"} · ${kinds}`);
      const pick = [...rows].sort((x, y) => hash(id + x.hit.sentence) - hash(id + y.hit.sentence)).slice(0, SAMPLES);
      for (const r of pick) out.push(`- ${r.fic} · ${r.hit.a}${r.hit.b ? ` → ${r.hit.b}` : ""} · ${r.hit.act} · “${r.hit.sentence.replace(/\s+/g, " ").slice(0, 170)}”`);
      out.push("");
    }
    out.push("## Patterns with no hits", "", unused.sort().join(", ") || "(none)", "");
    writeFileSync(join(dir!, "PATTERN_AUDIT.md"), out.join("\n"));
    // The same samples as rows with a key each, for labelling (see tests/labels/ and tests/reliability.test.ts).
    const rows = entries.flatMap(([id, rs]) =>
      [...rs].sort((x, y) => hash(id + x.hit.sentence) - hash(id + y.hit.sentence)).slice(0, SAMPLES).map((r) => ({
        key: `${id}#${hash(r.hit.sentence).toString(16)}`,
        via: id,
        fic: r.fic,
        kind: r.hit.kind,
        a: r.hit.a,
        b: r.hit.b,
        act: r.hit.act,
        sentence: r.hit.sentence.replace(/\s+/g, " ").slice(0, 220),
        hits: rs.length,
      })),
    );
    writeFileSync(join(dir!, "PATTERN_AUDIT.json"), JSON.stringify({ patterns: entries.length, hits: entries.reduce((n, e) => n + e[1].length, 0), rows }, null, 1));
  }, 1_500_000);
});
