// Turns an uploaded file (PDF, EPUB, HTML, TXT) into plain story text plus any AO3 metadata.

import { type Ao3Meta, countWords, emptyMeta, mergeMeta, parseAo3FromDom, parseAo3FromText } from "./ao3";

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
  const text = elementText(chapters ?? doc.body);
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
  // Skip the AO3 preface (everything up to the Stats line) when counting.
  const stats = text.slice(0, 20000).search(/Stats:|Words:\s*[\d,]+/i);
  const body = stats >= 0 ? text.slice(stats).replace(/^[^\n]*\n/, "") : text;
  return { format: "txt", text: text.trim(), meta, countedWords: countWords(body) };
}

async function extractFromPdf(data: ArrayBuffer): Promise<ExtractedWork> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let s = "";
    for (const item of content.items) {
      if (!("str" in item)) continue;
      s += item.str;
      s += item.hasEOL ? "\n" : item.str.endsWith(" ") ? "" : " ";
    }
    pages.push(s.replace(/ +\n/g, "\n"));
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
