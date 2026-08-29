/**
 * Lets `for await (… of readableStream)` work in Safari.
 *
 * Async iteration of a ReadableStream is in the streams standard and shipped
 * in Chrome and Firefox years ago. WebKit has never implemented it, so on any
 * browser on iOS the property is simply absent, and `for await (const x of
 * stream)` reaches for an iterator that is not there.
 *
 * pdf.js reads a page's text that way:
 *
 *     for await (const value of readableStream) { … }   // getTextContent
 *
 * which on an iPhone threw "undefined is not a function" from the middle of
 * minified code, after the page had already been fetched and painted. The text
 * layer never appeared, the draw was reported as failed, and Try again failed
 * the same way for the same reason.
 *
 * Installed rather than worked around: the reader is not the only thing that
 * may read a stream this way, and a missing platform feature is what a polyfill
 * is for. Feature-detected, so nothing is replaced where it already exists.
 */
declare global {
  /*
   * Declared because it is being provided. TypeScript's DOM library does not
   * describe async iteration of a stream — the same gap, in the type layer.
   *
   * The type parameter has to match lib.dom's own `ReadableStream<R = any>`
   * exactly, or the two declarations will not merge. That `any` is a
   * requirement of the merge, not a shortcut around a type.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface ReadableStream<R = any> {
    [Symbol.asyncIterator](): AsyncIterableIterator<R>;
  }
}

export function installStreamAsyncIterator(): void {
  const prototype = globalThis.ReadableStream?.prototype;
  if (!prototype || Symbol.asyncIterator in prototype) return;

  Object.defineProperty(prototype, Symbol.asyncIterator, {
    configurable: true,
    value: function asyncIterator(this: ReadableStream<unknown>) {
      const reader = this.getReader();
      return {
        next: () => reader.read(),
        // Called when the loop is left early — a break, a return, or a throw.
        // Without it the stream stays locked and its source is never released.
        async return(value: unknown) {
          await reader.cancel();
          reader.releaseLock();
          return { done: true as const, value };
        },
        [Symbol.asyncIterator]() {
          return this;
        },
      };
    },
    writable: true,
  });
}
