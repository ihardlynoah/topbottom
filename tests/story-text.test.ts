import { describe, expect, it } from "vitest";
import { emptyMeta } from "../src/ao3";
import { extractFromHtml, extractFromText } from "../src/extract";
import { analyzeWithPatterns } from "../src/heuristic";
import { splitParagraphs, UNCERTAIN_NOTE_END, UNCERTAIN_NOTE_START } from "../src/text";

const HEADER = `A Sample Work\nPosted originally on the Archive of Our Own at http://archiveofourown.org/works/1.\nRating: Explicit\nCategory: M/M\nFandom: Teen Wolf (TV)\nRelationships: Derek Hale/Stiles Stilinski\nCharacters: Derek Hale, Stiles Stilinski\nStats: Published: 2020-01-01 Words: 500 Chapters: 2/2\n\nA Sample Work\nby someone\n`;
const between = (text: string) => text.match(new RegExp(`\\[\\[AO3_UNCERTAIN_NOTE_START\\]\\]([\\s\\S]*?)\\[\\[AO3_UNCERTAIN_NOTE_END\\]\\]`))?.[1] ?? "";

describe("paragraphs", () => {
  it("keeps one-paragraph-per-line text as separate paragraphs", () => {
    expect(splitParagraphs(`"Hi," Derek said.\n"Hey," Stiles said.\nThey kissed.`)).toHaveLength(3);
  });
  it("joins PDF lines that wrap mid-sentence", () => {
    expect(splitParagraphs("Derek pressed Stiles into the\nmattress and kissed him.\n\nLater they slept.")).toEqual([
      "Derek pressed Stiles into the mattress and kissed him.",
      "Later they slept.",
    ]);
  });
});

describe("AO3 notes in TXT/PDF", () => {
  it("keeps a chapter whose notes have no end-of-notes line, setting aside only the first block", () => {
    const work = extractFromText(`${HEADER}\nChapter 1\nChapter Notes\nThanks to my beta!\n\nDerek and Stiles were naked in bed. Derek kissed Stiles.\n\nDerek slid into Stiles slowly.\n\nChapter 2\nThey slept.`);
    expect(between(work.text)).toContain("Thanks to my beta!");
    expect(between(work.text)).not.toContain("Derek");
    const a = analyzeWithPatterns(work.text, work.meta, { quiet: true }).pairings[0];
    expect(a.anal.instances[0]).toMatchObject({ top: "Derek Hale", bottom: "Stiles Stilinski" });
  });

  it("drops a chapter summary followed by chapter notes", () => {
    const work = extractFromText(`${HEADER}\nChapter 1\nChapter Summary\nIn which Stiles fucks Derek.\nChapter Notes\nA note.\nSee the end of the chapter for more notes\n\nDerek and Stiles were naked in bed.\n\nDerek slid into Stiles slowly.\n\nChapter End Notes\nBye!`);
    const a = analyzeWithPatterns(work.text, work.meta, { quiet: true }).pairings[0];
    expect(a.anal.instances).toHaveLength(1);
    expect(a.anal.instances[0]).toMatchObject({ top: "Derek Hale" });
    expect(work.text).not.toContain("Bye!");
  });

  it("drops a one-shot's preface summary and notes", () => {
    const work = extractFromText(`${HEADER}\nSummary\nStiles fucks Derek, maybe.\n\nNotes\nWritten for a prompt.\nSee the end of the work for more notes\n\nDerek slid into Stiles slowly.\n\nNotes\nThanks for reading!`);
    expect(work.text).not.toMatch(/maybe|Written for|Thanks for reading|Rating:/);
    expect(work.text).toContain("Derek slid into Stiles slowly.");
  });

  it("marks only the first block of a one-shot's notes when there's no end-of-notes line", () => {
    const work = extractFromText(`${HEADER}\nNotes\nWritten for a prompt.\n\nDerek slid into Stiles slowly.`);
    expect(between(work.text)).toContain("Written for a prompt.");
    expect(work.text).toContain(`${UNCERTAIN_NOTE_END}\n`);
    expect(work.text.split(UNCERTAIN_NOTE_END)[1]).toContain("Derek slid into Stiles slowly.");
    expect(work.text).toContain(UNCERTAIN_NOTE_START);
  });
});

describe("AO3 HTML", () => {
  it("removes chapter summaries and notes but keeps chapter headings", () => {
    const html = `<html><body><div id="preface"><dl class="tags"><dt>Rating:</dt><dd>Explicit</dd><dt>Relationship:</dt><dd><a>Derek Hale/Stiles Stilinski</a></dd></dl></div>
      <div id="chapters" class="userstuff">
        <div class="meta group"><h2 class="heading">Chapter 1</h2><p>Chapter Summary</p><blockquote class="userstuff"><p>Stiles fucks Derek.</p></blockquote></div>
        <div class="userstuff"><p>Derek and Stiles were naked in bed.</p><p>Derek slid into Stiles slowly.</p></div>
        <div class="meta" id="endnotes1"><p>Chapter End Notes</p><blockquote class="userstuff"><p>Thanks!</p></blockquote></div>
        <div class="meta group"><h2 class="heading">Chapter 2</h2></div>
        <div class="userstuff"><p>They slept.</p></div>
      </div></body></html>`;
    const work = extractFromHtml(html);
    expect(work.text).toContain("Chapter 1");
    expect(work.text).toContain("Chapter 2");
    expect(work.text).not.toMatch(/Stiles fucks Derek|Thanks!|Chapter Summary/);
    const a = analyzeWithPatterns(work.text, { ...emptyMeta(), ...work.meta, categories: ["M/M"] }, { quiet: true }).pairings[0];
    expect(a.anal.instances[0]).toMatchObject({ top: "Derek Hale" });
  });
});
