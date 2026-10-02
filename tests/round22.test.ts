import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

// Round 22: a Stranger Things teachers AU, a Supernatural Western and two 9-1-1 fics (paraphrased).
const meta: Ao3Meta = {
  ...emptyMeta(),
  rating: "Explicit",
  categories: ["M/M"],
  fandoms: ["9-1-1 (TV)"],
  relationships: ["Evan \"Buck\" Buckley/Eddie Diaz (9-1-1 TV)"],
  characters: ["Evan \"Buck\" Buckley", "Eddie Diaz (9-1-1 TV)", "Maddie Buckley", "Shannon Diaz"],
};
const SET = "Buck and Eddie were in Eddie's bed, naked, and Buck kissed Eddie. Eddie kissed Buck back, breathless.";
const filler = Array.from({ length: 12 }, (_, i) => `Buck smiled at Eddie across the firehouse, number ${i}. Maddie laughed. Shannon was gone.`).join("\n");
const run = (s: string, m: Ao3Meta = meta) => analyzeWithPatterns(`${filler}\n\n${SET}\n\n${s}`, m, { quiet: true }).pairings[0];

describe("everyday phrases that aren't sex", () => {
  it("doesn't take shadows swallowing him whole as a blowjob", () => {
    const p = run("Buck hadn't felt like the shadows in the hall were going to swallow him whole. Eddie held him.");
    expect(p.blowjob.instances).toHaveLength(0);
  });
  it("doesn't take 'the skin he had slipped in' as penetration", () => {
    const p = run("It had reminded Buck too much of the skin he had slipped in when he was eighteen.");
    expect(p.anal.instances).toHaveLength(0);
  });
  it("doesn't take whistling with fingers in the mouth as a bottom hint", () => {
    const p = run("Eddie stuck his fingers in his mouth and whistled loudly.");
    expect(p.blowjob.desires.some((d) => d.kind === "fingers")).toBe(false);
  });
  it("doesn't take a hand behind someone's knee as an ass grab", () => {
    const p = run("Eddie cupped his hand behind Buck’s knee and gave him a quick squeeze.");
    expect(p.anal.desires).toHaveLength(0);
  });
  it("doesn't take presenting himself well as presenting", () => {
    const p = run("Buck liked to present himself well but he thought more about his health.");
    expect(p.anal.desires).toHaveLength(0);
  });
  it("reads licking into someone's mouth during a kiss as a kiss", () => {
    const p = run("Eddie held him in place and worked his mouth open, tongue and lips and spit, as he licked into Buck.");
    expect(p.rimming.instances).toHaveLength(0);
  });
});

describe("who does what", () => {
  it("treats a sentence that opens on 'Wants to…' as wanting", () => {
    const p = run("It made Buck's mouth water. Wants to take Eddie to the back of his throat while Buck chokes on his cock.");
    expect(p.blowjob.instances).toHaveLength(0);
    expect(p.blowjob.desires.some((d) => /Buck/.test(d.who) && d.role === "bottom" && d.kind === "wanted")).toBe(true);
  });
  it("treats 'liked to picture Buck … bouncing on his cock' as a fantasy", () => {
    const p = run("Eddie liked to picture Buck on top of him, straddling him and bouncing on his cock.");
    expect(p.anal.instances).toHaveLength(0);
  });
  it("makes 'he' someone other than the person named plainly after it", () => {
    const p = run("Buck lined himself up. Eddie’s mouth opened in a little gasp, and then he was sliding in, swallowed by the tight heat of Eddie.");
    expect(p.anal.instances[0]).toMatchObject({ top: expect.stringMatching(/Buck/), bottom: expect.stringMatching(/Eddie/) });
  });
  it("gives 'of Buck fucking his finger into him' to Buck", () => {
    const p = run("“Another,” Eddie demanded, after a few minutes of Buck fucking his finger lazily into him.");
    expect(p.anal.instances[0]).toMatchObject({ top: expect.stringMatching(/Buck/), bottom: expect.stringMatching(/Eddie/) });
  });
});

describe("women in an M/M work", () => {
  const rel = { ...meta, relationships: ["Eddie Diaz/Shannon Diaz"] };
  const one = `${filler}\n\nEddie and Shannon were in bed, naked, and Shannon kissed Eddie. Shannon rode him, and he braced his feet to thrust up into her.`;
  const clear = `${filler}\n\nEddie and Shannon were in bed, naked. Eddie slid into Shannon and fucked her slowly. Later, Eddie pushed into Shannon again.`;
  const shannon = (m: Ao3Meta, t: string) => analyzeWithPatterns(t, m, { quiet: true }).pairings.find((x) => /Shannon/.test(x.pairing));
  it("drops a single pronoun-only reading that involves a woman when the work is tagged only M/M", () => {
    const p = shannon(rel, one);
    expect(!p || (p.anal.instances.length === 0 && p.vaginal.instances.length === 0)).toBe(true);
  });
  it("keeps a clear scene with a woman (both named, or seen more than once) as vaginal", () => {
    const p = shannon(rel, clear)!;
    expect(p.anal.instances).toHaveLength(0);
    expect(p.vaginal.instances.length).toBeGreaterThan(0);
  });
  it("keeps the single reading too once another category (F/M) removes the presumption", () => {
    const p = shannon({ ...rel, categories: ["M/M", "F/M"] }, one)!;
    expect(p.anal.instances).toHaveLength(0);
    expect(p.vaginal.instances.length).toBeGreaterThan(0);
  });
});

describe("women-only works", () => {
  const ff: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["F/F"], fandoms: ["9-1-1 (TV)"], relationships: ["Maddie Buckley/Athena Grant"], characters: ["Maddie Buckley", "Athena Grant", "Bobby Nash"] };
  it("keeps a clear scene with a man in an F/F work (both named)", () => {
    const t = `${filler}\n\nMaddie and Athena were in bed. Maddie licked Athena's pussy until she came. Bobby Nash slid his cock into Athena’s pussy and fucked her.`;
    const a = analyzeWithPatterns(t, ff, { quiet: true });
    expect(a.pairings.some((p) => /Bobby/.test(p.pairing) && p.vaginal.instances.length > 0)).toBe(true);
  });
});
