// Print a fic's story text with the AO3 preface (tags, summary) removed, for reading it "blind".
// Usage: node scripts/blind-text.mjs ao3-samples/123.html
import { readFileSync } from "node:fs";
const html = readFileSync(process.argv[2], "utf8");
const body = html.split(/<div id="chapters"[^>]*>/)[1] ?? html;
const text = body
  .split(/<div id="afterword"/)[0]
  .replace(/<(?:p|br|div|h\d)[^>]*>/gi, "\n")
  .replace(/<[^>]+>/g, "")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&nbsp;/g, " ")
  .replace(/\n{3,}/g, "\n\n");
process.stdout.write(text.trim() + "\n");
