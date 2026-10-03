// The evaluation helpers (scripts/eval-merge.mjs, scripts/eval-compare.mjs) on small made-up result files.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mergeEval, readResults } from "../scripts/eval-merge.mjs";

const act = (verdict: string, top = "", bottom = "", extra = {}) => ({ verdict, top, bottom, confidence: 80, scenes: 3, hints: 5, ...extra });
const fic = (file: string, anal: ReturnType<typeof act>) => ({ file, words: 1000, ms: { blind: 1, tagged: 1 }, blind: [], tagged: [{ pairing: "A/B", anal, blowjob: act("none"), rimming: act("none"), cunnilingus: act("none") }], text: `## ${file}.html\nbody\n` });
const setup = (fics: ReturnType<typeof fic>[]) => {
  const dir = mkdtempSync(join(tmpdir(), "eval-"));
  const out = join(dir, ".eval");
  mkdirSync(out);
  for (const f of fics) writeFileSync(join(out, `${f.file}.json`), JSON.stringify(f));
  mergeEval(out, dir);
  return dir;
};
const compare = (a: string, b: string, ...flags: string[]) => spawnSync("node", ["scripts/eval-compare.mjs", a, b, ...flags], { encoding: "utf8" });

describe("evaluation helpers", () => {
  it("merges per-fic files into REPORT.md (in name order) and eval.json", () => {
    const dir = setup([fic("b", act("none")), fic("a", act("none"))]);
    expect(readFileSync(join(dir, "REPORT.md"), "utf8")).toBe("## a.html\nbody\n\n## b.html\nbody\n");
    expect(JSON.parse(readFileSync(join(dir, "eval.json"), "utf8")).fics.map((f: { file: string }) => f.file)).toEqual(["a", "b"]);
    expect(readResults(join(dir, ".eval")).length).toBe(2);
  });
  it("reports a changed verdict and fails; small changes only with --all", () => {
    const old = setup([fic("a", act("one_way", "X", "Y"))]);
    const same = setup([fic("a", act("one_way", "X", "Y", { hints: 4 }))]);
    const flipped = setup([fic("a", act("one_way", "Y", "X"))]);
    const r1 = compare(old, same);
    expect(r1.status).toBe(0);
    expect(r1.stdout).toContain("0 verdict changes");
    expect(compare(old, same, "--all").stdout).toContain("hints 5->4");
    const r2 = compare(old, flipped);
    expect(r2.status).toBe(1);
    expect(r2.stdout).toContain("VERDICT a [tagged] A/B anal: one_way X / Y -> one_way Y / X");
  });
  it("notes new and missing fics", () => {
    const out = compare(setup([fic("a", act("none"))]), setup([fic("b", act("none"))])).stdout;
    expect(out).toContain("+ new fic b");
    expect(out).toContain("- fic gone a");
  });
});
