// Mistake report: what the reader flagged as wrong, formatted to paste into Claude so it can find the
// pattern that misfired. Pure text building, no DOM, so it can be tested.

export const FLAG_REASONS = [
  { key: "wrong_top", label: "Wrong character is flagged as topping / doing it" },
  { key: "wrong_bottom", label: "Wrong character is flagged as bottoming / receiving" },
  { key: "swapped", label: "Roles are reversed (top and bottom swapped)" },
  { key: "wrong_act", label: "Wrong sexual act is flagged (e.g. oral shown as anal)" },
  { key: "not_sex", label: "Not a sex act at all" },
  { key: "solo", label: "Solo or reflexive act (himself, his own…) shown as a scene with the partner" },
  { key: "hypothetical", label: "A wish, fantasy or \"what if\", not something that happens" },
  { key: "wrong_people", label: "Wrong people (someone outside this pairing, or a pronoun pointing at the wrong person)" },
  { key: "other", label: "Something else (explain below)" },
] as const;

export type FlagReason = (typeof FLAG_REASONS)[number]["key"];

export interface FlaggedScene {
  id: string;
  pairing: string;
  /** The card it appeared on: anal, blowjob, rimming, cunnilingus, vaginal. */
  card: string;
  top: string;
  bottom: string;
  act: string;
  basis?: string;
  confidence?: number;
  confidenceReasons?: string[];
  where?: string;
  evidence: string;
  context?: string;
  reasons: FlagReason[];
  note: string;
}

export interface MissedScene {
  passage: string;
  note: string;
}

export interface ReportInput {
  title?: string;
  fandoms?: string[];
  relationships?: string[];
  categories?: string[];
  rating?: string;
  words?: number;
  /** "patterns" (the built-in engine) or "claude". */
  source: string;
  /** One line per card, e.g. "Dracula/Jack Seward · anal: switch (top Dracula / bottom Jack) · High 97%". */
  summaries: string[];
  flags: FlaggedScene[];
  missed: MissedScene[];
  general: string;
}

const reasonLabel = (k: FlagReason) => FLAG_REASONS.find((r) => r.key === k)?.label ?? k;

export function buildReport(r: ReportInput): string {
  const out: string[] = [];
  out.push("# Trust the Tags But Verify — mistake report");
  out.push("");
  out.push(
    "I ran a fanfic through the analyzer and some results look wrong. For each item below, work out why the " +
      `${r.source === "claude" ? "second opinion" : "pattern engine"} read it that way, say whether it is a false positive (flagged but wrong) or a false negative (missed), ` +
      "and suggest a specific fix: a pattern or guard to change, with a short paraphrased test case. " +
      "Check the surrounding passage, not just the one sentence. If my explanation and the text disagree, tell me.",
  );
  out.push("");
  out.push("## The work");
  if (r.title) out.push(`- Title: ${r.title}`);
  if (r.fandoms?.length) out.push(`- Fandom: ${r.fandoms.join("; ")}`);
  if (r.relationships?.length) out.push(`- Relationships: ${r.relationships.join("; ")}`);
  if (r.categories?.length) out.push(`- Categories: ${r.categories.join(", ")}`);
  if (r.rating) out.push(`- Rating: ${r.rating}`);
  if (r.words) out.push(`- Words: ${r.words}`);
  out.push(`- Analysis source: ${r.source}`);
  if (r.summaries.length) {
    out.push("");
    out.push("## What the analyzer concluded");
    for (const s of r.summaries) out.push(`- ${s}`);
  }

  if (r.flags.length) {
    out.push("");
    out.push(`## Scenes I think are wrong (${r.flags.length})`);
    r.flags.forEach((f, n) => {
      out.push("");
      out.push(`### ${n + 1}. ${f.pairing} · ${f.card}`);
      out.push(`- Shown as: top/doing it **${f.top || "?"}**, bottom/receiving **${f.bottom || "?"}** · ${f.act}`);
      const how = [f.basis ? `people found ${f.basis === "named" ? "by name" : f.basis === "pronoun" ? "through pronouns" : "by inference"}` : "", f.confidence !== undefined ? `scene confidence ${Math.round(f.confidence * 100)}%` : "", f.where ?? ""].filter(Boolean);
      if (how.length) out.push(`- ${how.join(" · ")}`);
      if (f.confidenceReasons?.length) out.push(`- Why it scored that: ${f.confidenceReasons.join("; ")}`);
      out.push(`- Sentence: “${f.evidence}”`);
      if (f.context && f.context !== f.evidence) out.push(`- Around it: ${f.context.replace(/\s+/g, " ")}`);
      out.push(`- What is wrong: ${f.reasons.length ? f.reasons.map(reasonLabel).join("; ") : "(nothing ticked)"}`);
      if (f.note.trim()) out.push(`- My explanation: ${f.note.trim()}`);
    });
  }

  if (r.missed.length) {
    out.push("");
    out.push(`## Things it missed (${r.missed.length})`);
    r.missed.forEach((m, n) => {
      out.push("");
      out.push(`${n + 1}. “${m.passage.trim()}”`);
      if (m.note.trim()) out.push(`   - ${m.note.trim()}`);
    });
  }

  if (r.general.trim()) {
    out.push("");
    out.push("## Other comments");
    out.push(r.general.trim());
  }
  out.push("");
  return out.join("\n");
}
