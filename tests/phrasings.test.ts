// Sentence-level accuracy table for the pattern engine. Each case is a short scene;
// `expect` is [category, top, bottom] or null when nothing should be counted.

import { expect, it } from "vitest";
import { type Ao3Meta, emptyMeta } from "../src/ao3";
import { analyzeWithPatterns } from "../src/heuristic";

const M: Ao3Meta = {
  ...emptyMeta(),
  rating: "Explicit",
  relationships: ["Draco Malfoy/Harry Potter"],
  characters: ["Draco Malfoy", "Harry Potter"],
  categories: ["M/M"],
};
const H = "Harry Potter";
const D = "Draco Malfoy";
const SETUP = "Harry and Draco were naked in bed, hard and aching.";

type Exp = ["anal" | "oral", string, string, string?] | null;
const CASES: [string, Exp][] = [
  // anal, named
  ["Draco fucked Harry into the mattress.", ["anal", D, H]],
  ["Harry was fucking Draco slowly.", ["anal", H, D]],
  ["Draco slid into Harry with one long thrust.", ["anal", D, H]],
  ["Harry pushed his cock into Draco's tight hole.", ["anal", H, D]],
  ["Draco's cock slid into Harry inch by inch.", ["anal", D, H]],
  ["Harry's cock filled Draco completely.", ["anal", H, D]],
  ["Draco's hole clenched around Harry's cock.", ["anal", H, D]],
  ["Harry was buried inside Draco.", ["anal", H, D]],
  ["Draco's cock was buried deep in Harry.", ["anal", D, H]],
  ["Harry came inside Draco with a shout.", ["anal", H, D]],
  ["Draco rode Harry hard.", ["anal", H, D]],
  ["Harry sank down onto Draco's cock.", ["anal", D, H]],
  ["Draco lowered himself onto Harry's cock.", ["anal", H, D]],
  ["Harry was fucked by Draco until he cried.", ["anal", D, H]],
  ["Draco bottomed for Harry for the first time.", ["anal", H, D]],
  ["Harry entered Draco slowly.", ["anal", H, D]],
  ["Draco knotted Harry.", ["anal", D, H]],
  ["Harry's cock hit Draco's prostate.", ["anal", H, D]],
  ["Draco fucked himself back onto Harry's cock.", ["anal", H, D]],
  ["Harry thrust into Draco again and again.", ["anal", H, D]],
  ["Draco pounded into Harry.", ["anal", D, H]],
  // anal, pronouns
  ["Draco kissed Harry's neck. He pushed into him slowly.", ["anal", D, H]],
  ["Harry pinned Draco down. He fucked him hard.", ["anal", H, D]],
  ["Draco gasped. Harry slid into him.", ["anal", H, D]],
  ["Harry lay back. Draco climbed on top and rode him.", ["anal", H, D]],
  ["Draco moaned as Harry's cock pushed into him.", ["anal", H, D]],
  // fingering
  ["Harry pushed two fingers into Draco.", ["anal", H, D, "fingering"]],
  ["Draco fingered Harry open.", ["anal", D, H, "fingering"]],
  ["Harry's fingers slid inside Draco.", ["anal", H, D, "fingering"]],
  // blowjobs
  ["Harry sucked Draco off.", ["oral", D, H]],
  ["Draco sucked Harry's cock.", ["oral", H, D]],
  ["Harry blew Draco in the shower.", ["oral", D, H]],
  ["Draco went down on Harry.", ["oral", H, D]],
  ["Harry gave Draco a blowjob.", ["oral", D, H]],
  ["Draco took Harry's cock into his mouth.", ["oral", H, D]],
  ["Harry licked a stripe up Draco's cock.", ["oral", D, H]],
  ["Draco's lips wrapped around Harry's cock.", ["oral", H, D]],
  ["Harry's cock slid between Draco's lips.", ["oral", H, D]],
  ["Draco fucked Harry's mouth.", ["oral", D, H]],
  ["Harry fucked into Draco's throat.", ["oral", H, D]],
  ["Draco came down Harry's throat.", ["oral", D, H]],
  ["Harry deepthroated Draco.", ["oral", D, H]],
  ["Draco choked on Harry's cock.", ["oral", H, D]],
  ["Harry was sucked off by Draco.", ["oral", H, D]],
  ["Harry kissed Draco. Then he sucked him off.", ["oral", D, H]],
  ["Draco knelt. Harry's cock slid into his mouth.", ["oral", H, D]],
  // rimming (eater is top)
  ["Draco rimmed Harry.", ["oral", D, H, "rimming"]],
  ["Harry ate Draco out.", ["oral", H, D, "rimming"]],
  ["Draco licked into Harry.", ["oral", D, H, "rimming"]],
  ["Harry licked Draco's hole.", ["oral", H, D, "rimming"]],
  ["Draco's tongue pushed into Harry's hole.", ["oral", D, H, "rimming"]],
  ["Harry buried his face between Draco's cheeks.", ["oral", H, D, "rimming"]],
  ["Draco fucked Harry with his tongue.", ["oral", D, H, "rimming"]],
  ["Harry was rimmed by Draco.", ["oral", D, H, "rimming"]],
  ["Draco tongue-fucked Harry.", ["oral", D, H, "rimming"]],
  // things that must NOT count
  ["Harry sucked in a breath.", null],
  ["Draco blew him a kiss.", null],
  ["Harry pushed into the crowded room.", null],
  ["Draco's fingers tangled in Harry's hair.", null],
  ["Harry licked his lips.", null],
  ["Draco rode his broom across the pitch.", null],
  ["Harry ate dinner with Draco.", null],
  ["Draco came into the room.", null],
  ["Harry's mouth was on Draco's neck.", null],
  ["Draco took him to dinner.", null],
  ["Harry didn't fuck Draco that night.", null],
  ["Draco never sucked Harry off.", null],
  ["Harry screwed Draco over in the deal.", null],
  ["Draco topped up Harry's tea.", null],
  ["Harry kissed Draco's cheeks.", null],
  ["Draco went down on one knee.", null],
  ["Harry gave Draco a hug.", null],
  ["Draco pressed into Harry's side for warmth.", null],
  ["Harry blew out the candles.", null],
  ["Draco took Harry's hand.", null],
  ["Harry wanted Draco to fuck him.", null], // desire, not an act
  ["Draco imagined Harry sucking him off.", null], // fantasy, not an act
  // round 2: harder phrasing
  ["Harry pulled Draco close and slid inside him.", ["anal", H, D]],
  ["Draco smiled, then sank to his knees and sucked Harry off.", ["oral", H, D]],
  ["Harry rolled them over. He pushed Draco's thighs apart and slid into him.", ["anal", H, D]],
  ["Draco straddled Harry. He sank down on him with a groan.", ["anal", H, D]],
  ["Harry's tongue circled Draco's rim.", ["oral", H, D, "rimming"]],
  ["Draco's tongue was in Harry's hole.", ["oral", D, H, "rimming"]],
  ["Harry spread Draco open and licked into him.", ["oral", H, D, "rimming"]],
  ["Draco's mouth closed around Harry's cock.", ["oral", H, D]],
  ["Harry took Draco deep into his throat.", ["oral", D, H]],
  ["Draco bobbed his head on Harry's cock.", ["oral", H, D]],
  ["Harry's thick cock stretched Draco's hole.", ["anal", H, D]],
  ["Draco was being fucked by Harry.", ["anal", H, D]],
  ["Harry was railed by Draco against the door.", ["anal", D, H]],
  ["Draco finally bottomed out inside Harry.", ["anal", D, H]],
  ["Harry crooked his fingers inside Draco.", ["anal", H, D, "fingering"]],
  ["Draco worked a third finger into Harry.", ["anal", D, H, "fingering"]],
  ["Harry pressed his cock against Draco's hole and pushed in.", ["anal", H, D]],
  ["Draco fucked into Harry's mouth.", ["oral", D, H]],
  ["Harry came in Draco's mouth.", ["oral", H, D]],
  ["Draco pushed Harry onto his back and rode him.", ["anal", H, D]],
  ["Harry sucked a bruise into Draco's neck.", null],
  ["Draco pushed Harry against the wall and kissed him.", null],
  ["Harry slid into the booth next to Draco.", null],
  ["Draco slipped into Harry's shirt.", null],
  ["Harry ate Draco's chips.", null],
  ["Draco licked his fingers clean.", null],
  ["Harry had never been fucked before.", null],
  ["Draco's fingers dug into Harry's shoulders.", null],
  ["Harry's mouth found Draco's.", null],
  ["Draco sucked on Harry's tongue.", null],
  ["Harry blew Draco away with his speech.", null],
  ["Draco filled Harry's glass.", null],
  ["Harry went down on the stairs.", null],
  // round 3
  ["Draco kissed Harry, then fucked his ass slowly.", ["anal", D, H]],
  ["Harry fucked Draco's tight hole.", ["anal", H, D]],
  ["Draco worked his tongue into Harry's hole.", ["oral", D, H, "rimming"]],
  ["Harry worked Draco's hole with his fingers.", null], // fingering-ish but not a recognized form: must not become rimming
  ["Harry fucked his fist.", null],
  // round 4: heat-of, up, gerunds, object-less verbs, fullness/tightness, epithets
  ["Harry slid into the tight heat of Draco's body.", ["anal", H, D]],
  ["Harry pushed into the tight heat of Draco.", ["anal", H, D]],
  ["Draco slid into the wet heat of Harry's mouth.", ["oral", D, H]],
  ["Harry's cock was up Draco's ass.", ["anal", H, D]],
  ["Draco loved having Harry inside him.", ["anal", H, D]],
  ["Harry spread Draco's legs and pushed in.", ["anal", H, D]],
  ["Draco straddled Harry and sank down.", ["anal", H, D]],
  ["Draco was so full of Harry's cock.", ["anal", H, D]],
  ["Harry clenched around Draco.", ["anal", D, H]],
  ["Draco was so tight around Harry's cock.", ["anal", H, D]],
  ["Harry's head bobbed in Draco's lap.", ["oral", D, H]],
  ["Draco's cock hit the back of Harry's throat.", ["oral", D, H]],
  ["Harry took Draco's cock all the way to the back of his throat.", ["oral", D, H]],
  ["Draco licked a stripe over Harry's hole.", ["oral", D, H, "rimming"]],
  ["Harry's come dripped out of Draco's hole.", ["anal", H, D]],
  ["Draco made love to Harry.", ["anal", D, H]],
  ["Harry kissed Draco. The blond sucked him off.", ["oral", H, D]],
  ["Draco pulled Harry close. The brunet's cock slid into him.", ["anal", H, D]],
  ["Harry sheathed himself in Draco.", ["anal", H, D]],
  ["Draco hollowed his cheeks around Harry's cock.", ["oral", H, D]],
  ["Harry swallowed around Draco.", ["oral", D, H]],
  ["Draco's knot swelled inside Harry.", ["anal", D, H]],
  ["Harry kissed Draco. The other man rode him hard.", ["anal", H, D]],
  ["Harry slid into the warmth of the kitchen.", null],
  ["Draco was full of dinner.", null],
  ["Harry's head bobbed in time with the music.", null],
  ["Draco loved having Harry around.", null],
  ["Harry pushed in the door.", null],
  ["Before Harry could fuck him, Draco's phone rang.", null],
  ["Did Harry fuck him last night?", null],
  ["The blond rolled his eyes.", null],
  ["Harry was so tight with Draco these days.", null],
  // round 5: descriptive epithets (fallback rule: the person who isn't the current subject)
  ["Harry kissed Draco. The taller man pushed into him.", ["anal", D, H]],
  ["Draco pulled Harry close. The smaller man sank down on him.", ["anal", D, H]],
  ["Harry kissed Draco. The older of the two sucked him off.", ["oral", H, D]],
  ["Draco pinned Harry. The dark-haired wizard rode him.", ["anal", D, H]],
  ["Harry kissed Draco. The tall blond fucked him.", ["anal", D, H]],
  ["The older students laughed.", null],
  ["The American flag waved over the building.", null],
  ["The tall grass rustled.", null],
];

