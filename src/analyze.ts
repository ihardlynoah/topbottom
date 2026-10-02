// Asks Claude to work out fandom, pairing, and who tops/bottoms in the sex scenes.

import Anthropic from "@anthropic-ai/sdk";
import { type Ao3Meta, countWords } from "./ao3";
import type { ActResult, Analysis } from "./types";

/** Claude's raw answer; converted to the shared Analysis shape below. */
interface ClaudeAct extends Omit<ActResult, "confidence"> {
  confidence: { level: "High" | "Medium" | "Low"; reasons: string[] };
}
interface ClaudeVaginal {
  occurs: boolean;
  summary: string;
  instances: { participants: string[]; act: string; where: string; evidence: string }[];
  confidence: { level: "High" | "Medium" | "Low"; reasons: string[] };
}
interface ClaudeAnswer {
  fandom: string;
  main_pairing: string;
  pairings: { pairing: string; anal: ClaudeAct; oral: ClaudeAct; vaginal: ClaudeVaginal }[];
  notes: string;
}

export const MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 (most accurate)", inputPerM: 4 },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (cheaper)", inputPerM: 2 },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];

const instanceSchema = {
  type: "object",
  properties: {
    top: { type: "string", description: "Character name of the top (penetrative partner) in this instance." },
    bottom: { type: "string", description: "Character name of the bottom (receptive partner) in this instance." },
    act: { type: "string", description: "Short label, e.g. 'anal sex', 'blowjob', 'rimming', 'strap-on', 'fingering'." },
    where: { type: "string", description: "Chapter number/title or scene description so the reader can find it." },
    evidence: { type: "string", description: "A brief paraphrase (not a long quote) showing who did what." },
  },
  required: ["top", "bottom", "act", "where", "evidence"],
  additionalProperties: false,
};

const actSchema = {
  type: "object",
  properties: {
    verdict: {
      type: "string",
      enum: ["none", "one_way", "switch", "unclear"],
      description:
        "none = this act never happens on-page; one_way = always the same top; switch = both partners top at least once; unclear = it happens but roles can't be determined.",
    },
    top: { type: "string", description: "The usual/primary top. Empty string if verdict is none or unclear." },
    bottom: { type: "string", description: "The usual/primary bottom. Empty string if verdict is none or unclear." },
    summary: { type: "string", description: "One or two sentences, e.g. 'Harry tops every time (3 scenes).' or 'Mostly Draco tops; Harry tops once in ch. 12.'" },
    instances: { type: "array", items: instanceSchema },
    desires: {
      type: "array",
      description: "Lines where a character wants, asks for, imagines, or rejects a role in this act (not counted as instances).",
      items: {
        type: "object",
        properties: {
          who: { type: "string" },
          role: { type: "string", enum: ["top", "bottom"] },
          wants: { type: "boolean", description: "false if they say they do NOT want this role." },
          kind: { type: "string", enum: ["said", "wanted", "fantasy", "hypothetical", "identity", "ogling", "touch", "fingering"] },
          act: { type: "string" },
          where: { type: "string" },
          evidence: { type: "string", description: "Short paraphrase." },
        },
        required: ["who", "role", "wants", "kind", "act", "where", "evidence"],
        additionalProperties: false,
      },
    },
    confidence: {
      type: "object",
      properties: {
        level: { type: "string", enum: ["High", "Medium", "Low"] },
        reasons: { type: "array", items: { type: "string" }, description: "One to three short reasons." },
      },
      required: ["level", "reasons"],
      additionalProperties: false,
    },
  },
  required: ["verdict", "top", "bottom", "summary", "instances", "desires", "confidence"],
  additionalProperties: false,
};

const confidenceSchema = {
  type: "object",
  properties: {
    level: { type: "string", enum: ["High", "Medium", "Low"] },
    reasons: { type: "array", items: { type: "string" }, description: "One to three short reasons." },
  },
  required: ["level", "reasons"],
  additionalProperties: false,
};

const vaginalSchema = {
  type: "object",
  description: "Vaginal sex: only whether it happens and between whom (no top/bottom).",
  properties: {
    occurs: { type: "boolean" },
    summary: { type: "string", description: "e.g. 'Yes, between Ana and Ben (2 scenes).' or 'No on-page vaginal sex.'" },
    instances: {
      type: "array",
      items: {
        type: "object",
        properties: {
          participants: { type: "array", items: { type: "string" } },
          act: { type: "string", description: "'vaginal sex' or 'fingering'." },
          where: { type: "string" },
          evidence: { type: "string" },
        },
        required: ["participants", "act", "where", "evidence"],
        additionalProperties: false,
      },
    },
    confidence: confidenceSchema,
  },
  required: ["occurs", "summary", "instances", "confidence"],
  additionalProperties: false,
};

