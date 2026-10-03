import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { type AuditHit, analyzeWithPatterns } from "../src/heuristic";

const M: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Stranger Things (TV 2016)"], relationships: ["Steve Harrington/Eddie Munson"], characters: ["Steve Harrington", "Eddie Munson"] };
const lead = "Steve and Eddie were in bed, naked and kissing, hard and aching. Steve kissed Eddie. Eddie kissed Steve back, moaning. ".repeat(2) + "\n\n";
const run = (t: string, withLead = true) => {
  const hits: AuditHit[] = [];
  let dbg!: { texts: { para: number; from?: string }[]; pov: (string | undefined)[] };
  const r = analyzeWithPatterns((withLead ? lead : "") + t, M, { quiet: true, audit: (h) => hits.push(h), debug: (d) => (dbg = d as never) });
  return { r, p: r.pairings[0], hits, dbg };
};

describe("text logs, present-tense texting, and a few act-reading fixes", () => {
  it("reads a bracketed-sender log as a text thread, with the sender named", () => {
    const body = ["Steve and Eddie had been apart all week.", "[Steve] pick up the phone", "[Eddie] i am at work", "[Steve] it is an emergency", "[Eddie] you said that last time", "[Steve] and i meant it"].join("\n\n");
    const { dbg } = run(body);
    const senders = dbg.texts.map((t) => t.from);
    expect(senders).toEqual(["Steve Harrington", "Eddie Munson", "Steve Harrington", "Eddie Munson", "Steve Harrington"]);
  });
  it("does not treat a lone bracketed word or a media tag as a chat", () => {
    const { dbg } = run("Steve opened the door.\n\n[Chapter notes] some words here\n\n[photo]\n\nEddie waved.");
    expect(dbg.texts).toHaveLength(0);
  });
  it("catches present-tense narrated texting, with ‘he’ as the sender", () => {
    const { dbg } = run("You are not buying me a house, he texts Eddie back.\n\nHis phone buzzes with a text. It’s Eddie. Come over later.\n\nSteve cheerfully texts in return.");
    expect(dbg.texts.map((t) => t.from)).toEqual(["Steve Harrington", "Eddie Munson", "Steve Harrington"]);
  });
  it("‘imagined this, and the real thing is more’ is not a fantasy paragraph", () => {
    const { p } = run("Eddie shuddered. All the times Eddie had imagined this, and the real thing was so much more. Steve’s tongue twisted and curled, thickening inside him until it almost burned.");
    expect(p.rimming.instances.map((i) => `${i.top}>${i.bottom}`)).toEqual(["Steve Harrington>Eddie Munson"]);
  });
  it("a tongue paragraph is not also scored as penetration", () => {
    const { p } = run("Steve slid his tongue into Eddie, slow and wet.\n\nSteve sinks into him with all the ease in the world, tongue twisting, and Eddie arches.");
    expect(p.anal.instances.filter((i) => i.act !== "fingering")).toHaveLength(0);
  });
  it("‘snapped in response’ is not pushing in", () => {
    expect(run("If someone slammed into Steve, Steve snapped in response.").hits.filter((h) => h.via.startsWith("pushed-in"))).toHaveLength(0);
  });
  it("sex decades from now is no scene", () => {
    expect(run("Steve means in sixty years, when Eddie rides him so hard they both die.").p.anal.instances).toHaveLength(0);
  });
});
