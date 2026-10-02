// Runs the pattern engine off the main thread so long, explicit fics don't freeze the page.
import type { Ao3Meta } from "../ao3";
import { analyzeWithPatterns } from "./index";

self.onmessage = (e: MessageEvent<{ id: number; text: string; meta: Ao3Meta }>) => {
  const { id, text, meta } = e.data;
  try {
    self.postMessage({ id, result: analyzeWithPatterns(text, meta) });
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