const analysisSchema = {
  type: "object",
  properties: {
    fandom: { type: "string", description: "The fandom(s). Use the AO3 tags if provided, otherwise infer from the text." },
    main_pairing: { type: "string", description: "The main romantic/sexual pairing in 'A/B' form." },
    pairings: {
      type: "array",
      description: "One entry per pairing that has any on-page sex (or the main pairing if none do).",
      items: {
        type: "object",
        properties: {
          pairing: { type: "string" },
          anal: actSchema,
          oral: actSchema,
          vaginal: vaginalSchema,
        },
        required: ["pairing", "anal", "oral", "vaginal"],
        additionalProperties: false,
      },
    },
    notes: {
      type: "string",
      description: "Anything the reader should know: fade-to-black scenes, implied-only sex, threesomes, excerpt-only analysis, etc. Empty string if nothing.",
    },
  },
  required: ["fandom", "main_pairing", "pairings", "notes"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You analyze fanfiction (usually from Archive of Our Own) for readers who want to know the sexual role dynamics of a work before reading it. The work is fiction; report what happens in it accurately and matter-of-factly.

Use these definitions exactly:

ANAL
- Top = the penetrative partner (the one whose penis, strap-on, or toy they control penetrates the other's ass).
- Bottom = the anally receptive partner.
- Base the anal verdict on penetrative anal sex (penis, strap-on, or a toy used on a partner). Fingering alone does not decide the verdict, but list it as an instance with act "fingering" and mention it in the summary if it is the only anal activity.

VAGINAL
- Vaginal sex is reported separately: only whether it happens and between whom. It never counts as anal.
- Decide anal vs vaginal by what the text says, not by gender: in omegaverse fics and with trans characters, male characters may have vaginas ("his cunt", "his front hole"), and some women have penises. If a scene with such a character doesn't say which, use context; if it's truly unclear, say so in notes.

ORAL
- Top = the penetrative partner: the person getting their dick sucked, or the person eating ass (rimming — their tongue is the penetrating part).
- Bottom = the orally receptive partner: the person sucking dick, or the person having their ass eaten.
- So in a blowjob, the one receiving it is the top; in rimming, the one doing the rimming is the top.
- If cunnilingus occurs, treat it like rimming (the one doing the licking is the top) and label the act "cunnilingus".

SWITCHING
- verdict "switch" means each partner is the top at least once for that act category anywhere in the work. Set top/bottom to whoever tops more often (if it's even, pick either and say so in the summary).
- verdict "one_way" means every instance has the same top.
- Count only sex that actually happens between characters in the story (including flashbacks). Do not count fantasies, dreams, or sex that is only talked about, but do mention them in notes if they hint at roles. If sex is clearly implied but cut away from (fade to black) and roles are stated or obvious, count it and say it was implied in the evidence.

DESIRE / FANTASY
- Separately from what happens, list lines where a character wants, asks for, imagines, dreams about, or says they prefer a role ("I want you to fuck me", "he'd always bottomed", "he imagined Draco on his knees"), or says they do NOT want a role (wants: false). kind: said (dialogue), wanted (narrated desire), fantasy (imagined/dreamed), hypothetical (would/if), identity (habit or self-description like "I'm a bottom").
- Also list behaviour that hints at roles for same-sex pairs (not for M/F pairs): checking out or grabbing someone's ass suggests the looker/grabber would top (kind "ogling" or "touch", role "top"); staring at someone's crotch or bulge, or their mouth watering at it, suggests the looker would bottom (role "bottom"); grinding one's ass back against someone suggests bottom; fingering someone suggests the fingerer tops (kind "fingering", role "top").
- These do not count as instances, but use them in your confidence.

CONFIDENCE
- High: clear on-page scenes with unambiguous roles. Medium: some ambiguity (pronoun confusion, few scenes, implied sex). Low: mostly inferred from desire lines, tags, or vague text.

OTHER RULES
- Use the characters' names as they appear in the AO3 relationship tags when available.
- Original characters: when tags only say "Original Male Character(s)", "Original Female Character", "OMC", "OFC" and the like (or the fandom is "Original Work"), use the names the text gives them (e.g. "Tanner/Jacks"), never the generic tag, and mark them with "(OC)" once in notes.
- List every distinct sex scene as an instance (one per act per scene). Keep evidence short — a paraphrase, not a long quote.
- If there are AO3 tags provided, use them for fandom and pairing, but analyze roles from the text itself, not from tags like "Bottom X" (those can be wrong or describe only part of the fic). Mention in notes if the text contradicts such tags.
- If there is no sex of a given kind, use verdict "none", empty top/bottom, an empty instances array, and a summary like "No on-page oral sex."`;

/** Paragraphs that look like part of a sex scene. */
const STRONG = /\b(cock|dick|prick|lube[ds]?|rimm(?:ing|ed)|blow ?jobs?|strap-?on|cum(?:s|ming)?|fuck(?:s|ed|ing)? (?:him|her|them|me|you)|(?:his|her|their) hole|prostate|deepthroat|sucks? (?:him|her|them) off|eats? (?:him|her|them) out|inside (?:him|her|them|me))\b/i;
const WEAK = /\b(ass|arse|tongue|mouth|thrust|finger(?:s|ed|ing)?|suck(?:s|ed|ing)?|swallow|moan(?:s|ed|ing)?|naked|hard|wet|slick|stretch(?:ed|ing)?|hips|thighs|come|came|orgasm|bed|kneel(?:s|ed|ing)?|knees)\b/gi;

function isExplicit(p: string): boolean {
  if (STRONG.test(p)) return true;
  const weak = new Set((p.match(WEAK) ?? []).map((w) => w.toLowerCase()));
  return weak.size >= 3;
}

/** Cut a long work down to its sex scenes (with surrounding context) plus the opening. */
export function excerptExplicit(text: string, context = 3): { text: string; words: number } {
  const paras = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const keep = new Array<boolean>(paras.length).fill(false);

  // Keep the opening so the model learns who the characters are.
  let opening = 0;
  for (let i = 0; i < paras.length && opening < 1500; i++) {
    keep[i] = true;
    opening += countWords(paras[i]);
  }
  // Chapter headings help the model say where things happen.
  paras.forEach((p, i) => {
    if (/^chapter\s+\w+/i.test(p) && p.length < 200) keep[i] = true;
  });
  paras.forEach((p, i) => {
    if (!isExplicit(p)) return;
    for (let j = Math.max(0, i - context); j <= Math.min(paras.length - 1, i + context); j++) keep[j] = true;
  });

  const out: string[] = [];
  let skipped = false;
  paras.forEach((p, i) => {
    if (keep[i]) {
      if (skipped) out.push("[…]");
      out.push(p);
      skipped = false;
    } else skipped = true;
  });
  if (skipped) out.push("[…]");
  const joined = out.join("\n\n");
  return { text: joined, words: countWords(joined) };
}

/** Rough token estimate for cost display (English prose is ~1.35 tokens/word on current models). */
export function estimateTokens(words: number): number {
  return Math.round(words * 1.35);
}

function metaBlock(meta: Ao3Meta): string {
  const lines: string[] = [];
  if (meta.title) lines.push(`Title: ${meta.title}`);
  if (meta.fandoms.length) lines.push(`Fandom tags: ${meta.fandoms.join(", ")}`);
  if (meta.relationships.length) lines.push(`Relationship tags: ${meta.relationships.join(", ")}`);
  if (meta.characters.length) lines.push(`Character tags: ${meta.characters.join(", ")}`);
  return lines.length ? lines.join("\n") : "(No AO3 tags found in this file.)";
}

export class RefusalError extends Error {}

const LEVEL_SCORE = { High: 0.9, Medium: 0.62, Low: 0.3 } as const;

function toAnalysis(a: ClaudeAnswer): Analysis {
  const act = (x: ClaudeAct): ActResult => ({
    ...x,
    confidence: { score: LEVEL_SCORE[x.confidence.level], label: x.confidence.level, reasons: x.confidence.reasons },
  });
  return {
    source: "claude",
    fandom: a.fandom,
    main_pairing: a.main_pairing,
    pairings: a.pairings.map((p) => ({
      pairing: p.pairing,
      anal: act(p.anal),
      oral: act(p.oral),
      vaginal: {
        occurs: p.vaginal.occurs,
        applicable: p.vaginal.occurs || p.vaginal.instances.length > 0,
        summary: p.vaginal.summary,
        instances: p.vaginal.instances.map((i) => ({
          top: i.participants[0] ?? "",
          bottom: i.participants[1] ?? "",
          act: i.act,
          where: i.where,
          evidence: i.evidence,
        })),
        confidence: {
          score: LEVEL_SCORE[p.vaginal.confidence.level],
          label: p.vaginal.confidence.level,
          reasons: p.vaginal.confidence.reasons,
        },
      },
    })),
    notes: a.notes,
  };
}

export async function analyzeWork(opts: {
  apiKey: string;
  model: ModelId;
  meta: Ao3Meta;
  text: string;
  excerpted: boolean;
  signal?: AbortSignal;
}): Promise<Analysis> {
  const client = new Anthropic({ apiKey: opts.apiKey, dangerouslyAllowBrowser: true });

  const userContent =
    `<ao3_tags>\n${metaBlock(opts.meta)}\n</ao3_tags>\n\n` +
    (opts.excerpted
      ? "Note: the work was long, so below are the opening plus every passage that looked sexual, with [...] marking skipped text. Mention in notes that only excerpts were analyzed.\n\n"
      : "") +
    `<work>\n${opts.text}\n</work>\n\n` +
    "Determine the fandom, the main pairing, the anal and oral top/bottom dynamics (including any switching) for each pairing that has sex, and whether vaginal sex happens and between whom.";

  const stream = client.beta.messages.stream(
    {
      model: opts.model,
      max_tokens: 32000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "high",
        format: { type: "json_schema", schema: analysisSchema },
      },
      // If a safety classifier declines, retry server-side on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    },
    { signal: opts.signal },
  );
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    const why = message.stop_details?.explanation;
    throw new RefusalError(`Claude declined to analyze this work${why ? `: ${why}` : "."}`);
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error("The response was cut off before finishing. Try again, or use excerpt mode.");
  }
  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("Claude returned no answer.");
  return toAnalysis(JSON.parse(textBlock.text) as ClaudeAnswer);
}
