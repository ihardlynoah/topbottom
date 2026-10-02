import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const meta = (over: Partial<Ao3Meta>): Ao3Meta => ({ ...emptyMeta(), rating: "Explicit", categories: ["M/M"], ...over });
const MM = meta({ relationships: ["Derek Hale/Stiles Stilinski"] });
const said = (text: string) =>
  analyzeWithPatterns(text, MM, { quiet: true }).pairings[0]?.anal.desires.filter((d) => d.kind === "said" && d.wants) ?? [];

const SEXY = "Derek and Stiles were naked in bed, hard and aching.";
const PLAIN = "Derek and Stiles were stuck in traffic on the way to the station.";

describe("'fuck me' as an exclamation", () => {
  it.each([
    [PLAIN, `"Fuck me, it's cold," Stiles said.`],
    [PLAIN, `"Well, fuck me," Stiles said.`],
    [PLAIN, `"Oh, fuck me," Stiles said.`],
    [PLAIN, `"Holy shit, fuck me," Stiles said.`],
    [PLAIN, `"Fuck me sideways," Stiles said.`],
    [PLAIN, `"Fuck me if I know," Stiles said.`],
    [PLAIN, `"Fuck me, you're right," Stiles said.`],
    [PLAIN, `"Fuck me, what a day," Stiles said.`],
    [PLAIN, `"Fuck me." Stiles stared at the bill.`],
    [SEXY, `"Fuck me," Stiles muttered when the lube bottle rolled under the bed.`],
    [SEXY, `"Fuck me, that's a lot of lube," Stiles said.`],
  ])("%s %s", (setup, line) => {
    expect(said(`${setup}\n\n${line}`)).toHaveLength(0);
  });
});

describe("'fuck me' as a request", () => {
  it.each([
    `"Fuck me," Stiles begged.`,
    `"Please fuck me," Stiles said.`,
    `"Fuck me harder," Stiles said.`,
    `"Just fuck me already," Stiles said.`,
    `"Fuck me, Derek," Stiles said.`,
    `"Fuck me like you mean it," Stiles said.`,
    `"I need you to fuck me," Stiles said.`,
  ])("%s", (line) => {
    expect(said(`${SEXY}\n\n${line}`)).toContainEqual(expect.objectContaining({ who: "Stiles Stilinski", role: "bottom" }));
  });

  it("still reads an explicit request outside a sex scene", () => {
    expect(said(`${PLAIN}\n\n"Please fuck me tonight," Stiles said.`)).toHaveLength(1);
  });
});
