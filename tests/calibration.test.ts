import { describe, expect, it } from "vitest";
import { addLabel, calibrationLines, clearLabels, fingerprint, type Label, labelKey, loadLabels, parseLabels, saveLabels, summarize } from "../src/calibration";

const L = (key: string, confidence: number, right: boolean): Label => ({ key, kind: "scene", confidence, right, at: 1 });
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };

describe("calibration", () => {
  it("a well-calibrated set has a small gap", () => {
    const labels: Label[] = [];
    for (let i = 0; i < 10; i++) labels.push(L(`a${i}`, 0.85, i < 8)); // 80% right at about 85% sure
    for (let i = 0; i < 10; i++) labels.push(L(`b${i}`, 0.55, i < 5)); // 50% right at about 55% sure
    const s = summarize(labels);
    expect(s.n).toBe(20);
    expect(s.rows).toHaveLength(2);
    expect(s.ece).toBeLessThan(0.06);
    expect(s.rows[1].observed).toBeCloseTo(0.8);
  });
  it("overconfidence shows up as a big gap", () => {
    const labels = Array.from({ length: 10 }, (_, i) => L(`c${i}`, 0.95, i < 5));
    const s = summarize(labels);
    expect(s.ece).toBeGreaterThan(0.4);
    expect(s.brier).toBeGreaterThan(0.2);
  });
  it("labelling the same item twice keeps the latest word", () => {
    const k = labelKey("scene", "anal", "Cas fucked Dean.");
    const labels = addLabel(addLabel([], L(k, 0.9, true)), L(k, 0.9, false));
    expect(labels).toHaveLength(1);
    expect(labels[0].right).toBe(false);
  });
  it("the key ignores spacing and case in the sentence", () => {
    expect(fingerprint("Cas  fucked Dean.")).toBe(fingerprint("cas fucked dean."));
  });
  it("round-trips through the store and survives a missing or broken one", () => {
    const store = mem();
    saveLabels([L("x", 0.7, true)], store);
    expect(loadLabels(store)).toHaveLength(1);
    clearLabels(store);
    expect(loadLabels(store)).toHaveLength(0);
    expect(loadLabels(undefined)).toEqual([]);
    expect(() => saveLabels([L("x", 0.7, true)], { getItem: () => null, setItem: () => { throw new Error("full"); }, removeItem: () => {} })).not.toThrow();
  });
  it("parses exported JSON and drops malformed entries", () => {
    const json = JSON.stringify({ labels: [L("a", 0.5, true), { key: 3 }, { key: "b", kind: "line", confidence: 2, right: true }, L("a", 0.5, false)] });
    const out = parseLabels(json);
    expect(out).toHaveLength(1);
    expect(out[0].right).toBe(false);
    expect(parseLabels("not json")).toEqual([]);
  });
  it("report lines are empty without labels and list each bin otherwise", () => {
    expect(calibrationLines([])).toEqual([]);
    const lines = calibrationLines([L("a", 0.85, true), L("b", 0.85, false)]);
    expect(lines[0]).toMatch(/2 items marked so far \(1 right, 1 wrong\)/);
    expect(lines[1]).toMatch(/Stated 80%–90%: 2 marked, 50% right/);
  });
});
