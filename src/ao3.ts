// Pulls the work metadata AO3 puts at the top of every download (HTML, EPUB, PDF).

export interface Ao3Meta {
  title?: string;
  author?: string;
  url?: string;
  rating?: string;
  fandoms: string[];
  relationships: string[];
  characters: string[];
  words?: number;
  chapters?: string;
}

export function emptyMeta(): Ao3Meta {
  return { fandoms: [], relationships: [], characters: [] };
}

/** True if the metadata has the fields AO3 always includes. */
export function hasAo3Meta(meta: Ao3Meta): boolean {
  return meta.fandoms.length > 0 || meta.words !== undefined;
}

/** Romantic/sexual relationship tags use "/"; platonic ones use "&". */
export function romanticPairings(meta: Ao3Meta): string[] {
  return meta.relationships.filter((r) => r.includes("/"));
}

const LABELS = [
  "Rating",
  "Archive Warnings?",
  "Categor(?:y|ies)",
  "Fandoms?",
  "Relationships?",
  "Characters?",
  "Additional Tags",
  "Language",
  "Series",
  "Collections?",
  "Stats",
];

function parseWords(stats: string): number | undefined {
  const m = stats.match(/Words:\s*([\d,.\s]*\d)/i);
  if (!m) return undefined;
  const n = parseInt(m[1].replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : undefined;
}

function parseChapters(stats: string): string | undefined {
  return stats.match(/Chapters:\s*(\d+\s*\/\s*(?:\d+|\?))/i)?.[1].replace(/\s+/g, "");
}

function splitTags(value: string): string[] {
  return value
    .split(/,\s*(?![^()]*\))/) // tags are comma-separated; don't split inside parentheses
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Parse the `<dl class="tags">` block in an AO3 HTML/EPUB download. */
export function parseAo3FromDom(doc: Document): Ao3Meta {
  const meta = emptyMeta();
  for (const dt of Array.from(doc.querySelectorAll("dt"))) {
    const label = (dt.textContent ?? "").replace(/:\s*$/, "").trim().toLowerCase();
    let dd = dt.nextElementSibling;
    while (dd && dd.tagName.toLowerCase() !== "dd") dd = dd.nextElementSibling;
    if (!dd) continue;
    const links = Array.from(dd.querySelectorAll("a")).map((a) => (a.textContent ?? "").trim()).filter(Boolean);
    const text = (dd.textContent ?? "").replace(/\s+/g, " ").trim();
    const tags = links.length ? links : splitTags(text);
    if (/^fandoms?$/.test(label)) meta.fandoms = tags;
    else if (/^relationships?$/.test(label)) meta.relationships = tags;
    else if (/^characters?$/.test(label)) meta.characters = tags;
    else if (label === "rating") meta.rating = tags[0];
    else if (label === "stats") {
      meta.words = parseWords(text);
      meta.chapters = parseChapters(text);
    }
  }

  const workLink = doc.querySelector<HTMLAnchorElement>('a[href*="archiveofourown.org/works/"]');
  if (workLink) meta.url = workLink.getAttribute("href") ?? undefined;
  const author = doc.querySelector('a[rel="author"]');
  if (author) meta.author = author.textContent?.trim();
  const title = doc.querySelector("#preface h1, .meta h1, h1");
  if (title?.textContent?.trim()) meta.title = title.textContent.trim();
  else if (doc.title) meta.title = doc.title.replace(/\s*-\s*Archive of Our Own\s*$/i, "").trim();

  return meta;
}

/** Parse the same header from flattened text (PDF, TXT, or anything without a DOM). */
export function parseAo3FromText(text: string): Ao3Meta {
  const meta = emptyMeta();
  // Only look at the preface; tags never appear deep in the work.
  const head = text.slice(0, 20000);
  const labelRe = new RegExp(`(?:^|\\s)(${LABELS.join("|")}):`, "gi");
  const hits: { label: string; start: number; end: number }[] = [];
  for (const m of head.matchAll(labelRe)) {
    hits.push({ label: m[1].toLowerCase(), start: m.index!, end: m.index! + m[0].length });
  }
  for (let i = 0; i < hits.length; i++) {
    const { label, end } = hits[i];
    let value = head.slice(end, i + 1 < hits.length ? hits[i + 1].start : end + 400);
    if (/^stats$/.test(label)) {
      // Stats is last; stop at the first blank line so we don't eat the summary.
      value = value.split(/\n\s*\n/)[0];
      if (meta.words === undefined) meta.words = parseWords(value);
      meta.chapters ??= parseChapters(value);
      continue;
    }
    value = value.replace(/\s+/g, " ").trim();
    if (/^fandoms?$/.test(label) && !meta.fandoms.length) meta.fandoms = splitTags(value);
    else if (/^relationships?$/.test(label) && !meta.relationships.length) meta.relationships = splitTags(value);
    else if (/^characters?$/.test(label) && !meta.characters.length) meta.characters = splitTags(value);
    else if (label === "rating" && !meta.rating) meta.rating = value.split(" ")[0];
  }
  // PDFs sometimes put "Words:" outside a "Stats:" label.
  if (meta.words === undefined && hits.length) meta.words = parseWords(head);
  const url = head.match(/https?:\/\/archiveofourown\.org\/works\/\d+/);
  if (url) meta.url = url[0];
  return meta;
}

/** Merge b into a, keeping whatever a already has. */
export function mergeMeta(a: Ao3Meta, b: Ao3Meta): Ao3Meta {
  return {
    title: a.title ?? b.title,
    author: a.author ?? b.author,
    url: a.url ?? b.url,
    rating: a.rating ?? b.rating,
    fandoms: a.fandoms.length ? a.fandoms : b.fandoms,
    relationships: a.relationships.length ? a.relationships : b.relationships,
    characters: a.characters.length ? a.characters : b.characters,
    words: a.words ?? b.words,
    chapters: a.chapters ?? b.chapters,
  };
}

/** Rough AO3-style word count: whitespace-separated tokens that contain a letter or digit. */
export function countWords(text: string): number {
  let n = 0;
  for (const tok of text.split(/\s+/)) if (/[\p{L}\p{N}]/u.test(tok)) n++;
  return n;
}
