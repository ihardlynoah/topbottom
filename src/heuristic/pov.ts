// Whose point of view each stretch of the text is told from.
//
// Fics tagged "Two POVs" (or written in alternating first person) hide the "he" problem inside each chapter: in a
// Steve chapter "He wanted Eddie to fuck him" is Steve, whoever was named in the line before. POV comes from chapter
// headings ("Chapter 3: Steve", "Eddie's POV"), from short name-only lines inside a chapter, and, failing those,
// from counting whose thoughts and feelings the chapter reports.

import type { Cast, Character } from "./characters";

/** Verbs of inner experience: the person they are said of is the one the camera is on. */
const INNER = "(?:felt|feels|thought|thinks|wondered|wonders|wanted|wants|knew|knows|realized|realised|noticed|decided|hoped|wished|needed|remembered|imagined|couldn['’]t help|tried not to|tried to|loved|hated|worried|feared|figured|suspected|swallowed|bit (?:his|her) lip|let out a breath)";

export interface PovMap {
  /** The point-of-view character at each paragraph, when known. */
  at: (Character | undefined)[];
  /** How it was found: from headings, or only from whose feelings are reported. */
  source: "headings" | "feelings" | "none";
}

export function detectPov(paras: string[], isChapterHead: (p: string) => boolean, cast: Cast): PovMap {
  const at: (Character | undefined)[] = new Array(paras.length).fill(undefined);
  if (!cast.aliasPattern) return { at, source: "none" };
  const nameRe = new RegExp(`\\b(${cast.aliasPattern})\\b`, "g");
  const only = (text: string): Character | undefined => {
    const found = new Set<Character>();
    for (const m of text.matchAll(nameRe)) {
      const c = cast.byAlias.get(m[1]);
      if (c && c !== cast.secondPerson) found.add(c);
    }
    return found.size === 1 ? [...found][0] : undefined;
  };
  const povWord = /\bpov\b|point of view|\bperspective\b/i;

  // Segments: from one chapter heading to the next.
  const starts: number[] = [];
  paras.forEach((p, i) => { if (p.length < 120 && isChapterHead(p)) starts.push(i); });
  if (!starts.length || starts[0] !== 0) starts.unshift(0);
  let source: PovMap["source"] = "none";

  for (let s = 0; s < starts.length; s++) {
    const from = starts[s];
    const to = s + 1 < starts.length ? starts[s + 1] : paras.length;
    // 1. The heading: "Chapter 3: Steve", "Chapter 3 - Eddie's POV", "Steve POV".
    let pov: Character | undefined;
    const head = paras[from];
    if (from < paras.length && head.length < 120 && isChapterHead(head)) {
      const rest = head.replace(/^(?:chapter|ch\.?|part)\s*(?:\d+|[ivxlc]+|[a-z-]+)\b\s*[:.\-–—)]*\s*/i, "");
      const c = only(rest);
      if (c && (povWord.test(rest) || rest.replace(nameRe, "").replace(/['’]s|pov|\W+/gi, "").trim() === "")) pov = c;
    }
    // 2. Name-only lines inside the chapter switch the POV from there on.
    let current = pov;
    let sawMarker = !!pov;
    for (let i = from; i < to; i++) {
      const p = paras[i].trim();
      if (i > from && p.length > 0 && p.length <= 40) {
        const c = only(p);
        if (c && p.replace(nameRe, "").replace(/['’]s|pov|point of view|[\s:\-–—()\[\]|~*#]/gi, "") === "") { current = c; sawMarker = true; }
      }
      at[i] = current;
    }
    if (sawMarker) { source = "headings"; continue; }

    // 3. No marker: whose feelings does the chapter report?
    const seg = paras.slice(from, to).join(" ");
    const counts = new Map<Character, number>();
    for (const c of cast.chars) {
      if (c === cast.secondPerson) continue;
      const names = [...cast.byAlias.entries()].filter(([, v]) => v === c).map(([k]) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      if (!names.length) continue;
      const re = new RegExp(`(?:^|[.!?”"]\\s+)(?:${names.join("|")})\\s+(?:${INNER})\\b`, "g");
      counts.set(c, (seg.match(re) ?? []).length);
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const [top, second] = ranked;
    if (top && top[1] >= 6 && top[1] >= 2.5 * (second?.[1] ?? 0)) {
      for (let i = from; i < to; i++) at[i] = top[0];
      if (source === "none") source = "feelings";
    }
  }
  return { at, source };
}

/** A sentence whose "he" / "his" is the point-of-view character: inner experience, or their body reacting. */
export const POV_SENTENCE = new RegExp(
  `^\\W*(?:He|She)\\s+(?:\\w+ly\\s+)?${INNER}\\b|^\\W*(?:His|Her)\\s+(?:heart|stomach|chest|cheeks|face|hands|mind|thoughts|breath|pulse|throat|knees|skin)\\b`,
);
