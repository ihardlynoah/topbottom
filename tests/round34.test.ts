import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";
import { FLAG_REASONS, buildReport } from "../src/report";

const meta: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Dracula (TV 2020)"], relationships: ["Dracula/Jack Seward"], characters: ["Dracula", "Jack Seward"] };
const base = ("Dracula and Jack were in bed, naked and kissing. The count kissed Jack. Jack kissed the count back, breathless. The count, Dracula, smiled. Dracula, Jack's husband, smiled. Jack was somebody's husband. ").repeat(3);
const run = (s: string, b = base) => analyzeWithPatterns(b + s, meta, { quiet: true }).pairings[0];

describe("relative epithets: his husband is the partner of whoever 'his' is", () => {
  it("Jack's husband's cock in Jack's ass is Dracula topping", () => {
    const p = run("When Jack had no place left to hide and his husband's cock was buried in his ass, Jack did not beg.");
    expect(p.anal.instances[0]).toMatchObject({ top: "Dracula", bottom: "Jack Seward" });
  });
});

describe("Jack's Phone false positives", () => {
  it("sounds around him are a blowjob, not anal sex", () => {
    const p = run("Dracula made wet, filthy sounds around him and Jack was both horrified and thrilled as he emptied into him.");
    expect(p.anal.instances).toHaveLength(0);
    expect(p.blowjob.instances[0]).toMatchObject({ top: "Jack Seward", bottom: "Dracula" });
  });
  it("'while he was impaled' after 'permitted Jack to' is Jack", () => {
    const p = run("The count permitted Jack to wriggle beneath him, humping the bed and squirming while he was impaled.");
    expect(p.anal.instances[0]).toMatchObject({ top: "Dracula", bottom: "Jack Seward" });
  });
  it("a bare 'rode him' against many clear scenes the other way is a low-confidence scene that doesn't make a switch", () => {
    const firm = Array.from({ length: 4 }, (_, i) => `Dracula fucked Jack hard on the bed, pounding into him, number ${i}.\n\n`).join("");
    const p = run("Jack's orgasm was glorious and Dracula rode him all the way through it.", `${base}\n\n${firm}`);
    const odd = p.anal.instances.find((i) => i.top === "Jack Seward");
    expect(odd?.confidence ?? 0).toBeLessThan(0.4);
    expect(p.anal.verdict).toBe("one_way");
    expect(p.anal.top).toBe("Dracula");
  });
});

describe("scene confidence", () => {
  it("every scene carries a confidence and the reasons for it", () => {
    const p = run("Dracula fucked Jack hard on the bed, pounding into him.");
    for (const i of p.anal.instances) {
      expect(i.confidence).toBeGreaterThan(0);
      expect(i.confidence).toBeLessThanOrEqual(1);
      expect(i.reasons?.length).toBeGreaterThan(0);
      expect(i.context).toBeTruthy();
    }
  });
  it("a scene read by name with several agreeing sentences is surer than a lone pronoun one", () => {
    const strong = run("Dracula fucked Jack hard. Dracula pounded into Jack. Dracula's cock was buried in Jack's ass.").anal.instances[0];
    const weak = run("The count permitted Jack to wriggle beneath him while he was impaled.").anal.instances[0];
    expect(strong.confidence!).toBeGreaterThan(weak.confidence!);
  });
});

describe("noble and medieval epithets", () => {
  const m2: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], relationships: ["Aldric/Tomas"], characters: ["Aldric", "Tomas"] };
  const b2 = ("Aldric, the baron, kissed Tomas, the squire. The baron smiled at his squire. Tomas, the squire, blushed. ").repeat(3);
  for (const l of [
    "The baron fucked the squire into the mattress, pounding into him.",
    "The baron's cock was buried in the squire's ass.",
    "The lord fucked the squire hard, thrusting into him.",
  ]) it(l, () => {
    const p = analyzeWithPatterns(b2 + l, m2, { quiet: true }).pairings[0];
    expect(p.anal.instances[0]).toMatchObject({ top: "Aldric", bottom: "Tomas" });
  });
});

describe("mistake report", () => {
  it("lists the flagged scene, the ticked reasons and the explanation", () => {
    const text = buildReport({
      title: "Test fic", relationships: ["Dracula/Jack Seward"], source: "patterns", summaries: ["Dracula/Jack Seward · anal: switch"],
      flags: [{ id: "a", pairing: "Dracula/Jack Seward", card: "anal", top: "Jack Seward", bottom: "Dracula", act: "anal sex", basis: "pronoun", confidence: 0.4, confidenceReasons: ["one sentence"], evidence: "Dracula rode him all the way through it.", context: "…around it…", reasons: ["swapped", "wrong_top"], note: "Dracula is on top here" }],
      missed: [{ passage: "He pressed in slowly.", note: "anal, Dracula tops" }], general: "Vibe seems off",
    });
    expect(text).toContain("Dracula rode him all the way through it.");
    expect(text).toContain(FLAG_REASONS.find((r) => r.key === "swapped")!.label);
    expect(text).toContain("Wrong character is flagged as topping");
    expect(text).toContain("Dracula is on top here");
    expect(text).toContain("scene confidence 40%");
    expect(text).toContain("He pressed in slowly.");
    expect(text).toContain("Vibe seems off");
  });
});
