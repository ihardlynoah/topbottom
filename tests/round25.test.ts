import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const ff: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["F/F"], fandoms: ["Avatar: Legend of Korra"], relationships: ["Korra/Asami Sato"], characters: ["Korra", "Asami Sato"] };
const filler = Array.from({ length: 10 }, (_, i) => `Korra grinned at Asami across the garage, number ${i}.`).join("\n");

describe("implied sex in an Explicit F/F or M/M work", () => {
  const vague = [
    "Asami arched off the bed, pleasure flaring low in her belly, a small moan slipping from her lips as Korra's hips pressed close.",
    "She was breathless and trembling, sweat on her skin, the sheets twisted in her fists as the orgasm broke over her.",
  ].join("\n\n");
  it("points out passages that read like sex scenes when nothing explicit was recognized", () => {
    const a = analyzeWithPatterns(`${filler}\n\n${vague}`, ff, { quiet: true });
    expect(String(a.notes)).toMatch(/rated Explicit and tagged only F\/F/);
    expect(String(a.notes)).toMatch(/orgasm/);
  });
  it("stays quiet for a General Audiences work", () => {
    const a = analyzeWithPatterns(`${filler}\n\n${vague}`, { ...ff, rating: "General Audiences" }, { quiet: true });
    expect(String(a.notes)).not.toMatch(/tagged only/);
  });
  it("stays quiet when another category is present", () => {
    const a = analyzeWithPatterns(`${filler}\n\n${vague}`, { ...ff, categories: ["F/F", "F/M"] }, { quiet: true });
    expect(String(a.notes)).not.toMatch(/tagged only/);
  });
  it("reads 'looked up from her spot between her legs' as oral", () => {
    const a = analyzeWithPatterns(`${filler}\n\nAsami lay back, naked. Korra suddenly looked up from her spot between her legs, eyes wide.`, ff, { quiet: true });
    expect(a.pairings[0].cunnilingus.instances.length).toBeGreaterThan(0);
  });
});

describe("more fandoms", () => {
  it("knows Bakugou is Katsuki in a My Hero Academia fic", () => {
    const m: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Boku no Hero Academia | My Hero Academia"], relationships: ["Bakugou Katsuki/Midoriya Izuku"], characters: ["Bakugou Katsuki", "Midoriya Izuku"] };
    const t = Array.from({ length: 10 }, () => "Kacchan glared at Deku. Deku smiled back.").join("\n");
    const a = analyzeWithPatterns(`${t}\n\nKacchan pushed Deku onto the bed and fucked him slowly.`, m, { quiet: true });
    expect(a.pairings[0].anal.instances.length).toBeGreaterThan(0);
  });
});
