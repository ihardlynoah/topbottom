// Turns an uploaded file (PDF, EPUB, HTML, TXT) into plain story text plus any AO3 metadata.

import { type Ao3Meta, countWords, emptyMeta, mergeMeta, parseAo3FromDom, parseAo3FromText } from "./ao3";
import { ao3StoryText } from "./text";

export interface ExtractedWork {
  format: "pdf" | "epub" | "html" | "txt";
  /** Full text sent for analysis (chapters, headings, notes). */
  text: string;
  meta: Ao3Meta;
  /** Our own count of story words, used when AO3 stats are missing. */
  countedWords: number;
}

const BLOCK_TAGS = new Set([
  "p", "div", "br", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote",
  "dt", "dd", "tr", "hr", "section", "article", "pre",
]);

/** Element text with paragraph breaks preserved (textContent alone glues paragraphs together). */
export function elementText(root: Node): string {
  const out: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push(node.textContent ?? "");
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = (node as Element).tagName.toLowerCase();
    if (tag === "script" || tag === "style" || tag === "head") return;
    const block = BLOCK_TAGS.has(tag);
    if (block) out.push("\n");
    node.childNodes.forEach(walk);
    if (block) out.push("\n");
  };
  walk(root);
  return out
    .join("")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Story text from AO3's chapter container, excluding its notes block. */
function storyTextFromHtml(doc: Document): string | undefined {
  const chapters = doc.querySelector("#chapters");
  if (!chapters) return undefined;
  const copy = chapters.cloneNode(true) as Element;
  // Chapter summaries and notes go, but the "Chapter 2" headings stay: they mark where scenes are.
  copy.querySelectorAll(".meta").forEach((meta) => {
    const heading = meta.querySelector("h2, h3, .heading");
    if (heading) meta.replaceWith(heading);
    else meta.remove();
  });
  copy.querySelectorAll(".chapter .notes, .chapter_notes").forEach((el) => el.remove());
  return elementText(copy);
}

/** Positioned PDF text lets us distinguish paragraph gaps from ordinary line wraps. */
export interface PdfTextItem {
  str: string;
  hasEOL?: boolean;
  transform?: number[];
  height?: number;
}

export function joinPdfTextItems(items: PdfTextItem[]): string {
  let text = "";
  let previousLine: { y?: number; height?: number } | undefined;
  for (const item of items) {
    if (previousLine) {
      const y = item.transform?.[5];
      const gap = y !== undefined && previousLine.y !== undefined ? Math.abs(previousLine.y - y) : 0;
      const lineHeight = Math.max(1, ((previousLine.height ?? item.height ?? 10) + (item.height ?? previousLine.height ?? 10)) / 2);
      text += gap > Math.max(4, lineHeight * 1.55) ? "\n\n" : "\n";
    } else if (text && !/\s$/.test(text)) {
      text += " ";
    }

    text += item.str;
    previousLine = item.hasEOL ? { y: item.transform?.[5], height: item.height } : undefined;
  }
  return text.trim();
}

/** Story text from AO3's chapter containers, skipping summaries and author notes. */
function storyWordCount(roots: ParentNode[]): number | undefined {
  // Summaries and notes are blockquote.userstuff. Multi-chapter works nest div.userstuff inside
  // #chapters.userstuff, so keep only the innermost containers to avoid double counting.
  const STORY = "div.userstuff, section.userstuff, article.userstuff";
  const parts = roots.flatMap((r) =>
    Array.from(r.querySelectorAll(STORY)).filter((el) => !el.closest("blockquote") && !el.querySelector(STORY)),
  );
  if (!parts.length) return undefined;
  return parts.reduce((n, el) => n + countWords(elementText(el)), 0);
}

export function extractFromHtml(html: string): ExtractedWork {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const meta = mergeMeta(parseAo3FromDom(doc), parseAo3FromText(elementText(doc.body)));
  const chapters = doc.querySelector("#chapters");
  const text = chapters ? storyTextFromHtml(doc)! : elementText(doc.body);
  return {
    format: "html",
    text,
    meta,
    countedWords: storyWordCount([doc]) ?? countWords(text),
  };
}

