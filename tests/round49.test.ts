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
  it("arrow-style texts: > comes in from the other person, < is the viewpoint character’s reply", () => {
    const t = run(["Shane’s phone buzzed on the couch.", "Shane stared at it and typed back.", "> Jesus, man.", "would you let me fuck you? <", "> Why?", "i want to fuck you <"].join("\n\n")).texting!;
    expect(t.chat).toBe(4);
    expect(t.pairs.find((p) => p.from === "Shane Hollander")?.count).toBe(2);
    expect(t.pairs.find((p) => p.from === "Ilya Rozanov")?.count).toBe(2);
  });
  it("an arrow-style incoming wish is read as dialogue from the other person", () => {
    const p = run(["Shane’s phone buzzed on the couch.", "> i want to fuck you", "Why? <"].join("\n\n")).pairings[0];
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

describe("limited third with scene breaks and arrow threads", () => {
  const D: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Rugby RPF"], relationships: ["Dunk Pennytree/Aerion Vance"], characters: ["Dunk Pennytree", "Aerion Vance"], freeforms: [] };
  const intro = "Dunk and Aerion were at the clubhouse, talking. Dunk laughed. Aerion smiled back. ".repeat(2);
  const scene = (who: string, other: string) =>
    ["—•—", `${who} woke early and stared at the ceiling. ${who} felt restless. ${who} wondered what ${other} was doing.`, `${who} noticed the light on the wall. ${who} hoped the day would be quiet. ${who} knew it wouldn’t be.`, `${who} watched the street for a while. ${who} thought about training.`, `${other} smiled at him across the room. He wanted to be fucked.`].join("\n\n");
  const bottoms = (text: string) => analyzeWithPatterns(text, D, { quiet: true }).pairings[0].anal.desires.filter((d) => d.kind === "wanted" && d.wants && d.role === "bottom").map((d) => d.who.split(" ")[0]);
  it("scenes that open on and report one character’s experience are read as limited third, with no tag", () => {
    const text = [intro, scene("Dunk", "Aerion"), scene("Aerion", "Dunk"), scene("Dunk", "Aerion"), scene("Aerion", "Dunk"), scene("Dunk", "Aerion")].join("\n\n");
    expect(bottoms(text)).toEqual(["Dunk", "Aerion", "Dunk", "Aerion", "Dunk"]);
  });
  it("a contact name above an arrow thread is not a POV heading, and > comes from that contact", () => {
    const text = `${intro}\n\nDunk lay on his bed. Dunk read the message and felt his stomach drop. Dunk wondered what to say.\n\nAerion Vance\n> i want to fuck you\nWhy? <\n> because i do`;
    const r = analyzeWithPatterns(text, D, { quiet: true });
    expect(r.texting!.pairs.find((p) => p.from === "Aerion Vance")?.count).toBe(2);
    expect(r.texting!.pairs.find((p) => p.from === "Dunk Pennytree")?.count).toBe(1);
    expect(r.pairings[0].anal.desires.some((d) => d.who.startsWith("Aerion") && d.role === "top")).toBe(true);
  });
  it("a thread with someone outside the pair is not theirs", () => {
    const text = `${intro}\n\nDunk lay on his bed, then opened his messages and sent a plea to Roland, who answered within seconds.\n\nlet’s go out <\n> anything for you`;
    expect(analyzeWithPatterns(text, D, { quiet: true }).texting!.pairs.length).toBe(0);
  });
});
