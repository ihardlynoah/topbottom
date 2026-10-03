// Text messages between characters: chat-log lines ("Shane: Why?", often under a timestamp) and narration ("his phone
// buzzed", "Cas texted him", "a message from Dean"). Chat lines are rewritten as ordinary dialogue with a speaker tag
// ("“Why?” Shane texted.") so the act, desire and speaker logic reads them like spoken lines.

import type { TextingResult } from "../types";
import type { Cast, Character } from "./characters";

export interface TextMessage {
  para: number;
  sender?: Character;
  receiver?: Character;
  /** The label as written, when it isn't a character's name ("Lily", "Unknown Number"). */
  label?: string;
  text: string;
  how: "chat" | "narrated";
}

export interface TextingMap {
  messages: TextMessage[];
  /** Paragraphs rewritten from chat lines to dialogue. */
  rewritten: Map<number, string>;
}

const CHAT_LINE = /^(?:\[[^\]]{1,30}\]\s*)?([A-Z][\w.'’-]*(?:\s+[A-Z][\w.'’-]*){0,2})\s*[:：]\s+(\S.*)$/;
const TIMESTAMP = /^\W*(?:\[?\s*)?(?:\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}[ ,T]*)?\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?\W*$|^\W*\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}\W*$/i;
const NOT_LABELS = new Set("Note Notes Warning Warnings Chapter Summary Author Authors Title Rating Tags Tag Fandom Relationship Category Characters Edit Update Disclaimer Playlist Music Song Lyrics Part Day Time Scene Location Setting Re Ps PS Translator Beta Original Part".split(" "));
const PHONE_CUE = /\b(?:phone|text|texts|texted|texting|message|messages|messaged|buzz\w*|vibrat\w*|chim\w*|ping\w*|screen|typed|typing|reply|replied|sent|sext\w*|dm|dms|group chat|imessage|whatsapp|notification)\b/i;

