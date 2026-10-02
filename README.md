# Top/Bottom Finder

A small web app: drop in an AO3 download (PDF, EPUB, HTML, or TXT) and it tells you

1. **Fandom**
2. **Pairing**
3. **Word count**
4. **Who tops and bottoms**, and whether anyone switches:
   - **Anal:** top = penetrative partner, bottom = anally receptive partner.
   - **Oral:** top = penetrative partner (getting their dick sucked, or eating ass), bottom = orally receptive partner (sucking dick, or having their ass eaten).

## How it works

Everything runs in the browser; files are never uploaded.

**Fandom, pairing, word count** come from the tag block AO3 puts at the top of every download (PDF, EPUB,
HTML). Relationship tags with `/` count as pairings; `&` (platonic) tags are ignored. Without AO3 tags, the
word count is estimated and the main characters are guessed from frequently capitalized names.

**Top/bottom (free, no AI)** — `src/heuristic/` is a pattern-matching engine:

1. **Characters**: names and short forms from the AO3 tags (“Harry Potter” → “Harry”, “Potter”; shared
   surnames are dropped), gender from the M/M / F/F category or from pronoun continuity in the text, and
   first-person (“I”) or reader-insert (“you”) narration.
2. **Act patterns**: ~50 sentence patterns per act — e.g. “X fucked Y”, “X’s cock slid into Y”, “Y rode X”,
   “Y’s hole clenched around X’s cock”, “Y sucked X off”, “X’s cock between Y’s lips”, “X rimmed Y”,
   “X’s tongue in Y’s hole”, passive forms (“Y was fucked by X”), fingering, and sentences with the subject
   left out (“climbed on top and rode him”). Innocent look-alikes (“sucked in a breath”, “blew him a kiss”,
   “fingers in his hair”, “pushed into the room”) are excluded.
3. **Pronouns**: “he”/“she” as a subject means the last subject; the other person in a two-person sex
   scene is the partner. Each scene shows whether roles came from names or from pronouns.
4. **Desire / fantasy**: wanting (“he wanted Draco to fuck him”), imagining (“imagined Harry sucking him
   off”), hypotheticals, habits (“he’d always bottomed”), dialogue requests (“Fuck me,” Harry begged;
   “I want to ride you”), and negations (“didn’t want to bottom”). These are listed separately and never
   counted as acts. Negated acts (“didn’t fuck him”) are dropped.
5. **Verdict and confidence**: hits are grouped into scenes. “Switches” means each partner tops in at
   least one scene (a single weak contrary hit is flagged as a possible exception instead). Confidence goes
   up with more scenes, named (not pronoun) evidence, matching AO3 tags (“Bottom X”, “Switching”) and
   matching desire/fantasy lines, and down when tags or desires disagree. The reasons are shown on each card.

Vaginal sex isn’t counted as anal; going down on a woman is cunnilingus (the licker is the top, like rimming).

**Claude second opinion (optional)** — with your own Anthropic API key, Claude (Opus 5.5 by default) reads
the fic and returns the same result shape, including desire/fantasy lines and its own confidence. Long works
(over 150k words, or “Sex scenes only”) are cut down to the opening plus the passages that look sexual.

Your API key stays in your browser and is sent only to `api.anthropic.com`.

## Running locally

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # parser + pattern-engine tests (incl. a 110-sentence phrasing accuracy table)
npm run build    # static site in dist/
```

## Deploying

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main`. Turn it on once in
**Settings → Pages → Build and deployment → Source: GitHub Actions**. The build is plain static files, so
`dist/` also works on Netlify, Cloudflare Pages, etc.
