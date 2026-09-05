import { parseIdArray, LATER_KEY, READ_KEY } from "./reading-flags";
import { safeHttpUrl } from "./safe-url";
import type { ReadableStory } from "./reader-link";

export const READING_KEY = "hotai.reading.v2";
export const READING_EVENT = "hotai-reading-change";
const CAP = 400;
export type ReadingEntry = ReadableStory & {
  key: string; state: "later" | "read"; savedAt: number;
};
let sessionEntries: ReadingEntry[] | null = null;

export function parseReadingEntries(raw: string | null): ReadingEntry[] {
  try {
    const values: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(values)) return [];
    const result: ReadingEntry[] = [];
    const seen = new Set<string>();
    for (const value of values.slice(-CAP)) {
      if (!value || typeof value !== "object") continue;
      const v = value as Record<string, unknown>;
      const articleId = typeof v.articleId === "number" && Number.isInteger(v.articleId) && v.articleId > 0 && v.articleId <= 2_147_483_647 ? v.articleId : undefined;
      const url = safeHttpUrl(typeof v.url === "string" ? v.url : null) ?? "";
      if ((!url && !articleId) || (v.state !== "read" && v.state !== "later")) continue;
      const key = url || `article:${articleId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ key, url, articleId, state: v.state,
        title: typeof v.title === "string" ? v.title.slice(0, 300) : `Article #${articleId}`,
        source: typeof v.source === "string" ? v.source.slice(0, 100) : undefined,
        summary: typeof v.summary === "string" ? v.summary.slice(0, 400) : undefined,
        savedAt: typeof v.savedAt === "number" && Number.isFinite(v.savedAt) ? v.savedAt : 0,
      });
    }
    return result;
  } catch { return []; }
}

export function loadReadingEntries(): ReadingEntry[] {
  if (typeof window === "undefined") return [];
  if (sessionEntries) return sessionEntries;
  try {
    const raw = localStorage.getItem(READING_KEY);
    if (raw !== null) return parseReadingEntries(raw);
    // Preserve old ID-only bookmarks until their next visit supplies a URL.
    const later = parseIdArray(localStorage.getItem(LATER_KEY));
    const read = parseIdArray(localStorage.getItem(READ_KEY)).filter((id) => !later.includes(id));
    return [...later.map((articleId) => ({ articleId, state: "later" })),
      ...read.map((articleId) => ({ articleId, state: "read" }))]
      .slice(-CAP).map((entry) => ({ ...entry, key: `article:${entry.articleId}`,
        url: "", title: `Article #${entry.articleId}`, savedAt: 0,
        state: entry.state as "later" | "read" }));
  } catch { return []; }
}

export function storyState(entries: ReadingEntry[], story: ReadableStory): ReadingEntry["state"] | null {
  const url = safeHttpUrl(story.url);
  return entries.find((entry) => (url && entry.url === url) ||
    (story.articleId && entry.articleId === story.articleId))?.state ?? null;
}

function saveEntries(entries: ReadingEntry[]): boolean {
  let persisted = true;
  try { localStorage.setItem(READING_KEY, JSON.stringify(entries)); sessionEntries = null; }
  catch { sessionEntries = entries; persisted = false; }
  window.dispatchEvent(new Event(READING_EVENT));
  return persisted;
}

export function toggleReading(story: ReadableStory, state: ReadingEntry["state"]): boolean {
  const url = safeHttpUrl(story.url) ?? "";
  const entries = loadReadingEntries();
  const previous = storyState(entries, story);
  const next = entries.filter((entry) => entry.url !== url || !url)
    .filter((entry) => !story.articleId || entry.articleId !== story.articleId);
  if (previous !== state) next.push({ ...story, url, title: story.title.slice(0, 300),
    summary: story.summary?.slice(0, 400), source: story.source?.slice(0, 100),
    key: url || `article:${story.articleId}`, state, savedAt: Date.now() });
  return saveEntries(next.slice(-CAP));
}

export function removeReading(key: string): boolean {
  return saveEntries(loadReadingEntries().filter((entry) => entry.key !== key));
}

/** Upgrade an ID-only legacy mark on the next successful article visit. */
export function hydrateReadingStory(story: ReadableStory): boolean {
  if (!story.articleId || !safeHttpUrl(story.url)) return true;
  const entries = loadReadingEntries();
  const legacy = entries.find(entry => entry.articleId === story.articleId && !entry.url);
  if (!legacy) return true;
  return saveEntries(entries.filter(entry => entry !== legacy && entry.url !== story.url)
    .concat({ ...legacy, ...story, key: story.url }));
}

export function subscribeReading(listener: () => void): () => void {
  const storage = (event: StorageEvent) => {
    if (event.key === READING_KEY || event.key === null) { sessionEntries = null; listener(); }
  };
  window.addEventListener(READING_EVENT, listener);
  window.addEventListener("storage", storage);
  return () => { window.removeEventListener(READING_EVENT, listener); window.removeEventListener("storage", storage); };
}
