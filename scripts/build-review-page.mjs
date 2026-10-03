// Builds the review page (an HTML file for the Artifact tool) from a rows JSON file, e.g. REVIEW_QUEUE.json.
//   node scripts/build-review-page.mjs ao3-samples/REVIEW_QUEUE.json out.html ["Title"] ["Lede sentence."]
// Each row needs n, pattern, fic, a, b, act, kind, before, para, after (para has the sentence in 【】); claim is made if missing.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { claim } from "./review-claims.mjs";

const [rowsPath, out, title = "Label Review", lede = "These are lines the analyzer picked up that nobody has checked yet."] = process.argv.slice(2);
if (!rowsPath || !out) { console.error("usage: build-review-page.mjs rows.json out.html [title] [lede]"); process.exit(2); }
const rows = (JSON.parse(readFileSync(rowsPath, "utf8")).rows ?? JSON.parse(readFileSync(rowsPath, "utf8"))).map((r, i) => ({ ...r, n: r.n ?? i + 1, claim: r.claim ?? claim(r) }));
const tpl = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "review-page.tpl.html"), "utf8");
const html = tpl.replaceAll("/*TITLE*/", title).replace("/*LEDE*/", lede).replace("/*ROWS*/", JSON.stringify(rows).replaceAll("</", "<\\/"));
writeFileSync(out, html);
console.log(`${rows.length} rows -> ${out}`);
