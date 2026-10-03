import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const M: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Hockey RPF"], relationships: ["Shane Hollander/Ilya Rozanov"], characters: ["Shane Hollander", "Ilya Rozanov"], freeforms: ["Texting", "Sexting"] };
const lead = "Shane and Ilya were at the arena, talking. Shane laughed. Ilya smiled back. ".repeat(2) + "\n\n";
const CHAT = [
  "Shane’s phone buzzed on the couch cushion.",
  "03/11/10 20:54",
  "Ilya: would you let me fuck you?",
  "Shane stared at the screen, then typed out a reply.",
  "Shane: Is that what you want?",
  "Ilya: yes",
  "Ilya: i want to fuck you",
  "Shane: Yes.",
].join("\n\n");
const run = (t: string, m: Ao3Meta = M) => analyzeWithPatterns(lead + t, m, { quiet: true });

describe("text messages", () => {
  it("chat lines are recognized, with who sent and received them", () => {
    const t = run(CHAT).texting!;
    expect(t.occurs).toBe(true);
    expect(t.chat).toBe(5);
    expect(t.pairs.find((p) => p.from === "Ilya Rozanov")?.to).toBe("Shane Hollander");
    expect(t.pairs.find((p) => p.from === "Shane Hollander")?.to).toBe("Ilya Rozanov");
  });
  it("sexual messages are counted as sexting", () => {
    expect(run(CHAT).texting!.sexual).toBeGreaterThanOrEqual(2);
  });
  it("a contact name that isn’t the character’s becomes the other person in the pair", () => {
    const t = run(CHAT.replace(/Ilya:/g, "Lily:")).texting!;
    expect(t.pairs.some((p) => p.from === "Ilya Rozanov" && p.to === "Shane Hollander")).toBe(true);
  });
  it("narrated texting is recognized without any chat lines", () => {
    const t = run("Shane texted Ilya a picture of the rink. Ilya sent a message back a minute later.").texting!;
    expect(t.narrated).toBeGreaterThanOrEqual(2);
    expect(t.chat).toBe(0);
  });
  it("a chat line is read as dialogue from its sender (a texted wish to fuck is a top wish for the sender)", () => {
    const p = run(CHAT).pairings[0];
    expect(p.anal.desires.some((d) => d.who.startsWith("Ilya") && d.role === "top")).toBe(true);
  });
  it("Texting and Sexting tags are checked against the text", () => {
    const c = run(CHAT).tagCheck!;
    expect(c.find((x) => x.tag === "Texting")?.status).toBe("supported");
    expect(c.find((x) => x.tag === "Sexting")?.status).toBe("supported");
    const none = run("Shane kissed Ilya.").tagCheck!;
    expect(none.find((x) => x.tag === "Texting")?.status).toBe("not_found");
  });
  it("ordinary prose with a colon is not a chat", () => {
    expect(run("Note: this is a story.\n\nWarning: it is long.\n\nShane laughed.").texting!.occurs).toBe(false);
  });
  it("a contact name is matched to the sender even when the same run also has the character’s own name", () => {
    const chat = ["Ilya: who is this", "Unknown Number: Fuck off.", "Ilya: no, you are jane", "Jane: Lily, obviously.", "Shane’s phone buzzed again.", "Lily: i want to fuck you", "Shane: Really?"].join("\n\n");
    const t = run(chat).texting!;
    expect(t.pairs.find((p) => p.from === "Ilya Rozanov")?.count).toBeGreaterThanOrEqual(2);
  });
  it("swearing in a text is not sexting, but a sexual wish is", () => {
    expect(run(["Shane’s phone buzzed.", "Ilya: fuck off", "Shane: holy fuck", "Ilya: ok"].join("\n\n")).texting!.sexual).toBe(0);
    expect(run(["Shane’s phone buzzed.", "Ilya: let me fuck you tonight", "Shane: ok"].join("\n\n")).texting!.sexual).toBe(1);
  });
  it("arrow-style texts: > is sent by the viewpoint character, < received", () => {
    const t = run(["Shane’s phone buzzed on the couch.", "Shane stared at it and typed back.", "> Jesus, man.", "would you let me fuck you? <", "> Why?", "i want to fuck you <"].join("\n\n")).texting!;
    expect(t.chat).toBe(4);
    expect(t.pairs.find((p) => p.from === "Shane Hollander")?.count).toBe(2);
    expect(t.pairs.find((p) => p.from === "Ilya Rozanov")?.count).toBe(2);
  });
  it("an arrow-style received wish is read as dialogue from the sender", () => {
    const p = run(["Shane’s phone buzzed on the couch.", "> Why?", "i want to fuck you <"].join("\n\n")).pairings[0];
    expect(p.anal.desires.some((d) => d.who.startsWith("Ilya") && d.role === "top")).toBe(true);
  });
  it("quoted email-style > lines and <3 are not texts", () => {
    expect(run("> quoted reply from an old email\n\nShane laughed. Hello <3 he said.").texting!.occurs).toBe(false);
  });
  it("arrow lines written on consecutive lines (no blank lines between) still count", () => {
    const t = run("Shane’s phone buzzed on the couch.\n> Why?\ni want to fuck you <\n> Really?\nreally <").texting!;
    expect(t.chat).toBe(4);
  });
});
