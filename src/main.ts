import "./style.css";
import Anthropic from "@anthropic-ai/sdk";
import { hasAo3Meta, romanticPairings } from "./ao3";
import { MODELS, type ModelId, RefusalError, analyzeWork, estimateTokens, excerptExplicit } from "./analyze";
import { type ExtractedWork, extractFile } from "./extract";
import { runPatterns } from "./heuristic/run";
import { type ActKind, ROLE_WORDS } from "./roles";
import type { ActResult, Analysis, Desire, RoleOdds, VaginalResult } from "./types";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const els = {
  settings: $<HTMLDetailsElement>("settings"),
  keyStatus: $("key-status"),
  apiKey: $<HTMLInputElement>("api-key"),
  remember: $<HTMLInputElement>("remember-key"),
  model: $<HTMLSelectElement>("model"),
  mode: $<HTMLSelectElement>("mode"),
  autoRun: $<HTMLInputElement>("auto-run"),
  drop: $<HTMLLabelElement>("drop"),
  file: $<HTMLInputElement>("file"),
  error: $("error"),
  results: $("results"),
  title: $("work-title"),
  byline: $("work-byline"),
  fandom: $("fandom"),
  pairing: $("pairing"),
  otherPairings: $("other-pairings"),
  words: $("words"),
  wordsSub: $("words-sub"),
  analyze: $<HTMLButtonElement>("analyze"),
  estimate: $("estimate"),
  progress: $("progress"),
  roleResults: $("role-results"),
  notes: $("notes"),
  claudeResults: $("claude-results"),
  claudeNotes: $("claude-notes"),
};

// ---- settings (localStorage can throw in private windows, so guard every access) ----

const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string | null) {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};

for (const m of MODELS) els.model.add(new Option(m.label, m.id));
els.model.value = store.get("tb.model") ?? MODELS[0].id;
els.mode.value = store.get("tb.mode") ?? "auto";
els.autoRun.checked = store.get("tb.autoRun") === "1";
const savedKey = store.get("tb.apiKey");
if (savedKey) {
  els.apiKey.value = savedKey;
  els.remember.checked = true;
}

function updateKeyStatus() {
  const has = els.apiKey.value.trim().length > 0;
  els.keyStatus.textContent = has ? "key set" : "no key";
  els.keyStatus.dataset.state = has ? "ok" : "missing";
}
updateKeyStatus();

function persistKey() {
  store.set("tb.apiKey", els.remember.checked && els.apiKey.value.trim() ? els.apiKey.value.trim() : null);
}
els.apiKey.addEventListener("input", () => {
  updateKeyStatus();
  persistKey();
  updateEstimate();
});
els.remember.addEventListener("change", persistKey);
els.model.addEventListener("change", () => {
  store.set("tb.model", els.model.value);
  updateEstimate();
});
els.mode.addEventListener("change", () => {
  store.set("tb.mode", els.mode.value);
  updateEstimate();
});
els.autoRun.addEventListener("change", () => store.set("tb.autoRun", els.autoRun.checked ? "1" : "0"));

// ---- file intake ----

let current: ExtractedWork | null = null;
let inflight: AbortController | null = null;

function showError(msg: string | null) {
  els.error.hidden = !msg;
  els.error.textContent = msg ?? "";
}

els.file.addEventListener("change", () => {
  const f = els.file.files?.[0];
  if (f) void handleFile(f);
  els.file.value = "";
});
els.drop.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    els.file.click();
  }
});
for (const ev of ["dragenter", "dragover"]) {
  els.drop.addEventListener(ev, (e) => {
    e.preventDefault();
    els.drop.classList.add("over");
  });
}
for (const ev of ["dragleave", "drop"]) {
  els.drop.addEventListener(ev, () => els.drop.classList.remove("over"));
}
els.drop.addEventListener("drop", (e) => {
  e.preventDefault();
  const f = (e as DragEvent).dataTransfer?.files[0];
  if (f) void handleFile(f);
});
// Allow dropping anywhere on the page.
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files[0];
  if (f && !els.drop.contains(e.target as Node)) void handleFile(f);
});

