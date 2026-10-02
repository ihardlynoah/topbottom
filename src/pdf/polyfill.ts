// Safari doesn't support `for await (const chunk of readableStream)`, which pdf.js uses (e.g. in
// getTextContent), and pdf.js's legacy build doesn't polyfill it. Add it where missing.
const proto = ReadableStream.prototype as ReadableStream<unknown> & { [Symbol.asyncIterator]?: unknown };
if (typeof proto[Symbol.asyncIterator] !== "function") {
  Object.defineProperty(proto, Symbol.asyncIterator, {
    configurable: true,
    writable: true,
    value: async function* (this: ReadableStream<unknown>) {
      const reader = this.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) return;
          yield value;
        }
      } finally {
        reader.releaseLock();
      }
    },
  });
}

export {};
