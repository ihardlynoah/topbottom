// Turns flagged mistakes into vitest skeletons to review and commit. Pure text building, no DOM.
// The fic's own sentence is never put in the test body: it appears only in a comment marked for deletion, with a
// placeholder to fill in with a paraphrase (the repo's tests use made-up sentences, not quotes).
import type { FlaggedScene, MissedScene } from "./report";

const q = (s: string) => JSON.stringify(s);
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** What the test should assert, from what the reader said was wrong. */
function expectation(f: FlaggedScene): { title: string; assertion: string } {
  const r = new Set(f.reasons);
  const top = f.top || "TOP";
  const bottom = f.bottom || "BOTTOM";
  const kind = f.kind ?? "scene";
  if (kind === "vibe") {
    const dir = r.has("vibe_too_top") ? "not lean as far toward top" : r.has("vibe_too_bottom") ? "not lean as far toward bottom" : "have a different confidence";
    return { title: `${f.top}: rating should ${dir}`, assertion: `// Assert on pairings[0].${f.card === "dynamic" ? "dynamic" : "vibe"} for ${q(f.top)} (it was ${q(f.act)}); fill in the label or score this should be.\n    expect(rating(r, ${q(f.top)}).label).not.toBe(${q(f.act)});` };
  }
  if (r.has("swapped")) return { title: `${bottom} is the top and ${top} the bottom, not the reverse`, assertion: `expect(roles(r, ${q(f.card)})).toEqual({ top: ${q(bottom)}, bottom: ${q(top)} });` };
  if (r.has("wrong_top") || r.has("wrong_bottom") || r.has("wrong_person") || r.has("wrong_speaker") || r.has("wrong_pronoun")) {
    return { title: `credits the right character (not ${top} → ${bottom})`, assertion: `// Fill in who it should be:\n    expect(roles(r, ${q(f.card)})).toEqual({ top: "TODO", bottom: "TODO" });` };
  }
  if (r.has("wrong_act")) return { title: `is not read as ${f.act}`, assertion: `expect(count(r, ${q(f.card)})).toBe(0);` };
  const none = ["not_sex", "not_sexual_context", "figurative", "solo", "hypothetical", "negated", "wrong_people", "duplicate"].find((k) => r.has(k as never));
  if (none) {
    const why: Record<string, string> = { not_sex: "is not a sex act", not_sexual_context: "is not counted outside a sexual scene", figurative: "is figurative, not literal", solo: "is a solo act, not a scene with the partner", hypothetical: "is a wish, not something that happens", negated: "is negated", wrong_people: "involves people outside the pairing", duplicate: "is counted once" };
    return { title: `${why[none]}`, assertion: none === "duplicate" ? `expect(count(r, ${q(f.card)})).toBe(1);` : `expect(count(r, ${q(f.card)})).toBe(0);` };
  }
  return { title: "reads as intended", assertion: `// Say what should be true here, then assert it.\n    expect(roles(r, ${q(f.card)})).toEqual({ top: "TODO", bottom: "TODO" });` };
}

export function testSkeletons(flags: FlaggedScene[], missed: MissedScene[]): string {
  const items = flags.filter((f) => f.included !== false);
  const out: string[] = [];
  out.push('import { describe, expect, it } from "vitest";');
  out.push('import { type Ao3Meta, emptyMeta } from "../src/ao3";');
  out.push('import { analyzeWithPatterns } from "../src/heuristic";');
  out.push("");
  out.push("// Generated from flagged mistakes. Before committing:");
  out.push("//  1. Replace every PARAPHRASE_ME with a made-up sentence that has the same grammar, with different names and wording.");
  out.push("//  2. Delete the “original” comments (they quote the fic).");
  out.push("//  3. Fill in each TODO, run the file, and check the test FAILS before the fix and passes after it.");
  out.push("");
  out.push("const meta: Ao3Meta = { ...emptyMeta(), rating: \"Explicit\", categories: [\"M/M\"] };");
  out.push("const run = (text: string) => analyzeWithPatterns(text, meta, { quiet: true });");
  out.push("// Helpers: adapt these to the card in question (see tests/round45.test.ts for working examples).");
  out.push("declare function roles(r: ReturnType<typeof run>, card: string): { top: string; bottom: string };");
  out.push("declare function count(r: ReturnType<typeof run>, card: string): number;");
  out.push("declare function rating(r: ReturnType<typeof run>, name: string): { label: string };");
  out.push("");
  out.push('describe("flagged mistakes", () => {');
  items.forEach((f, i) => {
    const e = expectation(f);
    out.push(`  it(${q(e.title)}, () => {`);
    if (f.evidence) out.push(`    // original (delete before committing): ${q(oneLine(f.evidence).slice(0, 200))}`);
    if (f.context && f.context !== f.evidence) out.push(`    // surrounding text matters; give it a neutral lead-in of one or two paraphrased sentences`);
    if (f.note.trim()) out.push(`    // reader's note: ${oneLine(f.note)}`);
    out.push(`    const r = run("PARAPHRASE_ME");`);
    out.push(`    ${e.assertion}`);
    out.push("  });");
    if (i < items.length - 1) out.push("");
  });
  missed.forEach((m, i) => {
    if (items.length || i) out.push("");
    out.push(`  it("finds the missed scene ${i + 1}", () => {`);
    out.push(`    // original (delete before committing): ${q(oneLine(m.passage).slice(0, 200))}`);
    if (m.note.trim()) out.push(`    // reader's note: ${oneLine(m.note)}`);
    out.push(`    const r = run("PARAPHRASE_ME");`);
    out.push(`    expect(count(r, "TODO")).toBeGreaterThan(0);`);
    out.push("  });");
  });
  out.push("});");
  out.push("");
  return out.join("\n");
}