export function extractFromText(text: string): ExtractedWork {
  const meta = parseAo3FromText(text);
  // AO3 PDFs start with the work title on its own line.
  if (meta.url || meta.fandoms.length) {
    const first = text.trim().split("\n")[0]?.trim();
    if (first && first.length < 200 && !/:/.test(first)) meta.title = first;
  }
  // AO3 metadata remains in `meta`; author notes must not be scanned as story events.
  const hasAo3Header = !!(meta.url || meta.fandoms.length || meta.words !== undefined);
  const story = hasAo3Header ? ao3StoryText(text) : text.trim();
  return { format: "txt", text: story, meta, countedWords: countWords(story) };
}

async function extractFromPdf(data: ArrayBuffer): Promise<ExtractedWork> {
  // The legacy build includes polyfills; the modern one needs very new browsers (Math.sumPrecise etc.).
  await import("./pdf/polyfill");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Bundled by Vite as a plain .js worker, so hosts that serve .mjs with the wrong MIME type still work.
  if (!pdfjs.GlobalWorkerOptions.workerPort) {
    const { default: PdfWorker } = await import("./pdf/worker?worker");
    pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();
  }
  let pdf;
  try {
    pdf = await pdfjs.getDocument({ data }).promise;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/password/i.test(msg)) throw new Error("This PDF is password-protected. Try the EPUB or HTML download instead.");
    throw new Error(`Couldn't read this PDF (${msg}). Try the EPUB or HTML download from AO3 instead.`);
  }
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    // Read the text stream directly rather than via getTextContent(), which needs stream async iteration.
    const reader = page.streamTextContent().getReader();
    const items: unknown[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      items.push(...(value as { items: unknown[] }).items);
    }
    const textItems = items.filter(
      (item): item is PdfTextItem => typeof item === "object" && item !== null && "str" in item,
    );
    pages.push(joinPdfTextItems(textItems));
  }
  const work = extractFromText(pages.join("\n\n"));
  return { ...work, format: "pdf" };
}

async function extractFromEpub(data: ArrayBuffer): Promise<ExtractedWork> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(data);
  const parser = new DOMParser();

  const container = await zip.file("META-INF/container.xml")?.async("string");
  const opfPath = container?.match(/full-path="([^"]+)"/)?.[1];
  const opfText = opfPath ? await zip.file(opfPath)?.async("string") : undefined;
  if (!opfPath || !opfText) throw new Error("This EPUB is missing its package file (content.opf).");
  const opf = parser.parseFromString(opfText, "application/xml");
  const baseDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";

  const manifest = new Map<string, string>();
  opf.querySelectorAll("manifest > item").forEach((item) => {
    manifest.set(item.getAttribute("id") ?? "", item.getAttribute("href") ?? "");
  });
  const hrefs = Array.from(opf.querySelectorAll("spine > itemref"))
    .map((ref) => manifest.get(ref.getAttribute("idref") ?? ""))
    .filter((h): h is string => !!h);

  let meta = emptyMeta();
  const docs: Document[] = [];
  const texts: string[] = [];
  for (const href of hrefs) {
    const path = baseDir + decodeURIComponent(href.split("#")[0]);
    const src = await zip.file(path)?.async("string");
    if (!src) continue;
    const doc = parser.parseFromString(src, "text/html");
    const docMeta = parseAo3FromDom(doc);
    const isPreface = docMeta.fandoms.length > 0 || docMeta.words !== undefined;
    meta = mergeMeta(meta, docMeta);
    if (isPreface) continue;
    docs.push(doc);
    texts.push(elementText(doc.body));
  }

  // Fall back to the OPF's Dublin Core metadata for title/author.
  meta.title ??= opf.getElementsByTagName("dc:title")[0]?.textContent?.trim() || undefined;
  meta.author ??= opf.getElementsByTagName("dc:creator")[0]?.textContent?.trim() || undefined;

  const text = texts.join("\n\n").trim();
  return { format: "epub", text, meta, countedWords: storyWordCount(docs) ?? countWords(text) };
}

export async function extractFile(file: File): Promise<ExtractedWork> {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf" || file.type === "application/pdf") return extractFromPdf(await file.arrayBuffer());
  if (ext === "epub" || file.type === "application/epub+zip") return extractFromEpub(await file.arrayBuffer());
  if (ext === "html" || ext === "htm" || ext === "xhtml" || file.type === "text/html") {
    return extractFromHtml(await file.text());
  }
  if (ext === "txt" || ext === "md" || file.type.startsWith("text/")) return extractFromText(await file.text());
  throw new Error(`Unsupported file type ".${ext}". Use a PDF, EPUB, HTML, or TXT file.`);
}
