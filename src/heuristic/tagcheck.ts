// Tags vs text: for each AO3 tag that names an act, a role or a kink, did the text back it up?

import type { TagCheck, PairingResult, TextingResult } from "../types";
import type { TagInfo } from "./tags";

interface Detector {
  name: string;
  kind: "kink" | "dynamic";
  tag: RegExp;
  /** A sentence that shows it. Omit when there is no way to tell from single sentences. */
  text?: RegExp;
  /** How many sentences make it "supported". */
  min: number;
  /** Only counts near sexual narration (the words are common outside sex). */
  needsSex?: boolean;
}

const SEXY = /\b(?:cock|dick|prick|naked|moan\w*|thrust\w*|kiss\w*|undress\w*|erection|orgasm|climax|come|cum|came|fuck\w*|lube|nipples?|bed|hard|stroke\w*|suck\w*|hole|ass|inside him|inside her)\b/i;

const DETECTORS: Detector[] = [
  { name: "Edging", kind: "kink", tag: /\bedging|edge play/i, text: /\bedging\b|\bedged\b|\bedge (?:him|her|them|me|you)\b|\b(?:nearing|approaching|close to|closer to|so close to|bring \w+ (?:close )?to|brought \w+ (?:close )?to) the edge\b(?!\s+of\b)/i, min: 2, needsSex: true },
  { name: "Orgasm denial / delay", kind: "kink", tag: /orgasm (?:denial|delay|control)|\bdenial\b|chastity/i, text: /\b(?:denied|deny|denying|denial)\b|\bnot allowed to (?:come|cum)\b|\bwasn['’]t allowed to (?:come|cum)\b|\bpermission to (?:come|cum)\b|\bmay i (?:come|cum)\b|\bhold (?:it|off)\b/i, min: 2, needsSex: true },
  { name: "Praise", kind: "kink", tag: /\bpraise\b/i, text: /\bgood (?:boy|girl|job|pet)\b|\bso good for me\b|\bsuch a good\b|\bso perfect\b|\bperfect (?:boy|girl)\b|\bwell done\b/i, min: 3, needsSex: true },
  { name: "Bondage / restraints", kind: "kink", tag: /bondage|restraints?|shibari|\brope\b|handcuff|tied up|kinbaku/i, text: /\b(?:tied|bound|binds?|ropes?|roped|cuffs?|cuffed|handcuff\w*|restraint\w*|shibari|bondage|strapped down)\b/i, min: 2, needsSex: true },
  { name: "Spanking / impact play", kind: "kink", tag: /spank|impact|flogg|paddl|caning|whipp/i, text: /\bspank\w*|\bflogg\w*|\bpaddl\w*|\bcaned?\b|\bwhipp?\w*|\bcrop\b/i, min: 1, needsSex: true },
  { name: "Cock cage / chastity", kind: "kink", tag: /cock ?cage|chastity|\bcaged\b/i, text: /\bcock ?cage|\bchastity|\bcaged\b|\bthe cage\b/i, min: 1 },
  { name: "Panties / lingerie", kind: "kink", tag: /panty|panties|lingerie|crossdress|feminiz/i, text: /\bpanties\b|\blingerie\b|\bthong\b/i, min: 1, needsSex: true },
  { name: "Exhibitionism / public", kind: "kink", tag: /exhibition|public sex|voyeur/i, text: /\bin front of (?:everyone|an audience|a crowd|the whole|strangers|a hundred|people)\b|\baudience\b|\bvoyeur/i, min: 2, needsSex: true },
  { name: "Aftercare", kind: "kink", tag: /aftercare|caretaking/i, text: /\baftercare\b|\bcleaned (?:him|her|them) up\b|\bwiped (?:him|her|them) down\b|\bwrapped (?:him|her|them) in a blanket\b|\bwater bottle\b/i, min: 1 },
  { name: "Safeword / colour check", kind: "kink", tag: /safe ?word|traffic light|colou?r system|red.?yellow.?green/i, text: /\bsafe ?words?\b|\bcolou?r\?|\bwhat(?:['’]s| is) your colou?r\b/i, min: 2 },
  { name: "Kink negotiation", kind: "kink", tag: /negotiat/i, text: /\bnegotiat\w*|\bhard limits?\b|\bsoft limits?\b|\bcheck ?list\b/i, min: 1 },
  { name: "Degradation", kind: "kink", tag: /degradation|humiliation/i, text: /\bslut\b|\bwhore\b|\bpathetic\b|\bworthless\b|\bhumiliat\w*/i, min: 2, needsSex: true },
  { name: "Daddy kink", kind: "kink", tag: /daddy/i, text: /\bdaddy\b/i, min: 2, needsSex: true },
  { name: "Knotting / breeding", kind: "kink", tag: /knot|breeding|nesting|\bheat\b|mpreg/i, text: /\bknot\w*|\bbreed\w*|\bin heat\b|\bnest\w*/i, min: 2, needsSex: true },
  { name: "Choking / breath play", kind: "kink", tag: /choking|breath ?play|asphyx/i, text: /\bchok\w* (?:him|her|them)\b|\bhand around (?:his|her|their) throat\b|\bbreath ?play\b/i, min: 1, needsSex: true },
  { name: "Collar / leash", kind: "kink", tag: /collar|leash|pet play|petplay/i, text: /\bcollar\w*|\bleash\b/i, min: 1, needsSex: true },
  { name: "Dirty talk", kind: "kink", tag: /dirty talk/i, text: undefined, min: 0 },
];

const clip = (s: string) => (s.length > 190 ? `${s.slice(0, 187)}…` : s);

export function checkTags(
  freeforms: string[],
  tags: TagInfo,
  results: PairingResult[],
  paras: string[],
  where: (pi: number) => string,
  texting?: TextingResult,
): TagCheck[] {
  const out: TagCheck[] = [];
  const seen = new Set<string>();
  const add = (c: TagCheck) => { if (!seen.has(c.tag + c.kind)) { seen.add(c.tag + c.kind); out.push(c); } };

  const pull = <T extends { evidence: string; where: string; confidence?: number }>(xs: T[]) =>
    [...xs].sort((a, b) => (b.confidence ?? 0.5) - (a.confidence ?? 0.5)).slice(0, 3).map((x) => ({ text: clip(x.evidence), where: x.where }));

  // ── acts, from the pairings' own results ──
  const all = <K extends "anal" | "blowjob" | "rimming" | "cunnilingus">(k: K) => results.flatMap((r) => r[k].instances);
  const ACTS: { re: RegExp; label: string; get: () => { evidence: string; where: string; confidence?: number }[] }[] = [
    { re: /\banal\b(?!\s*fingering)|anal sex|sodomy|first time bottoming/i, label: "anal sex", get: () => all("anal").filter((i) => i.act !== "fingering") },
    { re: /anal fingering|\bfingering\b/i, label: "fingering", get: () => [...all("anal").filter((i) => /fingering/.test(i.act))] },
    { re: /blow ?jobs?|fellatio|deep ?throat|face[- ]?fuck/i, label: "blowjobs", get: () => all("blowjob") },
    { re: /\boral(?: sex)?\b(?!\s*fixation)/i, label: "oral sex", get: () => [...all("blowjob"), ...all("rimming"), ...all("cunnilingus")] },
    { re: /\brimming|anilingus|ass eating/i, label: "rimming", get: () => all("rimming") },
    { re: /cunnilingus|eating (?:her )?out/i, label: "cunnilingus", get: () => all("cunnilingus") },
    { re: /hand ?jobs?|frottage|dry ?(?:humping|hump)/i, label: "handjobs or frottage", get: () => results.flatMap((r) => r.manual?.instances ?? []) },
    { re: /mutual masturbation/i, label: "mutual masturbation", get: () => results.flatMap((r) => r.manual?.instances ?? []) },
    { re: /\bmasturbation\b|\bsolo\b/i, label: "solo masturbation", get: () => results.flatMap((r) => (r.solo?.instances ?? []).filter((i) => i.act === "Masturbation").map((i) => ({ evidence: i.evidence, where: i.where }))) },
    { re: /vaginal|\bpiv\b|p-in-v/i, label: "vaginal sex", get: () => results.flatMap((r) => r.vaginal?.instances ?? []) },
  ];
  for (const raw of freeforms) {
    const tag = raw.trim();
    for (const a of ACTS) {
      if (!a.re.test(tag)) continue;
      const hits = a.get();
      if (hits.length) add({ tag, kind: "act", status: "supported", note: `${hits.length} ${a.label} moment${hits.length === 1 ? "" : "s"} found in the text.`, evidence: pull(hits) });
      else add({ tag, kind: "act", status: "not_found", note: `No on-page ${a.label} recognized. It may be implied or fade to black, or phrased in a way the patterns miss.`, evidence: [] });
      break;
    }
  }

  // ── Texting / Sexting ──
  if (texting) {
    for (const raw of freeforms) {
      const tag = raw.trim();
      const sext = /\bsexting\b|\bsext\b|phone sex/i.test(tag);
      if (!sext && !/\btext(?:ing| messages?| messaging)\b|\bchat(?:ting)?\b|\binstant messag|\bdms?\b|\bgroup chat/i.test(tag)) continue;
      const ev = texting.examples.filter((e) => (sext ? e.sexual : true)).slice(0, 3).map((e) => ({ text: clip(`${e.from} → ${e.to}: ${e.text}`), where: e.where }));
      const n = sext ? texting.sexual : texting.total;
      if (n) add({ tag, kind: "kink", status: "supported", note: `${n} ${sext ? "sexual " : ""}text message${n === 1 ? "" : "s"} found in the text.`, evidence: ev });
      else add({ tag, kind: "kink", status: "not_found", note: sext ? "No sexual text messages recognized." : "No text messages recognized.", evidence: [] });
    }
  }

  // ── Top/Bottom/Switch role tags, against each person's odds in the anal result ──
  for (const r of tags.roles) {
    const found = results.find((p) => p.anal.people?.some((x) => x.name === r.char.name));
    if (!found) continue;
    const p = found;
    const sceneLines = p.anal.instances.filter((i) => i.act !== "fingering");
    // Counted from the scenes alone: the person's odds already lean on this very tag.
    const w = (xs: typeof sceneLines) => xs.reduce((n, i) => n + (i.confidence ?? 0.6), 0);
    const asTop = sceneLines.filter((i) => i.top === r.char.name);
    const asBottom = sceneLines.filter((i) => i.bottom === r.char.name);
    const roleEv = (role: "top" | "bottom") => pull(role === "top" ? asTop : asBottom);
    if (!sceneLines.length) {
      add({ tag: r.tag, kind: "role", status: "not_found", note: `No on-page anal sex recognized, so ${r.char.name}'s role can't be checked against the text.`, evidence: [] });
      continue;
    }
    if (r.role === "switch") {
      const both = asTop.length > 0 && asBottom.length > 0;
      add({ tag: r.tag, kind: "role", status: both ? "supported" : "contradicted", note: both ? `${r.char.name} tops in some scenes and bottoms in others.` : `Only one direction found for ${r.char.name}: ${asTop.length ? "tops" : "bottoms"}.`, evidence: pull([...asTop, ...asBottom]) });
      continue;
    }
    const mineW = w(r.role === "top" ? asTop : asBottom);
    const otherW = w(r.role === "top" ? asBottom : asTop);
    const share = mineW + otherW ? mineW / (mineW + otherW) : 0.5;
    const verb = (role: "top" | "bottom") => (role === "top" ? "tops" : "bottoms");
    const opposite = r.role === "top" ? "bottom" : "top";
    if (share >= 0.65) add({ tag: r.tag, kind: "role", status: "supported", note: `${r.char.name} ${verb(r.role)} in ${r.role === "top" ? asTop.length : asBottom.length} of ${sceneLines.length} scene${sceneLines.length === 1 ? "" : "s"}.`, evidence: roleEv(r.role) });
    else if (share <= 0.35) add({ tag: r.tag, kind: "role", status: "contradicted", note: `The text shows ${r.char.name} ${verb(opposite)}, not ${verb(r.role)}.`, evidence: roleEv(opposite) });
    else add({ tag: r.tag, kind: "role", status: "supported", note: `${r.char.name} ${verb(r.role)} in some scenes but also ${verb(opposite)}, so the text shows versatility.`, evidence: roleEv(r.role) });
  }

  // ── Dom/Sub tags, against the everyday-dynamic axis counted from behaviour alone (the tag itself is left out) ──
  const textLean = (pr: PairingResult, name: string) => {
    const r = pr.dynamic?.find((d) => d.name === name);
    const fs = (r?.factors ?? []).filter((f) => f.tier >= 2);
    const T = fs.filter((f) => f.role === "top").reduce((n, f) => n + f.weight, 0);
    const B = fs.filter((f) => f.role === "bottom").reduce((n, f) => n + f.weight, 0);
    return { x: (T - B) / (T + B + 0.2), n: T + B, lines: fs.map((f) => ({ evidence: f.source ?? "", where: f.where ?? "", confidence: f.weight, role: f.role })) };
  };
  for (const d of tags.dynamics) {
    const pr = results.find((p) => p.dynamic?.some((x) => x.name === d.char.name));
    if (!pr) continue;
    const { x, n, lines } = textLean(pr, d.char.name);
    const want = d.lean === "top" ? 1 : -1;
    const word = d.lean === "top" ? "leads" : "follows";
    const ev = pull(lines.filter((l) => (l.role === "top") === (d.lean === "top")).filter((l) => l.evidence));
    if (n < 0.3) add({ tag: d.tag, kind: "dynamic", status: "cant_tell", note: `Too little everyday behaviour between them to tell whether ${d.char.name} ${word}.`, evidence: [] });
    else if (x * want >= 0.25) add({ tag: d.tag, kind: "dynamic", status: "supported", note: `${d.char.name} ${word} in everyday behaviour (caring, leading, yielding).`, evidence: ev });
    else if (x * want <= -0.25) add({ tag: d.tag, kind: "dynamic", status: "contradicted", note: `Everyday behaviour shows ${d.char.name} ${d.lean === "top" ? "following" : "leading"}, not ${word}.`, evidence: pull(lines.filter((l) => (l.role === "top") !== (d.lean === "top")).filter((l) => l.evidence)) });
    else add({ tag: d.tag, kind: "dynamic", status: "cant_tell", note: `Everyday behaviour is mixed for ${d.char.name}: some leading, some following.`, evidence: ev });
  }
  for (const raw of freeforms) {
    const tag = raw.trim();
    if (!/\bdom\/sub\b|dominant\/submissive|\bd\/s\b|\bbdsm\b|power (?:dynamics?|imbalance|play)/i.test(tag) || seen.has(tag + "dynamic")) continue;
    const pr = results[0];
    if (!pr?.dynamic || pr.dynamic.length < 2) continue;
    const [a, b] = pr.dynamic.map((r) => textLean(pr, r.name));
    const opposite = a.n + b.n >= 0.4 && ((a.x >= 0.25 && b.x <= -0.1) || (b.x >= 0.25 && a.x <= -0.1));
    const lead = a.x >= b.x ? pr.dynamic[0].name : pr.dynamic[1].name;
    add({ tag, kind: "dynamic", status: opposite ? "supported" : "cant_tell", note: opposite ? `One leads and the other follows in everyday behaviour (${lead} leads).` : "Everyday behaviour doesn't clearly split into one who leads and one who follows.", evidence: opposite ? pull([...a.lines, ...b.lines].filter((l) => l.evidence).slice(0, 12)) : [] });
  }

  // ── kinks and dynamics, from keywords in the text near sex ──
  const sentences: { text: string; pi: number; sexy: boolean }[] = [];
  const sexyPara = paras.map((p) => SEXY.test(p));
  paras.forEach((p, pi) => {
    for (const s of p.split(/(?<=[.!?”"])\s+/)) if (s.length > 8) sentences.push({ text: s, pi, sexy: !!(sexyPara[pi] || sexyPara[pi - 1] || sexyPara[pi + 1]) });
  });
  for (const raw of freeforms) {
    const tag = raw.trim();
    const d = DETECTORS.find((x) => x.tag.test(tag));
    if (!d) continue;
    if (!d.text) {
      add({ tag, kind: d.kind, status: "cant_tell", note: d.kind === "dynamic" ? "A power dynamic can't be checked from single sentences yet." : "No way to check this one from the text yet.", evidence: [] });
      continue;
    }
    const hits = sentences.filter((s) => d.text!.test(s.text) && (!d.needsSex || s.sexy));
    if (hits.length >= d.min) {
      add({ tag, kind: d.kind, status: "supported", note: `${hits.length} sentence${hits.length === 1 ? "" : "s"} about ${d.name.toLowerCase()} near the sex.`, evidence: hits.slice(0, 3).map((h) => ({ text: clip(h.text), where: where(h.pi) })) });
    } else {
      add({ tag, kind: d.kind, status: "not_found", note: hits.length ? `Only ${hits.length} sentence${hits.length === 1 ? "" : "s"} about ${d.name.toLowerCase()}, too few to call it present.` : `No sentences about ${d.name.toLowerCase()} recognized.`, evidence: hits.slice(0, 2).map((h) => ({ text: clip(h.text), where: where(h.pi) })) });
    }
  }
  return out;
}
