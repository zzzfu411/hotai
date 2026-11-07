// Runs DOMPurify (isomorphic-dompurify on jsdom) off the main thread.
//
// Why a worker: jsdom 30 keeps every DOM tree it has ever parsed reachable
// through process-wide state. It is not tied to one window, so neither
// isomorphic-dompurify's clearWindow() nor window.close() releases it. One
// Juya refresh (~0.3 MB of HTML) pinned ~31 MB of heap for good, and a few
// refreshes pushed hotai-web past its heap limit ("JavaScript heap out of
// memory", roughly daily). A worker owns a separate V8 heap; terminating it
// hands all of that memory back. The lifecycle lives in sanitize-remote-html.ts.
//
// Plain CommonJS on purpose: it is loaded by path at runtime, never bundled by
// Next, and resolves isomorphic-dompurify from apps/web/node_modules.
"use strict";

const { parentPort } = require("node:worker_threads");
const { getHeapStatistics } = require("node:v8");
const { sanitize } = require("isomorphic-dompurify");

parentPort.on("message", ({ id, raws, config }) => {
  try {
    const out = raws.map((raw) => sanitize(raw, config));
    parentPort.postMessage({ id, ok: true, out, heapMb: getHeapStatistics().used_heap_size / 1048576 });
  } catch (err) {
    parentPort.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});
