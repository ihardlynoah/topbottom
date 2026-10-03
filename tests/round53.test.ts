import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";
import { AddressBook, vocatives } from "../src/heuristic/address";

const M: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Stranger Things (TV 2016)"], relationships: ["Steve Harrington/Eddie Munson"], characters: ["Steve Harrington", "Eddie Munson"] };
const lead = "Steve and Eddie were on the couch, talking about the show. Steve laughed. Eddie smiled back. ".repeat(2);
const lines = (said: string, who: string, times: number) => Array.from({ length: times }, (_, i) => `“${said.replace("#", ["now", "later", "again", "first"][i % 4])}” ${who} said.`).join("\n\n");
const run = (body: string) => analyzeWithPatterns(`${lead}\n\n${body}`, M, { quiet: true }).pairings[0];
const dyn = (p: ReturnType<typeof run>, who: string) => p.dynamic!.find((d) => d.name.startsWith(who))!;

describe("terms of address", () => {
  it("finds a form of address at the start, the end or the middle of a line", () => {
    const no = () => false;
    expect(vocatives("Sir, yes sir.", no)).toContain("sir");
    expect(vocatives("Come here, baby.", no)).toContain("baby");
    expect(vocatives("Hey, babe, listen to me.", no)).toContain("babe");
    expect(vocatives("Thank you, your highness.", no)).toContain("your highness");
    expect(vocatives("I think so, though.", no)).toEqual([]);
    expect(vocatives("Steve, come here.", (w) => w === "steve")).toEqual([]);
  });
  it("only counts a term used three times or more, and says who it is for", () => {
    const steve = { name: "Steve" } as never, eddie = { name: "Eddie" } as never;
    const b = new AddressBook();
    for (let i = 0; i < 2; i++) b.record(steve, eddie, "Come here, half man.", i, "x", () => false);
    expect(b.listenerOf("Sure, half man.", () => false)).toBeUndefined();
    b.record(steve, eddie, "Come here, half man.", 3, "x", () => false);
    expect(b.listenerOf("Sure, half man.", () => false)).toBe(eddie);
    expect(b.nicknames()[0]).toMatchObject({ speaker: "Steve", listener: "Eddie", term: "half man", count: 3 });
  });
  it("a title only one of them uses makes that one the follower", () => {
    const p = run(lines("Yes, sir, #.", "Eddie", 4) + "\n\nSteve nodded.");
    expect(["Follows", "Leans following"]).toContain(dyn(p, "Eddie").label);
    expect(dyn(p, "Eddie").factors!.some((f) => /addressing Steve as “sir”/.test(f.what))).toBe(true);
    expect(["Follows", "Leans following"]).not.toContain(dyn(p, "Steve").label);
  });
  it("an endearment only one of them uses is a cue for caring, leading", () => {
    const p = run(lines("Come here, baby, #.", "Steve", 4));
    expect(dyn(p, "Steve").factors!.some((f) => /pet name “baby”/.test(f.what))).toBe(true);
  });
  it("an endearment they both use says nothing", () => {
    const p = run(lines("Come here, baby, #.", "Steve", 4) + "\n\n" + lines("Okay, baby, #.", "Eddie", 4));
    expect(dyn(p, "Steve").factors!.some((f) => /pet name/.test(f.what))).toBe(false);
    expect(dyn(p, "Eddie").factors!.some((f) => /pet name/.test(f.what))).toBe(false);
  });
  it("an untagged line that uses the pair’s nickname for Eddie was said by Steve", () => {
    const p = run(lines("Get over here, half man, #.", "Steve", 3).replace(/said\./g, "said, naked and hard in the bed.") + "\n\n“Fuck me, half man.”");
    expect(p.anal.desires.some((d) => d.who.startsWith("Steve") && d.role === "bottom" && d.kind === "said")).toBe(true);
  });
});
