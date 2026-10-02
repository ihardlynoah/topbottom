import { describe, expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const meta: Ao3Meta = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], fandoms: ["Supernatural"], relationships: ["Castiel/Dean Winchester"], characters: ["Castiel", "Dean Winchester"] };
const filler = Array.from({ length: 12 }, (_, i) => `Cas looked at Dean across the garage, number ${i}.`).join("\n");
const SEXY = "Dean and Cas were in bed, naked and kissing. Cas kissed Dean. Dean kissed Cas back, breathless.";
const NEUTRAL = "Dean and Cas stood in the kitchen of the bunker making breakfast. Dean talked about the road trip. Cas listened.";

const everyday = [
  "Dean plugged his phone in and Cas slid the charger into the socket.",
  "Cas pushed the plug into the wall socket and the lamp flickered on.",
  "Dean plugged the leak in the pipe, working a rag into the gap while Cas held the flashlight.",
  "Cas slid the wand into his sleeve and Dean laughed.",
  "Dean unplugged the toaster. Cas pressed the plug against the wall to check it.",
  "Cas loaded the bullet into the chamber and slid the magazine in.",
  "Dean wore a plug in his ear while the vibrator on his phone buzzed.",
  "Cas tightened the strap on Dean’s watch and pressed it against his wrist.",
  "Dean was wearing a plug-in air freshener on his keys.",
  "Cas put the toy into the box and slid it under the bed.",
  "Dean slid the beads into the bowl and Cas counted the beads again.",
  "Dean strapped on his backpack and Cas buckled up the harness for the dog.",
  "Dean pressed the plug against the drain, and Cas ran the water.",
];

describe("plugs, wands and straps in everyday life aren't sex", () => {
  for (const ctx of [NEUTRAL, SEXY]) {
    for (const line of everyday) {
      it(`${ctx === SEXY ? "(in bed) " : ""}${line}`, () => {
        const p = analyzeWithPatterns(`${filler}\n\n${ctx}\n\n${line}`, meta, { quiet: true }).pairings[0];
        expect(p.anal.instances).toHaveLength(0);
        expect(p.anal.desires).toHaveLength(0);
        expect(p.vaginal.instances).toHaveLength(0);
      });
    }
  }
});
