import { expect, it } from "vitest";
import { emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

it("handles a novel-length work quickly", () => {
  const filler = "Harry walked through the castle, thinking about the day and the long conversation he had with Draco over breakfast, which had gone better than expected.";
  const scene = "Draco kissed Harry hard. He pushed into him slowly, and Harry moaned. Later Harry sucked Draco off.";
  const paras: string[] = [];
  for (let i = 0; i < 6000; i++) paras.push(i % 200 === 0 ? `Chapter ${i / 200 + 1}` : i % 50 === 0 ? scene : filler);
  const text = paras.join("\n\n");
  const meta = { ...emptyMeta(), relationships: ["Draco Malfoy/Harry Potter"], categories: ["M/M"] };
  const t0 = performance.now();
  const a = analyzeWithPatterns(text, meta, { quiet: true });
  const ms = performance.now() - t0;
  console.log(`${text.split(/\s+/).length} words in ${Math.round(ms)} ms`);
  expect(a.pairings[0].anal.top).toBe("Draco Malfoy");
  expect(ms).toBeLessThan(8000);
});
