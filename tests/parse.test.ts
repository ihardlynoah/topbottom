import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { countWords, romanticPairings } from "../src/ao3";
import { excerptExplicit } from "../src/analyze";
import { extractFromHtml, extractFromText } from "../src/extract";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

describe("AO3 HTML download", () => {
  const work = extractFromHtml(fixture("ao3-sample.html"));

  it("reads fandom, relationships, and stats", () => {
    expect(work.meta.fandoms).toEqual(["Harry Potter - J. K. Rowling"]);
    expect(work.meta.relationships).toEqual([
      "Sirius Black/Remus Lupin",
      "James Potter & Sirius Black",
      "James Potter/Lily Evans Potter",
    ]);
    expect(romanticPairings(work.meta)).toEqual(["Sirius Black/Remus Lupin", "James Potter/Lily Evans Potter"]);
    expect(work.meta.words).toBe(12345);
    expect(work.meta.chapters).toBe("2/2");
    expect(work.meta.rating).toBe("Explicit");
    expect(work.meta.author).toBe("sample_author");
    expect(work.meta.title).toBe("A Sample Work");
    expect(work.meta.url).toBe("https://archiveofourown.org/works/123456");
  });

  it("counts only chapter text, not notes or summary", () => {
    expect(work.countedWords).toBe(12);
  });

  it("keeps paragraph breaks in the text sent for analysis", () => {
    expect(work.text).toContain("One two three four five.\n");
    expect(work.text).not.toContain("Afterword");
  });
});

describe("AO3 PDF-style text", () => {
  const work = extractFromText(fixture("ao3-pdf-text.txt"));

  it("reads plural labels and multiple fandoms", () => {
    expect(work.meta.fandoms).toEqual(["Teen Wolf (TV)", "Supernatural"]);
    expect(work.meta.relationships).toEqual(["Derek Hale/Stiles Stilinski", "Scott McCall & Stiles Stilinski"]);
    expect(work.meta.characters).toEqual(["Derek Hale", "Stiles Stilinski", "Scott McCall"]);
    expect(work.meta.words).toBe(45210);
    expect(work.meta.chapters).toBe("3/?");
    expect(work.meta.url).toBe("http://archiveofourown.org/works/987654");
  });

  it("handles labels flattened onto one line, as PDF extraction often does", () => {
    const flat = fixture("ao3-pdf-text.txt").replace(/\n/g, " ");
    const meta = extractFromText(flat).meta;
    expect(meta.fandoms).toEqual(["Teen Wolf (TV)", "Supernatural"]);
    expect(meta.relationships[0]).toBe("Derek Hale/Stiles Stilinski");
    expect(meta.words).toBe(45210);
  });

  it("returns empty metadata for non-AO3 text", () => {
    const work = extractFromText("Just a story.\n\nNothing else here.");
    expect(work.meta.fandoms).toEqual([]);
    expect(work.meta.words).toBeUndefined();
    expect(work.countedWords).toBe(6);
  });
});

describe("countWords", () => {
  it("ignores bare punctuation", () => {
    expect(countWords("Hello — world ... it's 3 o'clock")).toBe(5);
  });
});

describe("excerptExplicit", () => {
  it("keeps the opening and flagged scenes, dropping the rest", () => {
    const filler = Array.from({ length: 400 }, (_, i) => `Filler paragraph number ${i} about the weather and tea.`);
    filler[300] = "Chapter 9";
    filler[350] = "He slicked his fingers with lube.";
    const { text } = excerptExplicit(filler.join("\n\n"), 1);
    expect(text).toContain("Filler paragraph number 0 ");
    expect(text).toContain("Chapter 9");
    expect(text).toContain("lube");
    expect(text).toContain("Filler paragraph number 349 ");
    expect(text).not.toContain("Filler paragraph number 330 ");
    expect(text).toContain("[…]");
  });
});
