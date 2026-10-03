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

describe("pattern audit fixes, batch 2", () => {
  it("penetrating with the tongue is not anal sex", () => {
    expect(via("Steve was very loud when Eddie penetrated his ass with his tongue.", "enter")).toHaveLength(0);
  });
  it("a hand cupping a caged cock is not a handjob", () => {
    expect(via("Steve’s hand settled on Eddie’s cock, cupping it gently in its cage.", "hj-hand-subject")).toHaveLength(0);
    expect(via("Steve’s hand wrapped around Eddie’s cock and he started stroking.", "hj-hand-subject").length).toBeGreaterThan(0);
  });
  it("working a plug out of someone is not using a toy on yourself", () => {
    expect(via("Steve slowly worked the plug out of Eddie while Eddie moaned.", "self-toy")).toHaveLength(0);
  });
  it("kissing an asscheek is not licking the hole", () => {
    expect(via("Steve kissed Eddie’s asscheek and bit down just to hear him yelp.", "licked-hole")).toHaveLength(0);
  });
  it("‘his eyes were glued to Eddie’s cock’ is not Eddie looking at his own cock", () => {
    const h = hits("Steve laughed and turned away. Eddie said nothing. His eyes were glued to Eddie’s cock.").filter((x) => x.via.startsWith("eyes-on-crotch"));
    expect(h.every((x) => x.a.startsWith("Steve"))).toBe(true);
  });
});

describe("pattern audit fixes, batch 3", () => {
  it("digging fingers into ass cheeks is not fingering", () => {
    expect(via("Steve dug his fingers into Eddie’s ass cheeks, massaging them.", "fingers-into")).toHaveLength(0);
    expect(via("Steve pushed two fingers into Eddie’s ass.", "fingers-into").length).toBeGreaterThan(0);
  });
  it("tilting your own chin is not gripping someone", () => {
    expect(via("Eddie enunciated clearly, tilting his chin.", "dom-grip")).toHaveLength(0);
  });
});
