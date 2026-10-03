import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const meta: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Supernatural"], relationships: ["Castiel/Dean Winchester"], characters: ["Castiel", "Dean Winchester"] };
const base = ("Dean and Cas were in bed. Cas kissed Dean. Dean kissed Cas back. Dean was bare and aching, and Cas’s cock was hard. ").repeat(3) + "\n\n";
const run = (s: string) => analyzeWithPatterns(base + s, meta, { quiet: true }).pairings[0];

describe("Belonging is Longing is Now / à la carte audit", () => {
  it("pushing your hips back into someone is bottoming, not topping", () => {
    const p = run("Dean growls for him to get off as he pushes his hips back into the alpha.");
    expect(p.anal.instances).toHaveLength(0);
  });
  it("sinking back into someone is the same", () => {
    expect(run("Dean huffs and sinks back into Castiel, more pliant than before.").anal.instances).toHaveLength(0);
  });
  it("slipping Cas's cock inside yourself is Dean taking it", () => {
    const p = run("Dean reaches back and tries to slip Cas’s cock inside him.");
    expect(p.anal.instances[0]).toMatchObject({ top: "Castiel", bottom: "Dean Winchester" });
  });
  it("someone jackhammering Dean's own fingers inside him isn't Dean topping", () => {
    expect(run("Castiel practically jackhammers Dean’s own fingers inside him.").anal.instances.filter((i) => i.top === "Dean Winchester")).toHaveLength(0);
  });
  it("“hopes Cas decides to fuck him” is a wish: Dean wants to bottom", () => {
    const p = run("Dean hopes Cas decides to fuck him just as thoroughly as he did that time.");
    expect(p.anal.instances).toHaveLength(0);
    expect(p.anal.desires.some((d) => d.who.startsWith("Dean") && d.role === "bottom" && d.wants)).toBe(true);
  });
});
