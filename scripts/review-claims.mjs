// Plain-language sentence for what the analyzer claims about a hit, from its audit fields (who, whom, act, kind).
const T = {
  "anal sex": "{A} is having anal sex with {B}, as the one penetrating",
  "anal sex (riding)": "{B} is riding {A} (anal sex)",
  "asking to be held": "{A} is asking {B} to hold them",
  "baring their neck": "{A} is baring their neck to {B} (a submissive gesture)",
  "being held afterwards": "{A} is being held by {B} after sex",
  "being pinned": "{A} is being pinned by {B}",
  "bending over": "{A} is bending over for {B} to take them",
  blowjob: "{A} is getting a blowjob from {B}",
  "calling someone a good boy/girl": "{A} is calling {B} a good boy or girl",
  "checking out a crotch": "{A} is checking out {B}'s crotch",
  "cleaning someone up": "{A} is cleaning {B} up after sex",
  "comforting someone": "{A} is comforting {B}",
  "coming on someone's face": "{A} is coming on {B}'s face",
  "falling asleep on someone's chest": "{A} is falling asleep on {B}'s chest",
  fingering: "{A} is fingering {B}",
  "gripping firmly": "{A} is gripping {B} firmly, in a dominant way",
  handjob: "{A} and {B} are having a handjob",
  "having their wrists held": "{A} is having their wrists held down by {B}",
  kneeling: "{A} is dropping to their knees in front of {B}, sexually",
  "leading someone": "{A} is leading {B} by the hand",
  "lifting or carrying someone": "{A} is lifting or carrying {B}",
  "looking after someone": "{A} is looking after {B}",
  masturbation: "{A} is masturbating",
  "pinning someone": "{A} is pinning {B} down",
  "pushing back": "{A} is pushing back against {B} during sex",
  "saying they like to bottom": "{A} is saying they like to bottom",
  "scent-marking someone": "{A} is scent-marking {B}",
  "sore after sex": "{A} is sore after sex with {B}",
  "staring at a bulge": "{A} is staring at {B}'s bulge",
  "sucking on fingers": "{A} is sucking on {B}'s fingers",
  "taking control": "{A} is taking control of {B} in a sexually dominant way",
  "vaginal sex": "{A} is having vaginal sex with {B}",
  rimming: "{A} is rimming {B}",
  cunnilingus: "{A} is going down on {B}",
};
const Q = { hypothetical: " (read as a hypothetical, not something that happens)", wanted: " (read as something wanted, not something that happens)", said: " (read as something said in dialogue)" };
export function claim({ a, b, act, kind }) {
  const first = (n) => (n ?? "someone").split(" ")[0];
  const t = (T[act] ?? `${first(a)} and ${first(b)}: ${act}`).replaceAll("{A}", first(a)).replaceAll("{B}", first(b));
  return t[0].toUpperCase() + t.slice(1) + (Q[kind] ?? "");
}
