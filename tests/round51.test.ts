import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { type AuditHit, analyzeWithPatterns } from "../src/heuristic";

// Fixes from the pattern audit: each line below was a clear misread found in the audit samples (paraphrased).
const M: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Stranger Things (TV 2016)"], relationships: ["Steve Harrington/Eddie Munson"], characters: ["Steve Harrington", "Eddie Munson"], freeforms: ["Alpha/Beta/Omega Dynamics"] };
const lead = "Steve and Eddie were in bed, naked and kissing, hard and aching. Steve kissed Eddie. Eddie kissed Steve back, moaning. ".repeat(2) + "\n\n";
const hits = (text: string): AuditHit[] => { const out: AuditHit[] = []; analyzeWithPatterns(lead + text, M, { quiet: true, audit: (h) => out.push(h) }); return out; };
const via = (text: string, id: string) => hits(text).filter((h) => h.via.replace(/~elided$/, "") === id);

describe("pattern audit fixes", () => {
  it("lowering the head or keeping the eyes on someone is not an omega’s deferential gaze", () => {
    expect(via("Eddie kept his eyes on the clock. Steve lowered his head and took Eddie into his mouth.", "abo-lower-gaze")).toHaveLength(0);
    expect(via("Eddie lowered his eyes when Steve walked in.", "abo-lower-gaze").length).toBeGreaterThan(0);
  });
  it("tilting your own head back is not tilting someone’s face up", () => {
    expect(via("Eddie tilted his head back and laughed.", "dom-tilt")).toHaveLength(0);
    expect(via("Steve cupped Eddie’s jaw and tilted his head back.", "dom-tilt").length).toBeGreaterThan(0);
  });
  it("falling to your knees after a shove is not kneeling for someone", () => {
    expect(via("Billy shoved Eddie so hard that he fell to his knees in front of Steve.", "sinks-to-floor")).toHaveLength(0);
    expect(via("Eddie dropped to his knees and looked up at Steve through his lashes. Steve groaned, his cock hard.", "sinks-to-floor").length).toBeGreaterThan(0);
  });
  it("taking charge of the menu is not taking control of a partner", () => {
    expect(via("Steve took charge of the drink menu like it was sacred.", "dom-take-control")).toHaveLength(0);
    expect(via("Steve took control and pushed Eddie back against the bed.", "dom-take-control").length).toBeGreaterThan(0);
  });
  it("holding him close in the middle of an act is not aftercare", () => {
    expect(via("Steve held Eddie close and licked into him.", "aftercare-held")).toHaveLength(0);
    expect(via("Afterwards Steve held Eddie close to his chest.", "aftercare-held").length).toBeGreaterThan(0);
  });
  it("fumbling with an object is not being flustered, fumbling for words is", () => {
    expect(via("Eddie fumbled with his bandana.", "flustered-verb")).toHaveLength(0);
    expect(via("Steve grinned at Eddie. Eddie fumbled for words.", "flustered-verb").length).toBeGreaterThan(0);
  });
  it("‘topped like how he bottomed’ and ‘bottom arm’ are not acts; ‘top grades’ is not topping", () => {
    expect(via("He topped a lot like how Eddie bottomed, full of energy.", "topped")).toHaveLength(0);
    expect(via("Steve was wrapped around him, bottom arm under Eddie’s head.", "bottomed-for")).toHaveLength(0);
    expect(via("Steve got top grades and showed off.", "topped")).toHaveLength(0);
  });
  it("‘liked being taken care of’ is not a stated bottom preference", () => {
    expect(via("Steve said he liked being taken care of.", "stated-bottom-pref")).toHaveLength(0);
    expect(via("Steve liked being fucked. He loved being taken hard by Eddie.", "stated-bottom-pref").length).toBeGreaterThan(0);
  });
  it("going still is not melting", () => {
    expect(via("Eddie went still underneath him.", "sub-melt")).toHaveLength(0);
    expect(via("Eddie went pliant underneath him.", "sub-melt").length).toBeGreaterThan(0);
  });
});
