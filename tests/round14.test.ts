import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

// Round 14: misreads found in a rugby AU (paraphrased). Dunk tops; Aerion is the "Englishman", Dunk the "Irishman".
const meta: Ao3Meta = {
  ...emptyMeta(),
  rating: "Explicit",
  categories: ["M/M"],
  relationships: ["Dunk/Aerion Targaryen"],
  characters: ["Dunk", "Aerion Targaryen"],
};
const SETUP = "Dunk and Aerion were tangled together on the bed, hard and aching.";
const run = (s: string, setup = SETUP) => analyzeWithPatterns(`${setup}\n\n${s}`, meta, { quiet: true }).pairings[0];

describe("not sex", () => {
  it("doesn't read accepting an apology as top talk", () => {
    const p = run("Aerion was annoyed.\n\n“Thanks for the… apology? Not sure it was a whole one, but I’ll take it,” Dunk said.", "Dunk and Aerion sat in the locker room after the match.");
    expect(p.anal.desires).toHaveLength(0);
  });
  it.each([
    "Dunk slid his mouth to Aerion's and kissed him hard.",
    "Dunk snapped his mouth shut.",
    "Aerion slammed their mouths together, teeth clacking.",
    "Aerion pushed Dunk's face away, laughing.",
  ])("doesn't read a kiss as a blowjob: %s", (s) => {
    expect(run(s).blowjob.instances).toHaveLength(0);
  });
  it("doesn't read a tongue in a kiss as anal", () => {
    expect(run("Aerion parted his lips, letting Dunk's tongue slip inside.").anal.instances).toHaveLength(0);
  });
  it("doesn't read stepping into a lift as anal", () => {
    expect(run("Dunk slipped in just before the doors closed behind them.").anal.instances).toHaveLength(0);
  });
  it("doesn't read a rugby tackle as lining up", () => {
    expect(run("Dunk lined himself up with the charging winger and flattened him.").anal.desires).toHaveLength(0);
  });
  it("doesn't read a face's cheeks as an ass", () => {
    expect(run("Aerion put both hands on Dunk's warm cheeks, cradling his head as they kissed.").anal.desires).toHaveLength(0);
  });
  it("doesn't read 'dream-like' as a dream", () => {
    const p = run("Aerion lay there in a dream-like haze as Dunk sucked him off.");
    expect(p.blowjob.instances[0]).toMatchObject({ top: "Aerion Targaryen", bottom: "Dunk" });
  });
});

describe("roles", () => {
  it("gives 'spreading his legs to stand between them' to the one standing", () => {
    const p = run("Dunk hoisted Aerion onto the counter, spreading his legs to stand between them.");
    expect(p.anal.desires[0]).toMatchObject({ who: "Dunk", role: "top" });
  });
  it("reads 'hummed around him, taking him to the root' as a blowjob, not anal", () => {
    const p = run("Aerion knelt and took Dunk's cock in his mouth.\n\nThe Englishman hummed around him, taking him all the way to the root again.");
    expect(p.anal.instances).toHaveLength(0);
    expect(p.blowjob.instances[0]).toMatchObject({ top: "Dunk", bottom: "Aerion Targaryen" });
  });
  it("doesn't read a bare 'Aerion took him' as Aerion topping", () => {
    expect(run("It was wet and loud, and Dunk's cock jerked as Aerion took him.").anal.instances).toHaveLength(0);
  });
  it("gives 'as Dunk's hands kneaded his arse as he pressed his tongue…' to Dunk", () => {
    const p = run("Aerion writhed against the bed as Dunk's hands kneaded his arse as he pressed his tongue past Aerion's rim.");
    expect(p.rimming.instances[0]).toMatchObject({ top: "Dunk", bottom: "Aerion Targaryen" });
  });
  it("reads 'maybe Dunk would… make him take him' as Dunk wanting to get sucked", () => {
    const p = run("Yeah, maybe Dunk would shut the scrumhalf up and fill his mouth, make him take him right to the back of his throat.");
    expect(p.blowjob.instances).toHaveLength(0);
    expect(p.blowjob.desires[0]).toMatchObject({ who: "Dunk", role: "top", kind: "hypothetical" });
  });
});
