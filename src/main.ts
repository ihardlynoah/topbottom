import "./style.css";
import Anthropic from "@anthropic-ai/sdk";
import { hasAo3Meta, romanticPairings } from "./ao3";
import { MODELS, type ModelId, RefusalError, analyzeWork, estimateTokens, excerptExplicit } from "./analyze";
import { type ExtractedWork, extractFile } from "./extract";
import { runPatterns } from "./heuristic/run";
import { addLabel, calibrationLines, clearLabels, type Label, labelKey, loadLabels, parseLabels, saveLabels, summarize } from "./calibration";
import { testSkeletons } from "./testgen";
import { FLAG_REASONS, type FlagKind, type FlagReason, type FlaggedScene, type MissedScene, REASONS_FOR, buildReport, reasonLabel } from "./report";
import { type ActKind, ROLE_WORDS } from "./roles";
import type { ActResult, Analysis, Desire, DynamicRating, Instance, ManualResult, RoleOdds, SoloResult, TagCheck, VaginalResult, VibeFactor, VibeRating } from "./types";

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
  report: $("report"),
  reportCount: $("report-count"),
  reportList: $("report-list"),
  reportGeneral: $<HTMLTextAreaElement>("report-general"),
  missedPassage: $<HTMLTextAreaElement>("missed-passage"),
  missedNote: $<HTMLInputElement>("missed-note"),
  missedAdd: $<HTMLButtonElement>("missed-add"),
  missedSelection: $<HTMLButtonElement>("missed-selection"),
  reportCopy: $<HTMLButtonElement>("report-copy"),
  reportClear: $<HTMLButtonElement>("report-clear"),
  reportTests: $<HTMLButtonElement>("report-tests"),
  reportPreview: $("report-preview"),
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
  // A new fic starts a new report: nothing marked wrong or right for the last one carries over.
  flagged.clear();
  rightItems.clear();
  rightPaint.clear();
  pickedFactors.clear();
  missedScenes.length = 0;
  shown = null;
  els.reportGeneral.value = "";
  refreshReport();
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

// ---- mistake report ----

const flagged = new Map<string, FlaggedScene>();
/** Items the reader checked and marked "Looks right", kept for the report so a fix doesn't break them. */
const rightItems = new Map<string, FlaggedScene>();
/** Repaints an item's "Looks right" button when it is marked or unmarked from the report list. */
const rightPaint = new Map<string, () => void>();
const missedScenes: MissedScene[] = [];
let shown: { source: string; analysis: Analysis } | null = null;

function cardSummaries(a: Analysis): string[] {
  const out: string[] = [];
  for (const p of a.pairings) {
    const cards: [string, ActResult][] = [["anal", p.anal], ["blowjob", p.blowjob], ["rimming", p.rimming], ["cunnilingus", p.cunnilingus]];
    for (const [k, r] of cards) {
      if (r.verdict === "none" && !r.instances.length) continue;
      out.push(`${p.pairing} · ${k}: ${r.verdict}${r.top ? ` (top/active ${r.top} / bottom/receiving ${r.bottom})` : ""} · ${r.confidence.label} ${Math.round(r.confidence.score * 100)}% · ${r.instances.length} scene${r.instances.length === 1 ? "" : "s"}`);
    }
    if (p.vaginal.instances.length) out.push(`${p.pairing} · vaginal: ${p.vaginal.instances.length} scene(s)`);
    if (p.solo?.occurs) out.push(`${p.pairing} · solo: ${p.solo.summary}`);
    if (p.manual?.occurs) out.push(`${p.pairing} · hands & body play: ${p.manual.summary}`);
    for (const v of p.vibe ?? []) out.push(`${p.pairing} · vibe ${v.name}: ${v.label} (${Math.round(v.confidence.score * 100)}%)`);
    for (const v of p.dynamic ?? []) if (v.label !== "Unclear") out.push(`${p.pairing} · everyday dynamic ${v.name}: ${v.label} (${Math.round(v.confidence.score * 100)}%)`);
  }
  return out;
}

function reportText(): string {
  const w = current;
  return buildReport({
    title: w?.meta.title,
    fandoms: w?.meta.fandoms,
    relationships: w?.meta.relationships,
    categories: w?.meta.categories,
    rating: w?.meta.rating,
    words: w?.meta.words ?? w?.countedWords,
    source: shown?.source ?? "patterns",
    summaries: shown ? cardSummaries(shown.analysis) : [],
    flags: [...flagged.values()],
    right: [...rightItems.values()],
    missed: missedScenes,
    general: els.reportGeneral.value,
    calibration: calibrationLines(labels),
  });
}

