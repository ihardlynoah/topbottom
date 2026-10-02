/**
 * Split text into paragraphs. Blank lines always separate paragraphs. A single line break separates them
 * too (many TXT files put one paragraph per line) unless the line stops mid-sentence, which is a soft wrap
 * from a PDF and is joined to the next line.
 */
export function splitParagraphs(text: string): string[] {
  const out: string[] = [];
  for (const block of text.replace(/\r\n?/g, "\n").split(/\n[\t ]*\n+/)) {
    let current = "";
    for (const raw of block.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      current = current ? `${current} ${line}` : line;
      if (/[.!?…"”’)\]*:—–-]\s*$/.test(line) || /^\[\[AO3_/.test(line)) {
        out.push(current);
        current = "";
      }
    }
    if (current) out.push(current);
  }
  return out;
}

const CHAPTER_HEADING = /^\s*chapter\s+(?:\d+|[ivxlc]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|[a-z]+teen|twenty[\w-]*|thirty[\w-]*)\b/i;
const CHAPTER_NOTES = /^\s*chapter\s+(?:notes|summary)\s*:?\s*$/i;
const END_NOTES = /^\s*(?:chapter\s+end\s+notes|end\s+notes|author(?:'s|’s)\s+notes?|notes)\s*:?\s*$/i;
const STORY_RESUMES = /^\s*see the end of (?:the|this) (?:chapter|work) for (?:more )?notes\s*\.?\s*$/i;
export const UNCERTAIN_NOTE_START = "[[AO3_UNCERTAIN_NOTE_START]]";
export const UNCERTAIN_NOTE_END = "[[AO3_UNCERTAIN_NOTE_END]]";

/**
 * A chapter's notes/summary with no "See the end of the chapter…" line after them: AO3 doesn't mark where
 * they stop. Only the first block (up to a blank line, or the first line if there are none) is set aside as
 * an unclear note; the rest stays story, since losing a whole chapter costs far more than a stray note line.
 */
function uncertainNote(lines: string[]): string[] {
  const start = lines.findIndex((l) => l.trim());
  if (start < 0) return [];
  const blank = lines.findIndex((l, i) => i > start && !l.trim());
  const end = blank > start ? blank : start + 1;
  return [UNCERTAIN_NOTE_START, ...lines.slice(start, end), UNCERTAIN_NOTE_END, ...lines.slice(end)];
}

/** Keep AO3 story chapters, excluding the preface and labeled author-note sections. */
export function ao3StoryText(text: string): string {
  let lines = text.replace(/\r\n?/g, "\n").split("\n");
  let firstChapter = lines.findIndex((line) => CHAPTER_HEADING.test(line));
  let synthetic = false;
  if (firstChapter < 0) {
    // A one-shot has no "Chapter 1": the story follows the Stats line, the title and byline, and any
    // "Summary"/"Notes" blocks, which are handled like a chapter's.
    const stats = lines.findIndex((l) => /^\s*Stats:|^\s*(?:Published|Words):/i.test(l));
    if (stats < 0) return text.trim();
    let i = stats + 1;
    while (i < lines.length && /^\s*(?:Published|Updated|Completed|Words|Chapters|Comments|Kudos|Bookmarks|Hits):/i.test(lines[i])) i++;
    const rest = lines.slice(i);
    const firstNonEmpty = rest.findIndex((l) => l.trim());
    const byline = rest.findIndex((l, j) => j <= firstNonEmpty + 3 && /^\s*by\s+\S/i.test(l));
    const body = rest.slice(byline >= 0 ? byline + 1 : firstNonEmpty + 1);
    // The preface's own "Summary" and "Notes" come first; a later "Notes" is the work's end notes.
    const resumes = body.findIndex((l) => STORY_RESUMES.test(l));
    const top = resumes >= 0 ? resumes : 40;
    let summary = false;
    let notes = false;
    for (let j = 0; j < Math.min(top, body.length); j++) {
      if (!summary && /^\s*summary\s*:?\s*$/i.test(body[j])) [body[j], summary] = ["Chapter Summary", true];
      else if (!notes && /^\s*notes\s*:?\s*$/i.test(body[j])) [body[j], notes] = ["Chapter Notes", true];
    }
    lines = ["Chapter 1", ...body];
    firstChapter = 0;
    synthetic = true;
  }

  const story: string[] = [];
  let inChapterNotes = false;
  let inEndNotes = false;
  let chapterNoteBuffer: string[] = [];
  for (const line of lines.slice(firstChapter)) {
    if (CHAPTER_HEADING.test(line)) {
      // If a PDF lacks AO3's explicit note/body separator, preserve ambiguous text
      // rather than dropping a whole chapter.
      if (inChapterNotes) story.push(...uncertainNote(chapterNoteBuffer));
      chapterNoteBuffer = [];
      inChapterNotes = false;
      inEndNotes = false;
      story.push(line.trim());
    } else if (inChapterNotes && STORY_RESUMES.test(line)) {
      chapterNoteBuffer = [];
      inChapterNotes = false;
    } else if (inChapterNotes && END_NOTES.test(line)) {
      story.push(...uncertainNote(chapterNoteBuffer));
      chapterNoteBuffer = [];
      inChapterNotes = false;
      inEndNotes = true;
    } else if (CHAPTER_NOTES.test(line)) {
      // "Chapter Summary" followed by "Chapter Notes": whatever came between was the summary, so it goes.
      inChapterNotes = true;
      chapterNoteBuffer = [];
    } else if (END_NOTES.test(line)) {
      inEndNotes = true;
    } else if (inChapterNotes) {
      chapterNoteBuffer.push(line);
    } else if (!inEndNotes) {
      story.push(line);
    }
  }
  if (inChapterNotes) story.push(...uncertainNote(chapterNoteBuffer));
  if (synthetic) story.shift();
  return story.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
