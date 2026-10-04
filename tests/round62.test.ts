import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { type AuditHit, analyzeWithPatterns } from "../src/heuristic";

const M: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Original Work"], relationships: ["Miles McKinnon/Jordan Olivera"], characters: ["Miles McKinnon", "Jordan Olivera"], freeforms: [] };
const lead = "Miles and Jordan were in bed, naked and kissing, hard and aching. Jordan kissed Miles. Miles kissed Jordan back, moaning. ".repeat(8) + "\n\n";
// Greg is a bartender who keeps turning up as a subject but is not in the cast.
const greg = "Greg laughed at the bar. Greg wiped the counter. Greg smiled at everyone.\n\n";
const run = (t: string, pre = "") => { const hits: AuditHit[] = []; analyzeWithPatterns(pre + lead + t, M, { quiet: true, audit: (h) => hits.push(h) }); return hits; };
const said = (t: string) => run(t).filter((x) => x.via === "dialogue:anal sex").map((x) => x.kind);

describe("who is on the page", () => {
  it("a he after an outsider’s clause is the outsider", () => {
    const t = "Greg frowned at the screen. He pushed Miles down and fucked him hard.";
    expect(run(t, greg).filter((x) => x.kind === "act" && x.cat === "anal")).toHaveLength(0);
  });
  it("…but the same sentence with no outsider is read", () => {
    expect(run("Jordan frowned at the screen. He pushed Miles down and fucked him hard.", greg).some((x) => x.kind === "act" && x.cat === "anal")).toBe(true);
  });
  it("an outsider only mentioned in passing doesn’t take the pronoun", () => {
    expect(run("Jordan talked to Greg. He pushed Miles down and fucked him hard.", greg).some((x) => x.kind === "act" && x.cat === "anal")).toBe(true);
  });
  it("a name seen fewer than three times is not treated as an outsider", () => {
    expect(run("Greg frowned. He pushed Miles down and fucked him hard.").some((x) => x.kind === "act" && x.cat === "anal")).toBe(true);
  });
  it("‘the bartender’ and ‘the waiter’ are strangers", () => {
    expect(run("The bartender shrugged. He shoved Miles down and fucked him hard.").filter((x) => x.kind === "act" && x.cat === "anal")).toHaveLength(0);
  });
});

describe("wishes that are put off or wondered about are hypothetical", () => {
  const say = (s: string) => said(`“${s}” Jordan smirked.`);
  it.each([
    "Someday I want to breed you.",
    "Maybe next time I will fuck you properly.",
    "What if I want to fuck you right here?",
    "Once we are home I want to fuck you.",
    "I bet I will fuck you until you cry.",
    "One day I am going to fuck you against that wall.",
  ])("%s", (s) => expect(say(s)).toEqual(["hypothetical"]));
  it("a plain request is still said", () => {
    expect(say("I want to fuck you.")).toEqual(["said"]);
    expect(say("Fuck me, Jordan.")).not.toContain("hypothetical");
  });
});
