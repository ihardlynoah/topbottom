

export interface Quote {
  start: number;
  end: number;
  text: string;
}

/** Replace dialogue with spaces (same length) so narration patterns don't fire on speech. */
export function maskQuotes(p: string, singleQuotes: boolean): { masked: string; quotes: Quote[] } {
  const quotes: Quote[] = [];
  const re = singleQuotes
    ? /(^|[\s(—–-])‘((?:[^’]|’(?=\p{L}))*)’(?=[\s,.;:!?—–)-]|$)/gu
    : // Straight and curly quotes are interchangeable: many fics open with " and close with ” (autocorrect).
      /[“"]([^“”"]*)[”"]?/g;
  let masked = p;
  for (const m of p.matchAll(re)) {
    const lead = singleQuotes ? m[1].length : 0;
    const start = m.index! + lead;
    const end = m.index! + m[0].length;
    const text = singleQuotes ? m[2] : (m[1] ?? "");
    quotes.push({ start, end, text });
    masked = masked.slice(0, start + 1) + " ".repeat(Math.max(0, end - start - 2)) + masked.slice(end - 1);
  }
  // Text messages are often written in [brackets]; treat them like dialogue.
  for (const m of masked.matchAll(/\[([^\[\]]{2,})\]/g)) {
    const start = m.index!;
    const end = start + m[0].length;
    quotes.push({ start, end, text: p.slice(start + 1, end - 1) });
    masked = masked.slice(0, start + 1) + " ".repeat(Math.max(0, end - start - 2)) + masked.slice(end - 1);
  }
  quotes.sort((x, y) => x.start - y.start);
  return { masked, quotes };
}

/** Sentence boundaries (start indices) in a paragraph. */
export function sentenceSpans(p: string): [number, number][] {
  const spans: [number, number][] = [];
  const re = /[.!?…]+["”’)]*\s+(?=["“‘(]?[\p{Lu}\d])/gu;
  let start = 0;
  for (const m of p.matchAll(re)) {
    const end = m.index! + m[0].length;
    // Don't split after common abbreviations.
    if (/\b(?:Mr|Mrs|Ms|Dr|St|Mt|Jr|Sr|vs|etc)\.\s*$/.test(p.slice(start, end))) continue;
    spans.push([start, end]);
    start = end;
  }
  if (start < p.length) spans.push([start, p.length]);
  return spans;
}

export const CHAPTER_RE = /^(?:chapter|ch\.?|part)\s*(\d+|[ivxlc]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|[a-z]+teen|twenty[\w-]*|thirty[\w-]*)\b/i;