/** A reply to a message: "Name: …" lines, labelled by who sent them. */
export function detectTexts(paras: string[], cast: Cast): TextingMap {
  const messages: TextMessage[] = [];
  const rewritten = new Map<number, string>();
  if (!cast.chars.length) return { messages, rewritten };

  // ── chat runs: consecutive chat lines (narration or a timestamp may sit between them) ──
  type Line = { para: number; label: string; text: string };
  const lines: Line[] = [];
  paras.forEach((p, i) => {
    const m = p.trim().length < 400 ? CHAT_LINE.exec(p.trim()) : null;
    if (m && !NOT_LABELS.has(m[1].split(" ")[0]) && !/^["“”]/.test(m[2])) lines.push({ para: i, label: m[1], text: m[2] });
  });
  const runs: Line[][] = [];
  for (const l of lines) {
    const run = runs[runs.length - 1];
    const last = run?.[run.length - 1];
    if (run && last && l.para - last.para <= 3) run.push(l);
    else runs.push([l]);
  }
  const aliasChar = (label: string): Character | undefined => cast.byAlias.get(label) ?? cast.byAlias.get(label.split(" ")[0]);
  for (const run of runs) {
    const labels = [...new Set(run.map((l) => l.label))];
    const known = labels.map(aliasChar);
    const around = paras.slice(Math.max(0, run[0].para - 3), run[run.length - 1].para + 2);
    const near = around.some((p) => TIMESTAMP.test(p.trim()) || (PHONE_CUE.test(p) && !CHAT_LINE.test(p.trim())));
    // A chat needs two voices and either a phone cue / timestamp close by or enough lines to be a conversation.
    const voices = labels.length;
    if (!(voices >= 2 && (run.length >= 4 || near))) continue;
    // A label that isn't a character's name (a contact name, "Unknown Number") is whoever is on the other end of the
    // nearest line from a character we know: the partner of that character.
    if (!known.some(Boolean)) continue;
    const partnerOf = (c: Character) => cast.pairings.find((pr) => pr.includes(c))?.find((x) => x !== c);
    run.forEach((l, k) => {
      let sender = aliasChar(l.label);
      if (!sender) {
        const nb = [...run.slice(0, k).reverse(), ...run.slice(k + 1)].find((o) => o.label !== l.label && aliasChar(o.label));
        const nbChar = nb && aliasChar(nb.label);
        sender = nbChar && partnerOf(nbChar);
      }
      const receiver = sender && partnerOf(sender);
      messages.push({ para: l.para, sender, receiver, label: aliasChar(l.label) ? undefined : l.label, text: l.text, how: "chat" });
      if (sender) {
        const msg = /[.!?…]$/.test(l.text) ? l.text : `${l.text}.`;
        rewritten.set(l.para, `“${msg.replace(/[“”"]/g, "'")}” ${sender.name} texted.`);
      }
    });
  }

  // ── arrow style: "> hi" is a message the viewpoint character sends, "Hello <" (or "< Hello") one they receive ──
  const ARROW_OUT = /^>\s*(\S.*)$/;
  const ARROW_IN = /^(?:<\s*(?![3])(\S.*)|(\S.*?)\s+<)$/;
  const arrowOf = (p: string): { out: boolean; text: string } | undefined => {
    const t = p.trim();
    if (t.length > 300 || /^>>|<<|^<\/?[a-z]/i.test(t)) return undefined;
    const o = ARROW_OUT.exec(t);
    if (o) return { out: true, text: o[1] };
    const i = ARROW_IN.exec(t);
    return i ? { out: false, text: (i[1] ?? i[2]).trim() } : undefined;
  };
  const arrows: { para: number; out: boolean; text: string }[] = [];
  paras.forEach((p, i) => { const a = arrowOf(p); if (a) arrows.push({ para: i, ...a }); });
  const arrowRuns: typeof arrows[] = [];
  for (const a of arrows) {
    const run = arrowRuns[arrowRuns.length - 1];
    if (run && a.para - run[run.length - 1].para <= 2) run.push(a);
    else arrowRuns.push([a]);
  }
  const partnerOf = (c: Character) => cast.pairings.find((pr) => pr.includes(c))?.find((x) => x !== c);
  for (const run of arrowRuns) {
    const first = run[0].para;
    const around = paras.slice(Math.max(0, first - 3), run[run.length - 1].para + 2);
    const cue = around.some((p) => TIMESTAMP.test(p.trim()) || (PHONE_CUE.test(p) && !arrowOf(p)));
    if (!(run.length >= 3 || (run.length >= 2 && cue) || (cue && run.some((a) => a.out) && run.some((a) => !a.out)))) continue;
    // The "I" of the arrows is the narrator, or else whoever was named last before the exchange.
    let owner: Character | undefined = cast.narrator;
    if (!owner) {
      const re = new RegExp(`\\b(${cast.aliasPattern || "(?!)"})\\b`, "g");
      for (let i = first - 1; i >= Math.max(0, first - 4) && !owner; i--) {
        const hits = [...paras[i].matchAll(re)].map((m) => cast.byAlias.get(m[1])).filter((c): c is Character => !!c && c !== cast.secondPerson);
        owner = hits[hits.length - 1];
      }
    }
    for (const a of run) {
      const sender = owner && (a.out ? owner : partnerOf(owner));
      const receiver = sender && partnerOf(sender);
      messages.push({ para: a.para, sender, receiver, text: a.text, how: "chat" });
      if (sender) {
        const msg = /[.!?…]$/.test(a.text) ? a.text : `${a.text}.`;
        rewritten.set(a.para, `“${msg.replace(/[“”"]/g, "'")}” ${sender.name} texted.`);
      }
    }
  }

  // ── narration: "he texted", "his phone buzzed", "a text from X" ──
  const NAMES = cast.aliasPattern || "(?!)";
  const sentRe = new RegExp(`\\b(${NAMES})\\s+(?:\\w+ly\\s+)?(?:texted|sexted|messaged|dm['’]?ed|wrote back|typed (?:out )?(?:a|his|her|their)\\s+(?:reply|response|message|text)|sent\\s+(?:\\w+\\s+){0,3}?(?:a\\s+)?(?:text|message|texts|messages|selfie|pic|photo|picture|emoji|sext)\\b)(?:\\s+(?:to\\s+)?(${NAMES}|him|her|them))?`, "g");
  const fromRe = new RegExp(`\\b(?:a\\s+)?(?:text|message|reply|texts|messages)\\s+from\\s+(${NAMES})\\b`, "g");
  const buzzRe = /\b(?:his|her|their)\s+phone\s+(?:buzzed|vibrated|chimed|pinged|lit up|beeped|dinged)\b/;
  paras.forEach((p, i) => {
    if (rewritten.has(i)) return;
    for (const s of p.split(/(?<=[.!?”])\s+/)) {
      let m: RegExpExecArray | null;
      sentRe.lastIndex = 0;
      while ((m = sentRe.exec(s))) {
        const sender = cast.byAlias.get(m[1]);
        const receiver = (m[2] && cast.byAlias.get(m[2])) || (sender && cast.pairings.find((pr) => pr.includes(sender))?.find((c) => c !== sender));
        messages.push({ para: i, sender, receiver, text: s.trim(), how: "narrated" });
      }
      fromRe.lastIndex = 0;
      while ((m = fromRe.exec(s))) {
        const sender = cast.byAlias.get(m[1]);
        const receiver = sender && cast.pairings.find((pr) => pr.includes(sender))?.find((c) => c !== sender);
        messages.push({ para: i, sender, receiver, text: s.trim(), how: "narrated" });
      }
      if (buzzRe.test(s) && !messages.some((x) => x.para === i)) messages.push({ para: i, text: s.trim(), how: "narrated" });
    }
  });
  return { messages, rewritten };
}

/** Cheap pre-check: are there enough "Name: message" lines to be worth looking for a chat? */
export function looksLikeChat(paras: string[]): boolean {
  if (paras.filter((p) => /^\s*>\s*\S/.test(p) && p.length < 300).length >= 1 && paras.some((p) => /^\s*(?:<\s*\S|\S.*\s<\s*$)/.test(p))) return true;
  let n = 0;
  for (const p of paras) if (p.length < 400 && CHAT_LINE.test(p.trim())) n++;
  if (n >= 3) return true;
  return n >= 2 && paras.some((p) => TIMESTAMP.test(p.trim()) || (PHONE_CUE.test(p) && !CHAT_LINE.test(p.trim())));
}

const STRONG_SEXUAL = /\b(?:cock|dick|horny|jerk\w*|cum|cumming|coming for|nipples?|touch\w* (?:myself|yourself)|stroking|sucking|suck you|suck me|fuck (?:me|you (?:so|hard|until|senseless))|fucking (?:me|you)|let me (?:fuck|suck|ride|touch|taste|blow)|(?:want|wanna|going) to (?:fuck|ride|suck)|fuck(?:ed)? (?:me|you) (?:so|until|hard))\b/i;
const WEAK_SEXUAL = /\b(?:naked|hard|wet|moan\w*|ass|riding|kneel\w*|inside (?:you|me)|bed|shirtless|thinking about (?:you|it)|pic|pictures?)\b/gi;
/** A text that is clearly sexual: one strong word or phrase, or three weaker ones ("fuck off" and "holy fuck" are only swearing). */
const isSexual = (t: string) => STRONG_SEXUAL.test(t) || (t.match(WEAK_SEXUAL) ?? []).length >= 3;

export function summarizeTexts(messages: TextMessage[], where: (pi: number) => string): TextingResult {
  const pairs = new Map<string, { from: string; to: string; count: number }>();
  for (const m of messages) {
    if (!m.sender) continue;
    const key = `${m.sender.name}>${m.receiver?.name ?? "?"}`;
    const e = pairs.get(key) ?? { from: m.sender.name, to: m.receiver?.name ?? "someone", count: 0 };
    e.count++;
    pairs.set(key, e);
  }
  const chat = messages.filter((m) => m.how === "chat").length;
  const sexual = messages.filter((m) => m.how === "chat" && isSexual(m.text)).length;
  const list = [...pairs.values()].sort((a, b) => b.count - a.count);
  const examples = messages
    .filter((m) => m.sender)
    .sort((a, b) => Number(isSexual(b.text)) - Number(isSexual(a.text)) || a.para - b.para)
    .slice(0, 6)
    .map((m) => ({ from: m.sender!.name, to: m.receiver?.name ?? "someone", text: m.text.length > 200 ? `${m.text.slice(0, 197)}…` : m.text, where: where(m.para), how: m.how, sexual: isSexual(m.text) }));
  const summary = messages.length
    ? `${messages.length} text message${messages.length === 1 ? "" : "s"}${list.length ? ` (${list.slice(0, 3).map((p) => `${p.from} → ${p.to} ×${p.count}`).join(", ")})` : ""}${sexual ? `, ${sexual} sexual` : ""}`
    : "No text messages recognized.";
  return { occurs: messages.length > 0, summary, total: messages.length, chat, narrated: messages.length - chat, sexual, pairs: list, examples };
}
