// Whose point of view each stretch of the text is told from.
//
// Fics tagged "Two POVs" (or written in alternating first person) hide the "he" problem inside each chapter: in a
// Steve chapter "He wanted Eddie to fuck him" is Steve, whoever was named in the line before. POV comes from chapter
// headings ("Chapter 3: Steve", "Eddie's POV"), from short name-only lines inside a chapter, and, failing those,
// from counting whose thoughts and feelings the chapter reports.

import type { Cast, Character } from "./characters";
import { looksLikeMessage } from "./texting";

/** Verbs of inner experience: the person they are said of is the one the camera is on. */
const INNER = "(?:felt|feels|thought|thinks|wondered|wonders|wanted|wants|knew|knows|realized|realised|noticed|decided|hoped|wished|needed|remembered|imagined|couldn['’]t help|tried not to|tried to|loved|hated|worried|feared|figured|suspected|swallowed|bit (?:his|her) lip|let out a breath)";

export interface PovMap {
  /** The point-of-view character at each paragraph, when known. */
  at: (Character | undefined)[];
  /** How it was found: from headings, or only from whose feelings are reported. */
  source: "headings" | "feelings" | "none";
}

export function detectPov(paras: string[], isChapterHead: (p: string) => boolean, cast: Cast, tags: string[] = []): PovMap {
  const at: (Character | undefined)[] = new Array(paras.length).fill(undefined);
  if (!cast.aliasPattern) return { at, source: "none" };
  const nameRe = new RegExp(`\\b(${cast.aliasPattern})\\b`, "g");
  const only = (text: string): Character | undefined => {
    const found = new Set<Character>();
    for (const m of text.matchAll(nameRe)) {
      const c = cast.byAlias.get(m[1]);
      if (c && c !== cast.secondPerson) found.add(c);
    }
    return found.size === 1 ? [...found][0] : undefined;
  };
  // A line that opens on a main character's name and then breaks off before any sentence: "Steve, Tuesday night",
  // "Eddie – later". Not when it opens with a quotation mark, and not when it is a full sentence ("Steve laughed.").
  const leadsWithName = (p: string): Character | undefined => {
    if (cast.narrator) return undefined; // first person: the engine reads "Scott - Saturday, …" narrator headings itself
    if (/^["“”‘'«]/.test(p) || /["“”]/.test(p)) return undefined;
    const m = p.match(new RegExp(`^(${cast.aliasPattern})\\b(.*)$`));
    if (!m) return undefined;
    const c = cast.byAlias.get(m[1]);
    if (!c || c === cast.secondPerson) return undefined;
    const rest = m[2].trim();
    if (!/^[,:;–—(|~-]/.test(rest)) return undefined;
    // "Ilya: who is this" is a chat line, not a heading: after a colon only a time or place may follow.
    if (rest.startsWith(":") && !/\b(?:\d|later|night|morning|evening|afternoon|dawn|dusk|earlier|before|after|january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(rest)) return undefined;
    if (/[.!?]\s+\S/.test(rest)) return undefined; // another sentence follows on the same line
    if (/[.!?]"?$/.test(rest) || rest.split(/\s+/).length > 8) return undefined; // a full sentence or a summary, not a heading
    return c;
  };
  const pairChars = new Set(cast.pairings.flat());
  const SPEECH = /^[\s,]*(?:asked|said|says|replied|answered|called|shouted|yelled|whispered|muttered|murmured|added|told|texted|sexted|typed|messaged|snapped|laughed|teased|continued|interrupted|offered|suggested|grumbled|groaned|sighed)\b/;
  const opener = (from: number, to: number): Character | undefined => {
    const head = paras[from] ?? "";
    for (let i = from + (isChapterHead(head) || /[–—-]/.test(head) && head.length < 70 ? 1 : 0); i < Math.min(to, from + 6); i++) {
      const raw = paras[i];
      if (!raw || /^\W*\d{1,4}[/.:-]\d/.test(raw) || /”\s+[\w. ]+ texted\.$/.test(raw) || looksLikeMessage(raw)) continue;
      const text = raw.replace(/[“"][^”"]*[”"]/g, " ");
      for (const m of text.matchAll(nameRe)) {
        const c = cast.byAlias.get(m[1]);
        if (!c || !pairChars.has(c) || c === cast.secondPerson) continue;
        if (SPEECH.test(text.slice(m.index! + m[0].length))) continue;
        return c;
      }
    }
    return undefined;
  };
  const firstPairName = (raw: string): Character | undefined => {
    if (!raw || /^\W*\d{1,4}[/.:-]\d/.test(raw) || /”\s+[\w. ]+ texted\.$/.test(raw) || looksLikeMessage(raw)) return undefined;
    const text = raw.replace(/[“"][^”"]*[”"]/g, " ");
    for (const m of text.matchAll(nameRe)) {
      const c = cast.byAlias.get(m[1]);
      if (!c || !pairChars.has(c) || c === cast.secondPerson) continue;
      if (SPEECH.test(text.slice(m.index! + m[0].length))) continue;
      return c;
    }
    return undefined;
  };
  const SENSE = `${INNER}|watched|saw|heard|looked|stared|glanced|could (?:see|feel|hear|tell)|had a hard time|had to|struck by|took a|rubbed|furrowed`;
  /** How many sentences in these paragraphs report what this character feels, sees or does as the viewpoint. */
  const experience = (c: Character, ps: string[]): number => {
    const names = [...cast.byAlias.entries()].filter(([, v]) => v === c).map(([k]) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (!names.length) return 0;
    const re = new RegExp(`(?:^|[.!?”"]\\s+)(?:${names.join("|")})\\s+(?:\\w+ly\\s+)?(?:${SENSE})\\b`, "g");
    return ps.reduce((n, p) => n + (p.replace(/[“"][^”"]*[”"]/g, " ").match(re) ?? []).length, 0);
  };
  // What the tags say about how the story is told. Third person is not always omniscient: "Third Person Limited" (or a POV
  // tag naming one character) means the camera sits on a character; "Omniscient" means it doesn't.
  const tagText = tags.join(" | ");
  const omniscient = /\bomniscient\b/i.test(tagText);
  const GENERIC = /^(?:first|second|third|alternating|multiple|outsider|switching|male|female|limited|close|deep|dual|two|changing|rotating|shifting|single|present|past)\b/i;
  const tagged = new Set<Character>();
  for (const f of tags) {
    const m = /^POV:?\s+(.+)$/i.exec(f.trim()) ?? /^(.+?)\s+POV$/i.exec(f.trim());
    if (!m || GENERIC.test(m[1].trim())) continue;
    const c = only(m[1]);
    if (c) tagged.add(c);
  }
  const limitedTag = /third[- ]person (?:limited|pov)|limited (?:third|pov|perspective)|close third|deep (?:third|pov)|tight pov|character[- ]limited/i.test(tagText);
  const altTag = /\bpov\b[^|]*\b(?:alternating|switching|multiple|dual|two|both|rotating|shifting|changing)\b|\b(?:alternating|switching|multiple|dual|two|both|rotating|shifting|changing)\b[^|]*\bpovs?\b|\b(?:two|multiple|dual) povs?\b/i.test(tagText);
  // The opener and mid-section rules read close third person ("Shane felt…"). In first person the first name in a section is
  // the one the narrator is talking to, so they would point at the wrong character.
  const alternating = (altTag || limitedTag || tagged.size > 1) && !cast.narrator && !omniscient;
  const soleTagged = tagged.size === 1 && !cast.narrator && !omniscient && !altTag ? [...tagged][0] : undefined;
  if (omniscient) return { at, source: "none" };
  const povWord = /\bpov\b|point of view|\bperspective\b/i;

  // Segments: from one chapter heading to the next.
  const starts: number[] = [];
  // A dated or timed section heading ("June 2011– Las Vegas", "Three weeks later– Detroit", "The same night– Boston") starts a
  // new stretch too: in alternating-POV fics the camera changes at these, not only at chapter headings.
  const SECTION = /^(?:(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(?:19|20)\d\d|(?:(?:an?|one|two|three|four|five|six|seven|eight|nine|ten|several|few|\d+)\s+)?(?:\w+\s+)?(?:days?|weeks?|months?|years?|hours?)\s+later|(?:the\s+)?(?:same|next|following)\s+(?:night|day|morning|evening|afternoon)|that\s+(?:night|evening|morning))\s*[–—-]+\s*\S.{0,30}$/i;
  // A scene-break line ("—•—", "* * *", "~") also starts a new stretch in a limited-third work, where the camera can change at it.
  const isSep = (p: string) => /^[\s—–\-*~•#=_·]{1,16}$/.test(p) && /[—–\-*~•#=_]/.test(p);
  const isHead = (p: string) => p.length < 120 && (isChapterHead(p) || (p.length < 70 && SECTION.test(p.trim())));
  // Untagged limited third: if the sections open on the character whose experience they then report, and both of the pair
  // take turns, treat the work as alternating limited third even without a tag.
  let autoLimited = false;
  if (!alternating && !cast.narrator && !omniscient && pairChars.size >= 2) {
    const marks: number[] = [];
    paras.forEach((p, i) => { if (isHead(p) || isSep(p)) marks.push(i); });
    if (marks[0] !== 0) marks.unshift(0);
    let clear = 0, agree = 0;
    const led = new Map<Character, number>();
    marks.forEach((from, k) => {
      const to = marks[k + 1] ?? paras.length;
      if (to - from < 4) return;
      const body = paras.slice(from, to);
      const exp = [...pairChars].map((c) => [c, experience(c, body)] as const).sort((a, b) => b[1] - a[1]);
      if (exp[0][1] < 2 || exp[0][1] < 2 * exp[1][1]) return;
      clear++;
      led.set(exp[0][0], (led.get(exp[0][0]) ?? 0) + 1);
      if (opener(from, to) === exp[0][0]) agree++;
    });
    const both = [...pairChars].filter((c) => (led.get(c) ?? 0) >= 2).length >= 2;
    autoLimited = clear >= 4 && agree / clear >= 0.75 && both;
  }
  const limited = alternating || autoLimited;
  paras.forEach((p, i) => { if (isHead(p) || (limited && isSep(p))) starts.push(i); });
  if (!starts.length || starts[0] !== 0) starts.unshift(0);
  let source: PovMap["source"] = "none";

  for (let s = 0; s < starts.length; s++) {
    const from = starts[s];
    const to = s + 1 < starts.length ? starts[s + 1] : paras.length;
    // 1. The heading: "Chapter 3: Steve", "Chapter 3 - Eddie's POV", "Steve POV".
    let pov: Character | undefined;
    const head = paras[from];
    if (from < paras.length && head.length < 120 && isChapterHead(head)) {
      const rest = head.replace(/^(?:chapter|ch\.?|part)\s*(?:\d+|[ivxlc]+|[a-z-]+)\b\s*[:.\-–—)]*\s*/i, "");
      const c = only(rest);
      if (c && (povWord.test(rest) || rest.replace(nameRe, "").replace(/['’]s|pov|\W+/gi, "").trim() === "")) pov = c;
    }
    // 1b. In a work tagged as alternating POV, a section opens on its point-of-view character: the first one of the pair
    // named in its narration (not in a quoted line, a chat line or a speech tag).
    if (!pov && limited && from < paras.length && (isChapterHead(head) || SECTION.test(head.trim()) || isSep(head))) pov = opener(from, to);
    // 1c. A tag naming one POV character in a third-person work ("POV Steve Harrington") makes it that character's throughout.
    if (!pov && soleTagged) pov = soleTagged;
    // 2. Name-only lines inside the chapter switch the POV from there on.
    let current = pov;
    let sawMarker = !!pov;
    let lastSwitch = from;
    for (let i = from; i < to; i++) {
      const p = paras[i].trim();
      // In an alternating-POV work the camera can change inside a section with nothing marking it. Switch when the
      // narration moves to the other one of the pair and the next few paragraphs report their experience, not the current one's.
      if (limited && current && i - lastSwitch >= 8) {
        const first = firstPairName(paras[i]);
        if (first && first !== current) {
          const ahead = paras.slice(i, i + 9);
          const mine = experience(first, ahead);
          if (mine >= 3 && mine >= 3 * experience(current, ahead)) { current = first; lastSwitch = i; sawMarker = true; }
        }
      }
      if (i > from && p.length > 0 && p.length <= 40 && !looksLikeMessage(paras[i + 1] ?? "")) {
        const c = only(p);
        if (c && p.replace(nameRe, "").replace(/['’]s|pov|point of view|[\s:\-–—()\[\]|~*#]/gi, "") === "") { current = c; sawMarker = true; }
        else if (leadsWithName(p)) { current = leadsWithName(p); sawMarker = true; }
      }
      at[i] = current;
    }
    if (sawMarker) { source = "headings"; continue; }

    // 3. No marker: whose feelings does the chapter report?
    const seg = paras.slice(from, to).join(" ");
    const counts = new Map<Character, number>();
    for (const c of cast.chars) {
      if (c === cast.secondPerson) continue;
      const names = [...cast.byAlias.entries()].filter(([, v]) => v === c).map(([k]) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      if (!names.length) continue;
      const re = new RegExp(`(?:^|[.!?”"]\\s+)(?:${names.join("|")})\\s+(?:${INNER})\\b`, "g");
      counts.set(c, (seg.match(re) ?? []).length);
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const [top, second] = ranked;
    if (top && top[1] >= 6 && top[1] >= 2.5 * (second?.[1] ?? 0)) {
      for (let i = from; i < to; i++) at[i] = top[0];
      if (source === "none") source = "feelings";
    }
  }
  return { at, source };
}

/** A sentence whose "he" / "his" is the point-of-view character: inner experience, or their body reacting. */
export const POV_SENTENCE = new RegExp(
  `^\\W*(?:He|She)\\s+(?:\\w+ly\\s+)?${INNER}\\b|^\\W*(?:His|Her)\\s+(?:heart|stomach|chest|cheeks|face|hands|mind|thoughts|breath|pulse|throat|knees|skin)\\b`,
);
