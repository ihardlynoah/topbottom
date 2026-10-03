// Mistake report: what the reader flagged as wrong, formatted to paste into Claude so it can find the
// pattern that misfired. Pure text building, no DOM, so it can be tested.

export const FLAG_REASONS = [
  // Who or what is credited
  { key: "wrong_top", label: "Wrong character is flagged as topping / doing it" },
  { key: "wrong_bottom", label: "Wrong character is flagged as bottoming / receiving" },
  { key: "swapped", label: "Roles are reversed (top and bottom swapped)" },
  { key: "wrong_person", label: "Credited to the wrong character" },
  { key: "wrong_speaker", label: "Wrong speaker: someone else said this line" },
  { key: "wrong_pronoun", label: "A pronoun (he / him / his) points at the wrong person" },
  { key: "wrong_people", label: "Wrong people (someone outside this pairing)" },
  // What it is
  { key: "wrong_act", label: "Wrong sexual act is flagged (e.g. oral shown as anal)" },
  { key: "not_sex", label: "Not a sex act, or not that kind of cue, at all" },
  { key: "not_sexual_context", label: "An everyday action, not in a sexual scene" },
  { key: "figurative", label: "Figure of speech, idiom or joke, not literal" },
  { key: "solo", label: "Solo or reflexive act (himself, his own…) shown as a scene with the partner" },
  { key: "hypothetical", label: "A wish, fantasy or \"what if\", not something that happens" },
  { key: "negated", label: "Negated or refused (didn't, wouldn't, never)" },
  // How much it counts
  { key: "duplicate", label: "Counted more than once" },
  { key: "wrong_tier", label: "Belongs in a different evidence tier" },
  { key: "too_strong", label: "Counts for too much for how weak the clue is" },
  { key: "too_weak", label: "Counts for too little" },
  // The overall rating
  { key: "vibe_too_top", label: "Rating leans too far toward top" },
  { key: "vibe_too_bottom", label: "Rating leans too far toward bottom" },
  { key: "vibe_confidence", label: "Confidence is too high or too low" },
  { key: "other", label: "Something else (explain below)" },
] as const;

export type FlagKind = "scene" | "hint" | "vibe" | "factor";

/** Which boxes make sense for what is being reported. */
export const REASONS_FOR: Record<FlagKind, FlagReason[]> = {
  scene: ["wrong_top", "wrong_bottom", "swapped", "wrong_pronoun", "wrong_people", "wrong_act", "not_sex", "figurative", "solo", "hypothetical", "negated", "duplicate", "other"],
  hint: ["wrong_person", "wrong_speaker", "wrong_pronoun", "swapped", "wrong_people", "not_sex", "not_sexual_context", "figurative", "hypothetical", "negated", "duplicate", "other"],
  vibe: ["vibe_too_top", "vibe_too_bottom", "vibe_confidence", "other"],
  factor: ["wrong_person", "swapped", "wrong_speaker", "wrong_pronoun", "not_sex", "not_sexual_context", "figurative", "hypothetical", "negated", "duplicate", "wrong_tier", "too_strong", "too_weak", "other"],
};

export type FlagReason = (typeof FLAG_REASONS)[number]["key"];

export const reasonLabel = (k: FlagReason) => FLAG_REASONS.find((r) => r.key === k)?.label ?? k;

export interface FlaggedScene {
  id: string;
  /** A scene, a hint line, or a vibe rating. */
  kind?: FlagKind;
  /** Left out of the copied report when false (default true). */
  included?: boolean;
  /** Extra lines to print under the item (e.g. what a vibe rating rests on). */
  extra?: string[];
  pairing: string;
  /** The card it appeared on: anal, blowjob, rimming, cunnilingus, vaginal. */
  card: string;
  top: string;
  bottom: string;
  /** What top / bottom mean on this card ("gets sucked" / "sucks cock"). */
  topVerb?: string;
  bottomVerb?: string;
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


export function buildReport(r: ReportInput): string {
  const out: string[] = [];
  out.push("# Trust (Tags) But Verify — mistake report");
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

  const flags = r.flags.filter((f) => f.included !== false);
  if (flags.length) {
    out.push("");
    out.push(`## Things I think are wrong (${flags.length})`);
    flags.forEach((f, n) => {
      out.push("");
      const kind = f.kind ?? "scene";
      out.push(`### ${n + 1}. ${f.pairing} · ${kind === "vibe" ? "vibe rating" : kind === "hint" ? (f.card === "solo" ? "solo act" : `${f.card} hint`) : f.card}`);
      if (kind === "scene") {
        out.push(`- Shown as: **${f.top || "?"}** ${f.topVerb ?? "tops"} (top), **${f.bottom || "?"}** ${f.bottomVerb ?? "bottoms"} (bottom) · ${f.act}`);
      } else if (kind === "hint" && f.card === "solo") {
        out.push(`- Shown as a solo act by **${f.top || "?"}** · ${f.act}`);
      } else if (kind === "hint") {
        out.push(`- Shown as: **${f.top || "?"}** points toward ${f.bottom || "?"} · ${f.act}`);
      } else {
        out.push(`- Rating shown: **${f.top}** is **${f.act}**`);
      }
      const how = [f.basis ? `people found ${f.basis === "named" ? "by name" : f.basis === "pronoun" ? "through pronouns" : "by inference"}` : "", f.confidence !== undefined ? `${kind === "scene" ? "scene " : ""}confidence ${Math.round(f.confidence * 100)}%` : "", f.where ?? ""].filter(Boolean);
      if (how.length) out.push(`- ${how.join(" · ")}`);
      if (f.confidenceReasons?.length) out.push(`- Why it scored that: ${f.confidenceReasons.join("; ")}`);
      for (const x of f.extra ?? []) out.push(`- ${x}`);
      if (f.evidence) out.push(`- Sentence: “${f.evidence}”`);
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
