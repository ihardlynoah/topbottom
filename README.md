# Top/Bottom Finder

A small web app: drop in an AO3 download (PDF, EPUB, HTML, or TXT) and it tells you

1. **Fandom**
2. **Pairing**
3. **Word count**
4. **Who tops and bottoms**, and whether anyone switches:
   - **Anal:** top = penetrative partner, bottom = anally receptive partner.
   - **Oral:** top = penetrative partner (getting their dick sucked, or eating ass), bottom = orally receptive partner (sucking dick, or having their ass eaten).

## How it works

Everything runs in the browser (the pattern engine in a background worker); files are never uploaded.

**Fandom, pairing, word count** come from the tag block AO3 puts at the top of every download (PDF, EPUB,
HTML). Relationship tags with `/` count as pairings; `&` (platonic) tags are ignored. Without AO3 tags, the
word count is estimated and the main characters are guessed from frequently capitalized names.

**Top/bottom (free, no AI)** — `src/heuristic/` is a pattern-matching engine:

1. **Characters**: names and short forms from the AO3 tags (“Harry Potter” → “Harry”, “Potter”; shared
   surnames are dropped), gender from the M/M / F/F category or from pronoun continuity in the text, and
   first-person (“I”) or reader-insert (“you”) narration. The narrator comes from a “POV X” tag, or else is the
   main character who is named in dialogue but rarely in narration. Without tags, a first name and surname
   that appear together (“Draco Malfoy”) but otherwise never share a sentence are merged into one person.
   **Original characters**: generic tags (“Original Male Character(s)”, “OFC”, “Original Characters”) are
   filled with the most-mentioned names in the text that aren't canon characters, so “Harry Potter/Original
   Male Character” becomes “Harry Potter/Jonah”. Named OC tags (“Kyle (Original Character)”, “OMC - Jonah”)
   are used as given, and Original Work fics with no character tags get their cast from the text. OCs
   take their gender from the tag and are listed in the notes.
2. **Act patterns**: ~50 sentence patterns per act — e.g. “X fucked Y”, “X’s cock slid into Y”, “Y rode X”,
   “Y’s hole clenched around X’s cock”, “Y sucked X off”, “X’s cock between Y’s lips”, “X rimmed Y”,
   “X’s tongue in Y’s hole”, passive forms (“Y was fucked by X”), fingering, and sentences with the subject
   left out (“climbed on top and rode him”). Innocent look-alikes (“sucked in a breath”, “blew him a kiss”,
   “fingers in his hair”, “pushed into the room”) are excluded.
3. **Pronouns and epithets**: “he”/“she” as a subject means the last subject; the other person in a two-person
   sex scene is the partner. Epithets are recognized for hair colour (“the blond”, “the redhead”, “the
   dark-haired man”), height (“the taller man”, “the shorter of the two”), size (“the bigger man”, “the
   smaller one”), age (“the older wizard”, “the younger man”, “the thirty-year-old”), nationality (“the
   American”, “the Brit”, “the Frenchman”), roles (“the alpha”, “the auror”), and stacks of these (“the tall
   American soldier”). Who they mean is learned from the text: “Draco’s blond hair”, “Harry was taller than
   Draco”, “Steve towered over Tony”, “Steve was a big man”, “Draco was two years older”, “Steve’s American
   accent”, “Bucky was from Russia”, “Draco, the blond,”, Alpha/Omega tags, and consistent use across the
   fic (a second pass). With two main characters, the opposite is inferred (taller known → shorter is the
   other). Otherwise an epithet falls back to “the person who isn’t the current subject”. Each scene shows
   whether roles came from names or pronouns/epithets.
4. **Desire / fantasy**: wanting (“he wanted Draco to fuck him”), imagining (“imagined Harry sucking him
   off”), hypotheticals, habits (“he’d always bottomed”), dialogue requests (“Fuck me,” Harry begged;
   “I want to ride you”), and negations (“didn’t want to bottom”). These are listed separately and never
   counted as acts. Negated acts (“didn’t fuck him”) are dropped.
5. **Hints (same-sex pairs)**: behaviour short of sex counts toward confidence. Fingering someone, checking out
   or grabbing their ass, grinding against it, lining up, slicking up or rolling on a condom suggests top;
   staring at someone’s crotch or bulge, a mouth watering at it, grinding one’s ass back, spreading one’s legs,
   getting on hands and knees, or kneeling between someone’s legs suggests bottom. Dialogue counts too
   (“nice ass”, “you’re so tight” → speaker tops; “you feel so big”, “I need your knot” → speaker bottoms).
   With no on-page anal sex, these give an “Unclear” verdict that leans one way, at low confidence.
6. **Verdict and confidence**: hits are grouped into scenes. “Switches” means each partner tops in at
   least one scene (a single weak contrary hit is flagged as a possible exception instead). Confidence goes
   up with more scenes, named (not pronoun) evidence, matching AO3 tags (“Bottom X”, “Switching”) and
   matching desire/fantasy lines and hints, and down when tags or desires disagree. The reasons are shown on each card.

**Vaginal sex** is reported separately: only whether it happens and between whom. Anal vs vaginal is decided
by the words in the sentence (“his cunt”, “her ass”, “front hole”), not by gender, since male omegas and trans
men may have vaginas and some women have penises; anatomy (by gender, or what the text says a character has)
is only the fallback. When a sentence doesn't say, it goes the way that bottom's clearly worded scenes went
(an omega whose other scenes all mention his “seam” or “cunt” gets vaginal), then by the paragraph. Going down on someone with a vagina is cunnilingus (the licker is the top, like rimming).

**Claude second opinion (optional)** — with your own Anthropic API key, Claude (Opus 5.5 by default) reads
the fic and returns the same result shape, including desire/fantasy lines and its own confidence. Long works
(over 150k words, or “Sex scenes only”) are cut down to the opening plus the passages that look sexual.

Your API key stays in your browser and is sent only to `api.anthropic.com`.

## Running locally

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # parser + pattern-engine tests (incl. a ~150-sentence phrasing accuracy table)
npm run build    # static site in dist/
```

## Deploying

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main`. Turn it on once in
**Settings → Pages → Build and deployment → Source: GitHub Actions**. The build is plain static files, so
`dist/` also works on Netlify, Cloudflare Pages, etc.