function refreshReport() {
  const n = [...flagged.values()].filter((f) => f.included !== false).length + missedScenes.length;
  const nr = rightItems.size;
  els.reportCount.textContent = n || nr ? [n ? `${n} item${n === 1 ? "" : "s"}` : "", nr ? `${nr} look${nr === 1 ? "s" : ""} right` : ""].filter(Boolean).join(" · ") : "none yet";
  els.reportCopy.disabled = !n && !nr && !els.reportGeneral.value.trim();
  els.reportClear.disabled = !n && !nr;
  els.reportTests.disabled = !n && !nr;
  els.reportList.replaceChildren();
  for (const f of flagged.values()) {
    const li = el("li");
    const inc = el("input");
    inc.type = "checkbox";
    inc.checked = f.included !== false;
    inc.title = "Include in the report";
    inc.addEventListener("change", () => { f.included = inc.checked; refreshReport(); });
    li.append(inc, " ");
    const label = f.kind === "vibe" ? `${f.top}: ${f.act}` : f.kind === "hint" ? `${f.top} · ${f.bottom}` : `${f.top || "?"} → ${f.bottom || "?"}`;
    li.append(el("strong", undefined, label), ` · ${f.kind === "vibe" ? "vibe rating" : f.act}${f.evidence ? ": " : ""}`, el("span", "evidence", f.evidence));
    const rm = el("button", "linklike", "remove");
    rm.type = "button";
    rm.addEventListener("click", () => { flagged.delete(f.id); refreshReport(); document.querySelector(`[data-flag="${CSS.escape(f.id)}"]`)?.classList.remove("flagged"); });
    li.append(" ", rm);
    els.reportList.append(li);
  }
  for (const f of rightItems.values()) {
    const li = el("li", "report-right");
    const label = f.kind === "vibe" || f.kind === "factor" ? `${f.top}: ${f.act}` : f.kind === "hint" ? `${f.top} · ${f.bottom}` : `${f.top || "?"} → ${f.bottom || "?"}`;
    li.append(el("strong", undefined, "✓ Looks right: "), label, ` · ${f.kind === "vibe" ? "vibe rating" : f.kind === "factor" ? "rating factor" : f.act}${f.evidence ? ": " : ""}`, el("span", "evidence", f.evidence));
    const rm = el("button", "linklike", "remove");
    rm.type = "button";
    rm.addEventListener("click", () => { unmarkRight(f.id); });
    li.append(" ", rm);
    els.reportList.append(li);
  }
  missedScenes.forEach((m, i) => {
    const li = el("li");
    li.append(el("strong", undefined, "Missed: "), el("span", "evidence", m.passage.slice(0, 160)));
    const rm = el("button", "linklike", "remove");
    rm.type = "button";
    rm.addEventListener("click", () => { missedScenes.splice(i, 1); refreshReport(); });
    li.append(" ", rm);
    els.reportList.append(li);
  });
  els.reportPreview.textContent = n || nr || els.reportGeneral.value.trim() ? reportText() : "";
}

/** Vibe factors the reader ticked as worth showing Claude, by vibe id and factor number, with any problems they named. */
interface PickedFactor { line: string; reasons: FlagReason[]; note: string }
const pickedFactors = new Map<string, Map<number, PickedFactor>>();
const vibeSpec = new Map<string, VibeRating | DynamicRating>();

function factorLine(f: VibeFactor): string {
  return `${f.role} · tier ${f.tier} (${f.tierName}) · weight ${f.weight}${f.fromOther ? " · from the other person's side" : ""} · ${f.what}${f.where ? ` · ${f.where}` : ""}${f.source ? ` — “${f.source}”` : ""}`;
}

/** The extra lines a vibe item carries: what it rests on, plus any factors the reader ticked and what they said was wrong with each. */
function vibeExtra(id: string, v: VibeRating | DynamicRating): string[] {
  const picked = [...(pickedFactors.get(id)?.values() ?? [])];
  return [
    `Evidence: ${v.basis.join("; ") || "none"}`,
    ...picked.map((p) => {
      const problems = p.reasons.length ? ` ⟶ What is wrong with this factor: ${p.reasons.map(reasonLabel).join("; ")}` : "";
      const note = p.note.trim() ? ` ⟶ My explanation: ${p.note.trim()}` : "";
      return `Factor I'm pointing at: ${p.line}${problems}${note}`;
    }),
  ];
}

// ── Marking items right or wrong, to check the confidence numbers ──
let labels: Label[] = loadLabels();
/** Reasons that mean the item itself was misread (not just counted too strongly or twice). */
const WRONG_REASONS = new Set<FlagReason>(["wrong_top", "wrong_bottom", "swapped", "wrong_person", "wrong_speaker", "wrong_pronoun", "wrong_people", "wrong_act", "not_sex", "not_sexual_context", "figurative", "solo", "hypothetical", "negated"]);
const labelable = (spec: { kind?: FlagKind; card: string; confidence?: number }) =>
  spec.confidence !== undefined && (spec.kind === "scene" || spec.kind === "hint" || spec.kind === undefined) && !["solo", "manual", "tagcheck", "vibe", "dynamic"].includes(spec.card);
function recordLabel(spec: { kind?: FlagKind; card: string; confidence?: number; evidence: string }, right: boolean) {
  if (!labelable(spec) || !spec.evidence) return;
  const kind = spec.kind === "hint" ? "line" : "scene";
  labels = addLabel(labels, { key: labelKey(kind, spec.card, spec.evidence), kind, confidence: spec.confidence!, right, at: Date.now() });
  saveLabels(labels);
  refreshCalibration();
  refreshReport();
}