it("pattern engine phrasing accuracy", () => {
  const failures: string[] = [];
  for (const [sentence, exp] of CASES) {
    const a = analyzeWithPatterns(`${SETUP}\n\n${sentence}`, M, { quiet: true });
    const p = a.pairings[0];
    const found = [...p.anal.instances.map((i) => ["anal", i] as const), ...p.oral.instances.map((i) => ["oral", i] as const)];
    if (!exp) {
      if (found.length) failures.push(`FALSE POSITIVE: ${sentence} → ${found.map(([c, i]) => `${c} ${i.top}>${i.bottom}`).join(", ")}`);
      continue;
    }
    const [cat, top, bottom, act] = exp;
    const hit = found.find(([c, i]) => c === cat && i.top === top && i.bottom === bottom && (!act || i.act.includes(act)));
    if (!hit) {
      failures.push(`MISSED: ${sentence} (want ${cat} ${top}>${bottom}${act ? ` ${act}` : ""}; got ${found.map(([c, i]) => `${c} ${i.top}>${i.bottom} ${i.act}`).join(", ") || "nothing"})`);
    } else if (found.length > 1 && found.some(([c, i]) => c === cat && (i.top !== top || i.bottom !== bottom))) {
      failures.push(`EXTRA: ${sentence}`);
    }
  }
  const accuracy = 1 - failures.length / CASES.length;
  if (failures.length) console.log(`${failures.length}/${CASES.length} failing:\n` + failures.join("\n"));
  expect(accuracy).toBeGreaterThanOrEqual(0.95);
});
