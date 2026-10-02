// Runs the pattern engine in a Web Worker when possible, falling back to the main thread.
import type { Ao3Meta } from "../ao3";
import type { Analysis } from "../types";
import { analyzeWithPatterns } from "./index";
import PatternWorker from "./worker?worker";

let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<number, { resolve: (a: Analysis) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | undefined {
  if (worker) return worker;
  try {
    worker = new PatternWorker();
    worker.onmessage = (e: MessageEvent<{ id: number; result?: Analysis; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.result) p.resolve(e.data.result);
      else p.reject(new Error(e.data.error ?? "Pattern analysis failed"));
    };
    worker.onerror = () => {
      // Worker unavailable (e.g. blocked): fail pending jobs over to the main thread.
      worker = undefined;
      for (const p of pending.values()) p.reject(new Error("worker failed"));
      pending.clear();
    };
    return worker;
  } catch {
    return undefined;
  }
}

export function runPatterns(text: string, meta: Ao3Meta): Promise<Analysis> {
  const w = getWorker();
  if (!w) return Promise.resolve(analyzeWithPatterns(text, meta));
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, text, meta });
  }).catch(() => analyzeWithPatterns(text, meta)) as Promise<Analysis>;
}