function refreshCalibration() {
  const box = document.getElementById("calibration-box");
  if (!box) return;
  const s = summarize(labels);
  box.replaceChildren();
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  if (!s.n) {
    box.append(el("p", "hint", "Nothing marked yet. Press “Looks right” on a scene or line you checked and agree with, or report a mistake on one that is wrong. Each mark is a data point: stated confidence against whether it was right."));
  } else {
    box.append(el("p", "hint", `${s.n} marked (${s.right} right, ${s.n - s.right} wrong). Average gap between stated and observed: ${pct(s.ece)}. ${s.n < 20 ? "Too few for the bins to mean much yet." : ""}`));
    const table = el("table", "calib-table");
    const head = el("tr");
    for (const h of ["Stated", "Marked", "Right", "Average sure"]) head.append(el("th", undefined, h));
    table.append(head);
    for (const r of s.rows) {
      const tr = el("tr");
      for (const c of [`${pct(r.lo)}–${pct(r.hi)}`, String(r.n), pct(r.observed), pct(r.expected)]) tr.append(el("td", undefined, c));
      table.append(tr);
    }
    box.append(table);
  }
  const row = el("div", "calib-actions");
  const exp = el("button", "linklike", "Export marks (JSON)");
  exp.type = "button";
  exp.addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ labels }, null, 2)], { type: "application/json" }));
    a.download = "tbv-marks.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  const imp = el("button", "linklike", "Import marks");
  imp.type = "button";
  imp.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.addEventListener("change", async () => {
      const f = input.files?.[0];
      if (!f) return;
      for (const l of parseLabels(await f.text())) labels = addLabel(labels, l);
      saveLabels(labels);
      refreshCalibration();
      refreshReport();
    });
    input.click();
  });
  const clr = el("button", "linklike", "Clear marks");
  clr.type = "button";
  clr.disabled = !s.n;
  clr.addEventListener("click", () => { labels = []; clearLabels(); refreshCalibration(); refreshReport(); });
  row.append(exp, " · ", imp, " · ", clr);
  box.append(row);
}

function renderCalibration(): HTMLElement {
  const det = el("details", "calibration");
  det.append(el("summary", undefined, "Is the confidence calibrated?"));
  const box = el("div");
  box.id = "calibration-box";
  det.append(box);
  queueMicrotask(refreshCalibration);
  return det;
}


/** Take an item off the "looks right" list (and its calibration mark), repainting its button. */
function unmarkRight(id: string) {
  const f = rightItems.get(id);
  if (!f) return;
  rightItems.delete(id);
  if (labelable(f)) {
    const key = labelKey(f.kind === "hint" ? "line" : "scene", f.card, f.evidence);
    labels = labels.filter((l) => l.key !== key);
    saveLabels(labels);
    refreshCalibration();
  }
  rightPaint.get(id)?.();
  refreshReport();
}

/** The "Report a mistake" and "Looks right" buttons on a scene, hint or vibe rating, and the little form the first opens. */
type FlagSpec = Omit<FlaggedScene, "reasons" | "note" | "included">;
function flagControl(li: HTMLElement, spec: FlagSpec) {
  const id = spec.id;
  const kind: FlagKind = spec.kind ?? "scene";
  li.dataset.flag = id;
  const btn = el("button", "linklike flag-btn", "Report a mistake");
  btn.type = "button";
  const okBtn = el("button", "linklike ok-btn", "✓ Looks right");
  okBtn.type = "button";
  okBtn.title = "Mark this as looking right: the report lists it as a reading to trust more, not as certainly correct everywhere" + (labelable(spec) ? ", and helps check how well the confidence numbers match" : "");
  // A mark saved from an earlier visit still counts: it shows as marked, so it goes in the report too.
  if (labelable(spec) && !rightItems.has(id) && labels.some((l) => l.key === labelKey(spec.kind === "hint" ? "line" : "scene", spec.card, spec.evidence) && l.right)) rightItems.set(id, { ...spec, reasons: [], note: "" });
  const paintRight = () => {
    const on = rightItems.has(id);
    okBtn.textContent = on ? "✓ Marked right" : "✓ Looks right";
    okBtn.setAttribute("aria-pressed", String(on));
    li.classList.toggle("marked-right", on);
  };
  rightPaint.set(id, paintRight);
  okBtn.addEventListener("click", () => {
    if (rightItems.has(id)) { unmarkRight(id); return; }
    // Right and wrong can't both be said of one item: marking it right takes it off the mistake list.
    if (flagged.delete(id)) { li.classList.remove("flagged"); add.textContent = "Add to report"; form.hidden = true; }
    rightItems.set(id, { ...spec, extra: vibeSpec.get(id) ? vibeExtra(id, vibeSpec.get(id)!) : spec.extra, kind, reasons: [], note: "" });
    recordLabel(spec, true);
    paintRight();
    refreshReport();
  });
  const form = el("form", "flag-form");
  form.hidden = true;
  const ticks = new Map<FlagReason, HTMLInputElement>();
  for (const key of REASONS_FOR[kind]) {
    const r = FLAG_REASONS.find((x) => x.key === key)!;
    const label = el("label", "flag-opt");
    const cb = el("input");
    cb.type = "checkbox";
    ticks.set(r.key, cb);
    label.append(cb, ` ${r.label}`);
    form.append(label);
  }
  const note = el("textarea");
  note.rows = 2;
  note.placeholder = kind === "vibe" ? "What looks off? (e.g. “Cas tops in every scene, so Total top fits better”)" : "Why is it wrong? (e.g. “his husband” is Dracula, who is the one fucking Jack)";
  const add = el("button", undefined, flagged.has(id) ? "Update report" : "Add to report");
  add.type = "submit";
  const cancel = el("button", "linklike", "Cancel");
  cancel.type = "button";
  form.append(note, add, " ", cancel);
  const prior = flagged.get(id);
  if (prior) { for (const r of prior.reasons) ticks.get(r)?.setAttribute("checked", ""); for (const r of prior.reasons) { const c = ticks.get(r); if (c) c.checked = true; } note.value = prior.note; li.classList.add("flagged"); }
  btn.addEventListener("mousedown", (e) => e.preventDefault()); // keep the reader's text selection
  btn.addEventListener("click", () => {
    form.hidden = !form.hidden;
    // Selected text inside this item is the part the reader means.
    const sel = window.getSelection()?.toString().trim();
    if (!form.hidden && sel && li.contains(window.getSelection()?.anchorNode ?? null) && !note.value) note.value = `The part I mean: “${sel}”. `;
  });
  cancel.addEventListener("click", () => { form.hidden = true; });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const reasons = [...ticks].filter(([, cb]) => cb.checked).map(([k]) => k);
    flagged.set(id, { ...spec, extra: vibeSpec.get(id) ? vibeExtra(id, vibeSpec.get(id)!) : spec.extra, kind, reasons, note: note.value, included: flagged.get(id)?.included ?? true });
    li.classList.add("flagged");
    form.hidden = true;
    add.textContent = "Update report";
    if (rightItems.delete(id)) paintRight();
    if (reasons.some((r) => WRONG_REASONS.has(r))) recordLabel(spec, false);
    refreshReport();
  });
  paintRight();
  li.append(" ", okBtn, " ", btn, form);
}

