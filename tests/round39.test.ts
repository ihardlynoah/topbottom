import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const meta: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], relationships: ["Aldric/Tomas"], characters: ["Aldric", "Tomas"] };
const base = ("Aldric kissed Tomas. Tomas kissed Aldric back. Tomas was younger than Aldric. Tomas, the boy, blushed. The lad smiled up at Aldric. ").repeat(2) + "\n\n";
const run = (s: string) => analyzeWithPatterns(base + s, meta, { quiet: true }).pairings[0];

describe("“the boy” and “the lad” are epithets for the same (younger) person", () => {
  for (const l of [
    "Aldric laid Tomas on the bed. The boy gasped as Aldric fucked him, pounding into him.",
    "Aldric laid Tomas on the bed. Aldric fucked the lad, pounding into the lad hard.",
    "Aldric stripped Tomas. The lad moaned as Aldric’s cock was buried in the boy’s ass.",
    "Tomas straddled Aldric. The boy sank down on his cock, riding him.",
  ]) it(l, () => expect(run(l).anal.instances[0]).toMatchObject({ top: "Aldric", bottom: "Tomas" }));
});
