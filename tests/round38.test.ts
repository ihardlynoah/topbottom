import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const meta = (freeforms: string[] = []): Ao3Meta => ({ ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Stranger Things (TV 2016)"], relationships: ["Steve Harrington/Eddie Munson"], characters: ["Steve Harrington", "Eddie Munson"], freeforms });
const base = ("Steve and Eddie were in bed, naked and kissing. Eddie kissed Steve. Steve kissed Eddie back, breathless. Eddie smiled at Steve. ").repeat(2) + "\n\n";
const run = (s: string, tags: string[] = []) => analyzeWithPatterns(base + s, meta(tags), { quiet: true }).pairings[0];
const factors = (s: string, who: string, tags: string[] = []) => run(s, tags).vibe!.find((v) => v.name.startsWith(who))!.factors!;
const hints = (s: string) => { const p = run(s); return [...p.anal.desires, ...p.blowjob.desires, ...p.rimming.desires]; };

describe("who said it: turn-taking and tags", () => {
  it("a tag right after the previous quote doesn't name the speaker of the next line, so no pet-name credit is given on a guess", () => {
    const text = "Steve clung to Eddie’s back, gasping, desperate for more. “Eddie,” He moaned raggedly. “Open your eyes for me, pretty boy, look at me.” Steve obeyed, putty under the praise.";
    expect(factors(text, "Steve", ["Praise Kink"]).some((x) => /good boy/.test(x.what) && x.role === "top" && !x.fromOther)).toBe(false);
  });
  it("“Good boy,” He says and Steve moans: the he isn't Steve", () => {
    const f = factors("He wrapped a hand around Steve’s throat. “Good boy,” He says and Steve moans, clutching at Eddie’s shoulders.", "Steve", ["Praise Kink"]);
    expect(f.some((x) => /good boy/.test(x.what) && x.role === "top" && !x.fromOther)).toBe(false);
  });
  it("a guessed speaker doesn't earn pet-name credit", () => {
    const f = factors("“Pretty boy,” was all anyone said.\n\n“Good boy.”", "Steve");
    expect(f.some((x) => /good boy/.test(x.what) && !x.fromOther)).toBe(false);
  });
});

describe("“need your mouth on me” is a blowjob request, not rimming", () => {
  it("Please suck me off, Eddie, need your mouth on me", () => {
    const p = run("Eddie kissed his thigh. “Please suck me off, Eddie, please, need your mouth on me.” He moaned.");
    expect(p.rimming.desires).toHaveLength(0);
    expect(p.blowjob.desires.some((d) => d.who.startsWith("Steve") && d.role === "top")).toBe(true);
  });
  it("tongue on my hole is still rimming", () => {
    const d = hints("Steve grabbed the sheets. “Need your tongue on my ass, Eddie,” Steve begged.");
    expect(d.some((x) => x.act === "rimming" && x.who.startsWith("Steve") && x.role === "bottom")).toBe(true);
  });
});

describe("head on chest, laps and holding are more careful", () => {
  const t6 = (l: string, who: string) => factors(l, who).filter((f) => f.tier === 6 && /chest|lap|held/.test(f.what));
  it("his head lolling onto his own chest is nothing", () => expect(t6("Unconscious in the chair, his head lolls forwards onto his chest, his hair hanging in front of his face.", "Steve")).toHaveLength(0));
  it("shaking your head against someone's chest isn't resting it", () => expect(t6("“You wanna talk about it?” He asks gently and Steve shakes his head against his chest.", "Steve")).toHaveLength(0));
  it("sitting back on someone's thighs mid-kiss isn't climbing into their lap", () => expect(t6("He groans and Eddie pulls away, sitting back on Steve’s thighs.", "Eddie")).toHaveLength(0));
  it("climbing into a lap still counts, softly", () => expect(t6("Steve climbed into Eddie’s lap and kissed him slowly.", "Steve").some((f) => f.role === "bottom")).toBe(true));
  it("a wish to pull someone closer isn't being held afterwards", () => expect(t6("Steve has the urge to hook his legs around his waist and pull him closer.", "Eddie")).toHaveLength(0));
});
