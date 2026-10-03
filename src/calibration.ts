// Is "80% sure" right 80% of the time? Items the reader has marked right ("Looks right") or wrong (a mistake report)
// are kept in the browser, and this module turns them into a calibration table: stated confidence against how often
// the item was actually right. Pure functions plus a small, failure-tolerant store.

export interface Label {
  /** Which item: kind + card + a short fingerprint of its sentence, so the same sentence isn't counted twice. */
  key: string;
  kind: "scene" | "line";
  /** What the engine said, 0–1. */
  confidence: number;
  /** What the reader said. */
  right: boolean;
  at: number;
}

export interface CalibrationRow {
  lo: number;
  hi: number;
  n: number;
  /** Mean stated confidence in the bin. */
  expected: number;
  /** Share of labelled items that were right. */
  observed: number;
}

export interface CalibrationSummary {
  n: number;
  right: number;
  rows: CalibrationRow[];
  /** Mean squared gap between stated confidence and the outcome (0 is perfect, 0.25 is coin-flipping at 50%). */
  brier: number;
  /** Expected calibration error: the average gap between stated and observed, weighted by bin size. */
  ece: number;
}

export const BIN_EDGES = [0, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0001];

export function fingerprint(text: string): string {
  let h = 5381;
  const t = text.replace(/\s+/g, " ").trim().toLowerCase();
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export const labelKey = (kind: Label["kind"], card: string, evidence: string) => `${kind}|${card}|${fingerprint(evidence)}`;

/** Add a label, replacing an earlier one for the same item (the latest word wins). */
export function addLabel(labels: Label[], label: Label): Label[] {
  return [...labels.filter((l) => l.key !== label.key), label];
}

export function summarize(labels: Label[]): CalibrationSummary {
  const rows: CalibrationRow[] = [];
  for (let i = 0; i + 1 < BIN_EDGES.length; i++) {
    const inBin = labels.filter((l) => l.confidence >= BIN_EDGES[i] && l.confidence < BIN_EDGES[i + 1]);
    if (!inBin.length) continue;
    rows.push({
      lo: BIN_EDGES[i],
      hi: Math.min(1, BIN_EDGES[i + 1]),
      n: inBin.length,
      expected: inBin.reduce((n, l) => n + l.confidence, 0) / inBin.length,
      observed: inBin.filter((l) => l.right).length / inBin.length,
    });
  }
  const n = labels.length;
  const brier = n ? labels.reduce((s, l) => s + (l.confidence - (l.right ? 1 : 0)) ** 2, 0) / n : 0;
  const ece = n ? rows.reduce((s, r) => s + (r.n / n) * Math.abs(r.expected - r.observed), 0) : 0;
  return { n, right: labels.filter((l) => l.right).length, rows, brier, ece };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Lines for the copied mistake report. */
export function calibrationLines(labels: Label[]): string[] {
  const s = summarize(labels);
  if (!s.n) return [];
  const out = [`${s.n} item${s.n === 1 ? "" : "s"} marked so far (${s.right} right, ${s.n - s.right} wrong). Average gap between stated and observed: ${pct(s.ece)}.`];
  for (const r of s.rows) out.push(`Stated ${pct(r.lo)}–${pct(r.hi)}: ${r.n} marked, ${pct(r.observed)} right (averaging ${pct(r.expected)} sure).`);
  return out;
}

/** Read labels back from JSON, dropping anything malformed. */
export function parseLabels(json: string): Label[] {
  try {
    const raw = JSON.parse(json);
    const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.labels) ? raw.labels : [];
    const out: Label[] = [];
    for (const x of arr) {
      if (typeof x?.key === "string" && (x.kind === "scene" || x.kind === "line") && typeof x.confidence === "number" && typeof x.right === "boolean" && x.confidence >= 0 && x.confidence <= 1)
        out.push({ key: x.key, kind: x.kind, confidence: x.confidence, right: x.right, at: typeof x.at === "number" ? x.at : 0 });
    }
    return out.reduce<Label[]>((acc, l) => addLabel(acc, l), []);
  } catch {
    return [];
  }
}

const STORE_KEY = "tbv.labels.v1";
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const defaultStore = (): Store | undefined => { try { return typeof localStorage === "undefined" ? undefined : localStorage; } catch { return undefined; } };

export function loadLabels(store: Store | undefined = defaultStore()): Label[] {
  try { return store ? parseLabels(store.getItem(STORE_KEY) ?? "[]") : []; } catch { return []; }
}
export function saveLabels(labels: Label[], store: Store | undefined = defaultStore()): void {
  try { store?.setItem(STORE_KEY, JSON.stringify(labels)); } catch { /* private window or storage full: carry on without saving */ }
}
export function clearLabels(store: Store | undefined = defaultStore()): void {
  try { store?.removeItem(STORE_KEY); } catch { /* ignore */ }
}