// Remember the last passage the reader selected outside the report panel; opening the form would otherwise clear it.
let lastSelection = "";
document.addEventListener("selectionchange", () => {
  const sel = window.getSelection();
  const text = sel?.toString().trim() ?? "";
  if (text && sel?.anchorNode && !els.report.contains(sel.anchorNode)) lastSelection = text;
});
els.missedSelection.addEventListener("mousedown", (e) => e.preventDefault());
els.missedSelection.addEventListener("click", () => {
  const text = window.getSelection()?.toString().trim() || lastSelection;
  if (text) els.missedPassage.value = els.missedPassage.value ? `${els.missedPassage.value}\n${text}` : text;
});
els.missedAdd.addEventListener("click", () => {
  const passage = els.missedPassage.value.trim();
  if (!passage) return;
  missedScenes.push({ passage, note: els.missedNote.value });
  els.missedPassage.value = "";
  els.missedNote.value = "";
  refreshReport();
});
els.reportGeneral.addEventListener("input", refreshReport);
els.reportClear.addEventListener("click", () => {
  flagged.clear();
  for (const id of [...rightItems.keys()]) { rightItems.delete(id); rightPaint.get(id)?.(); }
  pickedFactors.clear();
  missedScenes.length = 0;
  els.reportGeneral.value = "";
  document.querySelectorAll(".factors input:checked").forEach((x) => ((x as HTMLInputElement).checked = false));
  document.querySelectorAll(".flagged").forEach((x) => x.classList.remove("flagged"));
  refreshReport();
});
els.reportCopy.addEventListener("click", async () => {
  const text = reportText();
  try {
    await navigator.clipboard.writeText(text);
    els.reportCopy.textContent = "Copied!";
  } catch {
    // Clipboard blocked: show the text so it can be selected by hand.
    (els.reportPreview.closest("details") as HTMLDetailsElement | null)?.setAttribute("open", "");
    els.reportCopy.textContent = "Select the text below";
  }
  setTimeout(() => { els.reportCopy.textContent = "Copy report for Claude"; }, 2500);
});

els.reportTests.addEventListener("click", async () => {
  const text = testSkeletons([...flagged.values()], missedScenes, [...rightItems.values()]);
  try {
    await navigator.clipboard.writeText(text);
    els.reportTests.textContent = "Copied!";
  } catch {
    els.reportPreview.textContent = text;
    (els.reportPreview.closest("details") as HTMLDetailsElement | null)?.setAttribute("open", "");
    els.reportTests.textContent = "Select the text below";
  }
  setTimeout(() => { els.reportTests.textContent = "Copy test skeletons"; }, 2500);
});

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
  if (d.kind === "ogling" || d.kind === "touch" || d.kind === "fingering" || d.kind === "prep" || d.kind === "fingers" || d.kind === "solo" || d.kind === "history" || d.kind === "body" || d.kind === "aftercare" || d.kind === "position" || d.kind === "petname" || d.kind === "stated") return `${d.who}: ${d.act} (suggests ${ing})`;
  if (!d.wants) return `${d.who} doesn't want to ${verb}`;
  switch (d.kind) {
    case "said": return `${d.who} asks to ${verb}`;
    case "fantasy": return `${d.who} imagines ${ing}`;
    case "hypothetical": return `${d.who} considers ${ing}`;
    case "identity": return `${d.who} prefers to ${verb}`;
    default: return `${d.who} wants to ${verb}`;
  }
}

