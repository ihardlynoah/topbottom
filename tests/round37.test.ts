import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const meta: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Dracula (TV 2020)"], relationships: ["Dracula/Jack Seward"], characters: ["Dracula", "Jack Seward"] };
const base = ("Dracula and Jack were in bed, naked and kissing. The count kissed Jack. Jack kissed the count back, breathless. The count, Dracula, smiled. Vlad smiled at Jack. Jack’s cock was hard. ").repeat(2) + "\n\n";
const run = (s: string) => analyzeWithPatterns(base + s, meta, { quiet: true }).pairings[0];
const hints = (s: string) => { const p = run(s); return [...p.anal.desires, ...p.blowjob.desires]; };
const factors = (s: string, who: string) => [...run(s).vibe!.find((v) => v.name.startsWith(who))!.factors!, ...run(s).dynamic!.find((v) => v.name.startsWith(who))!.factors!];

describe("error-report fixes from Jack's Phone", () => {
  it("a speech beat ending in a period names the speaker of the next quote", () => {
    const d = hints("“Fuck me,” Jack said. His neck was licked and sucked. Vlad chuckled in his ear. “I’ll fuck you in front of the whole city.”");
    expect(d.some((x) => x.kind === "said" && x.who.startsWith("Dracula") && x.role === "top")).toBe(true);
    expect(d.some((x) => x.kind === "said" && x.who.startsWith("Jack") && x.role === "top")).toBe(false);
  });
  it("'wished to fuck the count would…' is not a wish to fuck", () => {
    expect(hints("He wished to fuck the count would at least let him know what time it was.")).toHaveLength(0);
  });
  it("parting your own legs with nobody else about is not spreading someone's legs", () => {
    const f = factors("He took the shoes from the box and parted his legs just a bit.", "Jack");
    expect(f.some((x) => /spreading someone/.test(x.what) && x.role === "top")).toBe(false);
  });
  it("a slender finger pressed inside of him is fingering", () => {
    const p = run("Jack’s hands were covered with lube and he nudged Dracula’s thighs open before slipping his hand beneath his balls and pressing one slender finger inside of him.");
    expect(p.anal.instances.some((i) => i.top === "Jack Seward" && i.bottom === "Dracula" && /fingering/.test(i.act))).toBe(true);
  });
  it("'thought Dracula might … and fuck him' is Jack being fucked", () => {
    const d = hints("He thought Dracula might break the door down at any moment and fuck him senseless over the sink.");
    expect(d.some((x) => x.who.startsWith("Jack") && x.role === "bottom")).toBe(true);
    expect(d.some((x) => x.who.startsWith("Jack") && x.role === "top")).toBe(false);
  });
  it("'sat next to Jack pulling him into his lap' is Dracula pulling", () => {
    const f = factors("Dracula shoved the boxes out of his way and sat next to Jack pulling him into his lap.", "Dracula").filter((x) => /lap/.test(x.what));
    expect(f.length).toBeGreaterThan(0);
    expect(f.every((x) => x.role === "top")).toBe(true);
  });
  it("offering your own cock isn't ogling one", () => {
    expect(factors("“Do you want this, Jackie blue eyes? Do you want this big cock inside of you?”", "Dracula").some((x) => /checking out a cock/.test(x.what))).toBe(false);
    expect(factors("“Nice cock,” Jack murmured, staring.", "Jack").some((x) => /checking out a cock/.test(x.what))).toBe(true);
  });
  it("surrendering wakefulness or submitting to a stethoscope is not submission", () => {
    expect(factors("He watched Jack blink slowly until he surrendered his wakefulness.", "Jack").some((x) => /submitting/.test(x.what))).toBe(false);
    expect(factors("Jack was grouchy as he submitted to the stethoscope and the blood pressure cuff.", "Jack").some((x) => /submitting/.test(x.what))).toBe(false);
  });
  it("submitting to a person still counts", () => {
    expect(factors("Jack submitted to Dracula completely, trembling.", "Jack").some((x) => /submitting/.test(x.what) && x.role === "bottom")).toBe(true);
  });
});
