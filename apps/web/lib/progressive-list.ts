/**
 * Refresh the full list while retaining the order of cards already visible.
 * Existing cards receive fresh data; removed cards disappear normally.
 */
export function preserveVisiblePrefix<T>(
  previous: T[],
  next: T[],
  visibleCount: number,
  keyOf: (item: T) => string,
): T[] {
  const limit = Math.max(0, Math.min(previous.length, Math.trunc(visibleCount)));
  if (limit === 0) return next;

  const nextByKey = new Map<string, T>();
  for (const item of next) {
    const key = keyOf(item);
    if (!nextByKey.has(key)) nextByKey.set(key, item);
  }

  const used = new Set<string>();
  const prefix: T[] = [];
  for (const oldItem of previous.slice(0, limit)) {
    const key = keyOf(oldItem);
    const freshItem = nextByKey.get(key);
    if (!freshItem || used.has(key)) continue;
    used.add(key);
    prefix.push(freshItem);
  }

  return [...prefix, ...next.filter((item) => !used.has(keyOf(item)))];
}