function renderDesires(desires: Desire[], kind: ActKind, pairing: string, source: string): HTMLElement {
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
  desires.forEach((d, n) => {
    const li = el("li");
    li.append(el("strong", undefined, desirePhrase(d, kind)), el("span", "where", ` · ${d.act} · ${d.where}`));
    if (d.confidence !== undefined) {
      const c = el("span", `scene-conf ${d.confidence >= 0.75 ? "high" : d.confidence >= 0.5 ? "medium" : "low"}`, `${Math.round(d.confidence * 100)}% sure`);
      if (d.reasons?.length) c.title = d.reasons.join("; ");
      li.append(c);
    }
    li.append(el("div", "evidence", d.evidence));
    flagControl(li, { id: `${source}|${pairing}|${kind}|hint|${n}`, kind: "hint", pairing, card: kind, top: d.who, bottom: `${d.wants ? "" : "NOT "}${d.role} (${d.kind})`, act: d.act, confidence: d.confidence, confidenceReasons: d.reasons, where: d.where, pattern: d.via, evidence: d.evidence, context: d.context });
    ul.append(li);
  });
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

function renderAct(kind: ActKind, act: ActResult, pairing: string, source: string): HTMLElement {
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
  if (act.desires.length) card.append(renderDesires(act.desires, kind, pairing, source));

  if (act.instances.length) {
    const det = el("details", "instances");
    det.append(el("summary", undefined, `${act.instances.length} scene${act.instances.length === 1 ? "" : "s"}`));
    const ul = el("ul");
    act.instances.forEach((i, n) => {
      const li = el("li");
      li.append(el("strong", undefined, w.scene(i.top, i.bottom)), ` · ${i.act}`);
      if (i.where) li.append(el("span", "where", ` · ${i.where}`));
      if (i.basis && i.basis !== "named") li.append(el("span", "basis", i.basis === "pronoun" ? "via pronouns" : "inferred"));
      if (i.confidence !== undefined) {
        const c = el("span", `scene-conf ${i.confidence >= 0.75 ? "high" : i.confidence >= 0.5 ? "medium" : "low"}`, `${Math.round(i.confidence * 100)}% sure`);
        if (i.reasons?.length) c.title = i.reasons.join("; ");
        li.append(c);
      }
      if (i.evidence) li.append(el("div", "evidence", i.evidence));
      flagControl(li, { id: `${source}|${pairing}|${kind}|${n}`, kind: "scene", pairing, card: kind, top: i.top, bottom: i.bottom, topVerb: w.topVerb, bottomVerb: w.bottomVerb, act: i.act, basis: i.basis, confidence: i.confidence, confidenceReasons: i.reasons, where: i.where, pattern: i.via, evidence: i.evidence, context: i.context });
      ul.append(li);
    });
    det.append(ul);
    card.append(det);
  }
  return card;
}

function renderVaginal(v: VaginalResult, pairing: string, source: string): HTMLElement {
  const card = el("article", `card act verdict-${v.occurs ? "one_way" : "none"}`);
  const head = el("div", "act-head");
  head.append(el("h4", undefined, "Vaginal"), el("span", `badge ${v.occurs ? "one_way" : "none"}`, v.occurs ? "Happens" : "Doesn't happen"));
  card.append(head, el("p", "summary", v.summary), renderConfidence(v.confidence));
  if (v.instances.length) {
    const det = el("details", "instances");
    det.append(el("summary", undefined, `${v.instances.length} scene${v.instances.length === 1 ? "" : "s"}`));
    const ul = el("ul");
    v.instances.forEach((i, n) => {
      const li = el("li");
      li.append(el("strong", undefined, [i.top, i.bottom].filter(Boolean).join(" & ")), ` · ${i.act}`);
      if (i.where) li.append(el("span", "where", ` · ${i.where}`));
      if (i.evidence) li.append(el("div", "evidence", i.evidence));
      flagControl(li, { id: `${source}|${pairing}|vaginal|${n}`, kind: "scene", pairing, card: "vaginal", top: i.top, bottom: i.bottom, act: i.act, basis: i.basis, confidence: i.confidence, confidenceReasons: i.reasons, where: i.where, evidence: i.evidence, context: i.context });
      ul.append(li);
    });
    det.append(ul);
    card.append(det);
  }
  return card;
}

const TAG_STATUS: Record<TagCheck["status"], { label: string; cls: string }> = {
  supported: { label: "Supported by the text", cls: "tag-ok" },
  not_found: { label: "Not found in the text", cls: "tag-missing" },
  contradicted: { label: "Text points the other way", cls: "tag-contra" },
  cant_tell: { label: "Can’t tell", cls: "tag-unknown" },
};

/** AO3 tags that name an act, role or kink, checked against the text. */
function renderTagCheck(checks: TagCheck[], source: string): HTMLElement {
  const box = el("section", "tagcheck");
  box.append(el("h5", "vibe-title", "Tags vs text"));
  box.append(el("p", "hint", "Each AO3 tag that names an act, role or kink, checked against what the patterns found. “Not found” can mean fade-to-black or phrasing the patterns miss."));
  // Tags that say the same thing (Cock Cage, “cas puts dean in a cock cage”) share a row.
  const groups = new Map<string, TagCheck[]>();
  for (const c of checks) {
    const k = `${c.kind}|${c.status}|${c.note}`;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const order: TagCheck["status"][] = ["contradicted", "not_found", "supported", "cant_tell"];
  const rows = [...groups.values()].sort((a, b) => order.indexOf(a[0].status) - order.indexOf(b[0].status));
  const ul = el("ul", "tagcheck-list");
  rows.forEach((g, n) => {
    const c = g[0];
    const li = el("li", `tagcheck-row ${TAG_STATUS[c.status].cls}`);
    const head = el("div", "tagcheck-head");
    head.append(el("span", `badge ${TAG_STATUS[c.status].cls}`, TAG_STATUS[c.status].label));
    const chips = el("span", "chips");
    for (const x of g) chips.append(el("span", "chip", x.tag));
    head.append(chips);
    li.append(head, el("div", "hint", c.note));
    if (c.evidence.length) {
      const det = el("details", "instances");
      det.append(el("summary", undefined, `${c.evidence.length} line${c.evidence.length === 1 ? "" : "s"}`));
      const inner = el("ul");
      for (const e of c.evidence) {
        const item = el("li");
        if (e.where) item.append(el("span", "where", `${e.where} · `));
        item.append(el("span", "evidence", e.text));
        inner.append(item);
      }
      det.append(inner);
      li.append(det);
    }
    flagControl(li, { id: `${source}|tagcheck|${n}`, kind: "hint", pairing: "Tags vs text", card: "tagcheck", top: g.map((x) => x.tag).join(" · "), bottom: TAG_STATUS[c.status].label, act: c.note, evidence: c.evidence[0]?.text ?? "" });
    ul.append(li);
  });
  box.append(ul);
  return box;
}

/** Handjobs and frottage between the pair. */
function renderManual(v: ManualResult, pairing: string, source: string): HTMLElement {
  const card = el("article", "card act verdict-one_way");
  const head = el("div", "act-head");
  head.append(el("h4", undefined, "Handjobs, frottage & body play"), el("span", "badge one_way", `${v.instances.length} found`));
  card.append(head, el("p", "summary", v.summary));
  card.append(el("p", "hint", "Not ranked top or bottom: this shows who uses their hand (or thighs, or chest) on whom."));
  const det = el("details", "instances");
  det.append(el("summary", undefined, `${v.instances.length} moment${v.instances.length === 1 ? "" : "s"}`));
  const ul = el("ul");
  v.instances.forEach((i, n) => {
    const li = el("li");
    li.append(el("strong", undefined, i.mutual ? `${i.giver} & ${i.receiver}` : `${i.giver} → ${i.receiver}`), ` · ${i.act}`);
    if (i.where) li.append(el("span", "where", ` · ${i.where}`));
    if (i.evidence) li.append(el("div", "evidence", i.evidence));
    flagControl(li, { id: `${source}|${pairing}|manual|${n}`, kind: "hint", pairing, card: "manual", top: i.giver, bottom: i.receiver, act: i.act, where: i.where, evidence: i.evidence, context: i.context });
    ul.append(li);
  });
  det.append(ul);
  card.append(det);
  return card;
}

/** Solo acts: masturbation, self-fingering and toys on oneself, per person. */
function renderSolo(v: SoloResult, pairing: string, source: string): HTMLElement {
  const card = el("article", "card act verdict-one_way");
  const head = el("div", "act-head");
  head.append(el("h4", undefined, "Solo"), el("span", "badge one_way", `${v.instances.length} found`));
  card.append(head, el("p", "summary", v.summary));
  card.append(el("p", "hint", "Masturbation isn’t counted toward top or bottom. Self-fingering and toys also count as anal-bottom evidence for someone with an ass."));
  const det = el("details", "instances");
  det.append(el("summary", undefined, `${v.instances.length} solo moment${v.instances.length === 1 ? "" : "s"}`));
  const ul = el("ul");
  v.instances.forEach((i, n) => {
    const li = el("li");
    li.append(el("strong", undefined, i.who), ` · ${i.act}`);
    if (i.where) li.append(el("span", "where", ` · ${i.where}`));
    if (i.evidence) li.append(el("div", "evidence", i.evidence));
    flagControl(li, { id: `${source}|${pairing}|solo|${n}`, kind: "hint", pairing, card: "solo", top: i.who, bottom: "", act: i.act, where: i.where, evidence: i.evidence, context: i.context });
    ul.append(li);
  });
  det.append(ul);
  card.append(det);
  return card;
}

/** Overall vibe per partner: a five-step scale from total top to total bottom, with confidence and what it rests on. */
function renderVibe(
  vibe: (VibeRating | DynamicRating)[],
  pairing: string,
  source: string,
  opts: { key: string; title: string; ends: [string, string, string]; hint?: string } = { key: "vibe", title: "Vibe", ends: ["Total bottom", "Vers", "Total top"] },
): HTMLElement {
  const box = el("section", `vibe vibe-${opts.key}`);
  box.append(el("h5", "vibe-title", opts.title));
  if (opts.hint) box.append(el("p", "hint", opts.hint));
  const row = el("div", "vibe-row");
  for (const v of vibe) {
    const card = el("article", `card vibe-card vibe-${v.label.toLowerCase().replace(/\s+/g, "-")}`);
    const head = el("div", "vibe-head");
    head.append(el("strong", "vibe-name", v.name), el("span", "vibe-label", v.label));
    card.append(head);
    if (v.label !== "Unclear") {
      const scale = el("div", "vibe-scale");
      const marker = el("span", "vibe-marker");
      marker.style.left = `${Math.round(((v.score + 1) / 2) * 100)}%`;
      scale.append(marker);
      const ends = el("div", "vibe-ends");
      ends.append(el("span", undefined, opts.ends[0]), el("span", undefined, opts.ends[1]), el("span", undefined, opts.ends[2]));
      card.append(scale, ends);
    }
    card.append(el("p", "vibe-conf", `Confidence: ${v.confidence.label} · ${Math.round(v.confidence.score * 100)}%`));
    const vid = `${source}|${pairing}|${opts.key}|${v.name}`;
    vibeSpec.set(vid, v);
    const vspec: FlagSpec = { id: vid, kind: "vibe", pairing, card: opts.key, top: v.name, bottom: "", act: v.label, confidence: v.confidence.score, extra: vibeExtra(vid, v), evidence: "" };
    // Tick a factor to send it with the report, and say what's wrong with it; either starts a report item for this rating.
    const setFactor = (idx: number, f: VibeFactor, on: boolean, reasons: FlagReason[] = [], note = "") => {
      const m = pickedFactors.get(vid) ?? new Map<number, PickedFactor>();
      if (on) m.set(idx, { line: factorLine(f), reasons, note }); else m.delete(idx);
      pickedFactors.set(vid, m);
      const prior = flagged.get(vid);
      if (prior) flagged.set(vid, { ...prior, extra: vibeExtra(vid, v) });
      else if (on) flagged.set(vid, { ...vspec, extra: vibeExtra(vid, v), reasons: [], note: "", included: true });
      document.querySelector(`[data-flag="${CSS.escape(vid)}"]`)?.classList.toggle("flagged", flagged.has(vid));
      refreshReport();
    };
    if (v.basis.length) {
      const ul = el("ul", "vibe-basis");
      const byTier = new Map<string, { idx: number; f: VibeFactor }[]>();
      (v.factors ?? []).forEach((f, idx) => {
        const label = f.tierName;
        byTier.set(label, [...(byTier.get(label) ?? []), { idx, f }]);
      });
      for (const b of v.basis) {
        const li = el("li");
        const group = [...byTier.entries()].find(([name]) => b.startsWith(name))?.[1];
        if (!group) { li.append(b); ul.append(li); continue; }
        const det = el("details", "factors");
        det.append(el("summary", undefined, b));
        const fl = el("ul", "factor-list");
        for (const { idx, f } of group) {
          const fi = el("li", `factor factor-${f.role}`);
          const label = el("label");
          const cb = el("input");
          cb.type = "checkbox";
          cb.checked = !!pickedFactors.get(vid)?.has(idx);
          cb.title = "Include this in the error report";
          label.append(cb, " ", el("strong", undefined, f.role), el("span", "where", ` · ${f.what}${f.where ? ` · ${f.where}` : ""}${f.fromOther ? " · other person's side" : ""} · weight ${f.weight}`));
          fi.append(label);
          if (f.source) fi.append(el("div", "evidence", f.source));
          // What's wrong with this one factor.
          const prior = pickedFactors.get(vid)?.get(idx);
          const btn = el("button", "linklike flag-btn", "What's wrong with this?");
          btn.type = "button";
          btn.addEventListener("mousedown", (e) => e.preventDefault());
          const form = el("form", "flag-form");
          form.hidden = true;
          const ticks = new Map<FlagReason, HTMLInputElement>();
          for (const key of REASONS_FOR.factor) {
            const r = FLAG_REASONS.find((x) => x.key === key)!;
            const lab = el("label", "flag-opt");
            const box = el("input");
            box.type = "checkbox";
            box.checked = !!prior?.reasons.includes(key);
            ticks.set(key, box);
            lab.append(box, ` ${r.label}`);
            form.append(lab);
          }
          const note = el("textarea");
          note.rows = 2;
          note.value = prior?.note ?? "";
          note.placeholder = "Why? (e.g. Eddie said this line, not Steve)";
          const save = el("button", undefined, "Add to report");
          save.type = "submit";
          const cancel = el("button", "linklike", "Cancel");
          cancel.type = "button";
          form.append(note, save, " ", cancel);
          btn.addEventListener("click", () => { form.hidden = !form.hidden; });
          cancel.addEventListener("click", () => { form.hidden = true; });
          form.addEventListener("submit", (e) => {
            e.preventDefault();
            const reasons = [...ticks].filter(([, x]) => x.checked).map(([k]) => k);
            cb.checked = true;
            if (rightItems.delete(fid)) paintF();
            setFactor(idx, f, true, reasons, note.value);
            form.hidden = true;
          });
          // Ticking or unticking the box keeps any problems already named.
          cb.addEventListener("change", () => {
            if (cb.checked && rightItems.delete(fid)) paintF();
            const cur = pickedFactors.get(vid)?.get(idx);
            setFactor(idx, f, cb.checked, cur?.reasons ?? [], cur?.note ?? "");
          });
          // This factor is right as it stands: it goes in the report as a reading to keep.
          const fid = `${vid}|factor|${idx}`;
          const okF = el("button", "linklike ok-btn", "✓ Looks right");
          okF.type = "button";
          okF.title = "Mark this factor as looking right: the report lists it as a reading to trust more, not as certainly correct everywhere";
          const paintF = () => { const on = rightItems.has(fid); okF.textContent = on ? "✓ Marked right" : "✓ Looks right"; okF.setAttribute("aria-pressed", String(on)); fi.classList.toggle("marked-right", on); };
          rightPaint.set(fid, paintF);
          okF.addEventListener("click", () => {
            if (rightItems.has(fid)) { unmarkRight(fid); return; }
            if (pickedFactors.get(vid)?.has(idx)) { cb.checked = false; setFactor(idx, f, false); }
            rightItems.set(fid, { id: fid, kind: "factor", pairing, card: opts.key, top: v.name, bottom: "", act: v.label, confidence: v.confidence.score, extra: [`Factor that looks right: ${factorLine(f)}`], evidence: f.source ?? "", reasons: [], note: "" });
            paintF();
            refreshReport();
          });
          paintF();
          fi.append(okF, " ", btn, form);
          fl.append(fi);
        }
        det.append(fl);
        li.append(det);
        ul.append(li);
      }
      card.append(ul);
    } else card.append(el("p", "hint", "No evidence either way."));
    const fl = el("div", "vibe-flag");
    flagControl(fl, vspec);
    card.append(fl);
    row.append(card);
  }
  box.append(row);
  return box;
}

/** How the vibe is shown: two ratings (sexual vibe + everyday dynamic) or the earlier single combined vibe. */
type VibeMode = "two" | "single";
const VIBE_MODE_KEY = "tbv.vibeMode";
let vibeMode: VibeMode = (() => { try { return localStorage.getItem(VIBE_MODE_KEY) === "single" ? "single" : "two"; } catch { return "two"; } })();

function renderAnalysis(a: Analysis, target: HTMLElement, notesEl: HTMLElement, keepFlags = false) {
  target.replaceChildren();
  // A new analysis replaces the reading the flags pointed at (switching the vibe display doesn't).
  if (!keepFlags && shown?.source === a.source) { for (const k of [...flagged.keys()]) if (k.startsWith(`${a.source}|`)) flagged.delete(k);
    for (const k of [...rightItems.keys()]) if (k.startsWith(`${a.source}|`)) rightItems.delete(k);
    for (const k of [...pickedFactors.keys()]) if (k.startsWith(`${a.source}|`)) pickedFactors.delete(k);
  }
  shown = { source: a.source, analysis: a };
  refreshReport();
  if (!a.pairings.length) target.append(el("p", "hint", "Couldn't identify the characters in this work."));
  if (a.pairings.some((p) => p.vibe?.length)) {
    const bar = el("div", "display-opts");
    bar.append(el("span", "mini-label", "Vibe display"));
    for (const [mode, label, tip] of [
      ["two", "Two ratings", "Sexual vibe (tops/bottoms) and everyday dynamic (leads/follows), kept apart"],
      ["single", "One combined vibe", "The earlier single rating, with taking charge, caring, pet names and yielding folded into the vibe"],
    ] as const) {
      const b = el("button", `seg${vibeMode === mode ? " on" : ""}`, label);
      b.type = "button";
      b.title = tip;
      b.setAttribute("aria-pressed", String(vibeMode === mode));
      b.addEventListener("click", () => {
        if (vibeMode === mode) return;
        vibeMode = mode;
        try { localStorage.setItem(VIBE_MODE_KEY, mode); } catch { /* not saved in a private window */ }
        renderAnalysis(a, target, notesEl, true);
      });
      bar.append(b);
    }
    target.append(bar);
  }
  for (const p of a.pairings) {
    const block = el("div", "pairing-block");
    if (a.pairings.length > 1) block.append(el("h4", "pairing-name", p.pairing));
    if (vibeMode === "single" && p.vibeCombined?.length) block.append(renderVibe(p.vibeCombined, p.pairing, a.source, { key: "vibe", title: "Vibe (combined)", ends: ["Total bottom", "Vers", "Total top"], hint: "One rating: sex acts, stated roles and tags, desires and hints, and everyday behaviour such as taking charge, caring and yielding, all together." }));
    else if (p.vibe?.length) block.append(renderVibe(p.vibe, p.pairing, a.source));
    if (vibeMode === "two" && p.dynamic?.length && p.dynamic.some((d) => d.label !== "Unclear")) block.append(renderVibe(p.dynamic, p.pairing, a.source, { key: "dynamic", title: "Everyday dynamic", ends: ["Follows", "Balanced", "Leads"], hint: "Who leads and who follows outside the sex: taking charge, caring, protecting, praising, yielding. Separate from who tops and bottoms." }));
    const grid = el("div", "grid two");
    grid.append(renderAct("anal", p.anal, p.pairing, a.source), renderAct("blowjob", p.blowjob, p.pairing, a.source), renderAct("rimming", p.rimming, p.pairing, a.source));
    if (p.cunnilingus.verdict !== "none" || p.vaginal.applicable) grid.append(renderAct("cunnilingus", p.cunnilingus, p.pairing, a.source));
    if (p.vaginal.applicable) grid.append(renderVaginal(p.vaginal, p.pairing, a.source));
    if (p.solo?.occurs) grid.append(renderSolo(p.solo, p.pairing, a.source));
    if (p.manual?.occurs) grid.append(renderManual(p.manual, p.pairing, a.source));
    block.append(grid);
    target.append(block);
  }
  if (a.tagCheck?.length) target.append(renderTagCheck(a.tagCheck, a.source));
  target.append(renderCalibration());
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
