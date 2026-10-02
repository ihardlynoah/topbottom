# Top/Bottom Finder

A small web app: drop in an AO3 download (PDF, EPUB, HTML, or TXT) and it tells you

1. **Fandom**
2. **Pairing**
3. **Word count**
4. **Who tops and bottoms**, and whether anyone switches:
   - **Anal:** top = penetrative partner, bottom = anally receptive partner.
   - **Oral:** top = penetrative partner (getting their dick sucked, or eating ass), bottom = orally receptive partner (sucking dick, or having their ass eaten).

## How it works

- Files are parsed entirely in the browser (pdf.js for PDFs, JSZip for EPUBs, DOMParser for HTML).
- Fandom, pairing, and word count come from the tag block AO3 puts at the top of every download. Relationship
  tags with `/` count as pairings; `&` (platonic) tags are ignored. If a file has no AO3 tags, the word count is
  estimated and Claude fills in fandom and pairing.
- Top/bottom roles need someone to actually read the sex scenes, so the app sends the text to Claude
  (Opus 5.5 by default, Sonnet 5.5 as a cheaper option) with your own Anthropic API key and asks for a structured
  answer: a verdict (one-way / switches / doesn't happen / unclear), the usual top and bottom, and a list of
  scenes with chapter references. It reads the text itself rather than trusting tags like "Bottom X".
- Very long works (over 150k words, or whenever you pick "Sex scenes only") are cut down to the opening plus
  every passage that looks sexual, which costs much less.

Your API key stays in your browser and is sent only to `api.anthropic.com`. "Remember key" stores it in
localStorage on that device.

## Running locally

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # parser tests
npm run build    # static site in dist/
```

## Deploying

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main`. Turn it on once in
**Settings → Pages → Build and deployment → Source: GitHub Actions**. The build is plain static files, so
`dist/` also works on Netlify, Cloudflare Pages, etc.
