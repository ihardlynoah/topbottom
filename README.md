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
   Bottom wishes and tastes in dialogue: “I want to get fucked”, “I wanna be bred”, “I want him to plow me”, “I want his cock
   inside me”, “put it in me”, “come inside me”, “plow me”, “take me hard”, “I want to ride that dick” (whoever the cock
   belongs to) are bottom wishes; “I love getting fucked”, “I love taking dick”, “I love cock”, “I’m a cockslut” are stated
   tastes. “Get fucked up”, “fucked over”, “go get fucked” and “use me as a shield” are not.
   **Point of view.** Whose “he” or “I” a stretch of text is told from comes from the chapter heading (“Chapter 3: Steve”,
   “Eddie's POV”), from a short line that is just a name, or a name followed by a break such as “Eddie, later that night” (never inside quotation marks, never a full sentence), inside a chapter, or, with neither, from whose feelings the chapter keeps
   reporting (“Steve felt…”, “Steve wondered…”: six or more, at least two and a half times the other man's). In that person's
   stretch, a sentence that opens with “He felt / wanted / thought…” or “His heart raced…” is them, whoever was named in the
   line before; and in alternating first person a chapter headed with the narrator's name says whose “I” follows. Also new:
   “He wanted to be fucked” / “needed to get fucked” (no one named) is a bottom desire.
   **Checking the confidence numbers.** Everything that has a “Report a mistake” button (scenes, hint lines, solo and
   hand-play lines, tag checks, vibe and everyday-dynamic ratings, and each factor under a rating) also has a “✓ Looks right”
   button. Pressing it again undoes it, and marking an item right takes it off the mistake list (and the other way round).
   Items marked right go into the copied report in their own section, “Things I checked that look right”, with the
   note that they deserve more confidence than the rest but are not right in every context, and “Copy test skeletons” turns
   them into tests that a fix should keep passing unless there is a reason.
   Scenes and lines that carry a confidence number also feed the calibration table: pressing it marks the item right; reporting a mistake that says it was misread (wrong top/bottom, wrong speaker,
   wrong pronoun, not a sex act, a wish…) marks it wrong. Marks are kept in your browser only (never sent anywhere), and the
   “Is the confidence calibrated?” panel at the bottom shows stated confidence against how often those items were right, in
   bins, with the average gap. Export them as JSON, import them back or clear them; a summary also goes into the copied
   mistake report, so the numbers can be tuned against real checks.
   **Tags vs text.** Below the results, each AO3 tag that names an act, a role or a kink is checked against what the patterns
   found: **supported** (with the lines), **not found** (the sex may fade to black or be phrased in a way the patterns miss),
   **contradicted** (a “Top X” tag when the scenes show X bottoming) or **can’t tell**. Act tags (Anal Sex, Blow Jobs, Hand Jobs,
   Rimming, Masturbation…) use the act results; Top/Bottom/Switch tags are counted from the scenes alone, not from the person’s
   odds, which already lean on the tag; kinks (edging, orgasm denial, praise, bondage, spanking, cock cage, panties,
   exhibitionism, aftercare, safeword, negotiation, degradation, daddy, knotting, choking, collars) need enough sentences near
   sexual narration. Tags that name nothing checkable (Slow Burn, Angst…) are left out, and tags that mean the same thing share a row.
   **Per-line confidence.** Every line under “Desire, fantasy & hints” has its own “N% sure” (hover for why). It starts from what
   kind of line it is (said outright or a stated preference are firm, a fantasy less, a ‘what if’ least) and the strength of
   the wording, goes up when the person is named or other lines point the same way, and down when the speaker was only guessed,
   the people were inferred, the wording is hedged (“maybe”, “kind of”) or other lines point the other way. A line’s
   confidence scales how much it counts toward the verdict’s confidence, the per-person odds and a hints-only reading.
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
   **Copy test skeletons** turns the same items into a vitest file with one test each (swapped roles expect the
   reverse, a wish expects no scene, and so on). The fic’s sentence appears only in a comment to delete; you replace
   each `PARAPHRASE_ME` with a made-up sentence, fill in the TODOs, and check the test fails before the fix.
   Each individual factor under a vibe rating has its own “What's wrong with this?” form with options for a wrong
   speaker, a pronoun pointing at the wrong person, credited to the wrong character, roles reversed, not a sexual cue,
   an everyday action, a figure of speech, a wish rather than an event, negated, counted twice, wrong tier, and counts
   for too much or too little. Scenes and hint lines offer the same kinds of options (wrong speaker, wrong pronoun,
   negated, figurative, duplicate…). The problems you name for a factor are printed right under that factor in the report. “Copy report for Claude” produces a text report (work tags, what the analyzer concluded, each
   flagged sentence with its surrounding passage, the scene confidence and reasons, and your explanation) to paste
   into Claude to find which pattern misfired. Nothing is sent anywhere; the report holds the passages you flag, so
   read it before sharing.
   Third person is not always omniscient: a tag naming one POV character ("POV Steve Harrington", "Eddie Munson POV") makes
   a third-person work that character's throughout, "Third Person Limited" (or close/deep third) turns on the section
   rules below even without an "alternating" tag, and "Omniscient" turns point of view off.
   In a work tagged as alternating POV, each dated or timed section heading ("June 2011– Las Vegas", "Three weeks later–
   Detroit") starts a new stretch told from the first of the pair named in its narration (not in a quoted line, a chat line or
   a speech tag), and the camera also switches inside a section when the narration moves to the other one and the next few
   paragraphs report only their experience. A chat line like "Ilya: who is this" is never read as a heading.

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
6. **Positions and cuddling**: *position and initiative* (pulling someone onto their lap, pinning wrists → top; climbing
   into a lap, having your wrists held → bottom; asking “ready?”, “tell me if it hurts” → top) and *cuddling positions*
   (resting or sleeping with your head on someone's chest, being the little spoon → bottom; being the one whose chest it
   is, being the big spoon → top). Position is two-sided, so the other person gets the opposite reading at a lower
   weight. These only feed the vibe, never the anal/oral cards. Dominant or submissive behaviour is no longer part of
   the vibe: it has its own axis, below.
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

## Vibe display: two ratings or one

**Text messages.** Chat-style lines ("Shane: Why?", often under a timestamp, with a phone cue or a long exchange nearby) and
bracketed logs ("[Anakin] pick up your phone"), narrated texting ("Cas texted him", "he texts Eddie back", "his phone buzzes with a text. It's Buck") are recognized so the lines can be attributed: a contact name ("Lily",
"Unknown Number") is matched to the character on the other end, and each chat line is rewritten as dialogue from the sender
before analysis, so a texted "I want to fuck you" counts like a spoken one. There is no separate card; "Texting" and "Sexting"
tags are checked against the text in the tags-vs-text section.
Arrow-style texts are read too: a line starting with ">" is sent by the viewpoint character (the narrator, or whoever was named
just before) and a line ending in "<" (or starting with "<") is received from the other one of the pair.

**Omegaverse.** In a work tagged alpha/beta/omega (or one that uses the words all through the text), nonsexual gestures count
toward the everyday dynamic: baring the neck or scent gland, lowering the eyes, nesting and submitting to an alpha read as
following; scenting, growling at someone, the alpha voice, gripping the scruff and a claiming bite read as leading.
"Alpha Dean" / "Omega!Cas" character tags lean the character the same way. These feed the dynamic axis and the combined
vibe, not the sexual top/bottom vibe.

A switch above the results chooses between **Two ratings** (the sexual vibe and the everyday dynamic, kept apart) and
**One combined vibe**, the earlier single rating with taking charge, caring, pet names, power bottoms and yielding folded
into tier 6 (“Dominant or submissive behaviour, positions and cuddling”). The choice is remembered in your browser, and
switching it keeps any mistakes you've already flagged.

## Everyday dynamic (leads / follows)

A second rating per person, shown next to the vibe, for who leads and who follows *outside* the sex. It is kept apart
from top/bottom on purpose: in a lot of fics one man cares for and protects the other but is the one who bottoms, or
the other way round. Evidence comes in four tiers: **stated dynamic** (tags like “Dominant Cas”, “Submissive Dean”, “Power
Bottom X”, and pet names or aftercare backed up by a “Dom/sub” or “Praise Kink” tag); **taking charge** (pinning, gripping a
chin or wrists, lifting or carrying, giving orders, leading someone by the hand, taking control of a kiss); **caring,
protecting and praising** (tucking a blanket around someone, handing them ice or food, stroking their hair, stepping
between them and a threat, “I've got you”, “let me clean you up”, “good boy”); and **yielding** (going pliant, letting
someone lead, being pinned, blushing or stammering with the other one right there). Doing something *to* the other person
credits them with the opposite reading at a lower weight (the one led follows; the one held is the one holding's
counterpart), except for blushing, which is only one side. Labels run Follows, Leans following, Balanced, Leans leading,
Leads. The same expandable factors and “What's wrong with this?” forms work here, and a Dom/Sub tag is checked against
this axis (with the tag itself left out) in “Tags vs text”.

**Terms of address.** Fics build their own vocabulary of address ("sir", "baby", "your highness", "half man", "Scotty"). The engine
notes the forms of address in lines whose speaker is certain (tagged) and learns a term once it has been used for the same
person three times. Two things follow. A term used for one of the pair almost every time tells who an untagged line is for, so
the other one said it ("Fuck me, half man" after three tagged "half man"s from Steve is Steve; an ABO fic's untagged "Alpha,
please, fuck me" is the omega). And lopsided use feeds the everyday-dynamic axis: a title (sir, master, your highness, daddy)
used at least three times as often one way as the other is a yielding cue for the sayer, and a pet name (baby, princess,
sweetheart) used that lopsidedly is a caring, leading cue. Terms both of them use cancel out.

## Running locally

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # parser, EPUB, pattern-engine, canon, anatomy and vibe tests (incl. a phrasing accuracy table)
npm run build    # static site in dist/
```

## Checking the engine against real fics

Developer tools that take a folder of AO3 `.html` downloads (the folder is never committed):

```sh
npm run eval -- ao3-samples                    # every fic, in parallel and cached; writes REPORT.md and eval.json
node scripts/eval-compare.mjs old-folder new-folder [--all]   # structured diff of two runs; exits 1 if a verdict changed
AO3_DIR=ao3-samples npx vitest run tests/pattern-audit.test.ts --testTimeout=1500000   # writes PATTERN_AUDIT.md
AO3_DIR=ao3-samples npx vitest run tests/gold-eval.test.ts                             # writes GOLD_REPORT.md
```

- **Sample eval.** `npm run eval` splits the fics across one vitest process per core (longest first, by how long each took last
  time), runs each fic blind and with its tags, and writes one result file per fic in `<folder>/.eval/`. A fic whose result was
  made by the same engine source and the same file is skipped, so a rerun with nothing changed takes a fraction of a second and
  adding one fic costs only that fic (`--force` redoes everything, `--jobs N` and `--only a,b` limit it). `REPORT.md` has the same text
  as before; `eval.json` has the verdicts, scene and hint counts and confidence per pairing for `eval-compare`, which prints verdict
  changes and, with `--all`, every change in counts and confidence. On four cores the 43 samples take about two minutes (they took
  about ten in one process). Running `tests/ao3-eval.test.ts` by hand still works (one process, no cache).
- **Pattern audit.** For every pattern, how many acts and hints it produced, in how many fics, and a fixed-hash sample of the
  sentences it matched. A pattern that is matching the wrong thing (a room "slipped inside", a wave of nausea "swallowed
  down") shows up here without waiting for a bug report. Patterns with no hits at all are listed too.
- **Pattern reliability.** `tests/labels/*.json` hold hand-checked labels (ok / wrong / unclear) for the audit's samples, keyed by
  pattern and a hash of the sentence, never the sentence itself. `tests/reliability.test.ts` turns them into
  `src/heuristic/reliability.ts`: for each pattern, the share of its labelled hits that were read correctly (smoothed toward
  90% so a handful of samples can't condemn a pattern, floored at 0.4). The engine multiplies each hit's weight by that
  number, so a pattern that is often wrong counts for less without anyone hand-tightening it. The test fails when the table
  and the labels disagree; after relabelling run `WRITE_RELIABILITY=1 npx vitest run tests/reliability.test.ts`. Fixing a
  pattern makes its old labels stale, so relabel its samples from a fresh audit (`AUDIT_SAMPLES=8`, which also writes
  `PATTERN_AUDIT.json` with a key per row). Mistake reports name the pattern behind each flagged line.
- **Context model.** `src/heuristic/learned.ts` turns each hit's surroundings (how sexual the stretch is, whether both people are
  a declared pair, whether the actor is named, sentence length, fights, babies, "what if" words, left-out subjects) and the
  pattern's own record into a trust multiplier for that hit, replacing the flat per-pattern number. It is trained from
  `tests/labels/*.json` by `AO3_DIR=ao3-samples npx vitest run tests/learn.test.ts` (add `WRITE_LEARNED=1` to write the model);
  the report in `LEARN_REPORT.md` gives held-out log loss and AUC against the pattern record alone, and the model is switched on only if
  it wins. On the first training: log loss 0.161 to 0.141, AUC 0.66 to 0.77.
- **Review queue.** `AO3_DIR=ao3-samples npx vitest run tests/review-queue.test.ts` picks the unlabelled hits where a wrong
  reading would move a result most (chance it is wrong × its share of the evidence behind its verdict × how close that verdict is
  to flipping; `QUEUE_RANK=unsure` ranks by the model's doubt alone), at most three per pattern, plus a few it trusts most, with the paragraph around each, into `REVIEW_QUEUE.json`.
  `node scripts/build-review-page.mjs REVIEW_QUEUE.json page.html` makes the page (Wrong / Fine / Not sure per row, saved as you
  click) and `node scripts/import-review-answers.mjs none <saved answers dir> tests/labels/review-DATE.json` turns the answers
  into labels. Then rerun `WRITE_RELIABILITY=1 npx vitest run tests/reliability.test.ts` and the training test.
- **Metamorphic tests.** `tests/metamorphic.test.ts` runs a table of act sentences as written, with the names swapped (roles
  must flip), in present tense, with a pronoun for the subject, negated, and as a dream or a wish (no scene may come out). A
  sentence that fails goes in its KNOWN list, so a new break fails the test and so does an unnoticed fix.
- **Gold labels.** `tests/gold/*.json` hold hand-checked readings of real fics (six now: hockey, rugby, werewolf, Star Wars, 9-1-1 and an omegaverse Stranger Things AU): verdicts per pairing and act, which scenes are
  real and who tops (as paragraph ranges), acts whose scene list is complete (any extra scene is a false positive), known
  false positives, who the point of view is by section, and who sent which text. They store paragraph numbers and a hash of
  each paragraph, never the fic's own text; if the engine's paragraph splitting changes, the hash lets a file shift itself.
  The report gives verdict accuracy, scene recall and precision, POV and text-sender accuracy. `GOLD_STRICT=1` fails on any miss.

## Deploying

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main`. Turn it on once in
**Settings → Pages → Build and deployment → Source: GitHub Actions**. The build is plain static files, so
`dist/` also works on Netlify, Cloudflare Pages, etc.
