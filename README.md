# Trust (Tags) But Verify

A small web app: drop in an AO3 download (PDF, EPUB, HTML, or TXT) and it tells you

1. **Fandom**
2. **Pairing**
3. **Word count**
4. **Who tops and bottoms**, and whether anyone switches:
   - **Anal:** top = penetrative partner, bottom = anally receptive partner.
   - **Oral**, reported per act in plain words rather than top/bottom:
     - **Blowjobs:** who sucks cock and who gets sucked.
     - **Rimming:** who eats ass and whose ass gets eaten.
     - **Cunnilingus** (shown when someone in the pair has a vagina): who eats out and who gets eaten out.

     Each act gets its own verdict, so someone who both sucks and rims their partner isn't mistaken for a switch.

   Every act also shows a **by-person** confidence for each partner in each role (e.g. Dunk tops 97% /
   bottoms 9%; Aerion sucks cock 97% / gets sucked 97%). The roles are scored independently, so someone who
   switches scores high on both. Each score is built from that person's scenes in the role (scenes worked
   out only from pronouns count less, and one shaky scene against many the other way counts little), plus
   hints (which alone stay under about 45%) and AO3 role tags (which alone stay around 60%).
5. **Vibe**: an overall rating for each partner in each pairing, from *Total top* through *Vers top*, *Vers* and
   *Vers bottom* to *Total bottom* (or *Unclear*), with a confidence score and the evidence it rests on (see
   [Vibe rating](#vibe-rating)).

## How it works

Analysis runs in the browser by default (the pattern engine in a background worker). If Claude analysis is
requested, the extracted story text is sent to Anthropic; the original file is not uploaded.
AO3 metadata is kept separately from story text. HTML chapter-note blocks and labeled notes in AO3 text/PDF
downloads are excluded from act detection when their boundaries are identifiable; when AO3 doesn't mark where a
chapter's notes end, only their first block is set aside, so a chapter is never lost. One-shots' preface summary
and notes are handled the same way. PDF line positions are used to preserve paragraph gaps, and a line that stops
mid-sentence is joined to the next, while one-paragraph-per-line text files keep their paragraphs.

**Fandom, pairing, word count** come from the tag block AO3 puts at the top of every download (PDF, EPUB,
HTML). Relationship tags with `/` count as pairings; `&` (platonic) tags are ignored. Without AO3 tags, the
word count is estimated and the main characters are guessed from frequently capitalized names.

**Top/bottom (free, no AI)** — `src/heuristic/` is a pattern-matching engine:

1. **Characters**: names and short forms from the AO3 tags (“Harry Potter” → “Harry”, “Potter”; shared
   surnames are dropped), gender from a built-in list of common fanfiction characters (for the fandoms the work is
   tagged with), the M/M / F/F category, or pronoun continuity in the text, and
   first-person (“I”) or reader-insert (“you”) narration. The narrator comes from a “POV X” tag, or else is the
   main character who is named in dialogue but rarely in narration. Without tags, a first name and surname
   that appear together (“Draco Malfoy”) but otherwise never share a sentence are merged into one person.
   **Original characters**: generic tags (“Original Male Character(s)”, “OFC”, “Original Characters”) are
   filled with the most-mentioned names in the text that aren't canon characters, so “Harry Potter/Original
   Male Character” becomes “Harry Potter/Jonah”. Named OC tags (“Kyle (Original Character)”, “OMC - Jonah”)
   are used as given, and Original Work fics with no character tags get their cast from the text. OCs
   take their gender from the tag and are listed in the notes.

   **Known characters and nicknames**: `src/heuristic/canon-data.ts` lists several hundred characters from ~70
   fandoms (Supernatural, Harry Potter, Captive Prince, Marvel, Stranger Things, 9-1-1, Teen Wolf, BTS/K-pop,
   anime, games, Wicked and more) with their other names (“Cas” for Castiel, “Damianos” for Damen, “Deadpool” for
   Wade). A nickname is added only if the text actually uses it, and names that look alike (“Damen”/“Damianos”)
   are merged. A work with two tags for one person (“Galinda Upland” beside “Glinda the Good”, when the text only
   says Glinda) becomes one character; two tags that are both well used (“Tom Riddle”, “Voldemort”) stay apart.
   A tagged character who never appears by name (“The Mute”) takes the name of the original character the text
   uses. First-person fics whose sections are headed by a name (“Scott - Saturday, September 6”) switch narrator
   at each heading.

   **Category presumption**: tagged *only* M/M (or only F/F), characters are presumed to be men (or women) and the
   sex to be between them. This is context, not a ban: a scene with someone of the other gender stays when it is
   clearly real (both people named, or the pair seen in more than one sentence) and is dropped when it rests on a
   single pronoun-only reading, which is where false flags come from. Any other category (F/M, Multi, Other) removes
   the presumption. A work rated Explicit or Not Rated with almost no recognised acts gets a note quoting the
   passages that read like sex scenes, since the sex may be written non-graphically.

   **Anatomy** follows the words in the text first (“his cunt”, “her cock”), then tags: a tag naming someone trans
   (“Trans Eddie Munson”) or saying they have a vagina or are intersex (“Intersex Dean Winchester”, “Dean
   Winchester Has A Vagina”) gives a man a vagina; “futanari” / trans-woman tags give a woman a penis. An *Omega*
   tag alone does **not**, because omegaverses differ; it takes an omega tag together with an intersex/vagina tag,
   and a general intersex/vagina tag with no names only makes men's anatomy uncertain.
2. **Act patterns**: ~50 sentence patterns per act — e.g. “X fucked Y”, “X’s cock slid into Y”, “Y rode X”,
   “Y’s hole clenched around X’s cock”, “Y sucked X off”, “X’s cock between Y’s lips”, “X rimmed Y”,
   “X’s tongue in Y’s hole”, passive forms (“Y was fucked by X”), fingering, and sentences with the subject
   left out (“climbed on top and rode him”). Words for the anus go beyond “hole” and “ass”: butthole, anus,
   pucker, rosebud, starfish, sphincter, ring of muscle, back entrance, and (for rimming) crack and cleft.
   The prostate counts as anal (“X nailed his prostate”, “milked”, “ground against”), and so do allusions to
   it, which are read as “his prostate”: “that bundle of nerves inside him”, “his sweet spot” (but not the
   sweet spot on his neck), “the spot inside Harry”, “his p-spot”, “the spot that made him see stars”. **Toys count**: dildos, vibrators, plugs, beads and strap-ons (“pushed the dildo into Dean”, “slid a vibrator
   inside her”, “fucked him with the strap-on”, “eased a plug into her ass”). **Whoever is penetrated is the
   bottom**; the one doing it (or wearing the strap-on or harness) is the top. Wearing a plug, lining a toy up at
   a hole, and strapping on a harness are hints. **Using a toy on yourself counts as bottoming**: fucking yourself on a dildo, sliding a plug or vibrator into yourself, riding one, teasing your hole with one, or wearing a plug each count about as much as a scene for that person's bottom odds and appear under “Sex acts” in the vibe. Women with women
   get the same treatment (strap-on play is vaginal sex, or anal when an ass is named); two women with no anal in
   the text get no anal card built from Top/Bottom tags. Someone tagged both “Top X” and “Bottom X” is versatile
   with their partner, never with themselves.
   Innocent look-alikes (“sucked in a breath”, “blew him a kiss”, “fingers in his hair”, “pushed into the room”,
   “top first, then trousers”, “top of my class”, “circled her clit” with a hand) are excluded.
3. **Pronouns and epithets**: “he”/“she” as a subject means the last subject; the other person in a two-person
   sex scene is the partner. Epithets are recognized for hair colour (“the blond”, “the redhead”, “the
   dark-haired man”), height (“the taller man”, “the shorter of the two”), size (“the bigger man”, “the
   smaller one”), age (“the older wizard”, “the younger man”, “the thirty-year-old”), nationality (“the
   American”, “the Brit”, “the Frenchman”), roles (“the alpha”, “the auror”), and stacks of these (“the tall
   American soldier”). Who they mean is learned from the text: “Draco’s blond hair”, “Harry was taller than
   Draco”, “Steve towered over Tony”, “Steve was a big man”, “Draco was two years older”, “Steve’s American
   accent”, “Bucky was from Russia”, “Draco, the blond,”, Alpha/Omega tags, and consistent use across the
   fic (a second pass). With two main characters, the opposite is inferred (taller known → shorter is the
   other). Otherwise an epithet falls back to “the person who isn’t the current subject”. Noble and medieval
   titles work as epithets too (“the lord”, “the baron”, “the prince”, “the knight”, “the squire”, “the
   countess”…). Titles worn by a named character teach the epithet ("Lord Cregan" → "the lord", "Prince Jacaerys" → "the prince"), and a word in front of a title doesn't change who it is ("the dragon prince", "the northern lord"). "The boy", "the lad", "the youth" and "the kid" mean the younger one. Relationship words (“his husband”, “her lover”) are always relative: they mean the partner of
   whoever “his” is, never one fixed person. After “permitted/let/forced X to …”, a later “he” is X. Each scene shows
   whether roles came from names or pronouns/epithets.
   More pronoun rules: in a sentence that names no one, “the hand on his cock and the tongue probing into him” is one
   person (the one receiving); after “Cas’s hands … holding him down as he …” or “Cas’s hand wandered, cupping …”
   the “he” and the participle belong to Cas; “Dean had no warning before he …” is the other man; “beg him to just
   fuck him” makes the asker the bottom. A qualifier on a relationship tag (“brief Castiel/Meg Masters”) is not
   part of the name. An untagged quote takes its speaker from the action sentence right before it (“Cas pulled his
   fingers free… ‘Good boy’”) or from the listener’s reaction right after it (“…” Dean’s breath hitched); lines
   about a show other people are performing (“the sub”, “his Dom”) are skipped.
4. **Desire / fantasy**: wanting (“he wanted Draco to fuck him”), imagining (“imagined Harry sucking him
   off”), hypotheticals, habits (“he’d always bottomed”), dialogue requests (“Fuck me,” Harry begged;
   “I want to ride you”), and negations (“didn’t want to bottom”). These are listed separately and never
   counted as acts. Negated acts (“didn’t fuck him”) are dropped.
5. **Hints (same-sex pairs)**: behaviour short of sex counts toward confidence. Fingering someone, checking out
   or grabbing their ass, grinding against it, lining up, slicking up or rolling on a condom suggests top;
   staring at someone’s crotch or bulge, a mouth watering at it, grinding one’s ass back, spreading one’s legs,
   getting on hands and knees, or kneeling between someone’s legs suggests bottom. Sucking on someone’s
   fingers (or having fingers pushed into one’s mouth) suggests the person sucking cock; fingering oneself or using a
   dildo, plug or toy on oneself (“fingered himself open”, “rode the plug”) suggests an anal bottom. Dialogue counts too
   (“nice ass”, “you’re so tight” → speaker tops; “you feel so big”, “I need your knot” → speaker bottoms).
   “Fuck me” only counts as a request when it is one: not after an interjection (“well, fuck me”), before a
   new clause (“fuck me, it’s cold”), in idioms (“fuck me sideways”), when muttered or sworn, or with no sex
   nearby in the narration.
   With no on-page anal sex, these give an “Unclear” verdict that leans one way, at low confidence.
   Everyday sentences are kept out: lying on your stomach counts as presenting only with ass or hips nearby; “pushed
   back” needs a sexual follow-on; leaking or aching needs a real hole word; “slid in next to” isn’t penetration;
   shoving someone aside, fights, torture and rescues, dancing, family hugs and “take over the job” aren’t
   dominance or submission; “no way X was asking…” is disbelief, not a stated dislike; “bottomed the dildo out” is
   the top seating a toy; “done this to himself” is solo prep; the slit of a cock isn’t cunnilingus. Weak dialogue
   cues (check-ins, aftercare, pet names) need an unambiguous sexual word within three paragraphs, or several loose
   ones, so comfort after a nightmare doesn’t count.
   A toy used on yourself counts as bottoming, and how sure it is depends on the wording: “fucked himself with the
   dildo” or “fucked his own ass” (or wearing a plug) counts fully, while “pushed the dildo into his ass” with no
   one else in the sentence counts a little over half as much. A long solo scene counts about twice, not once per
   sentence, and “got himself fucked” or “made himself come” are not solo toy use.
   **Solo acts** get their own card, per person: masturbation (“jerked himself off”, “stroked his own cock”,
   “masturbated”, “got himself off”, “thrust up into his own fist”), self-fingering and toys on oneself. Masturbation
   is never counted toward top or bottom. Self-fingering and toys keep counting as anal-bottom evidence for someone
   with an ass; for a woman (or anyone with a vulva) they count that way only when the sentence says ass or anal,
   otherwise they are solo and vaginal. A wish or plan (“wanted to touch himself”, “if he jerked off”) and a partner
   being touched (“jerked Eddie off”) are not solo acts.
   **Handjobs and frottage** between the pair get a card too: who uses their hand on whom (“stroked Steve’s cock”,
   “wrapped a hand around Eddie’s cock”, “shoved a hand into his underwear”, “tightened his grip on his cock”), and mutual
   moments (“wrapped his hands around them both”, “rubbed their cocks together”). They are not ranked top or bottom.
   “He stroked his cock” counts only with the partner in the sentence or the one before (and no thought of them), because on
   its own it is usually solo.
   Oral phrasings include a cock taken out of the mouth, a throat squeezing around a cock, a cock forced down the
   throat, fighting the urge to gag, tasting precum at the back of the throat, a grip in the hair with hips pushed
   forward, the back of the tongue around the head, and an open mouth against a zipper. “Not without taking …” cancels
   out, and “could taste/feel” is perception, not a hypothetical.
6. **Verdict and confidence**: hits are grouped into scenes. “Switches” means each partner tops in at
   least one scene (a single weak contrary hit is flagged as a possible exception instead). Confidence goes
   up with more scenes, named (not pronoun) evidence, matching AO3 tags (“Bottom X”, “Switching”) and
   matching desire/fantasy lines and hints, and down when tags or desires disagree. The reasons are shown on each card.
7. **Scene confidence**: every scene also gets its own “N% sure” (hover for why). It starts from the strength of
   the best sentence, goes up when several sentences agree or the people are named, and down when the people were
   only inferred, other sentences in the scene point the other way, or the wording is ambiguous (“rode him” can
   describe either partner). A shaky scene that goes against nearly every firm scene in the pair loses more. Scene
   confidence scales how much the scene counts toward the verdict, the per-person odds and the vibe rating, and a
   scene under 40% sure can’t on its own make someone a switch.
   **See what a rating rests on:** each line of a vibe card (“Sex acts: top ×99…”) expands into every piece of
   evidence behind it, with its role, weight, where it was found and the text it came from (a sentence, or the AO3
   tag). Tick any of them to send them with the error report; ticking one starts a report item for that rating.
8. **Report a mistake**: under each scene, hint line and vibe rating, “Report a mistake” opens a short form: tick what’s wrong (wrong
   character flagged as topping or bottoming, roles reversed, wrong act, not a sex act, solo act shown as a scene
   with the partner, a wish rather than an event, wrong people; for a vibe rating, leaning too far toward top or
   bottom, or the wrong confidence) and say why. Select part of a sentence first and it’s noted as the part you mean.
   Missed scenes (or any text you select on the page) and other comments can be added too, and each item has a
   checkbox to leave it out of the report.
   Each individual factor under a vibe rating has its own “What's wrong with this?” form with options for a wrong
   speaker, a pronoun pointing at the wrong person, credited to the wrong character, roles reversed, not a sexual cue,
   an everyday action, a figure of speech, a wish rather than an event, negated, counted twice, wrong tier, and counts
   for too much or too little. Scenes and hint lines offer the same kinds of options (wrong speaker, wrong pronoun,
   negated, figurative, duplicate…). The problems you name for a factor are printed right under that factor in the report. “Copy report for Claude” produces a text report (work tags, what the analyzer concluded, each
   flagged sentence with its surrounding passage, the scene confidence and reasons, and your explanation) to paste
   into Claude to find which pattern misfired. Nothing is sent anywhere; the report holds the passages you flag, so
   read it before sharing.

## Vibe rating

Each partner in a pairing gets one of *Total top*, *Vers top*, *Vers*, *Vers bottom*, *Total bottom* or
*Unclear*, plus a confidence score and a list of what it rests on. The evidence is weighed in this order, most
important first:

1. **Actual sex acts** in the work (penetration, strap-ons, fingering)
2. **Stating what they are or prefer**, and AO3 role tags.
   - *Said in dialogue:* “I'm a top”, “I like being on top”, “I never bottom”, “I never top”, “I love being fucked”.
   - *Said about someone:* “he liked being fucked”, “she loved being in control”, “he'd always been the one who topped”
     (or “the type to take charge” / “the one who took it”). “On top of the world” is nothing.
   - *Tags:* “Top X”, “Bottom X”, “Switch X”, “Power Bottom X” (a bottom who also takes charge), “Service Top X” (a top
     who also gives way), “Pillow Prince/Princess X” and “Size Queen X” (lean bottom), “Dominant X”/“Dom!X”
     (leans top) and “Submissive X”/“Sub X” (leans bottom) at a lower weight than Top/Bottom since a dynamic isn't a
     position, and pair-wide tags (“Switching”, “Dom/sub”, “Praise Kink”, “Daddy Kink”, “Power Dynamics”) which
     count a little for whoever gives the praise, pet names or care in the text.
3. **Groping and similar behaviour** (grabbing an ass, fingering, lining up, spreading legs), and **how the body
   shows it afterwards**, which is a strong bottom signal even without a named scene: a sore ass, walking funny or
   sitting down gingerly after a night with sex around it, come leaking out of a hole, a hole clenching around
   nothing, feeling full or empty. A leaking pipe, a sore throat and a long drive are not.
4. **Desires, plans and fantasies** (“he wanted Draco to fuck him”, “fuck me,” he begged)
5. **Other hints**, like ogling a bulge or an ass
6. **Dominant or submissive behaviour**, in or out of bed: pinning someone, taking control of a kiss, gripping a
   chin or wrists, giving orders, lifting or carrying, protecting someone, leading them by the hand (dominant);
   going pliant, yielding, letting someone lead, being pinned, squirming under a touch, looking up through the
   lashes (submissive). Also here, each a little weaker: *position and initiative* (pulling someone onto their lap,
   pinning wrists → top; climbing into a lap, having your wrists held → bottom; asking “ready?”, “tell me if it
   hurts” → top), *aftercare* (cleaning someone up or wrapping them in a blanket → top; being held close or curling
   up against someone afterwards → bottom; “let me clean you up”, “I've got you” → top; “hold me” → bottom), and
   *pet names* (“good boy” said to someone → top; “please, daddy/sir” → bottom), which only count when the
   scene around them is sexual. When the work is tagged with a dynamic (“Dom/sub”, “Praise Kink”…), these also count
   a little at tier 2 (pet names and aftercare only; ordinary pinning or protecting doesn't get the boost). *Cuddling positions* count too: resting or sleeping with your head on someone's chest and
   being the little spoon (“his back against Cas's chest”) read bottom; being the one whose chest it is and being the
   big spoon (“spooned him from behind”, “was the big spoon”) read top. Position and aftercare are two-sided, so the
   other person gets the opposite reading at a lower weight. These only feed the vibe, never the anal/oral cards.
7. **AO3 tag counts**: a very faint prior from how often AO3 tags the character as a top or bottom, for ~230
   popular characters (`src/heuristic/ao3-prior-data.ts`, from the community Top Tops / Top Bottoms / Most
   Versatile sheets). It is only used for characters in a fandom the work is tagged with, nudges per-person
   anal odds by at most about 15% on its own, and anything in the text outweighs it.

Each tier votes top or bottom with a strength that levels off as evidence piles up, and higher tiers outweigh
lower ones (`src/vibe.ts`). Confidence rises with how much evidence there is and how well it agrees, and is capped
when only faint hints (about 40%) or only the tag counts (about 12%) exist. A single faint hint never makes anyone
a “total”.

**“His clit” as a penis.** In some dom/sub fics a man’s penis is called his clit. When the tags say it’s that kind of work
(Master/Slave, Dom/sub, BDSM, humiliation, chastity, cock cages, feminization, “gender words just go anywhere”…), every
category is M/M, and nothing says anyone has a vulva (no intersex, omega, trans, pussy, cuntboy… tag), “his clit” and “Teo’s clit”
are read as cocks. Otherwise a clit stays a clit.

**Vaginal sex** is reported separately: only whether it happens and between whom. Anal vs vaginal is decided
by the words in the sentence (“his cunt”, “her ass”, “front hole”), not by gender, since trans men and intersex characters
(and omegas, in some omegaverses) may have vaginas and some women have penises; anatomy (by gender, or what the text says a character has)
is only the fallback. When a sentence doesn't say, it goes the way that bottom's clearly worded scenes went
(a character whose other scenes all mention his “seam” or “cunt” gets vaginal), then by the paragraph. Between
two men, a scene that still doesn't say is counted as anal. Going down on someone with a vagina is cunnilingus (the licker is the top, like rimming).

**Claude second opinion (optional)** — with your own Anthropic API key, Claude (Opus 5.5 by default) reads
the story text and returns the same result shape, including desire/fantasy lines and its own confidence. Long works
(over 150k words, or “Sex scenes only”) are cut down to the opening plus passages that look sexual, retaining
paragraph and chapter context.

Your API key stays in your browser and is sent only to `api.anthropic.com`.

## Running locally

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # parser, EPUB, pattern-engine, canon, anatomy and vibe tests (incl. a phrasing accuracy table)
npm run build    # static site in dist/
```

## Deploying

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main`. Turn it on once in
**Settings → Pages → Build and deployment → Source: GitHub Actions**. The build is plain static files, so
`dist/` also works on Netlify, Cloudflare Pages, etc.
