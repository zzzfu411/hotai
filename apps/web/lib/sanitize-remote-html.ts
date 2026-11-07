import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Worker } from "node:worker_threads";
import { parseHTML } from "linkedom";
import { safeHttpUrl } from "./safe-url";

const URL_ATTRS = ["href", "src", "poster", "cite", "action", "formaction", "xlink:href"] as const;

const PURIFY_CONFIG = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "link", "meta", "base"],
  // Remote classes could borrow the site's own styles (fixed overlays,
  // hidden text); the page styles remote markup by tag only.
  FORBID_ATTR: ["style", "class"],
  ADD_ATTR: ["target", "rel"],
};

/**
 * DOMPurify runs in a worker thread (lib/sanitize-worker.cjs) because jsdom
 * never releases the documents it parses — see the note in that file. The
 * worker is reused while work keeps arriving and is terminated, freeing its
 * whole heap, when it goes idle, grows past RETIRE_HEAP_MB, or a job hangs.
 */
const IDLE_MS = 30_000;
const RETIRE_HEAP_MB = 96;
const WORKER_HEAP_LIMIT_MB = 192;
const JOB_TIMEOUT_MS = 60_000;

type Job = { resolve: (out: string[]) => void; reject: (err: Error) => void; timer: NodeJS.Timeout };
type Slot = { worker: Worker; jobs: Map<number, Job>; retiring: boolean; idle?: NodeJS.Timeout };
type Pool = { current: Slot | null; nextId: number };

// One pool per process: Next can bundle this module into several route chunks.
const g = globalThis as typeof globalThis & { __hotai_sanitizer?: Pool };
function pool(): Pool {
  return (g.__hotai_sanitizer ??= { current: null, nextId: 1 });
}

/**
 * Next bundles this module into .next/server, so the worker script is found
 * from the app directory: `next start` runs in apps/web, vitest in the repo root.
 */
function workerScript(): string {
  const candidates = [
    resolve(process.cwd(), "lib/sanitize-worker.cjs"),
    resolve(process.cwd(), "apps/web/lib/sanitize-worker.cjs"),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`sanitize worker not found (cwd ${process.cwd()})`);
  return found;
}

function stop(slot: Slot, reason: string): void {
  const p = pool();
  if (p.current === slot) p.current = null;
  if (slot.idle) clearTimeout(slot.idle);
  for (const job of slot.jobs.values()) {
    clearTimeout(job.timer);
    job.reject(new Error(`html sanitizer ${reason}`));
  }
  slot.jobs.clear();
  void slot.worker.terminate();
}

function spawn(): Slot {
  const worker = new Worker(workerScript(), {
    resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_LIMIT_MB },
  });
  const slot: Slot = { worker, jobs: new Map(), retiring: false };
  worker.on("message", (msg: { id: number; ok: boolean; out?: string[]; error?: string; heapMb?: number }) => {
    const job = slot.jobs.get(msg.id);
    if (!job) return;
    slot.jobs.delete(msg.id);
    clearTimeout(job.timer);
    if (msg.ok && msg.out) job.resolve(msg.out);
    else job.reject(new Error(msg.error || "html sanitizer failed"));
    if ((msg.heapMb ?? 0) > RETIRE_HEAP_MB) {
      slot.retiring = true;
      if (pool().current === slot) pool().current = null;
    }
    if (slot.jobs.size === 0) {
      if (slot.retiring) {
        stop(slot, "retired");
      } else {
        worker.unref();
        slot.idle = setTimeout(() => stop(slot, "idle"), IDLE_MS);
        slot.idle.unref();
      }
    }
  });
  worker.on("error", (err) => stop(slot, `crashed: ${err.message}`));
  worker.on("exit", () => stop(slot, "exited"));
  return slot;
}

function purifyInWorker(raws: readonly string[]): Promise<string[]> {
  const p = pool();
  const slot = p.current ?? (p.current = spawn());
  if (slot.idle) {
    clearTimeout(slot.idle);
    slot.idle = undefined;
  }
  slot.worker.ref();
  const id = p.nextId++;
  return new Promise<string[]>((resolveJob, rejectJob) => {
    const timer = setTimeout(() => stop(slot, "timed out"), JOB_TIMEOUT_MS);
    slot.jobs.set(id, { resolve: resolveJob, reject: rejectJob, timer });
    slot.worker.postMessage({ id, raws, config: PURIFY_CONFIG });
  });
}

/**
 * Second pass over DOMPurify's output: normalize every browser URL sink
 * against the trusted fetched-page base, dropping private/local targets.
 * linkedom releases its documents normally, so this stays on the main thread.
 */
function normalizeUrls(clean: string, baseUrl: string): string {
  if (!clean) return "";
  const { document } = parseHTML(`<!doctype html><html><body>${clean}</body></html>`);
  for (const element of Array.from(document.body.querySelectorAll("*"))) {
    element.removeAttribute("srcset");
    for (const attr of URL_ATTRS) {
      const value = element.getAttribute(attr);
      if (value == null) continue;
      if (attr === "href" && value.trim().startsWith("#")) continue;
      const safe = safeHttpUrl(value, baseUrl);
      if (safe) element.setAttribute(attr, safe);
      else element.removeAttribute(attr);
    }
    if (element.getAttribute("target")?.toLowerCase() === "_blank") {
      element.setAttribute("rel", "noopener noreferrer");
    }
  }
  return document.body.innerHTML.trim();
}

/**
 * Sanitize several remote HTML fragments in one worker round trip, in order.
 * DOMPurify handles script/DOM clobbering; the second pass also removes
 * private/local navigation and resource targets.
 */
export async function sanitizeRemoteHtmlBatch(raws: readonly string[], baseUrl: string): Promise<string[]> {
  if (!raws.length) return [];
  const purified = await purifyInWorker(raws);
  return purified.map((clean) => normalizeUrls(clean.trim(), baseUrl));
}

/** Sanitize one remote HTML fragment; see sanitizeRemoteHtmlBatch. */
export async function sanitizeRemoteHtml(raw: string, baseUrl: string): Promise<string> {
  const [out] = await sanitizeRemoteHtmlBatch([raw], baseUrl);
  return out ?? "";
}
