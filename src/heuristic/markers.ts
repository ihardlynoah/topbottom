

// ───────────── context markers ─────────────

export const NEG = /\b(?:not|never|no longer|no way|refused to|instead of|rather than|without|stopped (?:himself|herself|themself|myself) from|nobody|no one)\b|n['’]t\b/i;
export const FANTASY =
  /\b(?:imagin\w*|fantasi[sz]\w*|daydream\w*|(?<!\blike a (?:[\w'’]+ )?)dream(?:ed|t|s|ing)?(?![-‐ ]like\b| come true)|pictur(?:e|ed|ing|es)|thought about|thinking about|thinks about|think about|(?:the )?thought of|wonder(?:ed|ing|s)? (?:what|how|if)|in (?:his|her|their|my) (?:head|mind)|mind['’]s eye|fantasy|fantasies|porn|(?:the|a|this|that) vision (?:of|he|she|they|I|that|which))\b/i;
export const DESIRE =
  /\b(?:hop(?:e|es|ed|ing)(?:\s+(?:that|to|for))?(?![\w-])|(?:urge|itch|temptation|impulse|compulsion)s?(?:\s+to)?(?![\w-])|tempted(?:\s+to)?(?![\w-])|want\w*|wanna|need(?:ed|s|ing)? to|need(?:ed)? (?:him|her|them|you|me)|(?<!\b(?:take|takes|took|taking|taken|so|too|as|how|that|very|any|a|not|no|for|in|on|at|of)\s)long(?:ed|ing|s)? (?:to|for)|crav\w*|ach(?:ed|ing|es) (?:to|for)|wish\w*|desperate (?:to|for)|dying to|would love|['’]d love|['’]d\s+(?:(?:very|really|quite|so|much|just|absolutely|certainly|definitely|dearly|especially)\s+)*(?:like|rather|prefer)|would\s+(?:(?:very|really|quite|so|much|just|absolutely|certainly|definitely|dearly|especially)\s+)*(?:like|prefer|rather)|desires? (?:of|to|for)|offer(?:ed|s|ing)? to|plan(?:s|ned|ning)? to|beg(?:ged|s|ging)?|demand(?:ed|s|ing)?(?![\w-])|yearn\w*|hop(?:ed|ing|es) (?:to|that)|ask(?:ed|s|ing)? (?:him|her|them|me|you|[a-z][\w'’-]*) to|plead\w* (?:for|with)|itch(?:ed|ing)? to|(?:the )?(?:prospect|possibility|chance|thought|promise|idea)(?=\s+of\b|\s*$)|(?:whin|whimper|moan|beg|plead|pray|wish|hop)\w*\s+for(?:\s+[\w'’]+)?(?:\s+to\b|\s*$))/i;
/** "…see himself asking [Damen to fuck him]": the request word sits just before the match, which starts at the name. */
/** A sentence with its subject left out that opens on the wanting: "Wants to take Eddie to the back of his throat while Steve chokes on his cock." */
export const DESIRE_LEAD = /^\W*(?:wants?|needs?|longs?|aches?|craves?|wishes?|yearns?)\s+(?:to|for)\b/i;
/** "your ass is grass", "kick your ass", "pain in the ass": an ass that isn't one. */
/** An animal nearby: "good boy" may be said to it. */
export const ANIMAL_NEAR = /\b(?:dog|dogs|puppy|pup|doggo|hound|retriever|labrador|collie|terrier|corgi|beagle|cat|kitten|horse|pony|mare|stallion|parrot|bird)\b/i;
export const IDIOM_ASS = /\b(?:ass is grass|(?:kick|kicked|kicking|whoop|whooped|whooping|save|saved|saving|bust|busted|busting|cover|covered|covering|haul|hauled|hauling|bite|bit)\w*\s+(?:your|his|her|my|their|our)?\s*ass|pain in the ass|smart[- ]?ass|dumb[- ]?ass|half[- ]?ass|work\w*\s+(?:your|his|her|my|their)\s+ass\s+off|ass\s+(?:off|kicked|whooped))\b/i;
/** A toy (dildo, plug, vibrator…) used on oneself, or worn: that is bottoming, so it counts as such. */
/** Up to ~250 characters either side of a sentence, for checking a reading by eye. */
export function contextAround(para: string, sentence: string): string {
  const at = para.indexOf(sentence);
  if (at < 0) return "";
  const from = Math.max(0, at - 250);
  const to = Math.min(para.length, at + sentence.length + 250);
  return (from > 0 ? "…" : "") + para.slice(from, to).trim() + (to < para.length ? "…" : "");
}
/** The passage around a line for a mistake report. A quoted line also gets the paragraph before and after, where the speaker is usually named. */
export function contextFor(paras: string[], pi: number, sentence: string): string {
  const quoted = /^[“"‘]/.test(sentence.trim());
  const bare = sentence.replace(/^[“"‘]|[”"’]$/g, "");
  const para = paras[pi] ?? "";
  let own = contextAround(para, sentence) || contextAround(para, bare);
  if (!own && para) own = para.length > 520 ? `${para.slice(0, 519)}…` : para;
  if (!quoted) return own;
  const tail = (s: string) => (s.length > 220 ? `…${s.slice(-219)}` : s);
  const head = (s: string) => (s.length > 220 ? `${s.slice(0, 219)}…` : s);
  const before = pi > 0 ? paras[pi - 1] ?? "" : "";
  const after = paras[pi + 1] ?? "";
  return [before && tail(before.trim()), own, after && head(after.trim())].filter(Boolean).join(" ¶ ");
}
export const SOLO_TOY = /\b(?:dildos?|vibrators?|vibes?|butt\s*plugs?|plugs?|anal beads|beads|toys?|wand)\b/i;
export const REFLEXIVE = /\b(?:himself|herself|themselves|themself|myself|(?:his|her|their|my)\s+own)\b/i;
/** How much a toy used on yourself counts: certain when worded “himself” / “his own” or when a plug is worn, less when only inferred from there being no one else in the sentence. */
export const selfToyStrength = (d: { reflexive?: boolean; act: string }) => (d.reflexive || d.act === "wearing a plug" ? 1 : 0.55);
export const usesToyOnSelf = (d: { kind: string; act: string; sentence: string }) => (d.kind === "solo" || d.act === "wearing a plug") && SOLO_TOY.test(d.sentence);
export const DESIRE_TAIL = /\b(?:(?:ask|beg|plead|urg|offer)(?:ed|s|ing)?(?:\s+[\w'’-]+)?|desires?(?:\s+of)?(?:\s+\w+ly)?)\s*$/i;
export const HYPO_WINDOW = /\b(?:unless|capable of|able to|would have|meant to|intended to|(?:['’]ll|will)\s+(?:just\s+)?have to|gonna have to|(?:is|are|was|were|am|['’]s|['’]re|['’]m)\s+(?:just\s+)?(?:going|about)\s+to|gonna|if|someday|some day|one day|next time|maybe|perhaps|might|what it would be like|what it'd be like|would be (?:one|a|an|the|so|too|more|less|better|worse|easier|harder)|would have been|would (?:feel|look|sound|taste)|imagine\w*|supposing|so (?:he|she|they|I|we) (?:can|could|might|may|will|would))\b/i;
/** "Yeah, maybe Dunk would stop his snide comments and stuff his mouth…": the whole sentence is a what-if. */
/** Mouth words near a line of dialogue / in the line itself, and anal words that override the oral reading. */
export const ORAL_NEAR_RE = /\b(?:mouth|throat|gag\w*|choke[sd]?|lips|tongue|suck\w*|swallow\w*|blow\w*|deepthroat\w*|skull)\b/i;
export const ORAL_LINE_RE = /\b(?:swallow\w*|suck\w*|throat|gag\w*|choke|mouth|lips|tongue|blow\w*)\b/i;
export const ANAL_NEAR_RE = /\b(?:ass|arse|hole|asshole|inside him|inside me|inside you|prostate|rim|entrance|stretch\w*|lube[ds]?|slick\w*)\b/i;
export const HYPO_SENT = /^\W*(?:[\w'’]+[,!]\s+)?(?:(?:will|would|could|should|can|shall)\s+(?:he|she|they)\b|maybe|perhaps)\b[^.!?]*?\b(?:would|could|might|['’]d)\b/i;
/** Sentences where "was fucked / screwed" is really about sex (anatomy, how, or sex words). */
export const IDIOM_SAFE = /\b(?:cock|dick|prick|ass|arse|hole|claim\w*|alphas?|omegas?|mate[ds]?|mating|cunt|pussy|clit\w*|vagina|cunny|slick|wet|dripping|womb|heat|rut|bred|breed\w*|inside|thrust\w*|knot\w*|lube[ds]?|prostate|come|cum|bed|mattress|sheets?|moan\w*|gasp\w*|whimper\w*|beg\w*|hard|deep(?:ly)?|slow(?:ly)?|senseless|raw|open|into|against|until|over the|on (?:his|her|their|the)\b|all night|good and proper)\b/i;
/** In the matched words themselves: "is going to knot", "can just fuck", "would have let". */
export const HYPO_MATCH = /\bgonna\b|\bcan\s+just\b|\bwould\s+have\s+let\b/i;
export const DANGER = /\b(?:explo\w+|gun|guns|rifle|shotgun|knife|knives|stab\w*|shot|shoot\w*|bullet|blood\w*|bleed\w*|monster|demogorgon|demobat|vecna|upside down|torture\w*|tied (?:me|him|you|us) up|scream\w*|punch\w*|kick\w*|fight\w*|attack\w*|ambush\w*|weapon\w*|flinch\w*|lunged|crashed|fled|run!|duck(?:ed)?)\b/i;
export const SEX_STRICT = /\b(?:cock|dick|prick|lube|lubed|slick|slicked|naked|erection|prostate|anus|condom|orgasm|climax|rim\w*|knot|strap|dildo|pussy|clit|cum|cumming|nipples?|arous\w*|undress\w*|thighs?|crotch|bulge|boner|hard-?on|moan\w*|thrust\w*|shirtless|blowjob|handjob)\b/gi;
export const HYPO_AUX = /\b(?:would|could|will|might|should|shall|going|gonna|['’]d|['’]ll)\b/i;
export const HABIT_AUX = /\b(?:always|usually|never|often|typically|rarely|only|used)\b/i;
/** Fantasy markers strong enough to cover the whole rest of the sentence ("the vision he'd clung to, which included…"). */
export const STRONG_FANTASY =
  /(?<!\b(?:not|never|no)\s|n['’]t\s)\b(?:imagin(?:ed|es|ing)|fantasi[sz](?:ed|es|ing)|daydream\w*|(?<!\blike a (?:[\w'’]+ )?)dream(?:ed|t|s|ing)?(?![-‐ ]like\b| come true)|(?:the|a|this|that) vision (?:of|he|she|they|I|that|which)|fantas(?:y|ies)\s+(?:of|about))\b/i;
export const SCENE_BREAK = /^\s*(?:\*+|x{3,}|~+|-{3,}|—+|#+|o+0+o+|\* \* \*)\s*$/i;
export const FANTASY_PARA = /(?<!\b(?:not|never|no)\s|n['’]t\s)\b(?:(?<!\blike a (?:[\w'’]+ )?)dream(?:ed|t|s|ing)?(?![-‐ ]like\b| come true)|fantasi[sz](?:ed|ing|es)|fantasy|daydream\w*|imagin(?:ed|es|ing))\b/i;

export const SAY =
  "texted|sexted|typed|messaged|said|says|say|asked|asks|begged|begs|whispered|whispers|murmured|murmurs|moaned|moans|groaned|groans|gasped|gasps|panted|pants|breathed|breathes|growled|growls|hissed|hisses|whined|whines|pleaded|pleads|demanded|demands|ordered|orders|told|tells|mumbled|mumbles|muttered|mutters|replied|replies|answered|answers|added|adds|choked out|managed|grunted|grunts|purred|purrs|rasped|rasps|sighed|sighs|laughed|laughs|snapped|snaps|teased|teases|urged|urges|insisted|insists|admitted|admits|confessed|confesses|sobbed|sobs|cried|cries|whimpered|whimpers|husked|drawled|offered|suggested|blurted|croaked|keened|ground out|bit out|gritted out|continued|promised|warned|commanded|instructed|repeated|agreed|protested|swore|cursed|chuckled|smirked|grinned|smiled|hummed|crooned|coaxed|praised|soothed|groused|whispered against|murmured against|chuckles|smirks|snorted|scoffed|huffed|grins|rumbled|rumbles|snarled|snarls|croons|continues|explains|explained|goes on|went on|offers|warns";

