import { it } from "vitest";
import { emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";
const m = { ...emptyMeta(), rating: "Explicit", categories: ["M/M"], relationships: ["Damen/Laurent (Captive Prince)"], characters: ["Damen", "Laurent"] };
const SET = "Damen and Laurent sat in the penthouse together.";
it("probe", () => {
  for (const s of [
    "Laurent noticed the bathtub, thinking it would be nice to enjoy it for once without being fucked open by older men in it.",
    "Laurent was very sure he'd like to be fucked by Damen on every surface of the room.",
    "Laurent learned that from a really old guy he dated while going down on him at his home office.",
    "Damen held back, stopping his carnal desires of simply taking Laurent raw.",
    "Laurent offered to fuck Damen.",
  ]) {
    const a = analyzeWithPatterns(`${SET}\n\n${s}`, m, { quiet: true }).pairings[0];
    const o = [...a.anal.desires, ...a.blowjob.desires].map((d) => `${d.who.split(" ")[0]} ${d.role}${d.wants ? "" : "(NOT)"} ${d.kind}`).join("; ") || "-";
    const pp = a.anal.people!.map((p) => `${p.name} top ${Math.round(p.top * 100)} bottom ${Math.round(p.bottom * 100)}`).join(" | ");
    const bj = a.blowjob.people!.map((p) => `${p.name} gets-sucked ${Math.round(p.top * 100)} sucks ${Math.round(p.bottom * 100)}`).join(" | ");
    console.log("P", s.slice(0, 60), "=>", o, "||", pp, "||", bj);
  }
});