async function handleFile(file: File) {
  inflight?.abort();
  showError(null);
  els.drop.classList.add("busy");
  try {
    current = await extractFile(file);
  } catch (err) {
    current = null;
    els.results.hidden = true;
    showError(err instanceof Error ? err.message : String(err));
    return;
  } finally {
    els.drop.classList.remove("busy");
  }
  if (!current.text.trim()) {
    showError("Couldn't find any text in that file. If it's a scanned PDF, try the HTML or EPUB download instead.");
    return;
  }
  renderMeta(current, file.name);
  // Pattern analysis runs in a background worker; long explicit fics can take a few seconds.
  const work = current;
  runPatterns(work.text, work.meta)
    .then((result) => {
      if (current !== work) return;
      renderAnalysis(result, els.roleResults, els.notes);
      fillMetaFromAnalysis(result);
    })
    .catch((err) => {
      if (current === work) showError(`Pattern analysis failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  if (els.autoRun.checked && els.apiKey.value.trim()) void runAnalysis();
}

// ---- rendering ----

function renderMeta(work: ExtractedWork, filename: string) {
  const { meta } = work;
  els.results.hidden = false;
  els.title.textContent = meta.title || filename.replace(/\.[^.]+$/, "");
  els.byline.textContent = "";
  if (meta.author) els.byline.append(`by ${meta.author}`);
  if (meta.rating) els.byline.append(`${meta.author ? " · " : ""}${meta.rating}`);
  if (meta.url) {
    if (els.byline.textContent) els.byline.append(" · ");
    const a = document.createElement("a");
    a.href = meta.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "on AO3";
    els.byline.append(a);
  }

  els.fandom.textContent = meta.fandoms.join(", ") || "—";
  els.fandom.classList.toggle("pending", !meta.fandoms.length);
  const pairings = romanticPairings(meta);
  els.pairing.textContent = pairings[0] ?? (meta.relationships[0] || "—");
  els.pairing.classList.toggle("pending", !pairings.length && !meta.relationships.length);
  els.otherPairings.textContent = pairings.length > 1 ? `Also tagged: ${pairings.slice(1).join(", ")}` : "";

  if (meta.words !== undefined) {
    els.words.textContent = meta.words.toLocaleString();
    els.wordsSub.textContent = meta.chapters ? `AO3 count · ${meta.chapters} chapters` : "AO3 count";
  } else {
    els.words.textContent = `~${work.countedWords.toLocaleString()}`;
    els.wordsSub.textContent = "Estimated (no AO3 stats in file)";
  }

  if (!hasAo3Meta(meta)) els.otherPairings.textContent = "No AO3 tags in this file.";

  const reading = el("p", "hint");
  reading.append(el("span", "spinner"), "Reading the fic…");
  els.roleResults.replaceChildren(reading);
  els.notes.hidden = true;
  els.claudeResults.replaceChildren();
  els.claudeNotes.hidden = true;
  els.progress.hidden = true;
  els.analyze.disabled = false;
  els.analyze.textContent = "Ask Claude";
  updateEstimate();
}

type Plan = { text: string; words: number; excerpted: boolean };

function plan(work: ExtractedWork): Plan {
  const words = work.text.split(/\s+/).length;
  const mode = els.mode.value;
  // Auto: send the whole thing unless it's novel-length.
  if (mode === "full" || (mode === "auto" && words <= 150_000)) {
    return { text: work.text, words, excerpted: false };
  }
  const ex = excerptExplicit(work.text);
  return { ...ex, excerpted: ex.words < words };
}

function updateEstimate() {
  if (!current) return;
  const p = plan(current);
  const model = MODELS.find((m) => m.id === els.model.value) ?? MODELS[0];
  const tokens = estimateTokens(p.words);
  const dollars = (tokens / 1e6) * model.inputPerM + 0.1; // + rough allowance for thinking/output
  const what = p.excerpted ? `sex scenes + opening (${p.words.toLocaleString()} words)` : "the full text";
  els.estimate.textContent = els.apiKey.value.trim()
    ? `Sends ${what} to Claude — about ${tokens.toLocaleString()} tokens, roughly $${dollars.toFixed(2)}.`
    : "Add your API key under Settings to ask Claude.";
  if (tokens > 900_000) {
    els.estimate.textContent += " That's over the model's limit; switch to “Sex scenes only”.";
  }
}

const VERDICT_LABEL: Record<ActResult["verdict"], string> = {
  none: "Doesn't happen",
  one_way: "No switching",
  switch: "Switches",
  unclear: "Unclear",
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** "Harry wants to bottom", "Draco imagines topping", "Harry wants to suck cock", "Harry doesn't want to top". */
function desirePhrase(d: Pick<Desire, "who" | "role" | "wants" | "kind" | "act">, kind: ActKind): string {
  const w = ROLE_WORDS[kind];
  const [verb, ing] = d.role === "top" ? [w.topInf, w.topIng] : [w.bottomInf, w.bottomIng];
  if (d.kind === "ogling" || d.kind === "touch" || d.kind === "fingering" || d.kind === "prep" || d.kind === "fingers" || d.kind === "solo") return `${d.who}: ${d.act} (suggests ${ing})`;
  if (!d.wants) return `${d.who} doesn't want to ${verb}`;
  switch (d.kind) {
    case "said": return `${d.who} asks to ${verb}`;
    case "fantasy": return `${d.who} imagines ${ing}`;
    case "hypothetical": return `${d.who} considers ${ing}`;
    case "identity": return `${d.who} prefers to ${verb}`;
    default: return `${d.who} wants to ${verb}`;
  }
}

function renderDesires(desires: Desire[], kind: ActKind): HTMLElement {
  const box = el("div", "desires");
  const counts = new Map<string, number>();
  for (const d of desires) counts.set(desirePhrase(d, kind), (counts.get(desirePhrase(d, kind)) ?? 0) + 1);
  const head = el("div", "desire-head");
  head.append(el("span", "mini-label", "Desire, fantasy & hints"));
  const chips = el("div", "chips");
  for (const [phrase, n] of counts) chips.append(el("span", "chip", n > 1 ? `${phrase} ×${n}` : phrase));
  head.append(chips);
  box.append(head);
  const det = el("details", "instances");
  det.append(el("summary", undefined, `${desires.length} line${desires.length === 1 ? "" : "s"}`));
  const ul = el("ul");
  for (const d of desires) {
    const li = el("li");
    li.append(el("strong", undefined, desirePhrase(d, kind)), el("span", "where", ` · ${d.act} · ${d.where}`));
    li.append(el("div", "evidence", d.evidence));
    ul.append(li);
  }
  det.append(ul);
  box.append(det);
  return box;
}

function renderConfidence(c: ActResult["confidence"]): HTMLElement {
  const box = el("div", `confidence conf-${c.label.toLowerCase()}`);
  const row = el("div", "conf-row");
  row.append(el("span", "mini-label", "Confidence"));
  const bar = el("div", "conf-bar");
  const fill = el("div", "conf-fill");
  fill.style.width = `${Math.round(c.score * 100)}%`;
  bar.append(fill);
  row.append(bar, el("span", "conf-text", `${c.label} · ${Math.round(c.score * 100)}%`));
  box.append(row);
  if (c.reasons.length) box.append(el("p", "conf-reasons", c.reasons.join(" · ")));
  return box;
}

/** "By person": how likely each partner is to take each role, in the act's own words. */
function renderOdds(kind: ActKind, people: RoleOdds[]): HTMLElement {
  const w = ROLE_WORDS[kind];
  // Lead with the active role: the one topping, sucking or eating.
  const cols: { label: string; key: "top" | "bottom" }[] =
    kind === "anal" ? [{ label: "Tops", key: "top" }, { label: "Bottoms", key: "bottom" }]
    : kind === "blowjob" ? [{ label: w.bottom, key: "bottom" }, { label: w.top, key: "top" }]
    : [{ label: w.top, key: "top" }, { label: w.bottom, key: "bottom" }];
  const box = el("div", "odds");
  box.append(el("span", "mini-label", "By person"));
  const table = el("table");
  const head = el("tr");
  head.append(el("th", undefined, ""), ...cols.map((c) => el("th", undefined, c.label)));
  table.append(head);
  for (const p of people) {
    const tr = el("tr");
    tr.append(el("td", "who", p.name));
    for (const c of cols) {
      const v = p[c.key];
      const td = el("td");
      const cell = el("div", "cell");
      const bar = el("div", "bar");
      const fill = el("div", `fill ${v >= 0.75 ? "likely" : v >= 0.4 ? "maybe" : ""}`);
      fill.style.width = `${Math.round(v * 100)}%`;
      bar.append(fill);
      cell.append(bar, el("span", "pct", `${Math.round(v * 100)}%`));
      td.append(cell);
      td.title = `${p.name} ${c.key === "top" ? w.topVerb : w.bottomVerb}: ${Math.round(v * 100)}%`;
      tr.append(td);
    }
    table.append(tr);
  }
  box.append(table);
  return box;
}

function renderAct(kind: ActKind, act: ActResult): HTMLElement {
  const w = ROLE_WORDS[kind];
  const card = el("article", `card act verdict-${act.verdict}`);
  const head = el("div", "act-head");
  head.append(el("h4", undefined, w.title), el("span", `badge ${act.verdict}`, VERDICT_LABEL[act.verdict]));
  card.append(head);

  if ((act.verdict === "one_way" || act.verdict === "switch") && (act.top || act.bottom)) {
    const roles = el("dl", "roles-dl");
    const more = act.verdict === "switch" ? " (more)" : "";
    // Lead with the active role: the one sucking or eating (for anal, the top).
    const rows: [string, string][] = [[w.top + more, act.top || "?"], [w.bottom + more, act.bottom || "?"]];
    if (kind === "blowjob") rows.reverse();
    for (const [dt, dd] of rows) roles.append(el("dt", undefined, dt), el("dd", undefined, dd));
    card.append(roles);
  }
  card.append(el("p", "summary", act.summary));
  card.append(renderConfidence(act.confidence));
  if (act.people?.some((p) => p.top > 0.05 || p.bottom > 0.05)) card.append(renderOdds(kind, act.people));
  if (act.desires.length) card.append(renderDesires(act.desires, kind));

  if (act.instances.length) {
    const det = el("details", "instances");
    det.append(el("summary", undefined, `${act.instances.length} scene${act.instances.length === 1 ? "" : "s"}`));
    const ul = el("ul");
    for (const i of act.instances) {
      const li = el("li");
      li.append(el("strong", undefined, w.scene(i.top, i.bottom)), ` · ${i.act}`);
      if (i.where) li.append(el("span", "where", ` · ${i.where}`));
      if (i.basis && i.basis !== "named") li.append(el("span", "basis", i.basis === "pronoun" ? "via pronouns" : "inferred"));
      if (i.evidence) li.append(el("div", "evidence", i.evidence));
      ul.append(li);
    }
    det.append(ul);
    card.append(det);
  }
  return card;
}

function renderVaginal(v: VaginalResult): HTMLElement {
  const card = el("article", `card act verdict-${v.occurs ? "one_way" : "none"}`);
  const head = el("div", "act-head");
  head.append(el("h4", undefined, "Vaginal"), el("span", `badge ${v.occurs ? "one_way" : "none"}`, v.occurs ? "Happens" : "Doesn't happen"));
  card.append(head, el("p", "summary", v.summary), renderConfidence(v.confidence));
  if (v.instances.length) {
    const det = el("details", "instances");
    det.append(el("summary", undefined, `${v.instances.length} scene${v.instances.length === 1 ? "" : "s"}`));
    const ul = el("ul");
    for (const i of v.instances) {
      const li = el("li");
      li.append(el("strong", undefined, [i.top, i.bottom].filter(Boolean).join(" & ")), ` · ${i.act}`);
      if (i.where) li.append(el("span", "where", ` · ${i.where}`));
      if (i.evidence) li.append(el("div", "evidence", i.evidence));
      ul.append(li);
    }
    det.append(ul);
    card.append(det);
  }
  return card;
}

function renderAnalysis(a: Analysis, target: HTMLElement, notesEl: HTMLElement) {
  target.replaceChildren();
  if (!a.pairings.length) target.append(el("p", "hint", "Couldn't identify the characters in this work."));
  for (const p of a.pairings) {
    const block = el("div", "pairing-block");
    if (a.pairings.length > 1) block.append(el("h4", "pairing-name", p.pairing));
    const grid = el("div", "grid two");
    grid.append(renderAct("anal", p.anal), renderAct("blowjob", p.blowjob), renderAct("rimming", p.rimming));
    if (p.cunnilingus.verdict !== "none" || p.vaginal.applicable) grid.append(renderAct("cunnilingus", p.cunnilingus));
    if (p.vaginal.applicable) grid.append(renderVaginal(p.vaginal));
    block.append(grid);
    target.append(block);
  }
  notesEl.hidden = !a.notes;
  notesEl.textContent = a.notes;
}

/** Fill in fandom/pairing from an analysis when the file had no AO3 tags. */
function fillMetaFromAnalysis(a: Analysis) {
  if (!current) return;
  if (!current.meta.fandoms.length && a.fandom) {
    els.fandom.textContent = a.fandom;
    els.fandom.classList.remove("pending");
  }
  if (!romanticPairings(current.meta).length && a.main_pairing) {
    els.pairing.textContent = a.main_pairing;
    els.pairing.classList.remove("pending");
    els.otherPairings.textContent = a.source === "claude" ? "Identified by Claude (no AO3 tags in file)" : "Guessed from the text (no AO3 tags in file)";
  }
}

// ---- analysis ----

els.analyze.addEventListener("click", () => void runAnalysis());

async function runAnalysis() {
  if (!current) return;
  const apiKey = els.apiKey.value.trim();
  if (!apiKey) {
    els.settings.open = true;
    els.apiKey.focus();
    showError("Add your Anthropic API key to analyze roles.");
    return;
  }
  showError(null);
  inflight?.abort();
  const ctrl = new AbortController();
  inflight = ctrl;
  const work = current;
  const p = plan(work);

  els.analyze.disabled = true;
  els.analyze.textContent = "Analyzing…";
  els.progress.hidden = false;
  els.claudeResults.replaceChildren();
  els.claudeNotes.hidden = true;
  try {
    const result = await analyzeWork({
      apiKey,
      model: els.model.value as ModelId,
      meta: work.meta,
      text: p.text,
      excerpted: p.excerpted,
      signal: ctrl.signal,
    });
    if (current === work) {
      renderAnalysis(result, els.claudeResults, els.claudeNotes);
      fillMetaFromAnalysis(result);
    }
  } catch (err) {
    if (ctrl.signal.aborted) return;
    showError(describeError(err));
  } finally {
    if (inflight === ctrl) {
      inflight = null;
      els.progress.hidden = true;
      els.analyze.disabled = false;
      els.analyze.textContent = "Ask again";
    }
  }
}

function describeError(err: unknown): string {
  if (err instanceof RefusalError) return err.message;
  if (err instanceof Anthropic.AuthenticationError) return "That API key was rejected. Check it in Claude API settings.";
  if (err instanceof Anthropic.PermissionDeniedError) return "This API key doesn't have access to that model.";
  if (err instanceof Anthropic.RateLimitError) return "Rate limited by the API. Wait a moment and try again.";
  if (err instanceof Anthropic.BadRequestError) {
    if (/too long|context|tokens/i.test(err.message)) {
      return "This work is too long to send in full. Switch “What to send” to “Sex scenes only”.";
    }
    if (/credit|balance|billing/i.test(err.message)) return "Your Anthropic account is out of credits.";
    return `The API rejected the request: ${err.message}`;
  }
  if (err instanceof Anthropic.InternalServerError) return "Anthropic's API had a server error. Try again in a bit.";
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach Anthropic's API. Check your connection.";
  if (err instanceof SyntaxError) return "Claude's answer couldn't be read. Try again.";
  return err instanceof Error ? err.message : String(err);
}
