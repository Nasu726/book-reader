import assert from "node:assert/strict";
import { test } from "node:test";

import { installStreamAsyncIterator } from "../../src/components/stream-async-iterator.ts";

/** A browser that never shipped the feature, made out of one that did. */
function withoutAsyncIteration<T>(body: () => Promise<T>): Promise<T> {
  const original = Object.getOwnPropertyDescriptor(
    ReadableStream.prototype,
    Symbol.asyncIterator,
  );
  // @ts-expect-error — removing a built-in is the whole point of the fixture.
  delete ReadableStream.prototype[Symbol.asyncIterator];
  return body().finally(() => {
    if (original) Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, original);
  });
}

function streamOf(...chunks: string[]): ReadableStream<string> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

test("a stream can be iterated where the browser has no iterator for it", async () => {
  await withoutAsyncIteration(async () => {
    // What pdf.js does to collect a page's text, and what threw on iOS.
    await assert.rejects(async () => {
      for await (const _ of streamOf("a")) void _;
    });

    installStreamAsyncIterator();

    const seen: string[] = [];
    for await (const chunk of streamOf("one", "two", "three")) seen.push(chunk);
    assert.deepEqual(seen, ["one", "two", "three"]);
  });
});

test("leaving the loop early releases the stream", async () => {
  await withoutAsyncIteration(async () => {
    installStreamAsyncIterator();

    const stream = streamOf("one", "two", "three");
    for await (const chunk of stream) {
      assert.equal(chunk, "one");
      break;
    }
    // A reader that was never released leaves the stream locked for ever.
    assert.equal(stream.locked, false);
  });
});

test("nothing is replaced where the browser already has it", () => {
  const before = Object.getOwnPropertyDescriptor(
    ReadableStream.prototype,
    Symbol.asyncIterator,
  );
  installStreamAsyncIterator();
  assert.deepEqual(
    Object.getOwnPropertyDescriptor(ReadableStream.prototype, Symbol.asyncIterator),
    before,
  );
});
